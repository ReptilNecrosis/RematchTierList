import type {
  ResolveUnverifiedRequest,
  ResolveUnverifiedResponse,
  TierId,
  UnverifiedAppearance
} from "@rematch/shared-types";

import { getServiceSupabase } from "../supabase";

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeShortCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "team";
}

function isCompetitiveTier(tierId: TierId | undefined): tierId is Exclude<TierId, "tier7"> {
  return Boolean(
    tierId &&
      tierId !== "tier7" &&
      (tierId === "tier1" ||
        tierId === "tier2" ||
        tierId === "tier3" ||
        tierId === "tier4" ||
        tierId === "tier5" ||
        tierId === "tier6")
  );
}

function buildUniqueSlug(baseName: string, existingSlugs: Set<string>) {
  const baseSlug = slugify(baseName);
  let candidate = baseSlug;
  let suffix = 2;

  while (existingSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function dedupeAppearanceNames(appearances: UnverifiedAppearance[]) {
  const uniqueNames = new Map<string, string>();

  for (const appearance of appearances) {
    const key = normalizeName(appearance.teamName);
    if (!uniqueNames.has(key)) {
      uniqueNames.set(key, appearance.teamName);
    }
  }

  return [...uniqueNames.values()];
}

async function logActivity(adminAccountId: string, verb: string, subject: string) {
  const client = getServiceSupabase();
  if (!client) {
    return;
  }

  await client.from("activity_log").insert({
    admin_account_id: adminAccountId,
    verb,
    subject
  } as never);
}

async function getPendingAppearances(normalizedName: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select("id, team_name, normalized_name, tournament_id, seen_at")
    .eq("normalized_name", normalizedName)
    .is("resolution_status", null)
    .order("seen_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load pending unverified appearances: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): UnverifiedAppearance => ({
      id: String(row.id),
      teamName: String(row.team_name),
      normalizedName: String(row.normalized_name),
      tournamentId: String(row.tournament_id),
      seenAt: String(row.seen_at)
    })
  );
}

async function dismissPendingAppearances(args: {
  appearanceIds: string[];
  normalizedName: string;
  adminAccountId: string;
  dismissReason?: string;
  dismissNote?: string;
}): Promise<ResolveUnverifiedResponse> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  const { error } = await client
    .from("unverified_appearances")
    .delete()
    .in("id", args.appearanceIds);

  if (error) {
    return { ok: false, message: `Could not dismiss unverified team: ${error.message}` };
  }

  const reasonPart = args.dismissReason ? ` — Reason: ${args.dismissReason}` : "";
  const notePart = args.dismissNote ? ` — Note: ${args.dismissNote}` : "";
  await logActivity(args.adminAccountId, "dismissed", `Unverified team ${args.normalizedName}${reasonPart}${notePart}`);
  return { ok: true, message: "Unverified team dismissed from the current queue." };
}

async function confirmPendingAppearances(args: {
  request: ResolveUnverifiedRequest;
  appearances: UnverifiedAppearance[];
  adminAccountId: string;
}): Promise<ResolveUnverifiedResponse> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  const teamName = args.request.teamName?.trim() ?? "";
  if (!teamName) {
    return { ok: false, message: "teamName is required when confirming an unverified team." };
  }

  const shortCode = normalizeShortCode(args.request.shortCode ?? "");
  if (shortCode.length < 2 || shortCode.length > 8) {
    return { ok: false, message: "shortCode must be between 2 and 8 characters." };
  }

  if (!isCompetitiveTier(args.request.tierId)) {
    return { ok: false, message: "tierId must be a competitive tier between Tier 1 and Tier 6." };
  }

  const normalizedCanonicalName = normalizeName(teamName);
  const now = new Date().toISOString();

  const { data: existingTeamsData, error: existingTeamsError } = await client
    .from("teams")
    .select("id, name, slug");

  if (existingTeamsError) {
    return { ok: false, message: `Could not validate existing teams: ${existingTeamsError.message}` };
  }

  const existingTeams = (existingTeamsData ?? []) as Array<Record<string, unknown>>;
  if (
    existingTeams.some((team) => normalizeName(String(team.name ?? "")) === normalizedCanonicalName)
  ) {
    return {
      ok: false,
      message: `A team named "${teamName}" already exists. Choose a different canonical name.`
    };
  }

  const existingSlugs = new Set(existingTeams.map((team) => String(team.slug ?? "")));
  const slug = buildUniqueSlug(teamName, existingSlugs);

  const { data: createdTeam, error: teamInsertError } = await client
    .from("teams")
    .insert({
      slug,
      name: teamName,
      short_code: shortCode,
      current_tier_id: args.request.tierId,
      verified: true,
      created_by: args.adminAccountId
    } as never)
    .select("id")
    .single();

  if (teamInsertError || !createdTeam) {
    return {
      ok: false,
      message: `Could not create verified team: ${teamInsertError?.message ?? "Unknown error"}`
    };
  }

  const teamId = String((createdTeam as Record<string, unknown>).id);

  const { error: tierHistoryError } = await client.from("team_tier_history").insert({
    team_id: teamId,
    from_tier_id: null,
    to_tier_id: args.request.tierId,
    movement_type: "placement",
    reason: "Admin confirmed from unverified queue",
    created_by: args.adminAccountId,
    created_at: now
  } as never);

  if (tierHistoryError) {
    return { ok: false, message: `Could not record team placement: ${tierHistoryError.message}` };
  }

  const aliasRows = dedupeAppearanceNames(args.appearances)
    .filter((alias) => normalizeName(alias) !== normalizedCanonicalName)
    .map((alias) => ({
      team_id: teamId,
      alias,
      created_at: now
    }));

  if (aliasRows.length > 0) {
    const { error: aliasError } = await client.from("team_aliases").insert(aliasRows as never);
    if (aliasError) {
      return { ok: false, message: `Could not save team aliases: ${aliasError.message}` };
    }
  }

  const tournamentIds = [...new Set(args.appearances.map((appearance) => appearance.tournamentId))];
  if (tournamentIds.length > 0) {
    const { data: seriesRows, error: seriesLoadError } = await client
      .from("series_results")
      .select("id, team_one_name, team_two_name, team_one_id, team_two_id")
      .in("tournament_id", tournamentIds);

    if (seriesLoadError) {
      return { ok: false, message: `Could not load series for backfill: ${seriesLoadError.message}` };
    }

    const matchingSeriesUpdates = ((seriesRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const updatePayload: Record<string, unknown> = {};
        const teamOneMatches =
          !row.team_one_id && normalizeName(String(row.team_one_name ?? "")) === args.request.normalizedName;
        const teamTwoMatches =
          !row.team_two_id && normalizeName(String(row.team_two_name ?? "")) === args.request.normalizedName;

        if (teamOneMatches) {
          updatePayload.team_one_id = teamId;
          updatePayload.team_one_tier_id = args.request.tierId;
        }

        if (teamTwoMatches) {
          updatePayload.team_two_id = teamId;
          updatePayload.team_two_tier_id = args.request.tierId;
        }

        return Object.keys(updatePayload).length > 0
          ? {
              id: String(row.id),
              updatePayload
            }
          : null;
      })
      .filter((row): row is { id: string; updatePayload: Record<string, unknown> } => row !== null);

    for (const row of matchingSeriesUpdates) {
      const { error: updateError } = await client
        .from("series_results")
        .update(row.updatePayload as never)
        .eq("id", row.id);

      if (updateError) {
        return { ok: false, message: `Could not backfill series results: ${updateError.message}` };
      }
    }
  }

  const { error: appearanceUpdateError } = await client
    .from("unverified_appearances")
    .update({
      resolution_status: "confirmed",
      resolved_at: now,
      resolved_by: args.adminAccountId,
      resolved_team_id: teamId
    } as never)
    .in(
      "id",
      args.appearances.map((appearance) => appearance.id)
    );

  if (appearanceUpdateError) {
    return { ok: false, message: `Could not resolve unverified appearances: ${appearanceUpdateError.message}` };
  }

  await logActivity(args.adminAccountId, "confirmed", `Unverified team ${teamName} created and verified`);

  return {
    ok: true,
    message: `${teamName} has been created as a verified team.`,
    teamId
  };
}

export async function resolveUnverifiedTeam(
  request: ResolveUnverifiedRequest,
  adminAccountId: string
): Promise<ResolveUnverifiedResponse> {
  const normalizedName = normalizeName(request.normalizedName ?? "");
  if (!normalizedName) {
    return { ok: false, message: "normalizedName is required." };
  }

  const appearances = await getPendingAppearances(normalizedName);
  if (appearances.length === 0) {
    return { ok: false, message: "No pending unverified appearances were found for that team." };
  }

  if (request.action === "dismiss") {
    return dismissPendingAppearances({
      appearanceIds: appearances.map((appearance) => appearance.id),
      normalizedName,
      adminAccountId,
      dismissReason: request.dismissReason,
      dismissNote: request.dismissNote
    });
  }

  if (request.action !== "confirm") {
    return { ok: false, message: "action must be either confirm or dismiss." };
  }

  return confirmPendingAppearances({
    request: {
      ...request,
      normalizedName
    },
    appearances,
    adminAccountId
  });
}
