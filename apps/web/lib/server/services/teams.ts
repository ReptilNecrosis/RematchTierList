import type { MovementType, Team, TierId } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

import { activityLog, teams, tierHistory } from "../../sample-data/demo";
import { getServiceSupabase } from "../supabase";

type MoveTeamResult = {
  ok: boolean;
  message: string;
  teamId?: string;
  teamName?: string;
  fromTierId?: TierId;
  toTierId?: TierId;
  movementType?: MovementType;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTierDefinition(tierId: TierId) {
  return TIER_DEFINITIONS.find((tier) => tier.id === tierId) ?? null;
}

function getAdjacentTierId(tierId: TierId, movementType: MovementType): TierId | null {
  const currentTier = getTierDefinition(tierId);
  if (!currentTier) {
    return null;
  }

  const nextRank = movementType === "promotion" ? currentTier.rank - 1 : currentTier.rank + 1;
  return TIER_DEFINITIONS.find((tier) => tier.rank === nextRank)?.id ?? null;
}

function buildBoundaryMessage(teamTierId: TierId, movementType: MovementType) {
  if (movementType === "promotion" && teamTierId === "tier1") {
    return "Tier 1 teams cannot be promoted.";
  }

  if (movementType === "demotion" && teamTierId === "tier7") {
    return "Tier 7 teams cannot be demoted.";
  }

  return "That move is outside the tier boundaries.";
}

function buildSuccessMessage(teamName: string, movementType: MovementType, targetTierId: TierId) {
  const tier = getTierDefinition(targetTierId);
  const tierLabel = tier?.shortLabel ?? targetTierId;
  return movementType === "promotion"
    ? `${teamName} promoted to ${tierLabel}.`
    : `${teamName} demoted to ${tierLabel}.`;
}

function buildCapacityError(targetTierId: TierId) {
  const tier = getTierDefinition(targetTierId);
  return `${tier?.shortLabel ?? targetTierId} is full`;
}

function validateMove(args: {
  team: Pick<Team, "tierId" | "name">;
  movementType: MovementType;
  destinationOccupancy: number;
}) {
  const targetTierId = getAdjacentTierId(args.team.tierId, args.movementType);
  if (!targetTierId) {
    return {
      ok: false,
      message: buildBoundaryMessage(args.team.tierId, args.movementType)
    } as const;
  }

  const targetTier = getTierDefinition(targetTierId);
  if (!targetTier) {
    return {
      ok: false,
      message: "Destination tier could not be resolved."
    } as const;
  }

  if (targetTier.maxTeams !== null && args.destinationOccupancy >= targetTier.maxTeams) {
    return {
      ok: false,
      message: buildCapacityError(targetTierId)
    } as const;
  }

  return {
    ok: true,
    targetTierId
  } as const;
}

function recordDemoMove(args: {
  team: Team;
  movementType: MovementType;
  actorAdminId: string;
  targetTierId: TierId;
  now: string;
}): MoveTeamResult {
  const fromTierId = args.team.tierId;
  args.team.tierId = args.targetTierId;

  tierHistory.unshift({
    id: createId("hist"),
    teamId: args.team.id,
    fromTierId,
    toTierId: args.targetTierId,
    movementType: args.movementType,
    reason: `Admin ${args.movementType}`,
    createdAt: args.now,
    createdBy: args.actorAdminId
  });

  activityLog.unshift({
    id: createId("act"),
    actorUsername: "admin",
    verb: args.movementType === "promotion" ? "promoted" : "demoted",
    subject: `${args.team.name} to ${getTierDefinition(args.targetTierId)?.shortLabel ?? args.targetTierId}`,
    createdAt: args.now
  });

  return {
    ok: true,
    message: buildSuccessMessage(args.team.name, args.movementType, args.targetTierId),
    teamId: args.team.id,
    teamName: args.team.name,
    fromTierId,
    toTierId: args.targetTierId,
    movementType: args.movementType
  };
}

async function moveDemoTeam(teamId: string, movementType: MovementType, actorAdminId: string) {
  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    } satisfies MoveTeamResult;
  }

  const validation = validateMove({
    team,
    movementType,
    destinationOccupancy: teams.filter((entry) => entry.tierId === getAdjacentTierId(team.tierId, movementType)).length
  });

  if (!validation.ok) {
    return validation;
  }

  return recordDemoMove({
    team,
    movementType,
    actorAdminId,
    targetTierId: validation.targetTierId,
    now: new Date().toISOString()
  });
}

async function moveLiveTeam(args: {
  teamId: string;
  movementType: MovementType;
  actorAdminId: string;
}) {
  const client = getServiceSupabase();
  if (!client) {
    return moveDemoTeam(args.teamId, args.movementType, args.actorAdminId);
  }

  const { data: teamRow, error: teamError } = await client
    .from("teams")
    .select("id, name, current_tier_id")
    .eq("id", args.teamId)
    .maybeSingle();

  if (teamError) {
    throw new Error(`Could not load team for movement: ${teamError.message}`);
  }

  if (!teamRow) {
    return moveDemoTeam(args.teamId, args.movementType, args.actorAdminId);
  }

  const teamRecord = teamRow as Record<string, unknown>;
  const team = {
    id: String(teamRecord.id),
    name: String(teamRecord.name),
    tierId: String(teamRecord.current_tier_id) as TierId
  };

  const targetTierId = getAdjacentTierId(team.tierId, args.movementType);
  const { data: destinationRows, error: destinationError } = targetTierId
    ? await client
        .from("teams")
        .select("id")
        .eq("current_tier_id", targetTierId)
    : { data: null, error: null };

  if (destinationError) {
    throw new Error(`Could not validate destination tier capacity: ${destinationError.message}`);
  }

  const validation = validateMove({
    team,
    movementType: args.movementType,
    destinationOccupancy: (destinationRows ?? []).length
  });

  if (!validation.ok) {
    return validation;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from("teams")
    .update({ current_tier_id: validation.targetTierId } as never)
    .eq("id", args.teamId);

  if (updateError) {
    throw new Error(`Could not move team: ${updateError.message}`);
  }

  const { error: historyError } = await client.from("team_tier_history").insert({
    team_id: args.teamId,
    from_tier_id: team.tierId,
    to_tier_id: validation.targetTierId,
    movement_type: args.movementType,
    reason: `Admin ${args.movementType}`,
    created_by: args.actorAdminId,
    created_at: now
  } as never);

  if (historyError) {
    throw new Error(`Could not record tier history: ${historyError.message}`);
  }

  const targetTier = getTierDefinition(validation.targetTierId);
  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: args.movementType === "promotion" ? "promoted" : "demoted",
    subject: `${team.name} to ${targetTier?.shortLabel ?? validation.targetTierId}`,
    created_at: now
  } as never);

  if (activityError) {
    throw new Error(`Could not record activity log: ${activityError.message}`);
  }

  return {
    ok: true,
    message: buildSuccessMessage(team.name, args.movementType, validation.targetTierId),
    teamId: args.teamId,
    teamName: team.name,
    fromTierId: team.tierId,
    toTierId: validation.targetTierId,
    movementType: args.movementType
  } satisfies MoveTeamResult;
}

export async function moveTeam(args: {
  teamId: string;
  movementType: MovementType;
  actorAdminId: string;
}) {
  const demoTeam = teams.find((entry) => entry.id === args.teamId);

  try {
    return await moveLiveTeam(args);
  } catch (error) {
    if (demoTeam) {
      return moveDemoTeam(args.teamId, args.movementType, args.actorAdminId);
    }

    throw error;
  }
}

export async function clearInactivity(teamId: string) {
  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  return {
    ok: true,
    message: `Inactivity clear requested for ${team.name}. This is a service contract endpoint until persistence is connected.`
  };
}

export async function confirmUnverifiedTeam(normalizedName: string, actorAdminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Supabase is not configured. Cannot confirm unverified team."
    };
  }

  const { data: teamRows, error: fetchError } = await client
    .from("teams")
    .select("id, name")
    .eq("verified", false)
    .ilike("name", normalizedName.replace(/-/g, " "));

  if (fetchError) {
    throw new Error(`Could not find team: ${fetchError.message}`);
  }

  const team = ((teamRows ?? []) as Array<Record<string, string>>).find(
    (t) => t.name.trim().toLowerCase() === normalizedName
  );

  if (!team) {
    return {
      ok: false,
      message: `No unverified team found matching "${normalizedName}".`
    };
  }

  const { error: updateError } = await client
    .from("teams")
    .update({ verified: true } as never)
    .eq("id", team.id);

  if (updateError) {
    throw new Error(`Could not confirm team: ${updateError.message}`);
  }

  const { error: deleteError } = await client
    .from("unverified_appearances")
    .delete()
    .eq("normalized_name", normalizedName);

  if (deleteError) {
    throw new Error(`Could not clear appearances: ${deleteError.message}`);
  }

  await client.from("activity_log").insert({
    admin_account_id: actorAdminId,
    verb: "confirmed",
    subject: `Unverified team ${team.name}`
  } as never);

  return { ok: true, teamName: team.name };
}

export async function rejectUnverifiedTeam(normalizedName: string, actorAdminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Supabase is not configured. Cannot reject unverified team."
    };
  }

  const { data: teamRows } = await client
    .from("teams")
    .select("id, name")
    .eq("verified", false);

  const team = ((teamRows ?? []) as Array<Record<string, string>>).find(
    (t) => t.name.trim().toLowerCase() === normalizedName
  );

  if (team) {
    const { error: deleteTeamError } = await client.from("teams").delete().eq("id", team.id);
    if (deleteTeamError) {
      throw new Error(`Could not delete team: ${deleteTeamError.message}`);
    }
  }

  const { error: deleteError } = await client
    .from("unverified_appearances")
    .delete()
    .eq("normalized_name", normalizedName);

  if (deleteError) {
    throw new Error(`Could not clear appearances: ${deleteError.message}`);
  }

  await client.from("activity_log").insert({
    admin_account_id: actorAdminId,
    verb: "rejected",
    subject: `Unverified team ${normalizedName}`
  } as never);

  return { ok: true };
}
