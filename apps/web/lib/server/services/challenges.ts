import type { ChallengeSeries } from "@rematch/shared-types";
import { getServiceSupabase } from "../supabase";

export async function confirmChallenge(
  challenge: ChallengeSeries,
  adminAccountId: string
): Promise<{ ok: boolean; message: string }> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await client.from("challenge_series").insert({
    state: "active",
    challenger_team_id: challenge.challengerTeamId,
    defender_team_id: challenge.defenderTeamId,
    challenger_tier_id: challenge.challengerTierId,
    defender_tier_id: challenge.defenderTierId,
    reason: challenge.reason,
    blocked_movement: challenge.blockedMovement,
    challenger_wins: 0,
    defender_wins: 0,
    approved_by_admin_id: adminAccountId,
    created_at: now.toISOString(),
    expires_at: expiresAt
  } as never);

  if (error) {
    return { ok: false, message: error.message };
  }

  await client.from("activity_log").insert({
    admin_account_id: adminAccountId,
    verb: "confirmed",
    subject: `${challenge.challengerTeamName} vs ${challenge.defenderTeamName} challenge series`
  } as never);

  return { ok: true, message: "Challenge series confirmed." };
}

export async function expireStaleChallenges(): Promise<{ ok: boolean; count: number; message: string }> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, count: 0, message: "Database not configured." };
  }

  const now = new Date().toISOString();

  const { data, error } = await client
    .from("challenge_series")
    .update({
      state: "expired",
      outcome: "expired",
      resolved_at: now
    } as never)
    .eq("state", "active")
    .lt("expires_at", now)
    .select("id");

  if (error) {
    return { ok: false, count: 0, message: error.message };
  }

  return { ok: true, count: (data ?? []).length, message: `Expired ${(data ?? []).length} challenge(s).` };
}
