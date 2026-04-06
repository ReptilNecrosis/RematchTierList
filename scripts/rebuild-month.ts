import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { confirmPreviewImport, previewImport } from "../apps/web/lib/server/services/imports";
import { softDeleteTeam } from "../apps/web/lib/server/services/teams";

type CliOptions = {
  monthKey: string;
  dryRun: boolean;
  adminUsername?: string;
};

type AdminAccountRow = {
  id: string;
  username: string;
  role: "super_admin" | "admin";
};

type TournamentRow = {
  id: string;
  title: string;
  eventDate: string;
};

type TournamentSourceRow = {
  tournamentId: string;
  sourceType: "battlefy" | "startgg" | "screenshot";
  url: string | null;
};

type HistoricalSeriesRow = {
  tournamentId: string;
  sourceRef: string;
  teamOneId: string | null;
  teamTwoId: string | null;
};

type MonthTournamentRecord = TournamentRow & {
  sources: TournamentSourceRow[];
  historicalSeries: HistoricalSeriesRow[];
};

type RebuildableTournament = MonthTournamentRecord & {
  sourceLinks: string[];
};

function loadEnvFromFile() {
  const envPath = join(process.cwd(), "apps/web/.env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let adminUsername: string | undefined;
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--admin=")) {
      adminUsername = arg.slice("--admin=".length).trim() || undefined;
      continue;
    }

    positional.push(arg);
  }

  const monthKey = positional[0]?.trim() ?? "";
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Usage: npx tsx scripts/rebuild-month.ts YYYY-MM [--dry-run] [--admin=username]");
  }

  return {
    monthKey,
    dryRun,
    adminUsername
  };
}

function getMonthBounds(monthKey: string) {
  const [yearString, monthString] = monthKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const start = `${yearString}-${monthString}-01`;
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;

  return { start, nextMonth };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function deriveRowSourceRef(row: {
  id: string;
  source: "battlefy" | "startgg" | "screenshot";
}) {
  if (row.source === "battlefy" || row.source === "startgg") {
    return row.id.replace(/^(battlefy-|startgg-)/, `${row.source}:`);
  }

  return `links-${row.id}`;
}

function pickHistoricalResolution(args: {
  previewRow: {
    id: string;
    source: "battlefy" | "startgg" | "screenshot";
    teamOne: { matchedTeamId?: string };
    teamTwo: { matchedTeamId?: string };
  };
  historicalSeriesByRef: Map<string, HistoricalSeriesRow>;
  activeTeamIds: Set<string>;
}) {
  const sourceRef = deriveRowSourceRef(args.previewRow);
  const historical = args.historicalSeriesByRef.get(sourceRef);

  const resolution: {
    rowId: string;
    teamOneMode?: "match" | "unverified";
    teamTwoMode?: "match" | "unverified";
    teamOneTeamId?: string | null;
    teamTwoTeamId?: string | null;
  } = {
    rowId: args.previewRow.id
  };

  const historicalTeamOneId =
    historical?.teamOneId && args.activeTeamIds.has(historical.teamOneId) ? historical.teamOneId : null;
  const historicalTeamTwoId =
    historical?.teamTwoId && args.activeTeamIds.has(historical.teamTwoId) ? historical.teamTwoId : null;

  if (historical) {
    if (historicalTeamOneId) {
      resolution.teamOneMode = "match";
      resolution.teamOneTeamId = historicalTeamOneId;
    } else if (!args.previewRow.teamOne.matchedTeamId) {
      resolution.teamOneMode = "unverified";
    }

    if (historicalTeamTwoId) {
      resolution.teamTwoMode = "match";
      resolution.teamTwoTeamId = historicalTeamTwoId;
    } else if (!args.previewRow.teamTwo.matchedTeamId) {
      resolution.teamTwoMode = "unverified";
    }
  }

  const hasResolution =
    resolution.teamOneMode !== undefined ||
    resolution.teamTwoMode !== undefined ||
    resolution.teamOneTeamId !== undefined ||
    resolution.teamTwoTeamId !== undefined;

  return hasResolution ? resolution : null;
}

async function loadAdminAccount(args: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminUsername?: string;
}) {
  const client = createClient(args.supabaseUrl, args.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await client
    .from("admin_accounts")
    .select("id, username, role");

  if (error) {
    throw new Error(`Could not load admin accounts: ${error.message}`);
  }

  const admins = ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): AdminAccountRow => ({
      id: String(row.id),
      username: String(row.username),
      role: row.role === "super_admin" ? "super_admin" : "admin"
    })
  );

  if (admins.length === 0) {
    throw new Error("No admin_accounts rows were found. The rebuild script needs a live admin identity for logging.");
  }

  if (args.adminUsername) {
    const matchedAdmin = admins.find((admin) => normalizeName(admin.username) === normalizeName(args.adminUsername ?? ""));
    if (!matchedAdmin) {
      throw new Error(`No admin account matched "${args.adminUsername}".`);
    }

    return matchedAdmin;
  }

  return [...admins].sort((left, right) => {
    const leftPriority = left.role === "super_admin" ? 0 : 1;
    const rightPriority = right.role === "super_admin" ? 0 : 1;
    return leftPriority - rightPriority || left.username.localeCompare(right.username);
  })[0];
}

async function loadMonthData(args: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  monthKey: string;
}) {
  const client = createClient(args.supabaseUrl, args.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { start, nextMonth } = getMonthBounds(args.monthKey);

  const { data: tournamentData, error: tournamentError } = await client
    .from("tournaments")
    .select("id, title, event_date")
    .gte("event_date", start)
    .lt("event_date", nextMonth)
    .order("event_date", { ascending: true });

  if (tournamentError) {
    throw new Error(`Could not load ${args.monthKey} tournaments: ${tournamentError.message}`);
  }

  const tournaments = ((tournamentData ?? []) as Array<Record<string, unknown>>).map(
    (row): TournamentRow => ({
      id: String(row.id),
      title: String(row.title),
      eventDate: String(row.event_date)
    })
  );

  const tournamentIds = tournaments.map((tournament) => tournament.id);
  if (tournamentIds.length === 0) {
    return {
      client,
      activeTeamIds: new Set<string>(),
      tournaments: [] as MonthTournamentRecord[]
    };
  }

  const [{ data: sourceData, error: sourceError }, { data: seriesData, error: seriesError }, { data: teamData, error: teamError }] =
    await Promise.all([
      client
        .from("tournament_sources")
        .select("tournament_id, source_type, url")
        .in("tournament_id", tournamentIds),
      client
        .from("series_results")
        .select("tournament_id, source_ref, team_one_id, team_two_id")
        .in("tournament_id", tournamentIds),
      client
        .from("teams")
        .select("id")
        .is("deleted_at", null)
    ]);

  if (sourceError) {
    throw new Error(`Could not load tournament sources: ${sourceError.message}`);
  }

  if (seriesError) {
    throw new Error(`Could not load historical series mappings: ${seriesError.message}`);
  }

  if (teamError) {
    throw new Error(`Could not load active teams: ${teamError.message}`);
  }

  const sources = ((sourceData ?? []) as Array<Record<string, unknown>>).map(
    (row): TournamentSourceRow => ({
      tournamentId: String(row.tournament_id),
      sourceType:
        row.source_type === "startgg"
          ? "startgg"
          : row.source_type === "screenshot"
            ? "screenshot"
            : "battlefy",
      url: row.url ? String(row.url) : null
    })
  );

  const historicalSeries = ((seriesData ?? []) as Array<Record<string, unknown>>).map(
    (row): HistoricalSeriesRow => ({
      tournamentId: String(row.tournament_id),
      sourceRef: String(row.source_ref),
      teamOneId: row.team_one_id ? String(row.team_one_id) : null,
      teamTwoId: row.team_two_id ? String(row.team_two_id) : null
    })
  );

  const activeTeamIds = new Set(
    ((teamData ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id))
  );

  const sourcesByTournamentId = new Map<string, TournamentSourceRow[]>();
  for (const source of sources) {
    const current = sourcesByTournamentId.get(source.tournamentId) ?? [];
    current.push(source);
    sourcesByTournamentId.set(source.tournamentId, current);
  }

  const seriesByTournamentId = new Map<string, HistoricalSeriesRow[]>();
  for (const series of historicalSeries) {
    const current = seriesByTournamentId.get(series.tournamentId) ?? [];
    current.push(series);
    seriesByTournamentId.set(series.tournamentId, current);
  }

  return {
    client,
    activeTeamIds,
    tournaments: tournaments.map((tournament) => ({
      ...tournament,
      sources: sourcesByTournamentId.get(tournament.id) ?? [],
      historicalSeries: seriesByTournamentId.get(tournament.id) ?? []
    }))
  };
}

function classifyTournaments(tournaments: MonthTournamentRecord[]) {
  const rebuildable: RebuildableTournament[] = [];
  const screenshotOnly: MonthTournamentRecord[] = [];
  const missingSources: MonthTournamentRecord[] = [];

  for (const tournament of tournaments) {
    const sourceLinks = tournament.sources
      .filter((source) => source.url && source.sourceType !== "screenshot")
      .map((source) => source.url as string);

    if (sourceLinks.length > 0) {
      rebuildable.push({
        ...tournament,
        sourceLinks: [...new Set(sourceLinks)]
      });
      continue;
    }

    if (tournament.sources.some((source) => source.sourceType === "screenshot")) {
      screenshotOnly.push(tournament);
      continue;
    }

    missingSources.push(tournament);
  }

  return { rebuildable, screenshotOnly, missingSources };
}

async function deleteMonthTournaments(client: ReturnType<typeof createClient>, tournaments: MonthTournamentRecord[]) {
  for (const tournamentIds of chunk(
    tournaments.map((tournament) => tournament.id),
    100
  )) {
    if (tournamentIds.length === 0) {
      continue;
    }

    const { error } = await client
      .from("tournaments")
      .delete()
      .in("id", tournamentIds);

    if (error) {
      throw new Error(`Could not delete month tournaments: ${error.message}`);
    }
  }
}

async function cleanupLegacyUnverifiedTeams(args: {
  client: ReturnType<typeof createClient>;
  adminId: string;
}) {
  const { data, error } = await args.client
    .from("teams")
    .select("id, name")
    .eq("verified", false)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Could not load leftover unverified teams: ${error.message}`);
  }

  const legacyTeams = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name)
  }));

  if (legacyTeams.length === 0) {
    return {
      deletedCount: 0,
      clearedAppearanceCount: 0
    };
  }

  for (const team of legacyTeams) {
    const result = await softDeleteTeam(team.id, args.adminId);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  const normalizedNames = [...new Set(legacyTeams.map((team) => normalizeName(team.name)))];
  let clearedAppearanceCount = 0;

  for (const names of chunk(normalizedNames, 100)) {
    if (names.length === 0) {
      continue;
    }

    const { data: deletedRows, error: deleteError } = await args.client
      .from("unverified_appearances")
      .delete()
      .in("normalized_name", names)
      .or("resolution_status.is.null,resolution_status.eq.pending")
      .select("id");

    if (deleteError) {
      throw new Error(`Could not clear leftover unverified appearances: ${deleteError.message}`);
    }

    clearedAppearanceCount += (deletedRows ?? []).length;
  }

  return {
    deletedCount: legacyTeams.length,
    clearedAppearanceCount
  };
}

async function rebuildTournament(args: {
  tournament: RebuildableTournament;
  activeTeamIds: Set<string>;
  adminId: string;
}) {
  const preview = await previewImport({
    tournamentTitle: args.tournament.title,
    eventDate: args.tournament.eventDate,
    sourceLinks: args.tournament.sourceLinks
  });

  if (!preview.ok || !preview.preview) {
    return {
      ok: false,
      tournamentTitle: args.tournament.title,
      message: preview.message ?? "Preview import failed."
    };
  }

  const historicalSeriesByRef = new Map(
    args.tournament.historicalSeries.map((series) => [series.sourceRef, series])
  );

  const resolutions = preview.preview.previewRows
    .map((row) =>
      pickHistoricalResolution({
        previewRow: row,
        historicalSeriesByRef,
        activeTeamIds: args.activeTeamIds
      })
    )
    .filter((resolution): resolution is NonNullable<typeof resolution> => resolution !== null);

  const confirmResult = await confirmPreviewImport({
    tournamentTitle: args.tournament.title,
    eventDate: args.tournament.eventDate,
    sourceMode: "links",
    sourceLinks: args.tournament.sourceLinks,
    previewRows: preview.preview.previewRows,
    resolutions,
    actorAdminId: args.adminId
  });

  if (!confirmResult.ok) {
    return {
      ok: false,
      tournamentTitle: args.tournament.title,
      message: confirmResult.message,
      blockedReasons: "blockedReasons" in confirmResult ? confirmResult.blockedReasons : undefined
    };
  }

  return {
    ok: true,
    tournamentTitle: args.tournament.title,
    seriesCount: confirmResult.summary?.seriesCount ?? 0,
    createdUnverifiedCount: confirmResult.summary?.createdUnverifiedCount ?? 0
  };
}

function printTournamentList(title: string, tournaments: MonthTournamentRecord[]) {
  console.log(`\n${title} (${tournaments.length})`);
  for (const tournament of tournaments) {
    console.log(`- ${tournament.eventDate} | ${tournament.title}`);
  }
}

async function main() {
  loadEnvFromFile();

  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.");
  }

  const admin = await loadAdminAccount({
    supabaseUrl,
    supabaseServiceRoleKey,
    adminUsername: options.adminUsername
  });

  const { client, tournaments, activeTeamIds } = await loadMonthData({
    supabaseUrl,
    supabaseServiceRoleKey,
    monthKey: options.monthKey
  });
  const { rebuildable, screenshotOnly, missingSources } = classifyTournaments(tournaments);

  console.log(`Month rebuild target: ${options.monthKey}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Admin actor: ${admin.username} (${admin.role})`);
  console.log(`Total tournaments found: ${tournaments.length}`);
  console.log(`Link-backed tournaments: ${rebuildable.length}`);
  console.log(`Screenshot-only tournaments: ${screenshotOnly.length}`);
  console.log(`Missing-source tournaments: ${missingSources.length}`);

  if (tournaments.length === 0) {
    console.log("No tournaments were found for that month.");
    return;
  }

  printTournamentList("Link-backed tournaments", rebuildable);
  printTournamentList("Screenshot-only tournaments", screenshotOnly);
  printTournamentList("Missing-source tournaments", missingSources);

  if (options.dryRun) {
    console.log("\nDry run complete. No data was changed.");
    return;
  }

  console.log(`\nDeleting ${tournaments.length} tournaments for ${options.monthKey}...`);
  await deleteMonthTournaments(client, tournaments);
  console.log("Month reset complete.");

  const rebuildFailures: Array<{ tournamentTitle: string; message: string; blockedReasons?: string[] }> = [];
  let rebuiltCount = 0;
  let rebuiltSeriesCount = 0;
  let rebuiltUnverifiedCount = 0;

  for (const tournament of rebuildable) {
    console.log(`\nRebuilding: ${tournament.title} (${tournament.eventDate})`);
    const result = await rebuildTournament({
      tournament,
      activeTeamIds,
      adminId: admin.id
    });

    if (!result.ok) {
      rebuildFailures.push({
        tournamentTitle: result.tournamentTitle,
        message: result.message,
        blockedReasons: result.blockedReasons
      });
      console.log(`Failed: ${result.message}`);
      if (result.blockedReasons?.length) {
        for (const reason of result.blockedReasons) {
          console.log(`  - ${reason}`);
        }
      }
      continue;
    }

    rebuiltCount += 1;
    rebuiltSeriesCount += result.seriesCount;
    rebuiltUnverifiedCount += result.createdUnverifiedCount;
    console.log(`Imported ${result.seriesCount} series.`);
  }

  console.log("\nCleaning leftover unverified team rows...");
  const cleanup = await cleanupLegacyUnverifiedTeams({
    client,
    adminId: admin.id
  });
  console.log(`Soft-deleted leftover unverified teams: ${cleanup.deletedCount}`);
  console.log(`Cleared leftover open unverified appearances: ${cleanup.clearedAppearanceCount}`);

  console.log("\nSummary");
  console.log(`- Rebuilt tournaments: ${rebuiltCount}/${rebuildable.length}`);
  console.log(`- Rebuilt series: ${rebuiltSeriesCount}`);
  console.log(`- Recreated unverified appearances from imports: ${rebuiltUnverifiedCount}`);
  console.log(`- Screenshot-only tournaments still require manual re-entry: ${screenshotOnly.length}`);
  console.log(`- Missing-source tournaments still require manual re-entry: ${missingSources.length}`);
  console.log(`- Rebuild failures: ${rebuildFailures.length}`);

  if (screenshotOnly.length > 0 || missingSources.length > 0 || rebuildFailures.length > 0) {
    if (screenshotOnly.length > 0) {
      printTournamentList("Not auto-rebuilt because only screenshot sources were stored", screenshotOnly);
    }

    if (missingSources.length > 0) {
      printTournamentList("Not auto-rebuilt because no reusable sources were stored", missingSources);
    }

    if (rebuildFailures.length > 0) {
      console.log("\nLink-backed rebuild failures");
      for (const failure of rebuildFailures) {
        console.log(`- ${failure.tournamentTitle}: ${failure.message}`);
        for (const reason of failure.blockedReasons ?? []) {
          console.log(`  * ${reason}`);
        }
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log("\nMonth rebuild completed successfully.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Month rebuild failed.");
  process.exit(1);
});
