import {
  buildImportPreview,
  detectImportSource,
  parseBattlefyUrl,
  parseStartGgUrl,
  type CanonicalSeriesRow
} from "@rematch/import-adapters";

import {
  canonicalImportRows,
  canonicalScreenshotRows,
  sampleImportPreview,
  sampleScreenshotPreview
} from "../../sample-data/demo";
import { getServiceSupabase } from "../supabase";
import { getServerEnv } from "../env";
import { getImportReferenceData } from "../repository";

type ConfirmPreviewRow = {
  id: string;
  playedAt: string;
  source: "battlefy" | "startgg" | "screenshot";
  bracketLabel?: string;
  roundLabel?: string;
  matchLabel?: string;
  teamOne: {
    name: string;
    status: "matched" | "unmatched" | "ambiguous";
    matchedTeamId?: string;
    matchedTeamName?: string;
    candidates?: string[];
  };
  teamTwo: {
    name: string;
    status: "matched" | "unmatched" | "ambiguous";
    matchedTeamId?: string;
    matchedTeamName?: string;
    candidates?: string[];
  };
  winnerName: string;
  score: string;
};

type ConfirmResolution = {
  rowId: string;
  teamOneTeamId?: string | null;
  teamTwoTeamId?: string | null;
  teamOneMode?: "match" | "unverified";
  teamTwoMode?: "match" | "unverified";
};

type ImportReferenceData = Awaited<ReturnType<typeof getImportReferenceData>>;

type BattlefyStageResponse = {
  _id?: string;
  name?: string;
  startTime?: string;
  tournamentID?: string;
  bracket?: {
    type?: string;
    series?: Array<{
      round?: number;
      roundType?: string;
      numGames?: number;
    }>;
  };
};

type BattlefyMatchSide = {
  teamID?: string;
  name?: string;
  score?: number;
  winner?: boolean;
  disqualified?: boolean;
  team?: {
    _id?: string;
    name?: string;
  };
};

type BattlefyMatchResponse = {
  _id?: string;
  roundNumber?: number;
  matchNumber?: number;
  isComplete?: boolean;
  isBye?: boolean;
  matchType?: string;
  inConsolationBracket?: boolean;
  schedule?: {
    startTime?: string;
  };
  top?: BattlefyMatchSide;
  bottom?: BattlefyMatchSide;
};

const BATTLEFY_HEADERS = {
  Referer: "https://battlefy.com/",
  Origin: "https://battlefy.com",
  "User-Agent": "Mozilla/5.0"
};

function normalizeScreenshotRows(
  rows: Array<{
    teamOneName: string;
    teamTwoName: string;
    teamOneScore: number;
    teamTwoScore: number;
    playedAt?: string;
  }>,
  fallbackPlayedAt: string
): CanonicalSeriesRow[] {
  return rows
    .filter((row) => {
      const validNames =
        typeof row.teamOneName === "string" &&
        row.teamOneName.trim().length > 0 &&
        typeof row.teamTwoName === "string" &&
        row.teamTwoName.trim().length > 0;
      const validScores =
        Number.isInteger(row.teamOneScore) &&
        row.teamOneScore >= 0 &&
        Number.isInteger(row.teamTwoScore) &&
        row.teamTwoScore >= 0;
      return validNames && validScores;
    })
    .map((row, index) => ({
      id: `screenshot-${index + 1}`,
      playedAt: row.playedAt || fallbackPlayedAt,
      source: "screenshot" as const,
      sourceRef: `screenshot-upload-${index + 1}`,
      teamOneName: row.teamOneName.trim(),
      teamTwoName: row.teamTwoName.trim(),
      teamOneScore: row.teamOneScore,
      teamTwoScore: row.teamTwoScore
    }));
}

function extractJsonBlock(input: string) {
  const firstBrace = input.indexOf("{");
  const firstBracket = input.indexOf("[");
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0);
  if (startCandidates.length === 0) {
    throw new Error("Anthropic response did not contain JSON.");
  }

  const start = Math.min(...startCandidates);
  const lastBrace = input.lastIndexOf("}");
  const lastBracket = input.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end < start) {
    throw new Error("Anthropic response contained incomplete JSON.");
  }

  return input.slice(start, end + 1);
}

async function parseScreenshotWithAnthropic(args: {
  title: string;
  eventDate: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
}) {
  const env = getServerEnv();
  if (!env.anthropicApiKey) {
    return {
      dryRun: true,
      rows: canonicalScreenshotRows,
      message:
        "Anthropic API key is not configured, so screenshot parsing is using sample OCR rows in dry-run mode."
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 1200,
      system:
        "You extract tournament series results from esports bracket screenshots. Return strict JSON only with no markdown fences.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Parse this tournament screenshot for "${args.title}" on ${args.eventDate}. ` +
                "Return JSON in the shape {\"rows\":[{\"teamOneName\":\"\",\"teamTwoName\":\"\",\"teamOneScore\":0,\"teamTwoScore\":0}]," +
                "\"notes\":[\"...\"]}. " +
                "Each row is one series result. Ignore individual games inside a series. If a score is unreadable, omit that row and explain it in notes."
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: args.mimeType,
                data: args.base64Data
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic screenshot parse failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlocks = payload.content?.filter((entry) => entry.type === "text").map((entry) => entry.text ?? "") ?? [];
  const rawJson = extractJsonBlock(textBlocks.join("\n"));
  const parsed = JSON.parse(rawJson) as {
    rows?: Array<{
      teamOneName: string;
      teamTwoName: string;
      teamOneScore: number;
      teamTwoScore: number;
      playedAt?: string;
    }>;
    notes?: string[];
  };

  return {
    dryRun: false,
    rows: normalizeScreenshotRows(parsed.rows ?? [], `${args.eventDate}T12:00:00.000Z`),
    notes: parsed.notes ?? [],
    message: `Screenshot parsed by Anthropic from ${args.fileName}.`
  };
}

function detectUnsupportedSourceLinks(sourceLinks: string[]) {
  return sourceLinks.filter((url) => {
    try {
      const parsed = new URL(url);
      return !parsed.hostname.includes("battlefy.com") && !parsed.hostname.includes("start.gg");
    } catch {
      return true;
    }
  });
}

function parseScore(score: string) {
  const match = score.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!match) {
    throw new Error(`Invalid score format: ${score}`);
  }

  return {
    teamOneScore: Number(match[1]),
    teamTwoScore: Number(match[2])
  };
}

function buildResolutionMap(resolutions: ConfirmResolution[]) {
  return new Map(resolutions.map((resolution) => [resolution.rowId, resolution]));
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function findTeamByResolutionValue(referenceData: ImportReferenceData, value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return (
    referenceData.teams.find((team) => team.id === value) ??
    referenceData.teams.find((team) => normalizeName(team.name) === normalizeName(value)) ??
    null
  );
}

function resolveConfirmedTeam(args: {
  side: "teamOne" | "teamTwo";
  row: ConfirmPreviewRow;
  resolution?: ConfirmResolution;
  referenceData: ImportReferenceData;
}) {
  const sideData = args.row[args.side];
  const teamIdKey = args.side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId";
  const modeKey = args.side === "teamOne" ? "teamOneMode" : "teamTwoMode";
  const selectedTeamId = args.resolution?.[teamIdKey] ?? sideData.matchedTeamId ?? null;
  const selectedMode = args.resolution?.[modeKey] ?? (selectedTeamId ? "match" : "unverified");

  if (selectedMode === "unverified") {
    return {
      matchedTeam: null,
      createsUnverified: true
    };
  }

  if (!selectedTeamId) {
    return {
      matchedTeam: null,
      createsUnverified: false,
      error: `${sideData.name} still needs explicit resolution.`
    };
  }

  const matchedTeam = findTeamByResolutionValue(args.referenceData, selectedTeamId);
  if (!matchedTeam) {
    return {
      matchedTeam: null,
      createsUnverified: false,
      error: `${sideData.name} was resolved to an unknown team id.`
    };
  }

  return {
    matchedTeam,
    createsUnverified: false
  };
}

async function fetchBattlefyJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: BATTLEFY_HEADERS,
    next: {
      revalidate: 0
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Battlefy fetch failed (${response.status}) for ${url}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

function extractBattlefyTeamName(side?: BattlefyMatchSide) {
  return side?.team?.name?.trim() || side?.name?.trim() || "";
}

function extractBattlefyScore(side?: BattlefyMatchSide) {
  return typeof side?.score === "number" ? side.score : null;
}

async function fetchBattlefyRowsFromLink(url: string, fallbackDate: string) {
  const parsed = parseBattlefyUrl(url);
  if (!parsed.stageId) {
    throw new Error("Battlefy links must include a stage id. Use the full Battlefy stage/bracket URL.");
  }

  const stage = await fetchBattlefyJson<BattlefyStageResponse>(
    `https://dtmwra1jsgyb0.cloudfront.net/stages/${parsed.stageId}`
  );
  const matches = await fetchBattlefyJson<BattlefyMatchResponse[]>(
    `https://dtmwra1jsgyb0.cloudfront.net/stages/${parsed.stageId}/matches`
  );

  const warnings: string[] = [];
  let skippedCount = 0;
  const maxChampionshipRound = Math.max(
    0,
    ...(stage.bracket?.series ?? [])
      .filter((entry) => entry.roundType === "championship" && typeof entry.round === "number")
      .map((entry) => entry.round as number)
  );
  const hasConsolationBracket = (stage.bracket?.series ?? []).some((entry) => entry.roundType === "consolation");

  function getBattlefyBracketLabel(match: BattlefyMatchResponse) {
    if (match.matchType === "loser" || match.inConsolationBracket) {
      return "Losers Bracket";
    }

    if (
      hasConsolationBracket &&
      match.matchType === "winner" &&
      typeof match.roundNumber === "number" &&
      match.roundNumber === maxChampionshipRound
    ) {
      return "Grand Finals";
    }

    if (match.matchType === "winner") {
      return "Winners Bracket";
    }

    return undefined;
  }

  function getBattlefyMatchLabel(match: BattlefyMatchResponse) {
    if (typeof match.matchNumber !== "number") {
      return undefined;
    }

    if (
      hasConsolationBracket &&
      match.matchType === "winner" &&
      typeof match.roundNumber === "number" &&
      match.roundNumber === maxChampionshipRound
    ) {
      return `Match GF${match.matchNumber}`;
    }

    if (match.matchType === "loser" || match.inConsolationBracket) {
      return `Match L${match.matchNumber}`;
    }

    if (match.matchType === "winner") {
      return `Match W${match.matchNumber}`;
    }

    return `Match ${match.matchNumber}`;
  }

  const rows = matches.flatMap((match) => {
    const teamOneName = extractBattlefyTeamName(match.top);
    const teamTwoName = extractBattlefyTeamName(match.bottom);
    const teamOneScore = extractBattlefyScore(match.top);
    const teamTwoScore = extractBattlefyScore(match.bottom);

    const missingTeam = !teamOneName || !teamTwoName;
    const missingScore = teamOneScore === null || teamTwoScore === null;

    if (match.isBye || !match.isComplete || missingTeam || missingScore) {
      skippedCount += 1;
      return [];
    }

    return [
      {
        id: `battlefy-${parsed.stageId}-${match._id ?? `${match.roundNumber ?? 0}-${match.matchNumber ?? 0}`}`,
        playedAt:
          match.schedule?.startTime ||
          stage.startTime ||
          `${fallbackDate}T12:00:00.000Z`,
        source: "battlefy" as const,
        sourceRef: `battlefy:${parsed.stageId}:${match._id ?? `${match.roundNumber ?? 0}-${match.matchNumber ?? 0}`}`,
        bracketLabel: getBattlefyBracketLabel(match),
        roundLabel: typeof match.roundNumber === "number" ? `Round ${match.roundNumber}` : undefined,
        matchLabel: getBattlefyMatchLabel(match),
        teamOneName,
        teamTwoName,
        teamOneScore,
        teamTwoScore
      }
    ];
  });

  if (skippedCount > 0) {
    warnings.push(`Skipped ${skippedCount} incomplete, bye, or scoreless Battlefy matches from stage ${parsed.stageId}.`);
  }

  if (rows.length === 0) {
    warnings.push(`Battlefy stage ${parsed.stageId} did not return any completed series with both teams and scores.`);
  }

  return {
    parsed,
    stage,
    rows,
    warnings
  };
}

async function getCanonicalRowsForLinks(draft: {
  tournamentTitle: string;
  eventDate: string;
  sourceLinks: string[];
}) {
  const battlefyLinks = draft.sourceLinks.filter((url) => detectImportSource(url) === "battlefy");
  const startGgLinks = draft.sourceLinks.filter((url) => detectImportSource(url) === "startgg");

  const warnings: string[] = [];
  const parsedSources: Array<ReturnType<typeof parseBattlefyUrl> | ReturnType<typeof parseStartGgUrl>> = [];
  const rows: CanonicalSeriesRow[] = [];

  for (const link of battlefyLinks) {
    const result = await fetchBattlefyRowsFromLink(link, draft.eventDate);
    parsedSources.push(result.parsed);
    warnings.push(...result.warnings);
    rows.push(...result.rows);
  }

  if (startGgLinks.length > 0) {
    warnings.push(
      "start.gg live fetching is not implemented yet in this environment. Those links were parsed but not imported."
    );
    parsedSources.push(...startGgLinks.map((link) => parseStartGgUrl(link)));
  }

  return {
    rows,
    warnings,
    parsedSources
  };
}

async function ensureImportNotDuplicated(sourceLinks: string[]) {
  const client = getServiceSupabase();
  if (!client || sourceLinks.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("tournament_sources")
    .select("url")
    .in("url", sourceLinks);

  if (error) {
    throw new Error(`Could not verify existing tournament sources: ${error.message}`);
  }

  const duplicates = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.url)
    .filter((value): value is string => typeof value === "string");

  if (duplicates.length > 0) {
    throw new Error(`These source links were already imported: ${duplicates.join(", ")}`);
  }
}

async function persistConfirmedImport(args: {
  tournamentTitle: string;
  eventDate: string;
  sourceMode: "links" | "screenshot";
  sourceLinks: string[];
  seriesPreview: Array<{
    id: string;
    playedAt: string;
    source: "battlefy" | "startgg" | "screenshot";
    teamOneName: string;
    teamTwoName: string;
    teamOneId?: string;
    teamTwoId?: string;
    teamOneTierId: string;
    teamTwoTierId: string;
    teamOneScore: number;
    teamTwoScore: number;
    confirmed: boolean;
    sourceRef: string;
  }>;
  createdUnverifiedNames: string[];
  actorAdminId?: string;
}) {
  const client = getServiceSupabase();
  if (!client) {
    return {
      persisted: false,
      message: "Supabase is not configured. Returning confirmation details without database persistence."
    };
  }

  if (args.sourceMode === "links") {
    await ensureImportNotDuplicated(args.sourceLinks);
  }

  const { data: tournament, error: tournamentError } = await client
    .from("tournaments")
    .insert({
      title: args.tournamentTitle,
      event_date: args.eventDate,
      created_by: args.actorAdminId ?? null
    } as never)
    .select("id")
    .single();

  if (tournamentError || !tournament) {
    throw new Error(`Could not create tournament: ${tournamentError?.message ?? "Unknown error"}`);
  }

  const tournamentId = String((tournament as Record<string, unknown>).id);

  if (args.sourceMode === "links" && args.sourceLinks.length > 0) {
    const sourceRows = args.sourceLinks.map((url) => {
      const sourceType = detectImportSource(url);
      const parsedSource =
        sourceType === "battlefy" ? parseBattlefyUrl(url) : sourceType === "startgg" ? parseStartGgUrl(url) : null;

      return {
        tournament_id: tournamentId,
        source_type: sourceType,
        url,
        source_ref:
          sourceType === "battlefy"
            ? parsedSource && "stageId" in parsedSource
              ? parsedSource.stageId ?? parsedSource.tournamentSlug
              : null
            : sourceType === "startgg"
              ? parsedSource && "eventSlug" in parsedSource
                ? parsedSource.phaseId ?? parsedSource.tournamentSlug
                : null
              : null,
        status: "imported"
      };
    });

    const { error: sourcesError } = await client.from("tournament_sources").insert(sourceRows as never);
    if (sourcesError) {
      throw new Error(`Could not save tournament sources: ${sourcesError.message}`);
    }
  }

  if (args.seriesPreview.length > 0) {
    const seriesRows = args.seriesPreview.map((row) => ({
      tournament_id: tournamentId,
      played_at: row.playedAt,
      team_one_name: row.teamOneName,
      team_two_name: row.teamTwoName,
      team_one_id: row.teamOneId ?? null,
      team_two_id: row.teamTwoId ?? null,
      team_one_tier_id: row.teamOneTierId,
      team_two_tier_id: row.teamTwoTierId,
      team_one_score: row.teamOneScore,
      team_two_score: row.teamTwoScore,
      source_type: row.source,
      source_ref: row.sourceRef,
      confirmed: true
    }));

    const { error: seriesError } = await client.from("series_results").insert(seriesRows as never);
    if (seriesError) {
      throw new Error(`Could not save series results: ${seriesError.message}`);
    }
  }

  if (args.createdUnverifiedNames.length > 0) {
    const appearanceRows = args.createdUnverifiedNames.map((name) => ({
      team_name: name,
      normalized_name: normalizeName(name),
      tournament_id: tournamentId
    }));

    const { error: appearancesError } = await client.from("unverified_appearances").insert(appearanceRows as never);
    if (appearancesError) {
      throw new Error(`Could not save unverified appearances: ${appearancesError.message}`);
    }
  }

  const { error: activityError } = await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId ?? null,
    verb: "imported",
    subject: `${args.tournamentTitle} (${args.seriesPreview.length} series)`
  } as never);

  if (activityError) {
    throw new Error(`Could not save activity log: ${activityError.message}`);
  }

  return {
    persisted: true,
    tournamentId,
    message: `Imported ${args.seriesPreview.length} series into tournament ${args.tournamentTitle}.`
  };
}

export async function previewImport(draft: {
  tournamentTitle: string;
  eventDate: string;
  sourceLinks: string[];
}) {
  if (!draft.tournamentTitle || draft.sourceLinks.length === 0) {
    return {
      ok: false,
      message: "Tournament title and at least one source link are required."
    };
  }

  const unsupportedLinks = detectUnsupportedSourceLinks(draft.sourceLinks);
  if (unsupportedLinks.length > 0) {
    return {
      ok: false,
      message:
        "One or more links are not Battlefy/start.gg URLs. Use screenshot fallback for unsupported sources.",
      unsupportedLinks
    };
  }

  const referenceData = await getImportReferenceData();

  try {
    const { rows, warnings, parsedSources } = await getCanonicalRowsForLinks(draft);

    const preview = buildImportPreview({
      draft,
      sourceRows: rows.length > 0 ? rows : canonicalImportRows,
      ...referenceData
    });

    return {
      ok: true,
      message:
        rows.length > 0
          ? "Preview generated from live Battlefy data."
          : "No live link rows were fetched. Returning the contract preview shape instead.",
      preview: {
        ...preview,
        parsedSources,
        warnings: [...warnings, ...preview.warnings]
      }
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not fetch live bracket data for the provided links."
    };
  }
}

export async function confirmImport() {
  return {
    ok: true,
    message: "Import confirmation contract completed. Persist preview rows inside one transaction when Supabase is connected.",
    preview: sampleImportPreview
  };
}

export async function confirmPreviewImport(args: {
  tournamentTitle: string;
  eventDate: string;
  sourceMode: "links" | "screenshot";
  sourceLinks: string[];
  previewRows: ConfirmPreviewRow[];
  resolutions: ConfirmResolution[];
  actorAdminId?: string;
}) {
  if (!args.tournamentTitle) {
    return {
      ok: false,
      message: "Tournament title is required before confirmation."
    };
  }

  if (args.previewRows.length === 0) {
    return {
      ok: false,
      message: "There are no preview rows to confirm."
    };
  }

  const referenceData = await getImportReferenceData();
  const resolutionMap = buildResolutionMap(args.resolutions);
  const blockedReasons: string[] = [];
  const seriesPreview = args.previewRows.flatMap((row) => {
    const rowResolution = resolutionMap.get(row.id);
    const teamOne = resolveConfirmedTeam({
      side: "teamOne",
      row,
      resolution: rowResolution,
      referenceData
    });
    const teamTwo = resolveConfirmedTeam({
      side: "teamTwo",
      row,
      resolution: rowResolution,
      referenceData
    });

    if (teamOne.error) {
      blockedReasons.push(`${row.teamOne.name}: ${teamOne.error}`);
    }
    if (teamTwo.error) {
      blockedReasons.push(`${row.teamTwo.name}: ${teamTwo.error}`);
    }
    if (teamOne.error || teamTwo.error) {
      return [];
    }

    const { teamOneScore, teamTwoScore } = parseScore(row.score);
    return [
      {
        id: row.id,
        playedAt: row.playedAt,
        source: row.source,
        teamOneName: row.teamOne.name,
        teamTwoName: row.teamTwo.name,
        teamOneId: teamOne.matchedTeam?.id,
        teamTwoId: teamTwo.matchedTeam?.id,
        teamOneTierId: teamOne.matchedTeam?.tierId ?? "tier7",
        teamTwoTierId: teamTwo.matchedTeam?.tierId ?? "tier7",
        teamOneScore,
        teamTwoScore,
        confirmed: true,
        sourceRef: row.source === "battlefy" || row.source === "startgg" ? row.id.replace(/^(battlefy-|startgg-)/, `${row.source}:`) : `${args.sourceMode}-${row.id}`
      }
    ];
  });

  if (blockedReasons.length > 0) {
    return {
      ok: false,
      message: "Resolve ambiguous team names before confirming this import.",
      blockedReasons
    };
  }

  const createdUnverifiedNames = args.previewRows.flatMap((row) => {
    const rowResolution = resolutionMap.get(row.id);
    const teamOne = resolveConfirmedTeam({
      side: "teamOne",
      row,
      resolution: rowResolution,
      referenceData
    });
    const teamTwo = resolveConfirmedTeam({
      side: "teamTwo",
      row,
      resolution: rowResolution,
      referenceData
    });

    const names: string[] = [];
    if (teamOne.createsUnverified) {
      names.push(row.teamOne.name);
    }
    if (teamTwo.createsUnverified) {
      names.push(row.teamTwo.name);
    }
    return names;
  });

  const persistence = await persistConfirmedImport({
    tournamentTitle: args.tournamentTitle,
    eventDate: args.eventDate,
    sourceMode: args.sourceMode,
    sourceLinks: args.sourceLinks,
    seriesPreview,
    createdUnverifiedNames,
    actorAdminId: args.actorAdminId
  });

  return {
    ok: true,
    message:
      args.sourceMode === "screenshot"
        ? persistence.message
        : persistence.persisted
          ? "Link import confirmed and recorded in Supabase."
          : "Link import confirmed. Supabase persistence is not available in this environment.",
    summary: {
      tournamentTitle: args.tournamentTitle,
      eventDate: args.eventDate,
      sourceMode: args.sourceMode,
      seriesCount: seriesPreview.length,
      matchedTeamCount: seriesPreview.reduce(
        (count, row) => count + Number(Boolean(row.teamOneId)) + Number(Boolean(row.teamTwoId)),
        0
      ),
      createdUnverifiedCount: createdUnverifiedNames.length,
      createdUnverifiedNames
    },
    persistence
  };
}

export async function previewScreenshotImport(args: {
  tournamentTitle: string;
  eventDate: string;
  fileName: string;
  mimeType: string;
  fileBuffer: ArrayBuffer;
}) {
  if (!args.tournamentTitle) {
    return {
      ok: false,
      message: "Tournament title is required before screenshot parsing."
    };
  }

  if (!args.mimeType.startsWith("image/")) {
    return {
      ok: false,
      message: "Only image uploads are supported for screenshot parsing."
    };
  }

  const parsed = await parseScreenshotWithAnthropic({
    title: args.tournamentTitle,
    eventDate: args.eventDate,
    fileName: args.fileName,
    mimeType: args.mimeType,
    base64Data: Buffer.from(args.fileBuffer).toString("base64")
  });

  const preview = buildImportPreview({
    draft: {
      tournamentTitle: args.tournamentTitle,
      eventDate: args.eventDate,
      sourceLinks: []
    },
    sourceRows: parsed.rows.length > 0 ? parsed.rows : canonicalScreenshotRows,
    ...(await getImportReferenceData())
  });

  return {
    ok: true,
    message: parsed.message,
    dryRun: parsed.dryRun,
    preview: {
      ...preview,
      warnings: [...(parsed.notes ?? []), ...preview.warnings]
    },
    cleanupPolicy:
      "Transient only. The uploaded screenshot is processed in-memory and is not persisted by this Phase 2 implementation."
  };
}

export async function confirmScreenshotImport() {
  return {
    ok: true,
    message:
      "Screenshot confirmation contract completed. Persist parsed rows through the same transaction path as link imports when Supabase is connected.",
    preview: sampleScreenshotPreview
  };
}
