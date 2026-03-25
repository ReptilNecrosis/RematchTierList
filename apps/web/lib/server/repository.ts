import type {
  ActivityEntry,
  AdminAccount,
  ChallengeSeries,
  ChallengeOutcome,
  DashboardSnapshot,
  HistoryPageData,
  HistoryTeamRecord,
  SeriesResult,
  SeasonOption,
  SettingsRecord,
  Team,
  TeamAllTimeRecord,
  TeamAlias,
  TeamMatchHistoryEntry,
  TeamSeasonRecord,
  TeamTierHistoryEntry,
  TournamentRecord,
  UnverifiedAppearance,
  UnverifiedTeamPageData,
  UnverifiedTeamProfile,
  UnverifiedTeamProgress,
  UnverifiedTierBreakdownRow
} from "@rematch/shared-types";
import { buildDashboardSnapshot } from "@rematch/rules-engine";

import {
  activityLog as demoActivity,
  adminAccounts as demoAdmins,
  currentSnapshot as demoSnapshot,
  getTeamBySlug as getDemoTeamBySlug,
  getTeamRecentSeries as getDemoRecentSeries,
  getTeamTierHistory as getDemoTierHistory,
  series as demoSeries,
  settings as demoSettings,
  teams as demoTeams,
  tournaments as demoTournaments,
  unverifiedAppearances as demoAppearances
} from "../sample-data/demo";
import { getServerEnv } from "./env";
import { getServiceSupabase } from "./supabase";
import { expireStaleChallenges } from "./services/challenges";

type RepositoryState = "live" | "fallback";

export interface RepositoryResult<T> {
  state: RepositoryState;
  data: T;
  warning?: string;
}

function parseTierId(value: string): Team["tierId"] {
  if (
    value === "tier1" ||
    value === "tier2" ||
    value === "tier3" ||
    value === "tier4" ||
    value === "tier5" ||
    value === "tier6" ||
    value === "tier7"
  ) {
    return value;
  }
  return "tier7";
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function roundRate(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function getSeasonKeyFromDate(value: string) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getSeasonLabel(seasonKey: string) {
  const [year, month] = seasonKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function getSeasonReferenceDate(seasonKey: string) {
  const [year, month] = seasonKey.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1), 0, 12, 0, 0, 0));
}

function getSeasonKeys(series: SeriesResult[], tournaments: TournamentRecord[]) {
  const keys = new Set<string>();
  for (const entry of series) {
    keys.add(getSeasonKeyFromDate(entry.playedAt));
  }
  for (const tournament of tournaments) {
    keys.add(getSeasonKeyFromDate(tournament.eventDate));
  }
  if (keys.size === 0) {
    keys.add(getSeasonKeyFromDate(new Date().toISOString()));
  }
  return [...keys].sort((left, right) => right.localeCompare(left));
}

function filterSeriesBySeason(series: SeriesResult[], seasonKey: string) {
  return series.filter((entry) => getSeasonKeyFromDate(entry.playedAt) === seasonKey);
}

function filterTournamentsBySeason(tournaments: TournamentRecord[], seasonKey: string) {
  return tournaments.filter((entry) => getSeasonKeyFromDate(entry.eventDate) === seasonKey);
}

function buildSeasonOptions(series: SeriesResult[], tournaments: TournamentRecord[]): SeasonOption[] {
  return getSeasonKeys(series, tournaments).map((seasonKey) => ({
    key: seasonKey,
    label: getSeasonLabel(seasonKey),
    seriesCount: filterSeriesBySeason(series, seasonKey).length,
    tournamentCount: filterTournamentsBySeason(tournaments, seasonKey).length
  }));
}

function buildAllTimeRecord(team: Team, teams: Team[], series: SeriesResult[]): TeamAllTimeRecord {
  const teamLookup = new Map(teams.map((entry) => [entry.id, entry]));
  let wins = 0;
  let losses = 0;
  let seriesPlayed = 0;
  let lastPlayedAt: string | null = null;

  for (const entry of series.filter((row) => row.confirmed)) {
    const isTeamOne = entry.teamOneId === team.id;
    const isTeamTwo = entry.teamTwoId === team.id;
    if (!isTeamOne && !isTeamTwo) {
      continue;
    }

    lastPlayedAt =
      lastPlayedAt === null || entry.playedAt.localeCompare(lastPlayedAt) > 0
        ? entry.playedAt
        : lastPlayedAt;

    const opponentId = isTeamOne ? entry.teamTwoId : entry.teamOneId;
    const opponent = opponentId ? teamLookup.get(opponentId) : null;
    if (!opponent?.verified) {
      continue;
    }

    seriesPlayed += 1;
    const won = isTeamOne ? entry.teamOneScore > entry.teamTwoScore : entry.teamTwoScore > entry.teamOneScore;
    if (won) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return {
    wins,
    losses,
    seriesPlayed,
    lastPlayedAt
  };
}

function buildTeamSeasonRecord(args: {
  seasonKey: string;
  team: Team;
  teamStats: DashboardSnapshot["teamStats"];
}): TeamSeasonRecord {
  const stats = args.teamStats[args.team.id];
  return {
    seasonKey: args.seasonKey,
    seasonLabel: getSeasonLabel(args.seasonKey),
    wins: stats?.countedWins ?? 0,
    losses: stats?.countedLosses ?? 0,
    seriesPlayed: stats?.seasonSeriesPlayed ?? 0,
    sameTierWinRate: stats?.sameTierWinRate ?? 0,
    overallWinRate: stats?.overallWinRate ?? 0,
    oneTierUpWinRate: stats?.oneTierUpWinRate ?? 0,
    oneTierDownWinRate: stats?.oneTierDownWinRate ?? 0,
    inactivityFlag: stats?.inactivityFlag ?? "none",
    removalFlag: stats?.removalFlag ?? false,
    lastPlayedAt: stats?.lastPlayedAt ?? null
  };
}

function buildTeamMatchHistory(args: {
  team: Team;
  teams: Team[];
  series: SeriesResult[];
  tournaments: TournamentRecord[];
  seasonKey?: string;
}): TeamMatchHistoryEntry[] {
  const teamLookup = new Map(args.teams.map((entry) => [entry.id, entry]));
  const tournamentLookup = new Map(args.tournaments.map((entry) => [entry.id, entry]));

  return args.series
    .filter((entry) => entry.confirmed)
    .filter((entry) => entry.teamOneId === args.team.id || entry.teamTwoId === args.team.id)
    .filter((entry) => (args.seasonKey ? getSeasonKeyFromDate(entry.playedAt) === args.seasonKey : true))
    .map((entry) => {
      const isTeamOne = entry.teamOneId === args.team.id;
      const opponentId = isTeamOne ? entry.teamTwoId : entry.teamOneId;
      const opponent = opponentId ? teamLookup.get(opponentId) : null;
      const tournament = tournamentLookup.get(entry.tournamentId);
      return {
        id: entry.id,
        seasonKey: getSeasonKeyFromDate(entry.playedAt),
        playedAt: entry.playedAt,
        tournamentId: entry.tournamentId,
        tournamentTitle: tournament?.title ?? entry.tournamentId,
        opponentName: isTeamOne ? entry.teamTwoName : entry.teamOneName,
        opponentTierId: isTeamOne ? entry.teamTwoTierId : entry.teamOneTierId,
        teamScore: isTeamOne ? entry.teamOneScore : entry.teamTwoScore,
        opponentScore: isTeamOne ? entry.teamTwoScore : entry.teamOneScore,
        won: isTeamOne ? entry.teamOneScore > entry.teamTwoScore : entry.teamTwoScore > entry.teamOneScore,
        source: entry.source,
        sourceRef: entry.sourceRef
      };
    })
    .sort((left, right) => right.playedAt.localeCompare(left.playedAt));
}

function isSeriesForUnverifiedTeam(entry: SeriesResult, normalizedName: string) {
  return (
    normalizeName(entry.teamOneName) === normalizedName ||
    normalizeName(entry.teamTwoName) === normalizedName
  );
}

function buildUnverifiedMatchHistory(args: {
  normalizedName: string;
  series: SeriesResult[];
  tournaments: TournamentRecord[];
  seasonKey?: string;
}): TeamMatchHistoryEntry[] {
  const tournamentLookup = new Map(args.tournaments.map((entry) => [entry.id, entry]));

  return args.series
    .filter((entry) => entry.confirmed)
    .filter((entry) => isSeriesForUnverifiedTeam(entry, args.normalizedName))
    .filter((entry) => (args.seasonKey ? getSeasonKeyFromDate(entry.playedAt) === args.seasonKey : true))
    .map((entry) => {
      const isTeamOne = normalizeName(entry.teamOneName) === args.normalizedName;
      const tournament = tournamentLookup.get(entry.tournamentId);
      return {
        id: entry.id,
        seasonKey: getSeasonKeyFromDate(entry.playedAt),
        playedAt: entry.playedAt,
        tournamentId: entry.tournamentId,
        tournamentTitle: tournament?.title ?? entry.tournamentId,
        opponentName: isTeamOne ? entry.teamTwoName : entry.teamOneName,
        opponentTierId: isTeamOne ? entry.teamTwoTierId : entry.teamOneTierId,
        teamScore: isTeamOne ? entry.teamOneScore : entry.teamTwoScore,
        opponentScore: isTeamOne ? entry.teamTwoScore : entry.teamOneScore,
        won: isTeamOne ? entry.teamOneScore > entry.teamTwoScore : entry.teamTwoScore > entry.teamOneScore,
        source: entry.source,
        sourceRef: entry.sourceRef
      };
    })
    .sort((left, right) => right.playedAt.localeCompare(left.playedAt));
}

function buildUnverifiedAllTimeRecord(
  normalizedName: string,
  series: SeriesResult[]
): TeamAllTimeRecord {
  let wins = 0;
  let losses = 0;
  let seriesPlayed = 0;
  let lastPlayedAt: string | null = null;

  for (const entry of series.filter((row) => row.confirmed)) {
    if (!isSeriesForUnverifiedTeam(entry, normalizedName)) {
      continue;
    }

    const isTeamOne = normalizeName(entry.teamOneName) === normalizedName;
    seriesPlayed += 1;
    lastPlayedAt =
      lastPlayedAt === null || entry.playedAt.localeCompare(lastPlayedAt) > 0
        ? entry.playedAt
        : lastPlayedAt;

    const won = isTeamOne ? entry.teamOneScore > entry.teamTwoScore : entry.teamTwoScore > entry.teamOneScore;
    if (won) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return {
    wins,
    losses,
    seriesPlayed,
    lastPlayedAt
  };
}

function buildUnverifiedTierBreakdown(
  normalizedName: string,
  series: SeriesResult[]
): UnverifiedTierBreakdownRow[] {
  const tierIds: UnverifiedTierBreakdownRow["tierId"][] = [
    "tier1",
    "tier2",
    "tier3",
    "tier4",
    "tier5",
    "tier6",
    "tier7"
  ];
  const breakdown = new Map(
    tierIds.map((tierId) => [
      tierId,
      {
        tierId,
        wins: 0,
        losses: 0,
        seriesPlayed: 0,
        winRate: 0
      }
    ])
  );

  for (const entry of series.filter((row) => row.confirmed)) {
    if (!isSeriesForUnverifiedTeam(entry, normalizedName)) {
      continue;
    }

    const isTeamOne = normalizeName(entry.teamOneName) === normalizedName;
    const opponentTierId = isTeamOne ? entry.teamTwoTierId : entry.teamOneTierId;
    const row = breakdown.get(opponentTierId);
    if (!row) {
      continue;
    }

    row.seriesPlayed += 1;
    const won = isTeamOne ? entry.teamOneScore > entry.teamTwoScore : entry.teamTwoScore > entry.teamOneScore;
    if (won) {
      row.wins += 1;
    } else {
      row.losses += 1;
    }
  }

  return tierIds.map((tierId) => {
    const row = breakdown.get(tierId);
    if (!row) {
      return {
        tierId,
        wins: 0,
        losses: 0,
        seriesPlayed: 0,
        winRate: 0
      };
    }

    return {
      ...row,
      winRate: row.seriesPlayed > 0 ? roundRate(row.wins / row.seriesPlayed) : 0
    };
  });
}

function buildUnverifiedSeasonOptions(args: {
  appearances: UnverifiedAppearance[];
  series: SeriesResult[];
  tournaments: TournamentRecord[];
}) {
  const tournamentIds = new Set(args.appearances.map((entry) => entry.tournamentId));
  for (const entry of args.series) {
    tournamentIds.add(entry.tournamentId);
  }

  const relevantTournaments = args.tournaments.filter((entry) => tournamentIds.has(entry.id));
  return buildSeasonOptions(args.series, relevantTournaments);
}

function buildUnverifiedProfile(args: {
  normalizedName: string;
  pendingAppearances: UnverifiedAppearance[];
  progress?: UnverifiedTeamProgress;
}): UnverifiedTeamProfile | null {
  if (args.pendingAppearances.length === 0) {
    return null;
  }

  const firstAppearance = args.pendingAppearances[0];
  const fallbackTeamName = firstAppearance?.teamName ?? args.normalizedName;

  return {
    teamName: args.progress?.teamName ?? fallbackTeamName,
    normalizedName: args.normalizedName,
    appearances: args.progress?.appearances ?? args.pendingAppearances.length,
    distinctTournaments:
      args.progress?.distinctTournaments ??
      new Set(args.pendingAppearances.map((entry) => entry.tournamentId)).size,
    firstSeenAt:
      args.progress?.firstSeenAt ??
      args.pendingAppearances.reduce(
        (earliest, entry) => (entry.seenAt < earliest ? entry.seenAt : earliest),
        firstAppearance.seenAt
      ),
    lastSeenAt:
      args.progress?.lastSeenAt ??
      args.pendingAppearances.reduce(
        (latest, entry) => (entry.seenAt > latest ? entry.seenAt : latest),
        firstAppearance.seenAt
      ),
    autoPlaced: args.progress?.autoPlaced ?? false,
    suggestedTierId: args.progress?.suggestedTierId,
    suggestedTierWinRate: args.progress?.suggestedTierWinRate,
    suggestedTierSeriesCount: args.progress?.suggestedTierSeriesCount
  };
}

function buildHistoryPageData(args: {
  teams: Team[];
  series: SeriesResult[];
  appearances: UnverifiedAppearance[];
  tournaments: TournamentRecord[];
  activity: ActivityEntry[];
  selectedSeasonKey?: string;
}): HistoryPageData {
  const seasonOptions = buildSeasonOptions(args.series, args.tournaments);
  const selectedSeasonKey =
    seasonOptions.find((option) => option.key === args.selectedSeasonKey)?.key ?? seasonOptions[0]?.key ?? getSeasonKeyFromDate(new Date().toISOString());
  const selectedSeries = filterSeriesBySeason(args.series, selectedSeasonKey);
  const selectedTournaments = filterTournamentsBySeason(args.tournaments, selectedSeasonKey).sort((left, right) =>
    right.eventDate.localeCompare(left.eventDate)
  );
  const selectedSnapshot = buildDashboardSnapshot({
    teams: args.teams,
    series: selectedSeries,
    appearances: args.appearances.filter((entry) => getSeasonKeyFromDate(entry.seenAt) === selectedSeasonKey),
    activity: args.activity,
    referenceDate: getSeasonReferenceDate(selectedSeasonKey)
  });

  const teamRecords: HistoryTeamRecord[] = args.teams
    .map((team) => ({
      teamId: team.id,
      slug: team.slug,
      teamName: team.name,
      shortCode: team.shortCode,
      tierId: team.tierId,
      verified: team.verified,
      allTime: buildAllTimeRecord(team, args.teams, args.series),
      selectedSeason: buildTeamSeasonRecord({
        seasonKey: selectedSeasonKey,
        team,
        teamStats: selectedSnapshot.teamStats
      })
    }))
    .sort(
      (left, right) =>
        right.selectedSeason.overallWinRate - left.selectedSeason.overallWinRate ||
        right.allTime.wins - left.allTime.wins ||
        left.teamName.localeCompare(right.teamName)
    );

  return {
    availableSeasons: seasonOptions,
    selectedSeasonKey,
    selectedSeasonLabel: getSeasonLabel(selectedSeasonKey),
    selectedSnapshot,
    selectedTournaments,
    selectedSeries: selectedSeries.sort((left, right) => right.playedAt.localeCompare(left.playedAt)),
    teamRecords,
    totalSeriesCount: args.series.filter((entry) => entry.confirmed).length,
    totalTournamentCount: args.tournaments.length
  };
}

async function fetchTeams() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("teams")
    .select("id, slug, name, short_code, current_tier_id, verified, notes, created_at");
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): Team => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      shortCode: String(row.short_code),
      tierId: parseTierId(String(row.current_tier_id)),
      verified: Boolean(row.verified),
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
      addedBy: "supabase"
    })
  );
}

async function fetchSeries() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("series_results")
    .select(
      "id, tournament_id, played_at, team_one_name, team_two_name, team_one_id, team_two_id, team_one_tier_id, team_two_tier_id, team_one_score, team_two_score, source_type, source_ref, confirmed"
    );
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): SeriesResult => ({
      id: String(row.id),
      tournamentId: String(row.tournament_id),
      playedAt: String(row.played_at),
      teamOneName: String(row.team_one_name),
      teamTwoName: String(row.team_two_name),
      teamOneId: row.team_one_id ? String(row.team_one_id) : undefined,
      teamTwoId: row.team_two_id ? String(row.team_two_id) : undefined,
      teamOneTierId: parseTierId(String(row.team_one_tier_id)),
      teamTwoTierId: parseTierId(String(row.team_two_tier_id)),
      teamOneScore: Number(row.team_one_score),
      teamTwoScore: Number(row.team_two_score),
      source: row.source_type === "startgg" ? "startgg" : row.source_type === "screenshot" ? "screenshot" : "battlefy",
      sourceRef: String(row.source_ref),
      confirmed: Boolean(row.confirmed)
    })
  );
}

async function fetchAppearances() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select("id, team_name, normalized_name, tournament_id, seen_at");
  if (error) {
    throw error;
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

async function fetchPendingAppearancesByNormalizedName(normalizedName: string) {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("unverified_appearances")
    .select("id, team_name, normalized_name, tournament_id, seen_at")
    .eq("normalized_name", normalizedName)
    .is("resolution_status", null)
    .order("seen_at", { ascending: true });
  if (error) {
    throw error;
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

async function fetchTournaments() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("tournaments")
    .select("id, title, event_date, created_at");
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): TournamentRecord => ({
      id: String(row.id),
      title: String(row.title),
      eventDate: String(row.event_date),
      createdAt: String(row.created_at),
      createdBy: "supabase",
      sourceLinks: []
    })
  );
}

async function fetchAdminAccounts() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("admin_accounts")
    .select("id, username, display_name, role");
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): AdminAccount => ({
      id: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name),
      role: row.role === "super_admin" ? "super_admin" : "admin"
    })
  );
}

async function fetchActivityLog() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("activity_log")
    .select("id, verb, subject, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): ActivityEntry => ({
      id: String(row.id),
      actorUsername: "admin",
      verb: String(row.verb),
      subject: String(row.subject),
      createdAt: String(row.created_at)
    })
  );
}

async function fetchTierHistory(teamId: string) {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("team_tier_history")
    .select("id, team_id, from_tier_id, to_tier_id, movement_type, reason, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): TeamTierHistoryEntry => ({
      id: String(row.id),
      teamId: String(row.team_id),
      fromTierId: row.from_tier_id ? parseTierId(String(row.from_tier_id)) : null,
      toTierId: parseTierId(String(row.to_tier_id)),
      movementType:
        row.movement_type === "promotion" || row.movement_type === "demotion"
          ? row.movement_type
          : "placement",
      reason: String(row.reason),
      createdAt: String(row.created_at),
      createdBy: "supabase"
    })
  );
}

async function fetchSettings() {
  const client = getServiceSupabase();
  const env = getServerEnv();
  if (!client) {
    return {
      startGgApiKeySet: Boolean(env.startGgApiKey),
      discordConfigured: Boolean(env.discordBotToken && env.discordChannelId),
      discordChannelId: env.discordChannelId,
      pinnedMessageId: env.discordPinnedMessageId
    } satisfies SettingsRecord;
  }

  const { data, error } = await client
    .from("app_settings")
    .select("discord_channel_id, discord_pinned_message_id, start_gg_api_key_ciphertext, discord_bot_token_ciphertext")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }

  const row = data as Record<string, unknown> | null;
  const discordChannelId = row?.discord_channel_id ? String(row.discord_channel_id) : env.discordChannelId;
  const pinnedMessageId = row?.discord_pinned_message_id
    ? String(row.discord_pinned_message_id)
    : env.discordPinnedMessageId;
  const settings: SettingsRecord = {
    startGgApiKeySet: Boolean(row?.start_gg_api_key_ciphertext || env.startGgApiKey),
    discordConfigured: Boolean(env.discordBotToken && discordChannelId),
    discordChannelId,
    pinnedMessageId
  };

  return settings;
}

async function fetchAliases() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("team_aliases")
    .select("id, team_id, alias, created_at");
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    teamId: String(row.team_id),
    alias: String(row.alias),
    createdAt: String(row.created_at)
  })) as TeamAlias[];
}

async function fetchChallenges(teams: Team[]): Promise<ChallengeSeries[] | null> {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  await expireStaleChallenges();

  const { data, error } = await client
    .from("challenge_series")
    .select(
      "id, state, challenger_team_id, defender_team_id, challenger_tier_id, defender_tier_id, reason, blocked_movement, challenger_wins, defender_wins, resolved_at, outcome, approved_by_admin_id, created_at, expires_at"
    )
    .in("state", ["pending", "active", "expired"]);

  if (error) {
    throw error;
  }

  const teamsById = new Map(teams.map((t) => [t.id, t]));

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row): ChallengeSeries => ({
      id: String(row.id),
      state: (row.state as ChallengeSeries["state"]) ?? "pending",
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      challengerTeamId: String(row.challenger_team_id),
      challengerTeamName: teamsById.get(String(row.challenger_team_id))?.name ?? String(row.challenger_team_id),
      defenderTeamId: String(row.defender_team_id),
      defenderTeamName: teamsById.get(String(row.defender_team_id))?.name ?? String(row.defender_team_id),
      challengerTierId: parseTierId(String(row.challenger_tier_id)),
      defenderTierId: parseTierId(String(row.defender_tier_id)),
      reason: String(row.reason),
      blockedMovement: row.blocked_movement === "demotion" ? "demotion" : "promotion",
      challengerWins: Number(row.challenger_wins ?? 0),
      defenderWins: Number(row.defender_wins ?? 0),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
      outcome: row.outcome ? (row.outcome as ChallengeOutcome) : undefined,
      approvedByAdminId: row.approved_by_admin_id ? String(row.approved_by_admin_id) : undefined
    })
  );
}

export async function getDashboardData(): Promise<RepositoryResult<{ snapshot: DashboardSnapshot; tournaments: TournamentRecord[] }>> {
  try {
    const [teams, series, appearances, tournaments, activity] = await Promise.all([
      fetchTeams(),
      fetchSeries(),
      fetchAppearances(),
      fetchTournaments(),
      fetchActivityLog()
    ]);

    if (!teams || !series || !appearances || !tournaments || !activity) {
      return {
        state: "fallback",
        data: {
          snapshot: demoSnapshot,
          tournaments: demoTournaments
        },
        warning: "Supabase is not configured yet. Showing local demo data."
      };
    }

    const challenges = await fetchChallenges(teams);

    return {
      state: "live",
      data: {
        snapshot: buildDashboardSnapshot({
          teams,
          series,
          appearances,
          activity,
          challenges: challenges ?? undefined
        }),
        tournaments
      }
    };
  } catch (error) {
    return {
      state: "fallback",
      data: {
        snapshot: demoSnapshot,
        tournaments: demoTournaments
      },
      warning:
        error instanceof Error
          ? `Supabase data unavailable, showing demo data instead: ${error.message}`
          : "Supabase data unavailable, showing demo data instead."
    };
  }
}

export async function getSettingsData(): Promise<RepositoryResult<{ settings: SettingsRecord; admins: AdminAccount[] }>> {
  try {
    const [settings, admins] = await Promise.all([fetchSettings(), fetchAdminAccounts()]);
    if (!settings || !admins) {
      return {
        state: "fallback",
        data: {
          settings: demoSettings,
          admins: demoAdmins
        },
        warning: "Supabase settings are not available yet. Showing demo admin data."
      };
    }

    return {
      state: "live",
      data: {
        settings,
        admins
      }
    };
  } catch (error) {
    return {
      state: "fallback",
      data: {
        settings: demoSettings,
        admins: demoAdmins
      },
      warning:
        error instanceof Error
          ? `Supabase settings unavailable, showing demo data instead: ${error.message}`
          : "Supabase settings unavailable, showing demo data instead."
    };
  }
}

export async function getTeamPageData(
  slug: string,
  selectedSeasonKey?: string
): Promise<
  RepositoryResult<{
    team: Team | undefined;
    snapshot: DashboardSnapshot;
    history: TeamTierHistoryEntry[];
    recentSeries: TeamMatchHistoryEntry[];
    seasonRecords: TeamSeasonRecord[];
    allTimeRecord: TeamAllTimeRecord | null;
    currentSeasonKey: string;
    currentSeasonLabel: string;
    selectedSeasonKey: string;
    selectedSeasonLabel: string;
    selectedSeasonSeries: TeamMatchHistoryEntry[];
  }>
> {
  try {
    const [teams, series, appearances, activity, tournaments] = await Promise.all([
      fetchTeams(),
      fetchSeries(),
      fetchAppearances(),
      fetchActivityLog(),
      fetchTournaments()
    ]);

    if (!teams || !series || !appearances || !activity || !tournaments) {
      const team = getDemoTeamBySlug(slug);
      const seasonHistory = buildHistoryPageData({
        teams: demoTeams,
        series: demoSeries,
        appearances: demoAppearances,
        tournaments: demoTournaments,
        activity: demoActivity
      });
      return {
        state: "fallback",
        data: {
          team,
          snapshot: demoSnapshot,
          history: team ? getDemoTierHistory(team.id) : [],
          recentSeries: team
            ? buildTeamMatchHistory({
                team,
                teams: demoTeams,
                series: demoSeries,
                tournaments: demoTournaments,
                seasonKey: seasonHistory.availableSeasons[0]?.key
              }).slice(0, 6)
            : [],
          seasonRecords: team
            ? seasonHistory.availableSeasons.map((season) => {
                const snapshot = buildDashboardSnapshot({
                  teams: demoTeams,
                  series: filterSeriesBySeason(demoSeries, season.key),
                  appearances: demoAppearances.filter((entry) => getSeasonKeyFromDate(entry.seenAt) === season.key),
                  referenceDate: getSeasonReferenceDate(season.key),
                  activity: demoActivity
                });
                return buildTeamSeasonRecord({
                  seasonKey: season.key,
                  team,
                  teamStats: snapshot.teamStats
                });
              })
            : [],
          allTimeRecord: team ? buildAllTimeRecord(team, demoTeams, demoSeries) : null,
          currentSeasonKey: seasonHistory.availableSeasons[0]?.key ?? getSeasonKeyFromDate(new Date().toISOString()),
          currentSeasonLabel:
            seasonHistory.availableSeasons[0]?.label ??
            getSeasonLabel(getSeasonKeyFromDate(new Date().toISOString())),
          selectedSeasonKey: seasonHistory.selectedSeasonKey,
          selectedSeasonLabel: seasonHistory.selectedSeasonLabel,
          selectedSeasonSeries: team
            ? buildTeamMatchHistory({
                team,
                teams: demoTeams,
                series: demoSeries,
                tournaments: demoTournaments,
                seasonKey: seasonHistory.selectedSeasonKey
              })
            : []
        },
        warning: "Supabase team data is not ready yet. Showing demo team data."
      };
    }

    const snapshot = buildDashboardSnapshot({
      teams,
      series,
      appearances,
      activity
    });
    const team = teams.find((entry) => entry.slug === slug);
    const history = team ? (await fetchTierHistory(team.id)) ?? [] : [];
    const historyPageData = buildHistoryPageData({
      teams,
      series,
      appearances,
      tournaments,
      activity
      ,
      selectedSeasonKey
    });
    const currentSeasonKey = historyPageData.availableSeasons[0]?.key ?? historyPageData.selectedSeasonKey;
    const currentSeasonLabel =
      historyPageData.availableSeasons[0]?.label ?? historyPageData.selectedSeasonLabel;
    const seasonRecords = team
      ? historyPageData.availableSeasons.map((season) => {
          const seasonSnapshot = buildDashboardSnapshot({
            teams,
            series: filterSeriesBySeason(series, season.key),
            appearances: appearances.filter((entry) => getSeasonKeyFromDate(entry.seenAt) === season.key),
            activity,
            referenceDate: getSeasonReferenceDate(season.key)
          });
          return buildTeamSeasonRecord({
            seasonKey: season.key,
            team,
            teamStats: seasonSnapshot.teamStats
          });
        })
      : [];
    const recentSeries = team
      ? buildTeamMatchHistory({
          team,
          teams,
          series,
          tournaments,
          seasonKey: currentSeasonKey
        }).slice(0, 6)
      : [];
    const selectedSeasonSeries = team
      ? buildTeamMatchHistory({
          team,
          teams,
          series,
          tournaments,
          seasonKey: historyPageData.selectedSeasonKey
        })
      : [];

    return {
      state: "live",
      data: {
        team,
        snapshot,
        history,
        recentSeries,
        seasonRecords,
        allTimeRecord: team ? buildAllTimeRecord(team, teams, series) : null,
        currentSeasonKey,
        currentSeasonLabel,
        selectedSeasonKey: historyPageData.selectedSeasonKey,
        selectedSeasonLabel: historyPageData.selectedSeasonLabel,
        selectedSeasonSeries
      }
    };
  } catch (error) {
    const team = getDemoTeamBySlug(slug);
    const seasonHistory = buildHistoryPageData({
      teams: demoTeams,
      series: demoSeries,
      appearances: demoAppearances,
      tournaments: demoTournaments,
      activity: demoActivity
    });
    return {
      state: "fallback",
      data: {
        team,
        snapshot: demoSnapshot,
        history: team ? getDemoTierHistory(team.id) : [],
        recentSeries: team
          ? buildTeamMatchHistory({
              team,
              teams: demoTeams,
              series: demoSeries,
              tournaments: demoTournaments,
              seasonKey: seasonHistory.availableSeasons[0]?.key
            }).slice(0, 6)
          : [],
        seasonRecords: team
          ? seasonHistory.availableSeasons.map((season) => {
              const seasonSnapshot = buildDashboardSnapshot({
                teams: demoTeams,
                series: filterSeriesBySeason(demoSeries, season.key),
                appearances: demoAppearances.filter((entry) => getSeasonKeyFromDate(entry.seenAt) === season.key),
                activity: demoActivity,
                referenceDate: getSeasonReferenceDate(season.key)
              });
              return buildTeamSeasonRecord({
                seasonKey: season.key,
                team,
                teamStats: seasonSnapshot.teamStats
              });
            })
          : [],
        allTimeRecord: team ? buildAllTimeRecord(team, demoTeams, demoSeries) : null,
        currentSeasonKey: seasonHistory.availableSeasons[0]?.key ?? getSeasonKeyFromDate(new Date().toISOString()),
        currentSeasonLabel:
          seasonHistory.availableSeasons[0]?.label ??
          getSeasonLabel(getSeasonKeyFromDate(new Date().toISOString())),
        selectedSeasonKey: seasonHistory.selectedSeasonKey,
        selectedSeasonLabel: seasonHistory.selectedSeasonLabel,
        selectedSeasonSeries: team
          ? buildTeamMatchHistory({
              team,
              teams: demoTeams,
              series: demoSeries,
              tournaments: demoTournaments,
              seasonKey: seasonHistory.selectedSeasonKey
            })
          : []
      },
      warning:
        error instanceof Error
          ? `Supabase team data unavailable, showing demo data instead: ${error.message}`
          : "Supabase team data unavailable, showing demo data instead."
    };
  }
}

export async function getUnverifiedTeamPageData(
  normalizedNameInput: string,
  selectedSeasonKey?: string
): Promise<RepositoryResult<UnverifiedTeamPageData>> {
  const normalizedName = normalizeName(normalizedNameInput);

  try {
    const [teams, series, activity, tournaments, pendingAppearances] = await Promise.all([
      fetchTeams(),
      fetchSeries(),
      fetchActivityLog(),
      fetchTournaments(),
      fetchPendingAppearancesByNormalizedName(normalizedName)
    ]);

    if (!teams || !series || !activity || !tournaments || !pendingAppearances) {
      const fallbackAppearances = demoAppearances
        .filter((entry) => normalizeName(entry.teamName) === normalizedName)
        .sort((left, right) => left.seenAt.localeCompare(right.seenAt));
      const relevantSeries = demoSeries.filter((entry) => isSeriesForUnverifiedTeam(entry, normalizedName));
      const seasonOptions = buildUnverifiedSeasonOptions({
        appearances: fallbackAppearances,
        series: relevantSeries,
        tournaments: demoTournaments
      });
      const resolvedSelectedSeasonKey =
        seasonOptions.find((option) => option.key === selectedSeasonKey)?.key ??
        seasonOptions[0]?.key ??
        getSeasonKeyFromDate(new Date().toISOString());
      const currentSeasonKey = seasonOptions[0]?.key ?? resolvedSelectedSeasonKey;
      const snapshot = buildDashboardSnapshot({
        teams: demoTeams,
        series: demoSeries,
        appearances: demoAppearances,
        activity: demoActivity
      });
      const profile = buildUnverifiedProfile({
        normalizedName,
        pendingAppearances: fallbackAppearances,
        progress: snapshot.unverifiedTeams.find((entry) => entry.normalizedName === normalizedName)
      });

      return {
        state: "fallback",
        data: {
          profile,
          recentSeries: buildUnverifiedMatchHistory({
            normalizedName,
            series: relevantSeries,
            tournaments: demoTournaments,
            seasonKey: currentSeasonKey
          }).slice(0, 6),
          selectedSeasonSeries: buildUnverifiedMatchHistory({
            normalizedName,
            series: relevantSeries,
            tournaments: demoTournaments,
            seasonKey: resolvedSelectedSeasonKey
          }),
          allTimeRecord: buildUnverifiedAllTimeRecord(normalizedName, relevantSeries),
          tierBreakdown: buildUnverifiedTierBreakdown(normalizedName, relevantSeries),
          availableSeasons: seasonOptions,
          currentSeasonKey,
          currentSeasonLabel: getSeasonLabel(currentSeasonKey),
          selectedSeasonKey: resolvedSelectedSeasonKey,
          selectedSeasonLabel: getSeasonLabel(resolvedSelectedSeasonKey)
        },
        warning: "Supabase unverified team data is not ready yet. Showing demo team data."
      };
    }

    const relevantSeries = series.filter((entry) => isSeriesForUnverifiedTeam(entry, normalizedName));
    const seasonOptions = buildUnverifiedSeasonOptions({
      appearances: pendingAppearances,
      series: relevantSeries,
      tournaments
    });
    const resolvedSelectedSeasonKey =
      seasonOptions.find((option) => option.key === selectedSeasonKey)?.key ??
      seasonOptions[0]?.key ??
      getSeasonKeyFromDate(new Date().toISOString());
    const currentSeasonKey = seasonOptions[0]?.key ?? resolvedSelectedSeasonKey;
    const snapshot = buildDashboardSnapshot({
      teams,
      series,
      appearances: pendingAppearances,
      activity
    });
    const profile = buildUnverifiedProfile({
      normalizedName,
      pendingAppearances,
      progress: snapshot.unverifiedTeams.find((entry) => entry.normalizedName === normalizedName)
    });

    return {
      state: "live",
      data: {
        profile,
        recentSeries: buildUnverifiedMatchHistory({
          normalizedName,
          series: relevantSeries,
          tournaments,
          seasonKey: currentSeasonKey
        }).slice(0, 6),
        selectedSeasonSeries: buildUnverifiedMatchHistory({
          normalizedName,
          series: relevantSeries,
          tournaments,
          seasonKey: resolvedSelectedSeasonKey
        }),
        allTimeRecord: buildUnverifiedAllTimeRecord(normalizedName, relevantSeries),
        tierBreakdown: buildUnverifiedTierBreakdown(normalizedName, relevantSeries),
        availableSeasons: seasonOptions,
        currentSeasonKey,
        currentSeasonLabel: getSeasonLabel(currentSeasonKey),
        selectedSeasonKey: resolvedSelectedSeasonKey,
        selectedSeasonLabel: getSeasonLabel(resolvedSelectedSeasonKey)
      }
    };
  } catch (error) {
    const fallbackAppearances = demoAppearances
      .filter((entry) => normalizeName(entry.teamName) === normalizedName)
      .sort((left, right) => left.seenAt.localeCompare(right.seenAt));
    const relevantSeries = demoSeries.filter((entry) => isSeriesForUnverifiedTeam(entry, normalizedName));
    const seasonOptions = buildUnverifiedSeasonOptions({
      appearances: fallbackAppearances,
      series: relevantSeries,
      tournaments: demoTournaments
    });
    const resolvedSelectedSeasonKey =
      seasonOptions.find((option) => option.key === selectedSeasonKey)?.key ??
      seasonOptions[0]?.key ??
      getSeasonKeyFromDate(new Date().toISOString());
    const currentSeasonKey = seasonOptions[0]?.key ?? resolvedSelectedSeasonKey;
    const snapshot = buildDashboardSnapshot({
      teams: demoTeams,
      series: demoSeries,
      appearances: demoAppearances,
      activity: demoActivity
    });
    const profile = buildUnverifiedProfile({
      normalizedName,
      pendingAppearances: fallbackAppearances,
      progress: snapshot.unverifiedTeams.find((entry) => entry.normalizedName === normalizedName)
    });

    return {
      state: "fallback",
      data: {
        profile,
        recentSeries: buildUnverifiedMatchHistory({
          normalizedName,
          series: relevantSeries,
          tournaments: demoTournaments,
          seasonKey: currentSeasonKey
        }).slice(0, 6),
        selectedSeasonSeries: buildUnverifiedMatchHistory({
          normalizedName,
          series: relevantSeries,
          tournaments: demoTournaments,
          seasonKey: resolvedSelectedSeasonKey
        }),
        allTimeRecord: buildUnverifiedAllTimeRecord(normalizedName, relevantSeries),
        tierBreakdown: buildUnverifiedTierBreakdown(normalizedName, relevantSeries),
        availableSeasons: seasonOptions,
        currentSeasonKey,
        currentSeasonLabel: getSeasonLabel(currentSeasonKey),
        selectedSeasonKey: resolvedSelectedSeasonKey,
        selectedSeasonLabel: getSeasonLabel(resolvedSelectedSeasonKey)
      },
      warning:
        error instanceof Error
          ? `Supabase unverified team data unavailable, showing demo data instead: ${error.message}`
          : "Supabase unverified team data unavailable, showing demo data instead."
    };
  }
}

export async function getImportReferenceData() {
  try {
    const [teams, aliases] = await Promise.all([fetchTeams(), fetchAliases()]);
    return {
      teams: teams ?? demoTeams,
      aliases: aliases ?? []
    };
  } catch {
    return {
      teams: demoTeams,
      aliases: []
    };
  }
}

export async function getHistoryPageData(selectedSeasonKey?: string): Promise<RepositoryResult<HistoryPageData>> {
  try {
    const [teams, series, appearances, tournaments, activity] = await Promise.all([
      fetchTeams(),
      fetchSeries(),
      fetchAppearances(),
      fetchTournaments(),
      fetchActivityLog()
    ]);

    if (!teams || !series || !appearances || !tournaments || !activity) {
      return {
        state: "fallback",
        data: buildHistoryPageData({
          teams: demoTeams,
          series: demoSeries,
          appearances: demoAppearances,
          tournaments: demoTournaments,
          activity: demoActivity,
          selectedSeasonKey
        }),
        warning: "Supabase history is not configured yet. Showing local demo data."
      };
    }

    return {
      state: "live",
      data: buildHistoryPageData({
        teams,
        series,
        appearances,
        tournaments,
        activity,
        selectedSeasonKey
      })
    };
  } catch (error) {
    return {
      state: "fallback",
      data: buildHistoryPageData({
        teams: demoTeams,
        series: demoSeries,
        appearances: demoAppearances,
        tournaments: demoTournaments,
        activity: demoActivity,
        selectedSeasonKey
      }),
      warning:
        error instanceof Error
          ? `Supabase history unavailable, showing demo data instead: ${error.message}`
          : "Supabase history unavailable, showing demo data instead."
    };
  }
}
