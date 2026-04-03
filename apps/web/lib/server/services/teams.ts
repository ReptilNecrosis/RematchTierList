import type {
  EligibilityFlag,
  MovementType,
  StagedMoveValidationIssue,
  StagedTeamMove,
  Team,
  TierId
} from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

import { activityLog, adminAccounts, stagedTeamMoves, teams, tierHistory } from "../../sample-data/demo";
import { getServiceSupabase } from "../supabase";

type StageMoveResult = {
  ok: boolean;
  message: string;
  stagedMove?: StagedTeamMove;
  removed?: boolean;
};

type PublishMovesResult = {
  ok: boolean;
  message: string;
  issues?: StagedMoveValidationIssue[];
  publishedCount?: number;
};

type ResetMovesResult = {
  ok: boolean;
  message: string;
  clearedCount?: number;
};

type StagePendingMovesResult = {
  ok: boolean;
  message: string;
  stagedCount?: number;
  skippedCount?: number;
};

type ResolveStageActionResult =
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "remove";
      message: string;
    }
  | {
      kind: "stage";
      message: string;
      targetTierId: TierId;
      movementType: MovementType;
    };

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTeamNameForComparison(value: string) {
  return value.trim().toLowerCase();
}

function getTierDefinition(tierId: TierId) {
  return TIER_DEFINITIONS.find((tier) => tier.id === tierId) ?? null;
}

function getDemoAdminIdentity(adminId: string) {
  const admin = adminAccounts.find((entry) => entry.id === adminId);
  return {
    username: admin?.username ?? "unknown-admin",
    displayName: admin?.displayName ?? "Unknown Admin"
  };
}

function getTierRank(tierId: TierId) {
  return getTierDefinition(tierId)?.rank ?? null;
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

function buildRemoveStageMessage(teamName: string) {
  return `Removed staged move for ${teamName}.`;
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

function buildStageMessage(teamName: string, movementType: MovementType, targetTierId: TierId) {
  const tierLabel = getTierDefinition(targetTierId)?.shortLabel ?? targetTierId;
  return `Staged ${movementType} for ${teamName} to ${tierLabel}.`;
}

function buildPublishMessage(publishedCount: number) {
  return publishedCount === 1
    ? "Published 1 staged move."
    : `Published ${publishedCount} staged moves.`;
}

function buildStagePendingMovesMessage(stagedCount: number, skippedCount: number) {
  const stagedCopy =
    stagedCount === 1 ? "Staged 1 pending move." : `Staged ${stagedCount} pending moves.`;

  if (skippedCount === 0) {
    return stagedCopy;
  }

  const skippedCopy =
    skippedCount === 1
      ? "Skipped 1 Tier 1-related move."
      : `Skipped ${skippedCount} Tier 1-related moves.`;

  return `${stagedCopy} ${skippedCopy}`;
}

function cloneTeams(input: Team[]) {
  return input.map((team) => ({ ...team }));
}

function buildTierMap(input: Team[]) {
  return Object.fromEntries(input.map((team) => [team.id, team.tierId] as const));
}

function applyStagedMovesToTeams(input: Team[], stagedMovesInput: StagedTeamMove[]) {
  const stagedMap = new Map(stagedMovesInput.map((move) => [move.teamId, move.stagedTierId]));
  return input.map((team) => ({
    ...team,
    tierId: stagedMap.get(team.id) ?? team.tierId
  }));
}

function buildValidationIssues(liveTeams: Team[], stagedMovesInput: StagedTeamMove[]) {
  const issues: StagedMoveValidationIssue[] = [];
  const previewTeams = applyStagedMovesToTeams(liveTeams, stagedMovesInput);

  for (const move of stagedMovesInput) {
    if (!liveTeams.some((team) => team.id === move.teamId)) {
      issues.push({
        teamId: move.teamId,
        message: "A staged move references a missing team."
      });
    }
  }

  for (const tier of TIER_DEFINITIONS) {
    if (tier.maxTeams === null) {
      continue;
    }

    const count = previewTeams.filter((team) => team.tierId === tier.id).length;
    if (count > tier.maxTeams) {
      issues.push({
        message: buildCapacityError(tier.id)
      });
    }
  }

  return issues;
}

function getMovementTypeForTarget(liveTierId: TierId, targetTierId: TierId): MovementType | null {
  const liveRank = getTierRank(liveTierId);
  const targetRank = getTierRank(targetTierId);

  if (liveRank === null || targetRank === null || liveRank === targetRank) {
    return null;
  }

  return targetRank < liveRank ? "promotion" : "demotion";
}

function shouldSkipBulkPendingFlag(flag: Pick<EligibilityFlag, "tierId" | "movementType">) {
  if (flag.tierId === "tier1") {
    return true;
  }

  return getAdjacentTierId(flag.tierId, flag.movementType) === "tier1";
}

function resolveStageAction(args: {
  team: Team;
  existingMove?: StagedTeamMove;
  movementType?: MovementType;
  targetTierId?: TierId;
}): ResolveStageActionResult {
  if (args.targetTierId) {
    if (args.targetTierId === args.team.tierId) {
      return {
        kind: "remove",
        message: buildRemoveStageMessage(args.team.name)
      };
    }

    const movementType = getMovementTypeForTarget(args.team.tierId, args.targetTierId);
    if (!movementType) {
      return {
        kind: "error",
        message: "Could not determine the staged move direction."
      };
    }

    return {
      kind: "stage",
      message: buildStageMessage(args.team.name, movementType, args.targetTierId),
      targetTierId: args.targetTierId,
      movementType
    };
  }

  if (!args.movementType) {
    return {
      kind: "error",
      message: "movementType or targetTierId is required."
    };
  }

  const effectiveTierId = args.existingMove?.stagedTierId ?? args.team.tierId;
  const targetTierId = getAdjacentTierId(effectiveTierId, args.movementType);
  if (!targetTierId) {
    return {
      kind: "error",
      message: buildBoundaryMessage(effectiveTierId, args.movementType)
    };
  }

  if (targetTierId === args.team.tierId) {
    return {
      kind: "remove",
      message: buildRemoveStageMessage(args.team.name)
    };
  }

  return {
    kind: "stage",
    message: buildStageMessage(args.team.name, args.movementType, targetTierId),
    targetTierId,
    movementType: args.movementType
  };
}

function recordDemoStageLog(args: {
  movementType: MovementType;
  actorAdminId: string;
  targetTierId: TierId;
  now: string;
  teamName: string;
}) {
  const actor = getDemoAdminIdentity(args.actorAdminId);
  activityLog.unshift({
    id: createId("act"),
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    verb: `staged ${args.movementType}`,
    subject: `${args.teamName} to ${getTierDefinition(args.targetTierId)?.shortLabel ?? args.targetTierId}`,
    createdAt: args.now
  });
}

function publishDemoMove(args: {
  team: Team;
  stagedMove: StagedTeamMove;
  actorAdminId: string;
  now: string;
}) {
  const actor = getDemoAdminIdentity(args.actorAdminId);
  const fromTierId = args.team.tierId;
  args.team.tierId = args.stagedMove.stagedTierId;

  tierHistory.unshift({
    id: createId("hist"),
    teamId: args.team.id,
    fromTierId,
    toTierId: args.stagedMove.stagedTierId,
    movementType: args.stagedMove.movementType,
    reason: `Published staged ${args.stagedMove.movementType}`,
    createdAt: args.now,
    createdBy: args.actorAdminId
  });

  activityLog.unshift({
    id: createId("act"),
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    verb: `published ${args.stagedMove.movementType}`,
    subject: `${args.team.name} to ${getTierDefinition(args.stagedMove.stagedTierId)?.shortLabel ?? args.stagedMove.stagedTierId}`,
    createdAt: args.now
  });
}

function stageDemoMove(args: {
  teamId: string;
  actorAdminId: string;
  movementType?: MovementType;
  targetTierId?: TierId;
}): StageMoveResult {
  const team = teams.find((entry) => entry.id === args.teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  const existingMoveIndex = stagedTeamMoves.findIndex((move) => move.teamId === args.teamId);
  const existingMove = existingMoveIndex >= 0 ? stagedTeamMoves[existingMoveIndex] : undefined;
  const resolvedAction = resolveStageAction({
    team,
    existingMove,
    movementType: args.movementType,
    targetTierId: args.targetTierId
  });

  if (resolvedAction.kind === "error") {
    return {
      ok: false,
      message: resolvedAction.message
    };
  }

  if (resolvedAction.kind === "remove") {
    if (existingMoveIndex >= 0) {
      stagedTeamMoves.splice(existingMoveIndex, 1);
    }
    return {
      ok: true,
      message: resolvedAction.message,
      removed: true
    };
  }

  const now = new Date().toISOString();
  const stagedMove: StagedTeamMove = {
    id: existingMove?.id ?? createId("stage"),
    teamId: args.teamId,
    liveTierId: team.tierId,
    stagedTierId: resolvedAction.targetTierId,
    movementType: resolvedAction.movementType,
    stagedByAdminId: args.actorAdminId,
    createdAt: existingMove?.createdAt ?? now,
    updatedAt: now
  };

  if (existingMoveIndex >= 0) {
    stagedTeamMoves[existingMoveIndex] = stagedMove;
  } else {
    stagedTeamMoves.unshift(stagedMove);
  }

  recordDemoStageLog({
    movementType: resolvedAction.movementType,
    actorAdminId: args.actorAdminId,
    targetTierId: resolvedAction.targetTierId,
    now,
    teamName: team.name
  });

  return {
    ok: true,
    message: resolvedAction.message,
    stagedMove
  };
}

function stageDemoPendingMoves(args: {
  pendingFlags: EligibilityFlag[];
  actorAdminId: string;
}): StagePendingMovesResult {
  if (args.pendingFlags.length === 0) {
    return {
      ok: false,
      message: "There are no pending moves to stage."
    };
  }

  let stagedCount = 0;
  let skippedCount = 0;

  for (const flag of args.pendingFlags) {
    if (shouldSkipBulkPendingFlag(flag)) {
      skippedCount += 1;
      continue;
    }

    const result = stageDemoMove({
      teamId: flag.teamId,
      movementType: flag.movementType,
      actorAdminId: args.actorAdminId
    });

    if (!result.ok) {
      return result;
    }

    stagedCount += 1;
  }

  return {
    ok: true,
    message: buildStagePendingMovesMessage(stagedCount, skippedCount),
    stagedCount,
    skippedCount
  };
}

function removeDemoStagedMove(teamId: string): StageMoveResult {
  const stagedMoveIndex = stagedTeamMoves.findIndex((move) => move.teamId === teamId);
  if (stagedMoveIndex < 0) {
    return {
      ok: false,
      message: "No staged move was found for that team."
    };
  }

  stagedTeamMoves.splice(stagedMoveIndex, 1);
  return {
    ok: true,
    message: "Removed staged move.",
    removed: true
  };
}

function resetDemoStagedMoves(): ResetMovesResult {
  const clearedCount = stagedTeamMoves.length;
  stagedTeamMoves.splice(0, stagedTeamMoves.length);
  return {
    ok: true,
    message: clearedCount === 0 ? "No staged moves to clear." : "Cleared all staged moves.",
    clearedCount
  };
}

function publishDemoStagedMoves(actorAdminId: string): PublishMovesResult {
  if (stagedTeamMoves.length === 0) {
    return {
      ok: false,
      message: "There are no staged moves to publish."
    };
  }

  const issues = buildValidationIssues(teams, stagedTeamMoves);
  if (issues.length > 0) {
    return {
      ok: false,
      message: "Fix the staged moves before publishing.",
      issues
    };
  }

  const now = new Date().toISOString();
  const publishedMoves = [...stagedTeamMoves];

  for (const stagedMove of publishedMoves) {
    const team = teams.find((entry) => entry.id === stagedMove.teamId);
    if (!team) {
      continue;
    }
    publishDemoMove({
      team,
      stagedMove,
      actorAdminId,
      now
    });
  }

  stagedTeamMoves.splice(0, stagedTeamMoves.length);

  return {
    ok: true,
    message: buildPublishMessage(publishedMoves.length),
    publishedCount: publishedMoves.length
  };
}

async function fetchLiveStagedMoves() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("staged_team_moves")
    .select("id, team_id, live_tier_id, staged_tier_id, movement_type, staged_by_admin_id, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load staged moves: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): StagedTeamMove => ({
      id: String(row.id),
      teamId: String(row.team_id),
      liveTierId: String(row.live_tier_id) as TierId,
      stagedTierId: String(row.staged_tier_id) as TierId,
      movementType: row.movement_type === "demotion" ? "demotion" : "promotion",
      stagedByAdminId: row.staged_by_admin_id ? String(row.staged_by_admin_id) : "",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    })
  );
}

async function fetchLiveTeamsForMoves() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("teams")
    .select("id, slug, name, short_code, current_tier_id, verified, notes, created_at")
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Could not load teams for staged moves: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): Team => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      shortCode: String(row.short_code),
      tierId: String(row.current_tier_id) as TierId,
      verified: Boolean(row.verified),
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
      addedBy: "supabase"
    })
  );
}

async function stageLiveMove(args: {
  teamId: string;
  movementType?: MovementType;
  targetTierId?: TierId;
  actorAdminId: string;
}): Promise<StageMoveResult> {
  const client = getServiceSupabase();
  if (!client) {
    return stageDemoMove(args);
  }

  const [liveTeams, liveStagedMoves] = await Promise.all([fetchLiveTeamsForMoves(), fetchLiveStagedMoves()]);
  if (!liveTeams || !liveStagedMoves) {
    return stageDemoMove(args);
  }

  const team = liveTeams.find((entry) => entry.id === args.teamId);
  if (!team) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  const existingMove = liveStagedMoves.find((move) => move.teamId === args.teamId);
  const resolvedAction = resolveStageAction({
    team,
    existingMove,
    movementType: args.movementType,
    targetTierId: args.targetTierId
  });

  if (resolvedAction.kind === "error") {
    return {
      ok: false,
      message: resolvedAction.message
    };
  }

  if (resolvedAction.kind === "remove") {
    if (existingMove) {
      const { error: deleteError } = await client.from("staged_team_moves").delete().eq("team_id", args.teamId);
      if (deleteError) {
        throw new Error(`Could not remove staged move: ${deleteError.message}`);
      }
    }
    return {
      ok: true,
      message: resolvedAction.message,
      removed: true
    };
  }

  const now = new Date().toISOString();
  const payload = {
    team_id: args.teamId,
    live_tier_id: team.tierId,
    staged_tier_id: resolvedAction.targetTierId,
    movement_type: resolvedAction.movementType,
    staged_by_admin_id: args.actorAdminId,
    updated_at: now
  };

  const stagedMoveRecord = existingMove
    ? await client
        .from("staged_team_moves")
        .update(payload as never)
        .eq("team_id", args.teamId)
        .select("id, team_id, live_tier_id, staged_tier_id, movement_type, staged_by_admin_id, created_at, updated_at")
        .single()
    : await client
        .from("staged_team_moves")
        .insert({
          ...payload,
          created_at: now
        } as never)
        .select("id, team_id, live_tier_id, staged_tier_id, movement_type, staged_by_admin_id, created_at, updated_at")
        .single();

  if (stagedMoveRecord.error) {
    throw new Error(`Could not stage move: ${stagedMoveRecord.error.message}`);
  }

  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: `staged ${resolvedAction.movementType}`,
    subject: `${team.name} to ${getTierDefinition(resolvedAction.targetTierId)?.shortLabel ?? resolvedAction.targetTierId}`,
    created_at: now
  } as never);

  if (activityError) {
    throw new Error(`Could not log staged move: ${activityError.message}`);
  }

  const record = stagedMoveRecord.data as Record<string, unknown>;
  const stagedMove: StagedTeamMove = {
    id: String(record.id),
    teamId: String(record.team_id),
    liveTierId: String(record.live_tier_id) as TierId,
    stagedTierId: String(record.staged_tier_id) as TierId,
    movementType: record.movement_type === "demotion" ? "demotion" : "promotion",
    stagedByAdminId: record.staged_by_admin_id ? String(record.staged_by_admin_id) : "",
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at)
  };

  return {
    ok: true,
    message: resolvedAction.message,
    stagedMove
  };
}

async function stageLivePendingMoves(args: {
  pendingFlags: EligibilityFlag[];
  actorAdminId: string;
}): Promise<StagePendingMovesResult> {
  const client = getServiceSupabase();
  if (!client) {
    return stageDemoPendingMoves(args);
  }

  if (args.pendingFlags.length === 0) {
    return {
      ok: false,
      message: "There are no pending moves to stage."
    };
  }

  let stagedCount = 0;
  let skippedCount = 0;

  for (const flag of args.pendingFlags) {
    if (shouldSkipBulkPendingFlag(flag)) {
      skippedCount += 1;
      continue;
    }

    const result = await stageLiveMove({
      teamId: flag.teamId,
      movementType: flag.movementType,
      actorAdminId: args.actorAdminId
    });

    if (!result.ok) {
      return result;
    }

    stagedCount += 1;
  }

  return {
    ok: true,
    message: buildStagePendingMovesMessage(stagedCount, skippedCount),
    stagedCount,
    skippedCount
  };
}

async function removeLiveStagedMove(teamId: string): Promise<StageMoveResult> {
  const client = getServiceSupabase();
  if (!client) {
    return removeDemoStagedMove(teamId);
  }

  const { data, error } = await client
    .from("staged_team_moves")
    .delete()
    .eq("team_id", teamId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not remove staged move: ${error.message}`);
  }

  if (!data) {
    return {
      ok: false,
      message: "No staged move was found for that team."
    };
  }

  return {
    ok: true,
    message: "Removed staged move.",
    removed: true
  };
}

async function resetLiveStagedMoves(): Promise<ResetMovesResult> {
  const client = getServiceSupabase();
  if (!client) {
    return resetDemoStagedMoves();
  }

  const stagedMovesList = await fetchLiveStagedMoves();
  if (!stagedMovesList || stagedMovesList.length === 0) {
    return {
      ok: true,
      message: "No staged moves to clear.",
      clearedCount: 0
    };
  }

  const stagedIds = stagedMovesList.map((m) => m.id);
  const { error } = await client.from("staged_team_moves").delete().in("id", stagedIds);
  if (error) {
    throw new Error(`Could not clear staged moves: ${error.message}`);
  }

  return {
    ok: true,
    message: "Cleared all staged moves.",
    clearedCount: stagedMovesList.length
  };
}

async function publishLiveStagedMoves(actorAdminId: string): Promise<PublishMovesResult> {
  const client = getServiceSupabase();
  if (!client) {
    return publishDemoStagedMoves(actorAdminId);
  }

  const [liveTeams, liveStagedMoves] = await Promise.all([fetchLiveTeamsForMoves(), fetchLiveStagedMoves()]);
  if (!liveTeams || !liveStagedMoves) {
    return publishDemoStagedMoves(actorAdminId);
  }

  if (liveStagedMoves.length === 0) {
    return {
      ok: false,
      message: "There are no staged moves to publish."
    };
  }

  const issues = buildValidationIssues(liveTeams, liveStagedMoves);
  if (issues.length > 0) {
    return {
      ok: false,
      message: "Fix the staged moves before publishing.",
      issues
    };
  }

  const now = new Date().toISOString();
  const liveTeamMap = new Map(liveTeams.map((team) => [team.id, team]));

  for (const stagedMove of liveStagedMoves) {
    const team = liveTeamMap.get(stagedMove.teamId);
    if (!team) {
      continue;
    }

    const { error: updateError } = await client
      .from("teams")
      .update({ current_tier_id: stagedMove.stagedTierId } as never)
      .eq("id", stagedMove.teamId);

    if (updateError) {
      throw new Error(`Could not publish staged move: ${updateError.message}`);
    }

    const { error: historyError } = await client.from("team_tier_history").insert({
      team_id: stagedMove.teamId,
      from_tier_id: team.tierId,
      to_tier_id: stagedMove.stagedTierId,
      movement_type: stagedMove.movementType,
      reason: `Published staged ${stagedMove.movementType}`,
      created_by: actorAdminId,
      created_at: now
    } as never);

    if (historyError) {
      throw new Error(`Could not record published move history: ${historyError.message}`);
    }

    const { error: activityError } = await client.from("activity_log").insert({
      admin_account_id: actorAdminId,
      verb: `published ${stagedMove.movementType}`,
      subject: `${team.name} to ${getTierDefinition(stagedMove.stagedTierId)?.shortLabel ?? stagedMove.stagedTierId}`,
      created_at: now
    } as never);

    if (activityError) {
      throw new Error(`Could not log published move: ${activityError.message}`);
    }
  }

  const publishedIds = liveStagedMoves.map((m) => m.id);
  const { error: deleteError } = await client.from("staged_team_moves").delete().in("id", publishedIds);
  if (deleteError) {
    throw new Error(`Could not clear staged moves after publish: ${deleteError.message}`);
  }

  return {
    ok: true,
    message: buildPublishMessage(liveStagedMoves.length),
    publishedCount: liveStagedMoves.length
  };
}

export async function getStagedMoves() {
  try {
    const liveStagedMoves = await fetchLiveStagedMoves();
    return liveStagedMoves ?? [...stagedTeamMoves];
  } catch {
    return [...stagedTeamMoves];
  }
}

export function buildEffectiveTierByTeamId(teamsInput: Team[]) {
  return buildTierMap(teamsInput);
}

export function buildPreviewTeams(teamsInput: Team[], stagedMovesInput: StagedTeamMove[]) {
  return applyStagedMovesToTeams(cloneTeams(teamsInput), stagedMovesInput);
}

export function getStagedMoveValidationIssues(teamsInput: Team[], stagedMovesInput: StagedTeamMove[]) {
  return buildValidationIssues(teamsInput, stagedMovesInput);
}

export async function moveTeam(args: {
  teamId: string;
  movementType?: MovementType;
  targetTierId?: TierId;
  actorAdminId: string;
}) {
  try {
    return await stageLiveMove(args);
  } catch {
    return stageDemoMove(args);
  }
}

export async function stagePendingMoves(args: {
  pendingFlags: EligibilityFlag[];
  actorAdminId: string;
}) {
  const client = getServiceSupabase();
  if (!client) {
    return stageDemoPendingMoves(args);
  }

  return stageLivePendingMoves(args);
}

export async function removeStagedMove(teamId: string) {
  try {
    return await removeLiveStagedMove(teamId);
  } catch {
    return removeDemoStagedMove(teamId);
  }
}

export async function resetStagedMoves() {
  const client = getServiceSupabase();
  if (!client) {
    return resetDemoStagedMoves();
  }
  return resetLiveStagedMoves();
}

export async function publishStagedMoves(actorAdminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return publishDemoStagedMoves(actorAdminId);
  }
  return publishLiveStagedMoves(actorAdminId);
}

export async function clearInactivity(teamId: string) {
  const client = getServiceSupabase();
  if (client) {
    const { data, error } = await client.from("teams").select("name").eq("id", teamId).maybeSingle();
    if (error) {
      throw new Error(`Could not load team: ${error.message}`);
    }

    if (!data) {
      return {
        ok: false,
        message: "Team not found."
      };
    }

    return {
      ok: true,
      message: `Inactivity clear requested for ${String((data as Record<string, unknown>).name)}. This is a service contract endpoint until persistence is connected.`
    };
  }

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

export async function deleteTeam(teamId: string, actorAdminId: string) {
  const normalizedTeamId = teamId.trim();
  if (!normalizedTeamId) {
    return {
      ok: false,
      message: "teamId is required."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Team deletion requires live Supabase data."
    };
  }

  const { data, error } = await client.rpc(
    "delete_team_atomic",
    {
      target_team_id: normalizedTeamId,
      actor_admin_id: actorAdminId
    } as never
  );

  if (error) {
    if (error.message === "TEAM_NOT_FOUND") {
      return {
        ok: false,
        message: "Team not found."
      };
    }

    if (error.message === "ADMIN_NOT_FOUND") {
      throw new Error("Your admin session is no longer valid.");
    }

    throw new Error(`Could not delete team: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    teamId?: string;
    teamName?: string;
  };

  return {
    ok: true,
    message: `${payload.teamName ?? "The team"} has been deleted.`
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

export async function softDeleteTeam(teamId: string, actorAdminId: string) {
  const normalizedTeamId = teamId.trim();
  if (!normalizedTeamId) {
    return { ok: false, message: "teamId is required." };
  }

  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Team deletion requires live Supabase data." };
  }

  const { data, error } = await client.rpc(
    "soft_delete_team_atomic",
    {
      target_team_id: normalizedTeamId,
      actor_admin_id: actorAdminId,
    } as never
  );

  if (error) {
    if (error.message === "TEAM_NOT_FOUND") {
      return { ok: false, message: "Team not found." };
    }
    if (error.message === "ADMIN_NOT_FOUND") {
      throw new Error("Your admin session is no longer valid.");
    }
    if (error.message === "TEAM_ALREADY_DELETED") {
      return { ok: false, message: "Team is already deleted." };
    }
    throw new Error(`Could not delete team: ${error.message}`);
  }

  const payload = (data ?? {}) as { teamId?: string; teamName?: string };
  return {
    ok: true,
    message: `${payload.teamName ?? "The team"} has been deleted.`,
  };
}

export async function renameTeam(args: {
  teamId: string;
  nextName: string;
  nextShortCode?: string;
  actorAdminId: string;
}) {
  const normalizedTeamId = args.teamId.trim();
  const trimmedName = args.nextName.trim();
  const trimmedShortCode = args.nextShortCode?.trim() ?? "";

  if (!normalizedTeamId) {
    return {
      ok: false,
      message: "teamId is required."
    };
  }

  if (!trimmedName) {
    return {
      ok: false,
      message: "Team name cannot be empty."
    };
  }

  if (!trimmedShortCode) {
    return {
      ok: false,
      message: "Team tag cannot be empty."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      message: "Team renaming requires live Supabase data."
    };
  }

  const { data: teamRow, error: teamError } = await client
    .from("teams")
    .select("id, name, short_code, deleted_at")
    .eq("id", normalizedTeamId)
    .maybeSingle();

  if (teamError) {
    throw new Error(`Could not load team: ${teamError.message}`);
  }

  if (!teamRow || (teamRow as Record<string, unknown>).deleted_at) {
    return {
      ok: false,
      message: "Team not found."
    };
  }

  const currentName = String((teamRow as Record<string, unknown>).name);
  const currentShortCode = String((teamRow as Record<string, unknown>).short_code ?? "");
  const nameIsUnchanged =
    normalizeTeamNameForComparison(currentName) === normalizeTeamNameForComparison(trimmedName);
  const shortCodeIsUnchanged = currentShortCode.trim() === trimmedShortCode;

  if (nameIsUnchanged && shortCodeIsUnchanged) {
    return {
      ok: true,
      message: `${currentName} already uses that name and tag.`
    };
  }

  if (!nameIsUnchanged) {
    const { data: duplicateRow, error: duplicateError } = await client
      .from("teams")
      .select("id, name")
      .neq("id", normalizedTeamId)
      .is("deleted_at", null)
      .ilike("name", trimmedName)
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      throw new Error(`Could not validate team name: ${duplicateError.message}`);
    }

    if (duplicateRow) {
      return {
        ok: false,
        message: `Another active team already uses "${String((duplicateRow as Record<string, unknown>).name)}".`
      };
    }
  }

  const { error: updateError } = await client
    .from("teams")
    .update({ name: trimmedName, short_code: trimmedShortCode } as never)
    .eq("id", normalizedTeamId)
    .is("deleted_at", null);

  if (updateError) {
    throw new Error(`Could not rename team: ${updateError.message}`);
  }

  const aliasError = nameIsUnchanged
    ? null
    : (
        await client.from("team_aliases").insert({
          team_id: normalizedTeamId,
          alias: currentName
        } as never)
      ).error;

  if (aliasError && !aliasError.message.toLowerCase().includes("duplicate")) {
    throw new Error(`Could not preserve the previous team name as an alias: ${aliasError.message}`);
  }

  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: "updated team",
    subject: `${currentName} (${currentShortCode}) to ${trimmedName} (${trimmedShortCode})`
  } as never);

  if (activityError) {
    throw new Error(`Could not log team rename: ${activityError.message}`);
  }

  return {
    ok: true,
    message: `Updated ${currentName} to ${trimmedName} with tag ${trimmedShortCode}.`
  };
}
