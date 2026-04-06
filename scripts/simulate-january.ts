/**
 * January Tournament Simulation
 *
 * Replays real confirmed January 2026 series against the current live tier
 * seedings — with optional manual uplift seeds (up to Tier 3) applied before
 * the loop starts.
 *
 * KEY FIX vs the naive approach:
 *   Before every stats calculation the series records are "rebased" so that
 *   each team's recorded tier reflects their CURRENT simulated tier, not the
 *   historical tier they happened to be in when the match was played.  This
 *   ensures that same-tier game counts stay meaningful as teams move up.
 *
 * Loop structure:
 *   Each iteration = one January "season" in two phases:
 *     Phase 1 — Mid-season   (Jan 1–15 series)
 *     Phase 2 — End-of-season (Jan 16–31 series)
 *   Stats reset fully each phase. Only team tiers carry forward.
 *   Stops when Tier 1 reaches 6+ teams (finishing the current season first)
 *   or after 20 iterations.
 *
 * Run from repo root:
 *   npx tsx scripts/simulate-january.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  calculateTeamStats,
  deriveEligibilityFlags,
  TIER_DEFINITIONS
} from "@rematch/rules-engine";
import type {
  EligibilityFlag,
  SeriesResult,
  Team,
  TierId
} from "@rematch/shared-types";

// ---------------------------------------------------------------------------
// Manual seeds — applied once before the loop.
// Based on January overall win-rate ranking from analyze-january.ts.
// Max allowed tier: tier3 (per user instruction).
// Teams not listed keep their current live tier.
// ---------------------------------------------------------------------------
// KEY INSIGHT: teams seeded into the same tier need shared match history for
// same-tier stats to accumulate after series rebasing.  So we group teams by
// their ORIGINAL tier (they played each other in January) and seed the whole
// group into the same target tier.
//
// Tier 3 receives:
//   • All original Tier-6 teams  → they have lots of T6-vs-T6 match data
//   • All original Tier-5 teams  → have T5-vs-T5 data
//   • KIN (only Tier-4 team)    → joins as top performer
//   • Top Tier-7 performers     → some cross-play with each other
//
// Tier 4 receives the remaining Tier-7 mid-performers.
// Everyone else stays at their live tier.
const MANUAL_SEEDS: Record<string, TierId> = {
  // ── Tier 3: original Tier-4 ──────────────────────────────────────────────
  "KIN":            "tier3",  // 81.0% OWR, 82.6% same-tier — sole tier4 team

  // ── Tier 3: original Tier-5 (shared T5 match history) ───────────────────
  "Str1ve Corp":    "tier3",  // 77.8% OWR, 66.7% same-tier
  "wildcats":       "tier3",  // 73.1% OWR, 77.8% same-tier

  // ── Tier 3: ALL original Tier-6 teams (rich T6 vs T6 match history) ─────
  "ORION ESPORTS":  "tier3",  // 75.0% OWR, 79.2% same-tier
  "Minus Tempø":    "tier3",  // 68.4% OWR, 80.0% same-tier
  "Morty's Minions":"tier3",  // 76.9% OWR, 75.0% same-tier
  "Desert elders":  "tier3",  // 75.0% OWR, 80.0% same-tier
  "100X35":         "tier3",  // 67.9% OWR, 70.0% same-tier
  "Silent":         "tier3",  // 59.3% OWR — needed for Tier-6 group mass

  // ── Tier 3: top Tier-7 performers (cross-play with each other) ──────────
  "MΛKO":           "tier3",  // 76.9% OWR, 72.7% same-tier
  "OVERDOZEE":      "tier3",  // 73.3% OWR, 66.7% same-tier
  "SPK x FLR":      "tier3",  // 70.6% OWR, 66.7% same-tier
  "Volt e-sport":   "tier3",  // 67.6% OWR, 71.4% same-tier
  "Team Assault":   "tier3",  // 66.7% OWR, 63.6% same-tier
  "Majin":          "tier3",  // 64.6% OWR, 69.0% same-tier

  // ── Tier 4: remaining mid-range Tier-7 performers ───────────────────────
  "Akaris":            "tier4",  // 62.2% OWR
  "UnderDog Gaming C": "tier4",  // 61.9% OWR
  "Unholy Steeze":     "tier4",  // 60.0% OWR
  "Nomade Esport":     "tier4",  // 60.0% OWR
  "NME":               "tier4",  // 58.1% OWR
  "After Hours":       "tier4",  // 57.1% OWR
  "Str1ve eSports":    "tier4",  // 64.3% OWR
};

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(
    join(process.cwd(), "apps/web/.env.local"),
    "utf-8"
  ).split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------
function parseTierId(v: string): TierId {
  return ["tier1","tier2","tier3","tier4","tier5","tier6","tier7"].includes(v)
    ? (v as TierId)
    : "tier7";
}

function getTierRank(tierId: TierId): number {
  return TIER_DEFINITIONS.find((t) => t.id === tierId)?.rank ?? 99;
}

function getTierAbove(tierId: TierId): TierId | null {
  const rank = getTierRank(tierId);
  return TIER_DEFINITIONS.find((t) => t.rank === rank - 1)?.id ?? null;
}

function getTierBelow(tierId: TierId): TierId | null {
  const rank = getTierRank(tierId);
  return TIER_DEFINITIONS.find((t) => t.rank === rank + 1)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Series rebasing
//
// Before every calculateTeamStats call we remap teamOneTierId / teamTwoTierId
// to each team's CURRENT simulated tier.  This keeps tier-gap math correct
// as teams move through tiers across iterations.
// ---------------------------------------------------------------------------
function rebaseSeries(series: SeriesResult[], teams: Team[]): SeriesResult[] {
  const tierById = new Map(teams.map((t) => [t.id, t.tierId]));
  return series.map((s) => ({
    ...s,
    teamOneTierId:
      s.teamOneId && tierById.has(s.teamOneId)
        ? tierById.get(s.teamOneId)!
        : s.teamOneTierId,
    teamTwoTierId:
      s.teamTwoId && tierById.has(s.teamTwoId)
        ? tierById.get(s.teamTwoId)!
        : s.teamTwoTierId
  }));
}

// ---------------------------------------------------------------------------
// Move resolution
// ---------------------------------------------------------------------------
function resolveFlags(
  flags: EligibilityFlag[],
  teams: Team[]
): Map<string, TierId> {
  const teamLookup = new Map(teams.map((t) => [t.id, t]));
  const moves = new Map<string, TierId>();

  const byTeam = new Map<string, EligibilityFlag[]>();
  for (const flag of flags) {
    const existing = byTeam.get(flag.teamId) ?? [];
    existing.push(flag);
    byTeam.set(flag.teamId, existing);
  }

  for (const [teamId, teamFlags] of byTeam) {
    const hasPromotion = teamFlags.some((f) => f.movementType === "promotion");
    const hasDemotion  = teamFlags.some((f) => f.movementType === "demotion");
    if (hasPromotion && hasDemotion) continue; // conflicted

    const best = teamFlags.sort((a, b) => b.priorityScore - a.priorityScore)[0];
    const team = teamLookup.get(teamId);
    if (!team) continue;

    if (best.movementType === "promotion") {
      const newTier = getTierAbove(team.tierId);
      if (newTier) moves.set(teamId, newTier);
    } else {
      const newTier = getTierBelow(team.tierId);
      if (newTier) moves.set(teamId, newTier);
    }
  }
  return moves;
}

function applyMoves(teams: Team[], moves: Map<string, TierId>): Team[] {
  return teams.map((t) =>
    moves.has(t.id) ? { ...t, tierId: moves.get(t.id)! } : t
  );
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const HR       = "─".repeat(64);
const HR_THICK = "═".repeat(64);

function printMoves(
  label: string,
  moves: Map<string, TierId>,
  teams: Team[],
  flags: EligibilityFlag[]
): void {
  const teamBefore = new Map(teams.map((t) => [t.id, t]));
  if (moves.size === 0) {
    console.log(`  [${label}] No movements triggered.`);
    return;
  }
  console.log(`  [${label}]`);
  for (const [teamId, newTier] of moves) {
    const team = teamBefore.get(teamId)!;
    const dir =
      getTierRank(newTier) < getTierRank(team.tierId)
        ? "▲ PROMOTED"
        : "▼ DEMOTED";
    const topFlag = flags
      .filter((f) => f.teamId === teamId)
      .sort((a, b) => b.priorityScore - a.priorityScore)[0];
    const reason = topFlag ? ` [${topFlag.reason}]` : "";
    console.log(
      `    ${dir}: ${team.name.padEnd(24)} ${team.tierId} → ${newTier}${reason}`
    );
  }
}

function printTierList(teams: Team[]): void {
  for (const tierDef of TIER_DEFINITIONS) {
    const tierTeams = teams
      .filter((t) => t.tierId === tierDef.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const maxStr = tierDef.maxTeams !== null ? `/${tierDef.maxTeams}` : "";
    console.log(`\n  ${tierDef.label} (${tierTeams.length}${maxStr})`);
    if (tierTeams.length === 0) {
      console.log("    (empty)");
    } else {
      for (const team of tierTeams) {
        const tag = team.verified ? "" : " [unverified]";
        console.log(`    • ${team.name}${tag}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnv();
  const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars in apps/web/.env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Fetch teams ────────────────────────────────────────────────────────
  const { data: tr, error: te } = await supabase
    .from("teams")
    .select(
      "id, slug, name, short_code, current_tier_id, verified, notes, created_at"
    )
    .is("deleted_at", null);
  if (te) { console.error("teams fetch error:", te.message); process.exit(1); }

  let teams: Team[] = ((tr ?? []) as any[]).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    shortCode: String(r.short_code),
    tierId: parseTierId(String(r.current_tier_id)),
    verified: Boolean(r.verified),
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    addedBy: "supabase"
  }));

  // ── Fetch January series ───────────────────────────────────────────────
  const { data: sr, error: se } = await supabase
    .from("series_results")
    .select(
      "id, tournament_id, played_at, team_one_name, team_two_name, " +
        "team_one_id, team_two_id, team_one_tier_id, team_two_tier_id, " +
        "team_one_score, team_two_score, source_type, source_ref, confirmed"
    )
    .gte("played_at", "2026-01-01T00:00:00Z")
    .lte("played_at", "2026-01-31T23:59:59Z")
    .eq("confirmed", true);
  if (se) { console.error("series fetch error:", se.message); process.exit(1); }

  const janSeries: SeriesResult[] = ((sr ?? []) as any[]).map((r) => ({
    id: String(r.id),
    tournamentId: String(r.tournament_id),
    playedAt: String(r.played_at),
    teamOneName: String(r.team_one_name),
    teamTwoName: String(r.team_two_name),
    teamOneId: r.team_one_id ? String(r.team_one_id) : undefined,
    teamTwoId: r.team_two_id ? String(r.team_two_id) : undefined,
    teamOneTierId: parseTierId(String(r.team_one_tier_id)),
    teamTwoTierId: parseTierId(String(r.team_two_tier_id)),
    teamOneScore: Number(r.team_one_score),
    teamTwoScore: Number(r.team_two_score),
    source:
      r.source_type === "startgg"
        ? "startgg"
        : r.source_type === "screenshot"
          ? "screenshot"
          : "battlefy",
    sourceRef: String(r.source_ref),
    confirmed: true
  }));

  // ── Apply manual seeds ─────────────────────────────────────────────────
  const seedsApplied: string[] = [];
  teams = teams.map((t) => {
    const newTier = MANUAL_SEEDS[t.name];
    if (newTier && newTier !== t.tierId) {
      seedsApplied.push(`  ${t.name.padEnd(24)} ${t.tierId} → ${newTier}`);
      return { ...t, tierId: newTier };
    }
    return t;
  });

  // ── Print header ───────────────────────────────────────────────────────
  console.log(HR_THICK);
  console.log("  JANUARY TOURNAMENT SIMULATION  (with manual seeding)");
  console.log(HR_THICK);
  console.log(`  Teams: ${teams.length}   January series: ${janSeries.length}`);

  if (janSeries.length === 0) {
    console.log("\n  No confirmed January series found.  Exiting.\n");
    return;
  }

  const MID_CUTOFF = "2026-01-15T23:59:59Z";
  const END_START  = "2026-01-16T00:00:00Z";
  const midRaw = janSeries.filter((s) => s.playedAt <= MID_CUTOFF);
  const endRaw = janSeries.filter((s) => s.playedAt >= END_START);

  console.log(`  Mid-season series (Jan 1–15):    ${midRaw.length}`);
  console.log(`  End-of-season series (Jan 16–31): ${endRaw.length}`);

  if (seedsApplied.length > 0) {
    console.log(`\n  Manual seeds applied (${seedsApplied.length}):`);
    for (const line of seedsApplied) console.log(line);
  }

  const startTier1 = teams.filter((t) => t.tierId === "tier1").length;
  console.log(`\n  Tier 1 at start: ${startTier1} teams`);

  if (startTier1 >= 6) {
    console.log("  Already at 6+ Tier 1 teams — no simulation needed.");
    printTierList(teams);
    return;
  }

  // ── Simulation loop ────────────────────────────────────────────────────
  const MAX_ITERATIONS = 20;
  let iteration = 0;

  while (true) {
    iteration++;
    console.log(`\n${HR}`);
    console.log(`  ITERATION ${iteration}`);
    console.log(HR);

    // Mid-season: evaluate Jan 1–15 series only
    const midSeries = rebaseSeries(midRaw, teams);
    const midStats  = calculateTeamStats(teams, midSeries, new Date("2026-01-15T23:59:59Z"));
    const midFlags  = deriveEligibilityFlags(teams, midStats, "2026-01-15T23:59:59Z");
    const midMoves  = resolveFlags(midFlags, teams);

    printMoves("Mid-season", midMoves, teams, midFlags);
    teams = applyMoves(teams, midMoves);

    // End-of-season: cumulative — all Jan 1–31 series.
    // Rebase after mid-season moves so promoted teams' stats are recalculated
    // in their new tier context over the full month of data.
    const allSeries = rebaseSeries([...midRaw, ...endRaw], teams);
    const endStats  = calculateTeamStats(teams, allSeries, new Date("2026-01-31T23:59:59Z"));
    const endFlags  = deriveEligibilityFlags(teams, endStats, "2026-01-31T23:59:59Z");
    const endMoves  = resolveFlags(endFlags, teams);

    printMoves("End-of-season", endMoves, teams, endFlags);
    teams = applyMoves(teams, endMoves);

    const tier1Count = teams.filter((t) => t.tierId === "tier1").length;
    console.log(`\n  Tier 1 after iteration ${iteration}: ${tier1Count} teams`);

    if (tier1Count >= 6) {
      console.log(`  Stop condition reached: ${tier1Count} teams in Tier 1.`);
      break;
    }

    if (midMoves.size === 0 && endMoves.size === 0) {
      console.log("  Simulation stabilized — no movements this iteration.");
      break;
    }

    if (iteration >= MAX_ITERATIONS) {
      console.log(
        `  Safety guard: ${MAX_ITERATIONS} iterations reached without 6 Tier 1 teams.`
      );
      break;
    }
  }

  // ── Final tier list ────────────────────────────────────────────────────
  console.log(`\n${HR_THICK}`);
  console.log("  FINAL TIER LIST");
  console.log(HR_THICK);
  printTierList(teams);
  console.log("");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
