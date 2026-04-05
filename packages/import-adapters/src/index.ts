import type {
  ImportDraft,
  ImportPreviewRow,
  ImportPreviewTeamResolution,
  ImportSource,
  SeriesResult,
  Team,
  TeamAlias
} from "@rematch/shared-types";

export interface ParsedBattlefyLink {
  source: "battlefy";
  tournamentSlug: string;
  stageId?: string;
}

export interface ParsedStartGgLink {
  source: "startgg";
  tournamentSlug: string;
  eventSlug?: string;
  phaseId?: string;
  groupId?: string;
}

export interface CanonicalSeriesRow {
  id: string;
  playedAt: string;
  source: ImportSource;
  sourceRef: string;
  bracketLabel?: string;
  roundLabel?: string;
  matchLabel?: string;
  teamOneName: string;
  teamTwoName: string;
  teamOneScore: number;
  teamTwoScore: number;
}

export interface ImportPreviewResult {
  draft: ImportDraft;
  parsedSources: Array<ParsedBattlefyLink | ParsedStartGgLink>;
  previewRows: ImportPreviewRow[];
  warnings: string[];
}

export function detectImportSource(url: string): ImportSource {
  if (url.includes("battlefy.com")) {
    return "battlefy";
  }
  if (url.includes("start.gg")) {
    return "startgg";
  }
  return "screenshot";
}

export function parseBattlefyUrl(url: string): ParsedBattlefyLink {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const stageIndex = segments.findIndex((segment) => segment === "stage");
  return {
    source: "battlefy",
    tournamentSlug: segments[segments.length - 1] ?? parsed.hostname,
    stageId: stageIndex >= 0 ? segments[stageIndex + 1] : undefined
  };
}

export function parseStartGgUrl(url: string): ParsedStartGgLink {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const tournamentIndex = segments.findIndex((segment) => segment === "tournament");
  const eventIndex = segments.findIndex((segment) => segment === "event" || segment === "events");
  const bracketsIndex = segments.findIndex((segment) => segment === "brackets");
  return {
    source: "startgg",
    tournamentSlug: tournamentIndex >= 0 ? segments[tournamentIndex + 1] : segments[0] ?? "unknown",
    eventSlug: eventIndex >= 0 ? segments[eventIndex + 1] : undefined,
    phaseId: bracketsIndex >= 0 ? segments[bracketsIndex + 1] : undefined,
    groupId: bracketsIndex >= 0 ? segments[bracketsIndex + 2] : undefined
  };
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function resolveTeamName(name: string, teams: Team[], aliases: TeamAlias[]): ImportPreviewTeamResolution {
  const normalized = normalizeName(name);
  const exact = teams.find((team) => normalizeName(team.name) === normalized);
  if (exact) {
    return {
      name,
      status: "matched",
      matchedTeamId: exact.id,
      matchedTeamName: exact.name
    };
  }

  const aliasMatches = aliases.filter((alias) => normalizeName(alias.alias) === normalized);
  if (aliasMatches.length === 1) {
    const matchedTeam = teams.find((team) => team.id === aliasMatches[0]?.teamId);
    if (matchedTeam) {
      return {
        name,
        status: "matched",
        matchedTeamId: matchedTeam.id,
        matchedTeamName: matchedTeam.name
      };
    }
  }

  const fuzzyCandidates = teams
    .filter((team) => normalizeName(team.name).includes(normalized) || normalized.includes(normalizeName(team.name)))
    .map((team) => team.name);

  if (fuzzyCandidates.length > 1) {
    return {
      name,
      status: "ambiguous",
      candidates: fuzzyCandidates
    };
  }

  return {
    name,
    status: "unmatched",
    candidates: fuzzyCandidates.length === 1 ? fuzzyCandidates : undefined
  };
}

export function normalizePreviewRows(
  rows: CanonicalSeriesRow[],
  teams: Team[],
  aliases: TeamAlias[]
): ImportPreviewRow[] {
  return rows.map((row) => {
    const teamOne = resolveTeamName(row.teamOneName, teams, aliases);
    const teamTwo = resolveTeamName(row.teamTwoName, teams, aliases);
    const winnerName = row.teamOneScore > row.teamTwoScore ? row.teamOneName : row.teamTwoName;

    return {
      id: row.id,
      playedAt: row.playedAt,
      source: row.source,
      bracketLabel: row.bracketLabel,
      roundLabel: row.roundLabel,
      matchLabel: row.matchLabel,
      teamOne,
      teamTwo,
      winnerName,
      score: `${row.teamOneScore}-${row.teamTwoScore}`
    };
  });
}

export function buildImportPreview(args: {
  draft: ImportDraft;
  sourceRows: CanonicalSeriesRow[];
  teams: Team[];
  aliases: TeamAlias[];
}): ImportPreviewResult {
  const parsedSources = args.draft.sourceLinks
    .map((url) => {
      const source = detectImportSource(url);
      if (source === "battlefy") {
        return parseBattlefyUrl(url);
      }
      if (source === "startgg") {
        return parseStartGgUrl(url);
      }
      return null;
    })
    .filter((value): value is ParsedBattlefyLink | ParsedStartGgLink => value !== null);

  const previewRows = normalizePreviewRows(args.sourceRows, args.teams, args.aliases);
  const warnings = previewRows.flatMap((row) => {
    const rowWarnings: string[] = [];
    if (row.teamOne.status !== "matched") {
      rowWarnings.push(`${row.teamOne.name} needs admin confirmation.`);
    }
    if (row.teamTwo.status !== "matched") {
      rowWarnings.push(`${row.teamTwo.name} needs admin confirmation.`);
    }
    return rowWarnings;
  });

  return {
    draft: args.draft,
    parsedSources,
    previewRows,
    warnings
  };
}

export function previewRowsToSeries(
  rows: CanonicalSeriesRow[],
  previewRows: ImportPreviewRow[],
  teams: Team[]
): SeriesResult[] {
  return rows.flatMap((row) => {
    const previewRow = previewRows.find((entry) => entry.id === row.id);
    if (!previewRow) {
      return [];
    }

    const teamOne = teams.find((team) => team.id === previewRow.teamOne.matchedTeamId);
    const teamTwo = teams.find((team) => team.id === previewRow.teamTwo.matchedTeamId);

    return [
      {
        id: row.id,
        tournamentId: "pending-confirmation",
        playedAt: row.playedAt,
        teamOneName: row.teamOneName,
        teamTwoName: row.teamTwoName,
        teamOneId: teamOne?.id,
        teamTwoId: teamTwo?.id,
        teamOneTierId: teamOne?.tierId ?? "tier7",
        teamTwoTierId: teamTwo?.tierId ?? "tier7",
        teamOneScore: row.teamOneScore,
        teamTwoScore: row.teamTwoScore,
        source: row.source,
        sourceRef: row.sourceRef,
        confirmed: false
      }
    ];
  });
}
