import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calculateTeamStats } from "@rematch/rules-engine";
import type { Team, SeriesResult, TierId } from "@rematch/shared-types";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), "apps/web/.env.local"), "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseTier(v: string): TierId {
  return ["tier1","tier2","tier3","tier4","tier5","tier6","tier7"].includes(v) ? v as TierId : "tier7";
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: tr } = await sb.from("teams")
    .select("id,slug,name,short_code,current_tier_id,verified,notes,created_at")
    .is("deleted_at", null);

  const teams: Team[] = ((tr ?? []) as any[]).map(r => ({
    id: String(r.id), slug: String(r.slug), name: String(r.name),
    shortCode: String(r.short_code), tierId: parseTier(String(r.current_tier_id)),
    verified: Boolean(r.verified), createdAt: String(r.created_at ?? ""), addedBy: "sb"
  }));

  const { data: sr } = await sb.from("series_results")
    .select("id,tournament_id,played_at,team_one_name,team_two_name,team_one_id,team_two_id,team_one_tier_id,team_two_tier_id,team_one_score,team_two_score,source_type,source_ref,confirmed")
    .gte("played_at", "2026-01-01T00:00:00Z")
    .lte("played_at", "2026-01-31T23:59:59Z")
    .eq("confirmed", true);

  const series: SeriesResult[] = ((sr ?? []) as any[]).map(r => ({
    id: String(r.id), tournamentId: String(r.tournament_id), playedAt: String(r.played_at),
    teamOneName: String(r.team_one_name), teamTwoName: String(r.team_two_name),
    teamOneId: r.team_one_id ? String(r.team_one_id) : undefined,
    teamTwoId: r.team_two_id ? String(r.team_two_id) : undefined,
    teamOneTierId: parseTier(String(r.team_one_tier_id)),
    teamTwoTierId: parseTier(String(r.team_two_tier_id)),
    teamOneScore: Number(r.team_one_score), teamTwoScore: Number(r.team_two_score),
    source: "battlefy" as const, sourceRef: String(r.source_ref), confirmed: true
  }));

  const stats = calculateTeamStats(teams, series, new Date("2026-01-31T23:59:59Z"));

  const rows = teams.filter(t => t.verified).map(t => {
    const s = stats[t.id];
    return {
      name: t.name, tier: t.tierId,
      games: s?.countedGames ?? 0, wins: s?.countedWins ?? 0, losses: s?.countedLosses ?? 0,
      sameTierGames: s?.sameTierGames ?? 0, sameTierWR: s?.sameTierWinRate ?? 0,
      overallWR: s?.overallWinRate ?? 0, seasonPlayed: s?.seasonSeriesPlayed ?? 0
    };
  }).filter(r => r.games > 0).sort((a, b) => b.overallWR - a.overallWR || b.games - a.games);

  console.log("RANK  NAME".padEnd(32) + "TIER   TOT-G  W-L      SAME-G  SAME-WR%  OVR-WR%");
  console.log("-".repeat(82));
  rows.forEach((r, i) => {
    const wl = `${r.wins}-${r.losses}`;
    console.log(
      String(i + 1).padStart(3) + "  " + r.name.padEnd(28) + r.tier.padEnd(7) +
      String(r.games).padEnd(7) + wl.padEnd(9) + String(r.sameTierGames).padEnd(8) +
      (r.sameTierWR * 100).toFixed(1).padStart(6) + "%   " +
      (r.overallWR * 100).toFixed(1).padStart(5) + "%"
    );
  });

  // Also show teams with NO games (fully inactive verified teams)
  const noGames = teams.filter(t => t.verified && (stats[t.id]?.countedGames ?? 0) === 0);
  if (noGames.length > 0) {
    console.log(`\nVerified teams with 0 January games (${noGames.length}):`);
    for (const t of noGames.sort((a,b) => a.name.localeCompare(b.name))) {
      console.log(`  ${t.name} [${t.tierId}]`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
