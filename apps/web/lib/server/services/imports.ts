import {
  buildImportPreview,
  detectImportSource,
  normalizePreviewRows,
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

type BattlefyTournamentResponse = {
  _id?: string;
  name?: string;
  startTime?: string;
};

type StartGgEventQueryResponse = {
  event?: {
    id?: string | number | null;
    name?: string | null;
    startAt?: number | string | null;
  } | null;
};

type StartGgSetSlot = {
  entrant?: {
    id?: string | number | null;
    name?: string | null;
  } | null;
  standing?: {
    placement?: number | null;
    stats?: {
      score?: {
        value?: number | string | null;
      } | null;
    } | null;
  } | null;
};

type StartGgEventSet = {
  id?: string | number | null;
  state?: number | null;
  round?: number | null;
  identifier?: string | null;
  fullRoundText?: string | null;
  completedAt?: number | string | null;
  phaseGroup?: {
    id?: string | number | null;
    displayIdentifier?: string | null;
    phase?: {
      name?: string | null;
    } | null;
  } | null;
  slots?: StartGgSetSlot[] | null;
};

type StartGgEventSetsQueryResponse = {
  event?: {
    id?: string | number | null;
    name?: string | null;
    sets?: {
      pageInfo?: {
        total?: number | null;
      } | null;
      nodes?: StartGgEventSet[] | null;
    } | null;
  } | null;
};

type StartGgGraphQlEnvelope<T> = {
  data?: T;
  errors?: Array<{
    message?: string | null;
  }>;
  message?: string;
};

type LinkImportMetadata = {
  suggestedTournamentTitle?: string;
  suggestedEventDate?: string;
};

const BATTLEFY_HEADERS = {
  Referer: "https://battlefy.com/",
  Origin: "https://battlefy.com",
  "User-Agent": "Mozilla/5.0"
};

const START_GG_API_URL = "https://api.start.gg/gql/alpha";
const START_GG_EVENT_QUERY = `
  query GetEvent($slug: String!) {
    event(slug: $slug) {
      id
      name
      startAt
    }
  }
`;
const START_GG_EVENT_SETS_QUERY = `
  query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      id
      name
      sets(
        page: $page
        perPage: $perPage
        sortType: STANDARD
      ) {
        pageInfo {
          total
        }
        nodes {
          id
          state
          round
          identifier
          fullRoundText
          completedAt
          phaseGroup {
            id
            displayIdentifier
            phase {
              name
            }
          }
          slots {
            entrant {
              id
              name
            }
            standing {
              placement
              stats {
                score {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;
const START_GG_SETS_PER_PAGE = 100;
const START_GG_SETS_PER_PAGE_FALLBACKS = [START_GG_SETS_PER_PAGE, 50, 25, 10] as const;

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

function buildStartGgApiError(args: {
  context: string;
  status: number;
  rawText: string;
  payload?: StartGgGraphQlEnvelope<unknown> | null;
}) {
  const graphqlMessages =
    args.payload?.errors
      ?.map((error) => error.message?.trim())
      .filter((message): message is string => Boolean(message)) ?? [];
  const baseMessage =
    graphqlMessages.join("; ") ||
    args.payload?.message?.trim() ||
    args.rawText.trim().slice(0, 300) ||
    "Unknown start.gg API error.";

  if (
    args.status === 401 ||
    args.status === 403 ||
    /token|auth|unauthori|forbidden/i.test(baseMessage)
  ) {
    return new Error(
      "start.gg API authentication failed. Check that START_GG_API_KEY is set to a valid token before importing start.gg tournaments."
    );
  }

  return new Error(`start.gg API request failed while ${args.context}: ${baseMessage}`);
}

async function fetchStartGgGraphQl<T>(args: {
  query: string;
  variables: Record<string, unknown>;
  context: string;
}): Promise<T> {
  const env = getServerEnv();
  if (!env.startGgApiKey) {
    throw new Error(
      "start.gg import is not configured yet. Add START_GG_API_KEY to the server environment before importing start.gg tournaments."
    );
  }

  const response = await fetch(START_GG_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.startGgApiKey}`
    },
    body: JSON.stringify({
      query: args.query,
      variables: args.variables
    }),
    next: {
      revalidate: 0
    }
  });

  const rawText = await response.text();
  let payload: StartGgGraphQlEnvelope<T> | null = null;

  try {
    payload = JSON.parse(rawText) as StartGgGraphQlEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || (payload?.errors?.length ?? 0) > 0 || !payload?.data) {
    throw buildStartGgApiError({
      context: args.context,
      status: response.status,
      rawText,
      payload
    });
  }

  return payload.data;
}

function isStartGgQueryComplexityError(error: unknown) {
  return (
    error instanceof Error &&
    /query complexity is too high|max(?:imum)? of 1000 objects/i.test(error.message)
  );
}

function extractBattlefyTeamName(side?: BattlefyMatchSide) {
  return side?.team?.name?.trim() || side?.name?.trim() || "";
}

function extractBattlefyScore(side?: BattlefyMatchSide) {
  return typeof side?.score === "number" ? side.score : null;
}

function extractBattlefyTournamentIdFromUrl(url: string) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const stageIndex = segments.findIndex((segment) => segment === "stage");
  if (stageIndex <= 0) {
    return null;
  }

  const candidate = segments[stageIndex - 1];
  return candidate?.trim() ? candidate : null;
}

function extractStartGgScoreValue(slot?: StartGgSetSlot) {
  const value = slot?.standing?.stats?.score?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

function hasCompletedPlacement(slot?: StartGgSetSlot) {
  return typeof slot?.standing?.placement === "number";
}

function normalizeStartGgCompletedAt(value: number | string | null | undefined, fallbackPlayedAt: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value.trim())) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        return new Date(timestamp).toISOString();
      }
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return fallbackPlayedAt;
}

function normalizeStartGgIdentifier(value: string | null | undefined) {
  return value?.trim() || "";
}

function getStartGgPhaseName(set: StartGgEventSet) {
  return set.phaseGroup?.phase?.name?.trim() || "Bracket";
}

function getStartGgBracketIdentifier(set: StartGgEventSet) {
  return set.phaseGroup?.displayIdentifier?.trim() || "";
}

function getStartGgBracketLabel(set: StartGgEventSet) {
  const phaseName = getStartGgPhaseName(set);
  const displayIdentifier = getStartGgBracketIdentifier(set);

  if (displayIdentifier) {
    return `${phaseName} ${displayIdentifier}`;
  }

  const phaseGroupId = set.phaseGroup?.id ? String(set.phaseGroup.id) : "";
  if (phaseGroupId) {
    return `${phaseName} ${phaseGroupId}`;
  }

  return phaseName;
}

function getStartGgPhaseSortOrder(phaseName: string) {
  if (phaseName === "Bracket") {
    return 0;
  }

  if (phaseName === "Final Bracket") {
    return 1;
  }

  return 2;
}

function compareStartGgSets(left: StartGgEventSet, right: StartGgEventSet, fallbackPlayedAt: string) {
  const leftPhaseName = getStartGgPhaseName(left);
  const rightPhaseName = getStartGgPhaseName(right);
  const leftPhaseOrder = getStartGgPhaseSortOrder(leftPhaseName);
  const rightPhaseOrder = getStartGgPhaseSortOrder(rightPhaseName);
  if (leftPhaseOrder !== rightPhaseOrder) {
    return leftPhaseOrder - rightPhaseOrder;
  }

  if (leftPhaseName !== rightPhaseName) {
    return leftPhaseName.localeCompare(rightPhaseName, undefined, { numeric: true, sensitivity: "base" });
  }

  const leftBracketIdentifier = getStartGgBracketIdentifier(left);
  const rightBracketIdentifier = getStartGgBracketIdentifier(right);
  if (leftBracketIdentifier !== rightBracketIdentifier) {
    return leftBracketIdentifier.localeCompare(rightBracketIdentifier, undefined, { numeric: true, sensitivity: "base" });
  }

  const leftRound = left.round ?? Number.MAX_SAFE_INTEGER;
  const rightRound = right.round ?? Number.MAX_SAFE_INTEGER;
  if (leftRound !== rightRound) {
    return leftRound - rightRound;
  }

  const leftRoundText = left.fullRoundText?.trim() ?? "";
  const rightRoundText = right.fullRoundText?.trim() ?? "";
  if (leftRoundText !== rightRoundText) {
    return leftRoundText.localeCompare(rightRoundText, undefined, { numeric: true, sensitivity: "base" });
  }

  const leftIdentifier = normalizeStartGgIdentifier(left.identifier);
  const rightIdentifier = normalizeStartGgIdentifier(right.identifier);
  if (leftIdentifier !== rightIdentifier) {
    if (!leftIdentifier) {
      return 1;
    }
    if (!rightIdentifier) {
      return -1;
    }

    return leftIdentifier.localeCompare(rightIdentifier, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  const leftPhaseGroupId = left.phaseGroup?.id ? String(left.phaseGroup.id) : "";
  const rightPhaseGroupId = right.phaseGroup?.id ? String(right.phaseGroup.id) : "";
  if (leftPhaseGroupId !== rightPhaseGroupId) {
    return leftPhaseGroupId.localeCompare(rightPhaseGroupId, undefined, { numeric: true, sensitivity: "base" });
  }

  const leftPlayedAt = normalizeStartGgCompletedAt(left.completedAt, fallbackPlayedAt);
  const rightPlayedAt = normalizeStartGgCompletedAt(right.completedAt, fallbackPlayedAt);
  if (leftPlayedAt !== rightPlayedAt) {
    return leftPlayedAt.localeCompare(rightPlayedAt);
  }

  const leftId = String(left.id ?? "");
  const rightId = String(right.id ?? "");
  return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: "base" });
}

function formatDateForInput(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value.trim())) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        return new Date(timestamp).toISOString().slice(0, 10);
      }
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }

  return undefined;
}

function mergeSuggestedMetadata(args: {
  current: LinkImportMetadata;
  next: LinkImportMetadata;
  warnings: string[];
  sourceLabel: string;
}) {
  const merged = { ...args.current };

  if (!merged.suggestedTournamentTitle && args.next.suggestedTournamentTitle) {
    merged.suggestedTournamentTitle = args.next.suggestedTournamentTitle;
  } else if (
    merged.suggestedTournamentTitle &&
    args.next.suggestedTournamentTitle &&
    merged.suggestedTournamentTitle !== args.next.suggestedTournamentTitle
  ) {
    args.warnings.push(
      `${args.sourceLabel} returned a different title ("${args.next.suggestedTournamentTitle}") than the first linked source, so the first title was kept in the form.`
    );
  }

  if (!merged.suggestedEventDate && args.next.suggestedEventDate) {
    merged.suggestedEventDate = args.next.suggestedEventDate;
  } else if (
    merged.suggestedEventDate &&
    args.next.suggestedEventDate &&
    merged.suggestedEventDate !== args.next.suggestedEventDate
  ) {
    args.warnings.push(
      `${args.sourceLabel} returned a different event date (${args.next.suggestedEventDate}) than the first linked source, so the first date was kept in the form.`
    );
  }

  return merged;
}

async function fetchStartGgEventBySlug(eventSlug: string) {
  const data = await fetchStartGgGraphQl<StartGgEventQueryResponse>({
    query: START_GG_EVENT_QUERY,
    variables: {
      slug: eventSlug
    },
    context: `loading event ${eventSlug}`
  });

  if (!data.event?.id) {
    throw new Error(`start.gg event "${eventSlug}" was not found.`);
  }

  return {
    id: String(data.event.id),
    name: data.event.name?.trim() || eventSlug,
    startAt: data.event.startAt ?? null
  };
}

async function fetchStartGgEventSets(eventId: string, eventName: string) {
  let lastError: unknown = null;

  for (const perPage of START_GG_SETS_PER_PAGE_FALLBACKS) {
    const allSets: StartGgEventSet[] = [];
    let page = 1;
    let totalPages = 1;

    try {
      while (page <= totalPages) {
        const data = await fetchStartGgGraphQl<StartGgEventSetsQueryResponse>({
          query: START_GG_EVENT_SETS_QUERY,
          variables: {
            eventId,
            page,
            perPage
          },
          context: `loading sets for event ${eventName}`
        });

        if (!data.event) {
          throw new Error(`start.gg event "${eventId}" could not be loaded.`);
        }

        const setNodes = data.event.sets?.nodes ?? [];
        const totalSets = data.event.sets?.pageInfo?.total ?? setNodes.length;
        totalPages = Math.max(1, Math.ceil(totalSets / perPage));
        allSets.push(...setNodes);
        page += 1;
      }

      return allSets;
    } catch (error) {
      lastError = error;
      if (!isStartGgQueryComplexityError(error) || perPage === START_GG_SETS_PER_PAGE_FALLBACKS.at(-1)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`start.gg event "${eventId}" could not be loaded.`);
}

async function fetchStartGgRowsFromTournamentLink(url: string, fallbackDate: string) {
  const parsed = parseStartGgUrl(url);
  if (!parsed.tournamentSlug || parsed.tournamentSlug === "unknown" || !parsed.eventSlug) {
    throw new Error(
      "start.gg imports are event-specific. Paste a specific event URL like /tournament/.../event/.../brackets."
    );
  }

  const eventSlug = `tournament/${parsed.tournamentSlug}/event/${parsed.eventSlug}`;
  const event = await fetchStartGgEventBySlug(eventSlug);

  const warnings: string[] = [];
  const rows: CanonicalSeriesRow[] = [];
  let skippedCount = 0;
  const fallbackPlayedAt = `${fallbackDate}T12:00:00.000Z`;
  const eventSets = (await fetchStartGgEventSets(event.id, event.name)).sort((left, right) =>
    compareStartGgSets(left, right, fallbackPlayedAt)
  );

  for (const set of eventSets) {
    const slots = (set.slots ?? []).slice(0, 2);
    const teamOneName = slots[0]?.entrant?.name?.trim() ?? "";
    const teamTwoName = slots[1]?.entrant?.name?.trim() ?? "";
    const teamOneScore = extractStartGgScoreValue(slots[0]);
    const teamTwoScore = extractStartGgScoreValue(slots[1]);
    const isCompleted = hasCompletedPlacement(slots[0]) && hasCompletedPlacement(slots[1]);

    if (!isCompleted || !teamOneName || !teamTwoName || teamOneScore === null || teamTwoScore === null) {
      skippedCount += 1;
      continue;
    }

    const setId = String(set.id ?? `${event.id}-${rows.length + 1}`);
    const roundLabel = set.fullRoundText?.trim() || undefined;
    const matchIdentifier = set.identifier?.trim();
    rows.push({
      id: `startgg-${parsed.tournamentSlug}-${event.id}-${setId}`,
      playedAt: normalizeStartGgCompletedAt(
        set.completedAt,
        fallbackPlayedAt
      ),
      source: "startgg",
      sourceRef: `startgg:${parsed.tournamentSlug}:${event.id}:${setId}`,
      bracketLabel: getStartGgBracketLabel(set),
      roundLabel,
      matchLabel: matchIdentifier ? `Set ${matchIdentifier}` : `Set ${setId}`,
      teamOneName,
      teamTwoName,
      teamOneScore,
      teamTwoScore
    });
  }

  if (skippedCount > 0) {
    warnings.push(
      `Skipped ${skippedCount} incomplete, bye, or scoreless start.gg sets in ${event.name}.`
    );
  }

  if (rows.length === 0) {
    warnings.push(
      `start.gg event ${event.name} did not return any completed head-to-head series with both teams and scores.`
    );
  }

  return {
    parsed,
    rows,
    warnings,
    metadata: {
      suggestedTournamentTitle: event.name,
      suggestedEventDate: formatDateForInput(event.startAt) ?? formatDateForInput(rows[0]?.playedAt)
    }
  };
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
  const battlefyTournamentId = extractBattlefyTournamentIdFromUrl(url);
  const tournament =
    battlefyTournamentId
      ? await fetchBattlefyJson<BattlefyTournamentResponse>(
          `https://dtmwra1jsgyb0.cloudfront.net/tournaments/${battlefyTournamentId}`
        )
      : null;

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
    warnings,
    metadata: {
      suggestedTournamentTitle:
        tournament?.name?.trim() ||
        stage.name?.trim() ||
        undefined,
      suggestedEventDate:
        formatDateForInput(tournament?.startTime) ??
        formatDateForInput(stage.startTime) ??
        formatDateForInput(rows[0]?.playedAt)
    }
  };
}

async function getCanonicalRowsForLinks(draft: {
  tournamentTitle: string;
  eventDate: string;
  sourceLinks: string[];
}) {
  const battlefyLinks = draft.sourceLinks.filter((url) => detectImportSource(url) === "battlefy");
  const startGgLinks = draft.sourceLinks.filter((url) => detectImportSource(url) === "startgg");
  const uniqueStartGgLinks = new Map<string, string>();

  const warnings: string[] = [];
  const parsedSources: Array<ReturnType<typeof parseBattlefyUrl> | ReturnType<typeof parseStartGgUrl>> = [];
  const rows: CanonicalSeriesRow[] = [];
  let metadata: LinkImportMetadata = {};

  for (const link of battlefyLinks) {
    const result = await fetchBattlefyRowsFromLink(link, draft.eventDate);
    parsedSources.push(result.parsed);
    warnings.push(...result.warnings);
    rows.push(...result.rows);
    metadata = mergeSuggestedMetadata({
      current: metadata,
      next: result.metadata,
      warnings,
      sourceLabel: "Battlefy"
    });
  }

  if (startGgLinks.length > 0) {
    parsedSources.push(...startGgLinks.map((link) => parseStartGgUrl(link)));

    for (const link of startGgLinks) {
      const parsed = parseStartGgUrl(link);
      const key = parsed.eventSlug ? `${parsed.tournamentSlug}/${parsed.eventSlug}` : link;
      if (!uniqueStartGgLinks.has(key)) {
        uniqueStartGgLinks.set(key, link);
      }
    }

    if (uniqueStartGgLinks.size < startGgLinks.length) {
      warnings.push("Multiple start.gg links pointed at the same event, so that event was imported once.");
    }

    for (const link of uniqueStartGgLinks.values()) {
      const result = await fetchStartGgRowsFromTournamentLink(link, draft.eventDate);
      warnings.push(...result.warnings);
      rows.push(...result.rows);
      metadata = mergeSuggestedMetadata({
        current: metadata,
        next: result.metadata,
        warnings,
        sourceLabel: "start.gg"
      });
    }
  }

  return {
    rows,
    warnings,
    parsedSources,
    metadata
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
    const { rows, warnings, parsedSources, metadata } = await getCanonicalRowsForLinks(draft);

    const preview = buildImportPreview({
      draft,
      sourceRows: rows.length > 0 ? rows : canonicalImportRows,
      ...referenceData
    });

    return {
      ok: true,
      message:
        rows.length > 0
          ? "Preview generated from live link data."
          : "No live link rows were fetched. Returning the contract preview shape instead.",
      preview: {
        ...preview,
        parsedSources,
        warnings: [...warnings, ...preview.warnings],
        suggestedTournamentTitle: metadata.suggestedTournamentTitle,
        suggestedEventDate: metadata.suggestedEventDate
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

export async function logTournamentHeader(args: {
  tournamentTitle: string;
  eventDate: string;
  sourceLinks: string[];
  actorAdminId: string;
}): Promise<{ ok: boolean; message: string; duplicates?: string[] }> {
  if (!args.tournamentTitle || !args.eventDate || args.sourceLinks.length === 0) {
    return { ok: false, message: "Title, date, and at least one URL are required." };
  }

  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, message: "Database not configured." };
  }

  const { data: existingData, error: dupError } = await client
    .from("tournament_sources")
    .select("url")
    .in("url", args.sourceLinks);

  if (dupError) {
    return { ok: false, message: `Could not verify existing sources: ${dupError.message}` };
  }

  const duplicates = ((existingData ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.url)
    .filter((value): value is string => typeof value === "string");

  if (duplicates.length > 0) {
    return {
      ok: false,
      message: `These URLs were already imported: ${duplicates.join(", ")}`,
      duplicates
    };
  }

  const { data: tournament, error: tournamentError } = await client
    .from("tournaments")
    .insert({
      title: args.tournamentTitle,
      event_date: args.eventDate,
      created_by: args.actorAdminId
    } as never)
    .select("id")
    .single();

  if (tournamentError || !tournament) {
    return { ok: false, message: `Could not create tournament: ${tournamentError?.message ?? "Unknown error"}` };
  }

  const tournamentId = String((tournament as Record<string, unknown>).id);

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
    return { ok: false, message: `Could not save tournament sources: ${sourcesError.message}` };
  }

  await client.from("activity_log").insert({
    admin_account_id: args.actorAdminId,
    verb: "logged",
    subject: `${args.tournamentTitle} (header only)`
  } as never);

  return { ok: true, message: "Tournament logged to database." };
}

export async function reimportTournamentSeries(
  tournamentId: string
): Promise<{ ok: boolean; added: number; message: string }> {
  const client = getServiceSupabase();
  if (!client) {
    return { ok: false, added: 0, message: "Database not available." };
  }

  const { data: tournament, error: tournamentError } = await client
    .from("tournaments")
    .select("id, title, event_date")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return { ok: false, added: 0, message: "Tournament not found." };
  }

  const t = tournament as Record<string, unknown>;
  const tournamentTitle = String(t.title ?? "");
  const eventDate = String(t.event_date ?? "");

  const { data: sourcesData, error: sourcesError } = await client
    .from("tournament_sources")
    .select("url")
    .eq("tournament_id", tournamentId)
    .neq("source_type", "screenshot");

  if (sourcesError) {
    return { ok: false, added: 0, message: `Could not load sources: ${sourcesError.message}` };
  }

  const sourceLinks = ((sourcesData ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.url)
    .filter((value): value is string => typeof value === "string");

  if (sourceLinks.length === 0) {
    return { ok: false, added: 0, message: "No importable source links found for this tournament." };
  }

  const { rows } = await getCanonicalRowsForLinks({ tournamentTitle, eventDate, sourceLinks });

  if (rows.length === 0) {
    return { ok: true, added: 0, message: "No series rows returned from source links." };
  }

  const { data: existingData, error: existingError } = await client
    .from("series_results")
    .select("source_ref")
    .eq("tournament_id", tournamentId);

  if (existingError) {
    return { ok: false, added: 0, message: `Could not load existing series: ${existingError.message}` };
  }

  const existingRefs = new Set(
    ((existingData ?? []) as Array<Record<string, unknown>>)
      .map((row) => row.source_ref)
      .filter((value): value is string => typeof value === "string")
  );

  const newRows = rows.filter((row) => !existingRefs.has(row.sourceRef));

  if (newRows.length === 0) {
    return { ok: true, added: 0, message: "No new series found; tournament is already up to date." };
  }

  const referenceData = await getImportReferenceData();
  const previewRows = normalizePreviewRows(newRows, referenceData.teams, referenceData.aliases);

  const seriesRows = newRows.map((row) => {
    const preview = previewRows.find((p) => p.id === row.id);
    const teamOneId =
      preview?.teamOne.status === "matched" ? (preview.teamOne.matchedTeamId ?? null) : null;
    const teamTwoId =
      preview?.teamTwo.status === "matched" ? (preview.teamTwo.matchedTeamId ?? null) : null;
    const teamOneTier = referenceData.teams.find((t) => t.id === teamOneId)?.tierId ?? "tier7";
    const teamTwoTier = referenceData.teams.find((t) => t.id === teamTwoId)?.tierId ?? "tier7";

    return {
      tournament_id: tournamentId,
      played_at: row.playedAt,
      team_one_name: row.teamOneName,
      team_two_name: row.teamTwoName,
      team_one_id: teamOneId,
      team_two_id: teamTwoId,
      team_one_tier_id: teamOneTier,
      team_two_tier_id: teamTwoTier,
      team_one_score: row.teamOneScore,
      team_two_score: row.teamTwoScore,
      source_type: row.source,
      source_ref: row.sourceRef,
      confirmed: true
    };
  });

  const { error: insertError } = await client.from("series_results").insert(seriesRows as never);
  if (insertError) {
    return { ok: false, added: 0, message: `Could not insert new series: ${insertError.message}` };
  }

  return {
    ok: true,
    added: seriesRows.length,
    message: `Re-imported ${seriesRows.length} new series into "${tournamentTitle}".`
  };
}
