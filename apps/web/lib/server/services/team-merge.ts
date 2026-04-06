import type { ResolveUnverifiedResponse, TierId } from "@rematch/shared-types";

import { getServiceSupabase } from "../supabase";

type ActiveTeamRow = {
  id: string;
  name: string;
  currentTierId: TierId;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function dedupeNames(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeName(trimmed);
    if (!trimmed || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(trimmed);
  }

  return deduped;
}

async function loadActiveTeam(teamId: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  const { data, error } = await client
    .from("teams")
    .select("id, name, current_tier_id, deleted_at")
    .eq("id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load team: ${error.message}`);
  }

  if (!data || (data as Record<string, unknown>).deleted_at) {
    return null;
  }

  return {
    id: String((data as Record<string, unknown>).id),
    name: String((data as Record<string, unknown>).name),
    currentTierId: String((data as Record<string, unknown>).current_tier_id) as TierId
  } satisfies ActiveTeamRow;
}

async function saveAliases(teamId: string, aliases: string[]) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  for (const alias of dedupeNames(aliases)) {
    const { error } = await client.from("team_aliases").insert({
      team_id: teamId,
      alias
    } as never);

    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(`Could not save merged alias "${alias}": ${error.message}`);
    }
  }
}

async function backfillSeriesByNormalizedName(args: {
  tournamentIds: string[];
  normalizedName: string;
  targetTeamId: string;
  targetTierId: TierId;
}) {
  const client = getServiceSupabase();
  if (!client || args.tournamentIds.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("series_results")
    .select("id, team_one_name, team_two_name, team_one_id, team_two_id")
    .in("tournament_id", args.tournamentIds);

  if (error) {
    throw new Error(`Could not load series results for merge backfill: ${error.message}`);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const updatePayload: Record<string, unknown> = {};

    const teamOneMatches =
      !row.team_one_id && normalizeName(String(row.team_one_name ?? "")) === args.normalizedName;
    const teamTwoMatches =
      !row.team_two_id && normalizeName(String(row.team_two_name ?? "")) === args.normalizedName;

    if (teamOneMatches) {
      updatePayload.team_one_id = args.targetTeamId;
      updatePayload.team_one_tier_id = args.targetTierId;
    }

    if (teamTwoMatches) {
      updatePayload.team_two_id = args.targetTeamId;
      updatePayload.team_two_tier_id = args.targetTierId;
    }

    if (Object.keys(updatePayload).length === 0) {
      continue;
    }

    const { error: updateError } = await client
      .from("series_results")
      .update(updatePayload as never)
      .eq("id", String(row.id));

    if (updateError) {
      throw new Error(`Could not backfill merged series results: ${updateError.message}`);
    }
  }
}

async function resolveOpenAppearancesToTeam(args: {
  normalizedName: string;
  targetTeamId: string;
  actorAdminId: string;
}) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select("id, team_name, tournament_id")
    .eq("normalized_name", args.normalizedName)
    .or("resolution_status.is.null,resolution_status.eq.pending");

  if (error) {
    throw new Error(`Could not load unverified appearances: ${error.message}`);
  }

  const appearanceRows = (data ?? []) as Array<Record<string, unknown>>;
  const appearanceIds = appearanceRows.map((row) => String(row.id));
  if (appearanceIds.length === 0) {
    return {
      tournamentIds: [] as string[],
      aliasNames: [] as string[]
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from("unverified_appearances")
    .update({
      resolution_status: "confirmed",
      resolved_at: now,
      resolved_by: args.actorAdminId,
      resolved_team_id: args.targetTeamId,
      pending_team_name: null,
      pending_tier_id: null
    } as never)
    .in("id", appearanceIds);

  if (updateError) {
    throw new Error(`Could not resolve unverified appearances: ${updateError.message}`);
  }

  return {
    tournamentIds: [...new Set(appearanceRows.map((row) => String(row.tournament_id)))],
    aliasNames: dedupeNames(appearanceRows.map((row) => String(row.team_name ?? "")))
  };
}

export async function mergeUnverifiedTeamIntoExistingTeam(args: {
  normalizedName: string;
  targetTeamId: string;
  actorAdminId: string;
}): Promise<ResolveUnverifiedResponse> {
  const normalizedName = normalizeName(args.normalizedName);
  const normalizedTargetTeamId = args.targetTeamId.trim();
  if (!normalizedName) {
    return { ok: false, message: "normalizedName is required." };
  }

  if (!normalizedTargetTeamId) {
    return { ok: false, message: "targetTeamId is required." };
  }

  const targetTeam = await loadActiveTeam(normalizedTargetTeamId);
  if (!targetTeam) {
    return { ok: false, message: "Target team not found." };
  }

  const resolved = await resolveOpenAppearancesToTeam({
    normalizedName,
    targetTeamId: targetTeam.id,
    actorAdminId: args.actorAdminId
  });

  if (resolved.aliasNames.length === 0) {
    return { ok: false, message: "No pending unverified appearances were found for that team." };
  }

  await saveAliases(
    targetTeam.id,
    resolved.aliasNames.filter((alias) => normalizeName(alias) !== normalizeName(targetTeam.name))
  );
  await backfillSeriesByNormalizedName({
    tournamentIds: resolved.tournamentIds,
    normalizedName,
    targetTeamId: targetTeam.id,
    targetTierId: targetTeam.currentTierId
  });

  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: "merged unverified",
    subject: `${normalizedName} into ${targetTeam.name}`
  } as never);

  if (activityError) {
    throw new Error(`Could not log unverified merge: ${activityError.message}`);
  }

  return {
    ok: true,
    message: `Merged ${resolved.aliasNames[0] ?? normalizedName} into ${targetTeam.name}.`,
    teamId: targetTeam.id
  };
}

export async function mergeVerifiedTeamIntoExistingTeam(args: {
  sourceTeamId: string;
  targetTeamId: string;
  actorAdminId: string;
}) {
  const normalizedSourceTeamId = args.sourceTeamId.trim();
  const normalizedTargetTeamId = args.targetTeamId.trim();
  if (!normalizedSourceTeamId || !normalizedTargetTeamId) {
    return {
      ok: false,
      message: "sourceTeamId and targetTeamId are required."
    };
  }

  if (normalizedSourceTeamId === normalizedTargetTeamId) {
    return {
      ok: false,
      message: "A team cannot be merged into itself."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Team merging requires live Supabase data."
    };
  }

  const [sourceTeam, targetTeam] = await Promise.all([
    loadActiveTeam(normalizedSourceTeamId),
    loadActiveTeam(normalizedTargetTeamId)
  ]);

  if (!sourceTeam) {
    return { ok: false, message: "Source team not found." };
  }

  if (!targetTeam) {
    return { ok: false, message: "Target team not found." };
  }

  const { data: conflictingChallenge, error: challengeError } = await client
    .from("challenge_series")
    .select("id")
    .or(`challenger_team_id.eq.${sourceTeam.id},defender_team_id.eq.${sourceTeam.id}`)
    .in("state", ["pending", "active", "expired"])
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    throw new Error(`Could not validate active challenges before merge: ${challengeError.message}`);
  }

  if (conflictingChallenge) {
    return {
      ok: false,
      message: "Remove or resolve active challenge records for the source team before merging."
    };
  }

  const { data: sourceAliasesData, error: sourceAliasesError } = await client
    .from("team_aliases")
    .select("id, alias")
    .eq("team_id", sourceTeam.id);

  if (sourceAliasesError) {
    throw new Error(`Could not load source aliases: ${sourceAliasesError.message}`);
  }

  const { data: sourceAppearanceData, error: sourceAppearanceError } = await client
    .from("unverified_appearances")
    .select("id, team_name, tournament_id")
    .eq("normalized_name", normalizeName(sourceTeam.name))
    .or("resolution_status.is.null,resolution_status.eq.pending");

  if (sourceAppearanceError) {
    throw new Error(`Could not load matching unverified appearances: ${sourceAppearanceError.message}`);
  }

  await saveAliases(
    targetTeam.id,
    [sourceTeam.name, ...((sourceAliasesData ?? []) as Array<Record<string, unknown>>).map((row) => String(row.alias ?? ""))]
      .filter((alias) => normalizeName(alias) !== normalizeName(targetTeam.name))
  );

  const { error: moveTeamOneError } = await client
    .from("series_results")
    .update({ team_one_id: targetTeam.id } as never)
    .eq("team_one_id", sourceTeam.id);

  if (moveTeamOneError) {
    throw new Error(`Could not reassign source team series results: ${moveTeamOneError.message}`);
  }

  const { error: moveTeamTwoError } = await client
    .from("series_results")
    .update({ team_two_id: targetTeam.id } as never)
    .eq("team_two_id", sourceTeam.id);

  if (moveTeamTwoError) {
    throw new Error(`Could not reassign source team series results: ${moveTeamTwoError.message}`);
  }

  const sourceTournamentIds = [...new Set(((sourceAppearanceData ?? []) as Array<Record<string, unknown>>).map((row) => String(row.tournament_id)))];
  if (sourceTournamentIds.length > 0) {
    await backfillSeriesByNormalizedName({
      tournamentIds: sourceTournamentIds,
      normalizedName: normalizeName(sourceTeam.name),
      targetTeamId: targetTeam.id,
      targetTierId: targetTeam.currentTierId
    });

    const sourceAppearanceIds = ((sourceAppearanceData ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    if (sourceAppearanceIds.length > 0) {
      const now = new Date().toISOString();
      const { error: resolveAppearanceError } = await client
        .from("unverified_appearances")
        .update({
          resolution_status: "confirmed",
          resolved_at: now,
          resolved_by: args.actorAdminId,
          resolved_team_id: targetTeam.id,
          pending_team_name: null,
          pending_tier_id: null
        } as never)
        .in("id", sourceAppearanceIds);

      if (resolveAppearanceError) {
        throw new Error(`Could not resolve source unverified appearances: ${resolveAppearanceError.message}`);
      }
    }
  }

  const { error: reassignResolvedAppearancesError } = await client
    .from("unverified_appearances")
    .update({ resolved_team_id: targetTeam.id } as never)
    .eq("resolved_team_id", sourceTeam.id);

  if (reassignResolvedAppearancesError) {
    throw new Error(`Could not reassign resolved appearances: ${reassignResolvedAppearancesError.message}`);
  }

  const { error: deleteSourceAliasError } = await client.from("team_aliases").delete().eq("team_id", sourceTeam.id);
  if (deleteSourceAliasError) {
    throw new Error(`Could not clear source aliases after merge: ${deleteSourceAliasError.message}`);
  }

  const { error: deleteStagedMoveError } = await client.from("staged_team_moves").delete().eq("team_id", sourceTeam.id);
  if (deleteStagedMoveError) {
    throw new Error(`Could not clear staged moves for the source team: ${deleteStagedMoveError.message}`);
  }

  const { error: softDeleteError } = await client
    .from("teams")
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", sourceTeam.id)
    .is("deleted_at", null);

  if (softDeleteError) {
    throw new Error(`Could not hide the merged source team: ${softDeleteError.message}`);
  }

  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: "merged team",
    subject: `${sourceTeam.name} into ${targetTeam.name}`
  } as never);

  if (activityError) {
    throw new Error(`Could not log team merge: ${activityError.message}`);
  }

  return {
    ok: true,
    message: `Merged ${sourceTeam.name} into ${targetTeam.name}.`,
    teamId: targetTeam.id
  };
}
