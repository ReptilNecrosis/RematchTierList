import type {
  PendingUnverifiedPlacement,
  ResolveUnverifiedRequest,
  ResolveUnverifiedResponse,
  TierId,
  UnverifiedAppearance
} from "@rematch/shared-types";

import { getServiceSupabase } from "../supabase";
import { mergeUnverifiedTeamIntoExistingTeam } from "./team-merge";

export const PENDING_UNVERIFIED_TEAM_ID_PREFIX = "pending:";

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeShortCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function parseTierId(value: unknown): TierId | undefined {
  return value === "tier1" ||
    value === "tier2" ||
    value === "tier3" ||
    value === "tier4" ||
    value === "tier5" ||
    value === "tier6" ||
    value === "tier7"
    ? value
    : undefined;
}

function isPlacementTier(tierId: TierId | undefined): tierId is TierId {
  return Boolean(
    tierId &&
      (tierId === "tier1" ||
        tierId === "tier2" ||
        tierId === "tier3" ||
        tierId === "tier4" ||
        tierId === "tier5" ||
        tierId === "tier6" ||
        tierId === "tier7")
  );
}

function mapAppearanceRow(row: Record<string, unknown>): UnverifiedAppearance {
  return {
    id: String(row.id),
    teamName: String(row.team_name),
    normalizedName: String(row.normalized_name),
    tournamentId: String(row.tournament_id),
    seenAt: String(row.seen_at),
    resolutionStatus:
      row.resolution_status === "pending" || row.resolution_status === "confirmed" || row.resolution_status === "dismissed"
        ? row.resolution_status
        : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolvedTeamId: row.resolved_team_id ? String(row.resolved_team_id) : undefined,
    pendingTeamName: row.pending_team_name ? String(row.pending_team_name) : undefined,
    pendingShortCode: row.pending_short_code ? String(row.pending_short_code) : undefined,
    pendingTierId: parseTierId(row.pending_tier_id)
  };
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

async function getOpenAppearances(normalizedName: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Database not configured.");
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select(
      "id, team_name, normalized_name, tournament_id, seen_at, resolution_status, resolved_at, resolved_by, resolved_team_id, pending_team_name, pending_short_code, pending_tier_id"
    )
    .eq("normalized_name", normalizedName)
    .or("resolution_status.is.null,resolution_status.eq.pending")
    .order("seen_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load unverified appearances: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapAppearanceRow);
}

async function getPendingAppearanceRows() {
  const client = getServiceSupabase();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select(
      "id, team_name, normalized_name, tournament_id, seen_at, resolution_status, resolved_at, resolved_by, resolved_team_id, pending_team_name, pending_short_code, pending_tier_id"
    )
    .eq("resolution_status", "pending")
    .order("seen_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load pending unverified placements: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapAppearanceRow);
}

async function loadTeamIdentityConflicts(teamName: string, shortCode: string) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      duplicateName: false,
      duplicateShortCode: false
    };
  }

  const { data, error } = await client
    .from("teams")
    .select("name, short_code")
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Could not validate existing teams: ${error.message}`);
  }

  const normalizedCanonicalName = normalizeName(teamName);
  const normalizedPendingShortCode = normalizeShortCode(shortCode);
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  return {
    duplicateName: rows.some((team) => normalizeName(String(team.name ?? "")) === normalizedCanonicalName),
    duplicateShortCode: rows.some(
      (team) => normalizeShortCode(String(team.short_code ?? "")) === normalizedPendingShortCode
    )
  };
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

  const reasonPart = args.dismissReason ? ` - Reason: ${args.dismissReason}` : "";
  const notePart = args.dismissNote ? ` - Note: ${args.dismissNote}` : "";
  await logActivity(args.adminAccountId, "dismissed", `Unverified team ${args.normalizedName}${reasonPart}${notePart}`);
  return { ok: true, message: "Unverified team dismissed from the current queue." };
}

async function cancelPendingAppearances(args: {
  appearances: UnverifiedAppearance[];
  normalizedName: string;
  adminAccountId: string;
}): Promise<ResolveUnverifiedResponse> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  const pendingRows = args.appearances.filter((appearance) => appearance.resolutionStatus === "pending");
  if (pendingRows.length === 0) {
    return { ok: false, message: "There is no pending staged placement to cancel for that team." };
  }

  const { error } = await client
    .from("unverified_appearances")
    .update({
      resolution_status: null,
      resolved_at: null,
      resolved_by: null,
      resolved_team_id: null,
      pending_team_name: null,
      pending_short_code: null,
      pending_tier_id: null
    } as never)
    .in(
      "id",
      pendingRows.map((appearance) => appearance.id)
    );

  if (error) {
    return { ok: false, message: `Could not cancel pending staging: ${error.message}` };
  }

  await logActivity(args.adminAccountId, "cancelled pending", `Unverified team ${args.normalizedName}`);
  return {
    ok: true,
    message: "Pending staging cleared. The team is back in the normal unverified queue."
  };
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

  if (!isPlacementTier(args.request.tierId)) {
    return { ok: false, message: "tierId must be a valid tier between Tier 1 and Tier 7." };
  }

  const { duplicateName, duplicateShortCode } = await loadTeamIdentityConflicts(teamName, shortCode);
  if (duplicateName) {
    return {
      ok: false,
      message: `A team named "${teamName}" already exists. Choose a different canonical name.`
    };
  }

  if (duplicateShortCode) {
    return {
      ok: false,
      message: `Short code "${shortCode}" is already in use. Choose a different short code.`
    };
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from("unverified_appearances")
    .update({
      resolution_status: "pending",
      resolved_at: now,
      resolved_by: args.adminAccountId,
      resolved_team_id: null,
      pending_team_name: teamName,
      pending_short_code: shortCode,
      pending_tier_id: args.request.tierId
    } as never)
    .in(
      "id",
      args.appearances.map((appearance) => appearance.id)
    );

  if (error) {
    return { ok: false, message: `Could not stage the unverified team: ${error.message}` };
  }

  await logActivity(
    args.adminAccountId,
    "staged unverified",
    `Unverified team ${teamName} for ${args.request.tierId} preview`
  );

  return {
    ok: true,
    message: `${teamName} has been staged in the admin preview. It will stay pending until Confirm Moves is used.`
  };
}

export function buildPendingUnverifiedTeamId(normalizedName: string) {
  return `${PENDING_UNVERIFIED_TEAM_ID_PREFIX}${normalizeName(normalizedName)}`;
}

export function isPendingUnverifiedTeamId(teamId: string) {
  return teamId.startsWith(PENDING_UNVERIFIED_TEAM_ID_PREFIX);
}

export function getNormalizedNameFromPendingTeamId(teamId: string) {
  return isPendingUnverifiedTeamId(teamId)
    ? normalizeName(teamId.slice(PENDING_UNVERIFIED_TEAM_ID_PREFIX.length))
    : null;
}

export async function getPendingUnverifiedPlacements(): Promise<PendingUnverifiedPlacement[]> {
  const appearances = await getPendingAppearanceRows();
  const grouped = new Map<string, PendingUnverifiedPlacement>();
  const tournamentSets = new Map<string, Set<string>>();

  for (const appearance of appearances) {
    const normalizedName = appearance.normalizedName;
    const pendingTeamName = appearance.pendingTeamName?.trim() ?? appearance.teamName;
    const pendingShortCode = normalizeShortCode(appearance.pendingShortCode ?? "");
    const pendingTierId = appearance.pendingTierId;
    if (!pendingShortCode || !pendingTierId) {
      continue;
    }

    const tournamentSet = tournamentSets.get(normalizedName) ?? new Set<string>();
    tournamentSet.add(appearance.tournamentId);
    tournamentSets.set(normalizedName, tournamentSet);

    const existing = grouped.get(normalizedName);
    if (!existing) {
      grouped.set(normalizedName, {
        id: buildPendingUnverifiedTeamId(normalizedName),
        normalizedName,
        teamName: pendingTeamName,
        shortCode: pendingShortCode,
        tierId: pendingTierId,
        appearances: 1,
        distinctTournaments: tournamentSet.size,
        firstSeenAt: appearance.seenAt,
        lastSeenAt: appearance.seenAt,
        stagedAt: appearance.resolvedAt,
        stagedBy: appearance.resolvedBy,
        adminHref: `/admin/unverified/${encodeURIComponent(normalizedName)}`
      });
      continue;
    }

    existing.appearances += 1;
    existing.distinctTournaments = tournamentSet.size;
    existing.firstSeenAt = appearance.seenAt < existing.firstSeenAt ? appearance.seenAt : existing.firstSeenAt;
    existing.lastSeenAt = appearance.seenAt > existing.lastSeenAt ? appearance.seenAt : existing.lastSeenAt;
    existing.stagedAt =
      existing.stagedAt && appearance.resolvedAt
        ? appearance.resolvedAt < existing.stagedAt
          ? appearance.resolvedAt
          : existing.stagedAt
        : existing.stagedAt ?? appearance.resolvedAt;
  }

  return [...grouped.values()].sort(
    (left, right) =>
      right.distinctTournaments - left.distinctTournaments ||
      right.appearances - left.appearances ||
      left.teamName.localeCompare(right.teamName)
  );
}

export async function updatePendingUnverifiedPlacementTier(args: {
  normalizedName: string;
  targetTierId: TierId;
  adminAccountId: string;
}) {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  if (!isPlacementTier(args.targetTierId)) {
    return { ok: false, message: "Pending unverified teams must stay in Tier 1 through Tier 7." };
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .update({
      pending_tier_id: args.targetTierId,
      resolved_at: new Date().toISOString(),
      resolved_by: args.adminAccountId
    } as never)
    .eq("normalized_name", args.normalizedName)
    .eq("resolution_status", "pending")
    .select("id");

  if (error) {
    return { ok: false, message: `Could not update the pending preview tier: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { ok: false, message: "No pending staged placement exists for that team." };
  }

  await logActivity(
    args.adminAccountId,
    "updated pending tier",
    `Unverified team ${args.normalizedName} to ${args.targetTierId}`
  );

  return {
    ok: true,
    message: `Updated pending preview placement to ${args.targetTierId}.`
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

  const appearances = await getOpenAppearances(normalizedName);
  if (appearances.length === 0) {
    return { ok: false, message: "No pending unverified appearances were found for that team." };
  }

  if (request.action === "cancel_pending") {
    return cancelPendingAppearances({
      appearances,
      normalizedName,
      adminAccountId
    });
  }

  if (request.action === "dismiss") {
    const pendingRows = appearances.filter((appearance) => appearance.resolutionStatus === "pending");
    if (pendingRows.length > 0) {
      return {
        ok: false,
        message: "Cancel the pending staged placement before dismissing this team from the unverified queue."
      };
    }

    return dismissPendingAppearances({
      appearanceIds: appearances.map((appearance) => appearance.id),
      normalizedName,
      adminAccountId,
      dismissReason: request.dismissReason,
      dismissNote: request.dismissNote
    });
  }

  if (request.action === "merge_into_existing") {
    if (appearances.some((appearance) => appearance.resolutionStatus === "pending")) {
      return {
        ok: false,
        message: "Cancel the pending staged placement before merging this unverified team into an existing profile."
      };
    }

    return mergeUnverifiedTeamIntoExistingTeam({
      normalizedName,
      targetTeamId: request.targetTeamId ?? "",
      actorAdminId: adminAccountId
    });
  }

  if (request.action !== "confirm") {
    return { ok: false, message: "action must be confirm, dismiss, cancel_pending, or merge_into_existing." };
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
