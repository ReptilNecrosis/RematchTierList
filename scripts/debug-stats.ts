/**
 * Debug helper — shows per-phase stats for each team after applying manual
 * seeds + one iteration of moves, to understand why the simulation stalls.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calculateTeamStats, TIER_DEFINITIONS } from "@rematch/rules-engine";
import type { SeriesResult, Team, TierId } from "@rematch/shared-types";

// Same seedings as simulate-january.ts
const MANUAL_SEEDS: Record<string, TierId> = {
  "KIN":            "tier2",  // already promoted in iter 1
  "Str1ve Corp":    "tier3",
  "MΛKO":           "tier3",
  "ORION ESPORTS":  "tier3",
  "wildcats":       "tier3",
  "OVERDOZEE":      "tier3",
  "SPK x FLR":      "tier3",
  "Minus Tempø":    "tier3",
  "Volt e-sport":   "tier3",  // promoted to tier3 in iter 1 mid-season
  "Morty's Minions":"tier4",
  "Desert elders":  "tier4",
  "Majin":          "tier4",
  "Team Assault":   "tier4",
  "Str1ve eSports":    "tier5",
  "Akaris":            "tier5",
  "UnderDog Gaming C": "tier5",
  "Unholy Steeze":     "tier5",
  "100X35":            "tier5",
  "After Hours":    "tier6",
  "NME":            "tier6",
  "Nomade Esport":  "tier6",
  "Haokami":        "tier6",  // promoted in iter 1 mid-season
};

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), "apps/web/.env.local"), "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseTierId(v: string): TierId {
  return ["tier1","tier2","tier3","tier4","tier5","tier6","tier7"].includes(v) ? v as TierId : "tier7";
}

function rebaseSeries(series: SeriesResult[], teams: Team[]): SeriesResult[] {
  const tierById = new Map(teams.map((t) => [t.id, t.tierId]));
  return series.map((s) => ({
    ...s,
    teamOneTierId: s.teamOneId && tierById.has(s.teamOneId) ? tierById.get(s.teamOneId)! : s.teamOneTierId,
    teamTwoTierId: s.teamTwoId && tierById.has(s.teamTwoId) ? tierById.get(s.teamTwoId)! : s.teamTwoTierId,
  }));
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: tr } = await sb.from("teams")
    .select("id, slug, name, current_tier_id, verified, notes, created_at")
    .is("deleted_at", null);

  let teams: Team[] = ((tr ?? []) as any[]).map(r => ({
    id: String(r.id), slug: String(r.slug), name: String(r.name),
    tierId: parseTierId(String(r.current_tier_id)),
    verified: Boolean(r.verified), createdAt: String(r.created_at ?? ""), addedBy: "sb"
  }));

  teams = teams.map(t => MANUAL_SEEDS[t.name] ? { ...t, tierId: MANUAL_SEEDS[t.name] } : t);

  const { data: sr } = await sb.from("series_results")
    .select("id, tournament_id, played_at, team_one_name, team_two_name, team_one_id, team_two_id, team_one_tier_id, team_two_tier_id, team_one_score, team_two_score, source_type, source_ref, confirmed")
    .gte("played_at", "2026-01-01T00:00:00Z")
    .lte("played_at", "2026-01-31T23:59:59Z")
    .eq("confirmed", true);

  const janSeries: SeriesResult[] = ((sr ?? []) as any[]).map(r => ({
    id: String(r.id), tournamentId: String(r.tournament_id), playedAt: String(r.played_at),
    teamOneName: String(r.team_one_name), teamTwoName: String(r.team_two_name),
    teamOneId: r.team_one_id ? String(r.team_one_id) : undefined,
    teamTwoId: r.team_two_id ? String(r.team_two_id) : undefined,
    teamOneTierId: parseTierId(String(r.team_one_tier_id)),
    teamTwoTierId: parseTierId(String(r.team_two_tier_id)),
    teamOneScore: Number(r.team_one_score), teamTwoScore: Number(r.team_two_score),
    source: "battlefy" as const, sourceRef: String(r.source_ref), confirmed: true
  }));

  const MID_CUTOFF = "2026-01-15T23:59:59Z";
  const END_START  = "2026-01-16T00:00:00Z";
  const midRaw = janSeries.filter(s => s.playedAt <= MID_CUTOFF);
  const endRaw = janSeries.filter(s => s.playedAt >= END_START);

  // Show iteration 2 stats (after applying iter-1 seedings above)
  for (const [label, series, refDate] of [
    ["MID-SEASON (Jan 1-15)", rebaseSeries(midRaw, teams), new Date("2026-01-15T23:59:59Z")],
    ["END-OF-SEASON (Jan 16-31)", rebaseSeries(endRaw, teams), new Date("2026-01-31T23:59:59Z")],
  ] as [string, SeriesResult[], Date][]) {
    const stats = calculateTeamStats(teams, series, refDate);

    console.log(`\n=== ${label} STATS ===`);
    console.log("NAME".padEnd(26) + "TIER   SAME-G  SAME-WR%  1UP-G  1UP-WR%  TOT-G  OWR%   NOTE");
    console.log("-".repeat(100));

    for (const tierDef of TIER_DEFINITIONS.slice(0, 4)) {
      const tierTeams = teams.filter(t => t.tierId === tierDef.id && t.verified);
      if (tierTeams.length === 0) continue;
      for (const team of tierTeams.sort((a,b) => a.name.localeCompare(b.name))) {
        const s = stats[team.id];
        if (!s) continue;
        const note =
          s.sameTierGames >= 5 && s.sameTierWinRate >= 0.75 ? "★ PROMO ELIGIBLE" :
          s.sameTierGames >= 5 && s.sameTierWinRate < 0.25  ? "▼ DEMO ELIGIBLE" :
          s.sameTierGames < 5 ? `(only ${s.sameTierGames} same-tier games)` : "";
        console.log(
          team.name.padEnd(26) + team.tierId.padEnd(7) +
          String(s.sameTierGames).padEnd(8) +
          (s.sameTierWR * 100 || s.sameTierWinRate * 100).toFixed(1).padStart(6) + "%   " +
          String(s.oneTierUpGames).padEnd(7) +
          (s.oneTierUpWinRate * 100).toFixed(1).padStart(5) + "%   " +
          String(s.countedGames).padEnd(7) +
          (s.overallWinRate * 100).toFixed(1).padStart(5) + "%   " +
          note
        );
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
