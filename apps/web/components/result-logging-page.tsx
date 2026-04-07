"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { ImportPreviewRow, TournamentRecord } from "@rematch/shared-types";

type ImportSearchTeam = {
  id: string;
  name: string;
  tierId: string;
  verified: boolean;
};

type PreviewPayload = {
  preview?: {
    parsedSources: Array<Record<string, unknown>>;
    previewRows: ImportPreviewRow[];
    warnings: string[];
    suggestedTournamentTitle?: string;
    suggestedEventDate?: string;
  };
  message?: string;
};

type ResolutionState = {
  teamOneMode?: "match" | "unverified";
  teamTwoMode?: "match" | "unverified";
  teamOneTeamId?: string | null;
  teamTwoTeamId?: string | null;
};

type HistoryFilterOption = {
  key: string;
  label: string;
  count: number;
};

type HistoryMonthFilterOption = HistoryFilterOption & {
  seasonKey: string;
};

const ALL_HISTORY_FILTER = "all";
const UNKNOWN_HISTORY_SEASON = "unknown";
const UNKNOWN_HISTORY_MONTH = "unknown";

function normalizeFuzzyValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function toCompactFuzzyValue(value: string) {
  return normalizeFuzzyValue(value).replace(/\s+/g, "");
}

function buildBigrams(value: string) {
  if (value.length < 2) {
    return value ? [value] : [];
  }

  const bigrams: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    bigrams.push(value.slice(index, index + 2));
  }
  return bigrams;
}

function getDiceCoefficient(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  const counts = new Map<string, number>();

  for (const bigram of leftBigrams) {
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const bigram of rightBigrams) {
    const count = counts.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function getTokenOverlapScore(left: string, right: string) {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function getFuzzyTeamScore(query: string, team: ImportSearchTeam) {
  const normalizedQuery = normalizeFuzzyValue(query);
  const normalizedTeamName = normalizeFuzzyValue(team.name);
  const compactQuery = toCompactFuzzyValue(query);
  const compactTeamName = toCompactFuzzyValue(team.name);

  if (!normalizedQuery || !normalizedTeamName) {
    return 0;
  }

  if (normalizedQuery === normalizedTeamName || compactQuery === compactTeamName) {
    return 1;
  }

  let score =
    getDiceCoefficient(compactQuery, compactTeamName) * 0.7 +
    getTokenOverlapScore(normalizedQuery, normalizedTeamName) * 0.3;

  if (normalizedTeamName.includes(normalizedQuery) || compactTeamName.includes(compactQuery)) {
    score += 0.2;
  }

  if (normalizedQuery.includes(normalizedTeamName) || compactQuery.includes(compactTeamName)) {
    score += 0.12;
  }

  return score;
}

function getBestFuzzyTeamMatch(teamName: string, teams: ImportSearchTeam[]) {
  let bestMatch: ImportSearchTeam | null = null;
  let bestScore = 0;

  for (const team of teams) {
    const score = getFuzzyTeamScore(teamName, team);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = team;
    }
  }

  return bestMatch;
}

function getSearchableTeamMatches(args: {
  teams: ImportSearchTeam[];
  query: string;
  candidateNames?: string[];
  matchedTeamId?: string;
}) {
  const normalizedQuery = args.query.trim().toLowerCase();
  const candidateNameSet = new Set((args.candidateNames ?? []).map((name) => name.trim().toLowerCase()));
  const candidateTeamIds = new Set<string>();

  for (const team of args.teams) {
    if (args.matchedTeamId && team.id === args.matchedTeamId) {
      candidateTeamIds.add(team.id);
      continue;
    }

    if (candidateNameSet.has(team.name.trim().toLowerCase())) {
      candidateTeamIds.add(team.id);
    }
  }

  if (!normalizedQuery && candidateTeamIds.size === 0) {
    return [];
  }

  return args.teams
    .map((team) => {
      const fuzzyScore = normalizedQuery ? getFuzzyTeamScore(args.query, team) : 0;
      return {
        team,
        fuzzyScore
      };
    })
    .filter(({ team, fuzzyScore }) => {
      if (!normalizedQuery) {
        return candidateTeamIds.size > 0 ? candidateTeamIds.has(team.id) : true;
      }

      const searchableValue = normalizeFuzzyValue(`${team.name} ${team.tierId}`);
      return searchableValue.includes(normalizedQuery) || fuzzyScore >= 0.2;
    })
    .sort((left, right) => {
      if (left.fuzzyScore !== right.fuzzyScore) {
        return right.fuzzyScore - left.fuzzyScore;
      }

      const leftTeam = left.team;
      const rightTeam = right.team;
      const leftIsCandidate = candidateTeamIds.has(leftTeam.id) ? 1 : 0;
      const rightIsCandidate = candidateTeamIds.has(rightTeam.id) ? 1 : 0;
      if (leftIsCandidate !== rightIsCandidate) {
        return rightIsCandidate - leftIsCandidate;
      }
      return leftTeam.name.localeCompare(rightTeam.name);
    })
    .map(({ team }) => team)
    .slice(0, normalizedQuery ? 12 : 8);
}

function formatSearchTeamMeta(team: ImportSearchTeam) {
  return team.verified ? team.tierId.toUpperCase() : "UNVERIFIED";
}

function getHistoryDateParts(eventDate: string) {
  const match = /^(\d{4})-(\d{2})/.exec(eventDate);
  if (!match) {
    return {
      seasonKey: UNKNOWN_HISTORY_SEASON,
      monthKey: UNKNOWN_HISTORY_MONTH
    };
  }

  const [, year, month] = match;
  return {
    seasonKey: year,
    monthKey: `${year}-${month}`
  };
}

function formatHistorySeasonLabel(seasonKey: string) {
  return seasonKey === UNKNOWN_HISTORY_SEASON ? "Unknown season" : seasonKey;
}

function formatHistoryMonthLabel(monthKey: string) {
  if (monthKey === UNKNOWN_HISTORY_MONTH) {
    return "Unknown month";
  }

  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return "Unknown month";
  }

  const [, year, month] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function ResolutionTeamSearch({
  label,
  teams,
  candidateNames,
  matchedTeamId,
  selectedTeamId,
  disabled,
  onSelect,
  onClear
}: {
  label: string;
  teams: ImportSearchTeam[];
  candidateNames?: string[];
  matchedTeamId?: string;
  selectedTeamId: string;
  disabled: boolean;
  onSelect: (teamId: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const selectedTeam = selectedTeamId ? teams.find((team) => team.id === selectedTeamId) ?? null : null;

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (selectedTeamId) {
      setQuery("");
      setOpen(false);
    }
  }, [selectedTeamId]);

  const matches = useMemo(
    () =>
      getSearchableTeamMatches({
        teams,
        query: deferredQuery,
        candidateNames,
        matchedTeamId
      }),
    [candidateNames, deferredQuery, matchedTeamId, teams]
  );
  const showDropdown = !disabled && !selectedTeam && open && matches.length > 0;

  return (
    <div ref={ref} className="h2h-team-input">
      <div className="resolution-title">{label}</div>
      {selectedTeam ? (
        <div className="h2h-selected-team">
          <span className="h2h-selected-name">
            {selectedTeam.name} · {formatSearchTeamMeta(selectedTeam)}
          </span>
          <button type="button" className="h2h-clear-btn" onClick={onClear} disabled={disabled}>
            ✕
          </button>
        </div>
      ) : (
        <input
          className="search-input"
          value={query}
          disabled={disabled}
          placeholder={disabled ? "Select Match existing team first" : "Search all current teams..."}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
        />
      )}
      {showDropdown ? (
        <div className="h2h-dropdown">
          {matches.map((team) => (
            <button
              key={team.id}
              type="button"
              className="h2h-dropdown-item"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(team.id);
                setOpen(false);
              }}
            >
              <span>{team.name}</span>
              <span className="h2h-dropdown-count">{formatSearchTeamMeta(team)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResultLoggingPage({
  initialRows,
  initialMessage,
  availableTeams
}: {
  initialRows: ImportPreviewRow[];
  initialMessage: string;
  availableTeams: ImportSearchTeam[];
}) {
  const [title, setTitle] = useState("Tournament #15");
  const [eventDate, setEventDate] = useState("2026-03-22");
  const [links, setLinks] = useState(
    "https://start.gg/tournament/demo-15/event/open/brackets/555/666\nhttps://battlefy.com/demo/tournament-15/stage/bbb"
  );
  const [rows, setRows] = useState(initialRows);
  const [warnings, setWarnings] = useState<string[]>(initialMessage ? [initialMessage] : []);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({});
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTournaments, setHistoryTournaments] = useState<TournamentRecord[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectedHistorySeason, setSelectedHistorySeason] = useState(ALL_HISTORY_FILTER);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState(ALL_HISTORY_FILTER);
  const historyFilterOptions = useMemo(() => {
    if (!historyTournaments || historyTournaments.length === 0) {
      return {
        seasons: [] as HistoryFilterOption[],
        months: [] as HistoryMonthFilterOption[]
      };
    }

    const seasonCounts = new Map<string, number>();
    const monthCounts = new Map<string, HistoryMonthFilterOption>();

    for (const tournament of historyTournaments) {
      const { seasonKey, monthKey } = getHistoryDateParts(tournament.eventDate);

      seasonCounts.set(seasonKey, (seasonCounts.get(seasonKey) ?? 0) + 1);

      const currentMonth = monthCounts.get(monthKey);
      if (currentMonth) {
        currentMonth.count += 1;
      } else {
        monthCounts.set(monthKey, {
          key: monthKey,
          label: formatHistoryMonthLabel(monthKey),
          count: 1,
          seasonKey
        });
      }
    }

    return {
      seasons: [...seasonCounts.entries()]
        .map(([key, count]) => ({
          key,
          label: formatHistorySeasonLabel(key),
          count
        }))
        .sort((left, right) => right.key.localeCompare(left.key)),
      months: [...monthCounts.values()].sort((left, right) => right.key.localeCompare(left.key))
    };
  }, [historyTournaments]);

  const availableHistoryMonths = useMemo(
    () =>
      historyFilterOptions.months.filter((option) =>
        selectedHistorySeason === ALL_HISTORY_FILTER ? true : option.seasonKey === selectedHistorySeason
      ),
    [historyFilterOptions.months, selectedHistorySeason]
  );

  const filteredHistoryTournaments = useMemo(() => {
    if (!historyTournaments) {
      return [];
    }

    return historyTournaments.filter((tournament) => {
      const { seasonKey, monthKey } = getHistoryDateParts(tournament.eventDate);

      if (selectedHistorySeason !== ALL_HISTORY_FILTER && seasonKey !== selectedHistorySeason) {
        return false;
      }

      if (selectedHistoryMonth !== ALL_HISTORY_FILTER && monthKey !== selectedHistoryMonth) {
        return false;
      }

      return true;
    });
  }, [historyTournaments, selectedHistoryMonth, selectedHistorySeason]);

  useEffect(() => {
    if (!historyTournaments || historyTournaments.length === 0) {
      if (selectedHistorySeason !== ALL_HISTORY_FILTER) {
        setSelectedHistorySeason(ALL_HISTORY_FILTER);
      }
      if (selectedHistoryMonth !== ALL_HISTORY_FILTER) {
        setSelectedHistoryMonth(ALL_HISTORY_FILTER);
      }
      return;
    }

    const seasonExists =
      selectedHistorySeason === ALL_HISTORY_FILTER ||
      historyFilterOptions.seasons.some((option) => option.key === selectedHistorySeason);
    if (!seasonExists) {
      setSelectedHistorySeason(ALL_HISTORY_FILTER);
    }

    const monthExists =
      selectedHistoryMonth === ALL_HISTORY_FILTER ||
      availableHistoryMonths.some((option) => option.key === selectedHistoryMonth);
    if (!monthExists) {
      setSelectedHistoryMonth(ALL_HISTORY_FILTER);
    }
  }, [
    availableHistoryMonths,
    historyFilterOptions.seasons,
    historyTournaments,
    selectedHistoryMonth,
    selectedHistorySeason
  ]);

  async function handlePreview() {
    setSourceMode("links");
    setConfirmSummary(null);
    setResolutions({});
    setStatus("Generating preview...");
    const response = await fetch("/api/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentTitle: title,
        eventDate,
        sourceLinks: links.split("\n").map((line) => line.trim()).filter(Boolean)
      })
    });
    const payload = (await response.json()) as PreviewPayload;
    setRows(payload.preview?.previewRows ?? []);
    setWarnings(payload.preview?.warnings ?? [payload.message ?? "Preview complete."]);
    if (response.ok) {
      if (payload.preview?.suggestedTournamentTitle) {
        setTitle(payload.preview.suggestedTournamentTitle);
      }
      if (payload.preview?.suggestedEventDate) {
        setEventDate(payload.preview.suggestedEventDate);
      }
    }
    setStatus(payload.message ?? "Preview complete.");
  }

  function updateResolution(rowId: string, key: keyof ResolutionState, value: string) {
    setResolutions((current) => ({
      ...current,
      [rowId]: {
        ...current[rowId],
        [key]: value === "" ? undefined : value === "null" ? null : value
      }
    }));
  }

  function handleResolutionModeChange(args: {
    rowId: string;
    side: "teamOne" | "teamTwo";
    nextMode: "match" | "unverified";
    detectedName: string;
    fallbackTeamId?: string;
  }) {
    const teamIdKey = args.side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId";
    const modeKey = args.side === "teamOne" ? "teamOneMode" : "teamTwoMode";

    setResolutions((current) => {
      const existing = current[args.rowId] ?? {};
      const currentTeamId = (existing[teamIdKey] === null ? "" : existing[teamIdKey]) ?? args.fallbackTeamId ?? "";

      if (args.nextMode !== "match" || currentTeamId) {
        return {
          ...current,
          [args.rowId]: {
            ...existing,
            [modeKey]: args.nextMode
          }
        };
      }

      const suggestedTeam = getBestFuzzyTeamMatch(args.detectedName, availableTeams);
      return {
        ...current,
        [args.rowId]: {
          ...existing,
          [modeKey]: args.nextMode,
          [teamIdKey]: suggestedTeam?.id ?? null
        }
      };
    });
  }

  async function handleConfirm() {
    setErrorPopup(null);

    if (!title.trim()) {
      setErrorPopup("Tournament title is required.");
      return;
    }
    if (!eventDate) {
      setErrorPopup("Event date is required.");
      return;
    }
    const sourceLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    for (const url of sourceLinks) {
      if (seen.has(url)) {
        setErrorPopup(`Duplicate URL entered: ${url}`);
        return;
      }
      seen.add(url);
    }

    setStatus("Confirming import...");
    setStatusIsError(false);
    setConfirmSummary(null);

    const resolutionPayload = Object.entries(resolutions).map(([rowId, value]) => ({
      rowId,
      ...value
    }));

    const response = await fetch("/api/imports/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentTitle: title,
        eventDate,
        sourceMode: "links",
        sourceLinks: links.split("\n").map((line) => line.trim()).filter(Boolean),
        previewRows: rows,
        resolutions: resolutionPayload
      })
    });

    const responseText = await response.text();
    const payload = (() => {
      if (!responseText) {
        return {};
      }

      try {
        return JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        return {};
      }
    })() as {
      ok?: boolean;
      message?: string;
      blockedReasons?: string[];
      summary?: {
        seriesCount: number;
        matchedTeamCount: number;
        createdUnverifiedCount: number;
        createdUnverifiedNames: string[];
      };
    };

    if (payload.ok === false || !response.ok) {
      const isAlreadyImported = payload.message?.toLowerCase().includes("already imported");
      setWarnings(payload.blockedReasons ?? warnings);
      setStatus(isAlreadyImported ? "Import Error - Already imported" : payload.message ?? "Import failed.");
      setStatusIsError(true);
      setConfirmSummary(null);
      return;
    }

    setStatus(payload.message ?? "Confirmation complete.");
    setWarnings(payload.blockedReasons ?? warnings);
    if (payload.summary) {
      const created =
        payload.summary.createdUnverifiedCount > 0
          ? ` Unverified tracked: ${payload.summary.createdUnverifiedNames.join(", ")}.`
          : "";
      setConfirmSummary(
        `Confirmed ${payload.summary.seriesCount} series. Matched ${payload.summary.matchedTeamCount} team slots.${created}`
      );
    }
  }

  async function handleToggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }

    setShowHistory(true);
    if (historyTournaments !== null && !historyError) return;

    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch("/api/tournaments");
      const payload = (await response.json()) as {
        ok: boolean;
        message?: string;
        tournaments?: TournamentRecord[];
      };

      if (!response.ok || !payload.ok) {
        setHistoryError(payload.message ?? "Could not load tournament history. Please try again.");
        return;
      }

      setHistoryTournaments(payload.tournaments ?? []);
    } catch {
      setHistoryError("Could not load tournament history. Please try again.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  function getResolutionValue(
    rowId: string,
    side: "teamOne" | "teamTwo",
    fallbackMode: "match" | "unverified",
    fallbackTeamId?: string
  ) {
    const resolution = resolutions[rowId];
    const modeKey = side === "teamOne" ? "teamOneMode" : "teamTwoMode";
    const teamIdKey = side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId";
    const resolvedTeamId = resolution?.[teamIdKey];
    return {
      mode: resolution?.[modeKey] ?? fallbackMode,
      teamId: resolvedTeamId === null ? "" : resolvedTeamId ?? fallbackTeamId ?? ""
    };
  }

  return (
    <div className="page">
      <div className="page-title">Result Logging</div>

      <div className="form-grid">
        <label className="form-stack">
          <span className="form-label">Tournament Title</span>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="form-stack">
          <span className="form-label">Event Date</span>
          <input className="form-input" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        </label>
      </div>

      <label className="form-stack">
        <span className="form-label">Bracket Links</span>
        <textarea
          className="form-textarea"
          value={links}
          onChange={(event) => setLinks(event.target.value)}
          placeholder="One Battlefy or start.gg URL per line"
        />
      </label>

      <div className="inline-actions">
        <button className="btn-login" type="button" onClick={() => { void handlePreview(); }}>
          Generate Preview
        </button>
        <button className="btn-login danger" type="button" onClick={() => { void handleConfirm(); }}>
          Confirm Import
        </button>
        <button className="btn-login" type="button" onClick={() => { void handleToggleHistory(); }}>
          {showHistory ? "Hide History" : "Tournament History"}
        </button>
      </div>

      {errorPopup ? (
        <div className="modal-overlay" onClick={() => setErrorPopup(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Cannot Complete Action</div>
            <div className="modal-body">{errorPopup}</div>
            <button className="btn-login" type="button" onClick={() => setErrorPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <div className="upload-result">
          <div className="ur-title">Tournament History</div>
          {isHistoryLoading ? (
            <div className="inline-status">Loading...</div>
          ) : historyError ? (
            <div className="inline-status" style={{ color: "var(--red, #ef4444)" }}>{historyError}</div>
          ) : historyTournaments === null ? (
            <div className="inline-status">No tournament history loaded yet.</div>
          ) : historyTournaments.length === 0 ? (
            <div className="inline-status">No tournaments logged yet.</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <div className="form-label">Season</div>
                  <div className="history-filters">
                    <button
                      type="button"
                      className={`season-chip ${selectedHistorySeason === ALL_HISTORY_FILTER ? "active" : ""}`}
                      onClick={() => {
                        setSelectedHistorySeason(ALL_HISTORY_FILTER);
                        setSelectedHistoryMonth(ALL_HISTORY_FILTER);
                      }}
                    >
                      <span>All seasons</span>
                      <b>{historyTournaments.length} events</b>
                    </button>
                    {historyFilterOptions.seasons.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`season-chip ${selectedHistorySeason === option.key ? "active" : ""}`}
                        onClick={() => {
                          setSelectedHistorySeason(option.key);
                          setSelectedHistoryMonth(ALL_HISTORY_FILTER);
                        }}
                      >
                        <span>{option.label}</span>
                        <b>{option.count} events</b>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="form-label">Month</div>
                  <div className="history-filters">
                    <button
                      type="button"
                      className={`season-chip ${selectedHistoryMonth === ALL_HISTORY_FILTER ? "active" : ""}`}
                      onClick={() => setSelectedHistoryMonth(ALL_HISTORY_FILTER)}
                    >
                      <span>All months</span>
                      <b>
                        {selectedHistorySeason === ALL_HISTORY_FILTER
                          ? historyTournaments.length
                          : availableHistoryMonths.reduce((total, option) => total + option.count, 0)}{" "}
                        events
                      </b>
                    </button>
                    {availableHistoryMonths.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`season-chip ${selectedHistoryMonth === option.key ? "active" : ""}`}
                        onClick={() => setSelectedHistoryMonth(option.key)}
                      >
                        <span>{option.label}</span>
                        <b>{option.count} events</b>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredHistoryTournaments.length === 0 ? (
                <div className="inline-status">No tournaments match the selected season or month.</div>
              ) : (
                filteredHistoryTournaments.map((t) => (
                  <div key={t.id} className="preview-card">
                    <div className="ur-team">
                      <div className="team-avatar compact">{t.title.slice(0, 2).toUpperCase()}</div>
                      <span>{t.title}</span>
                      <span className="versus">·</span>
                      <span>{new Date(t.eventDate).toDateString()}</span>
                    </div>
                    {t.sourceLinks.length > 0 ? (
                      <div className="match-meta">
                        {t.sourceLinks.map((link) => (
                          <div key={link.id} className="match-meta-item">
                            <span className="match-meta-label">{link.source}</span>
                            <a className="match-meta-value" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      ) : null}

      {status ? (
        <div className="inline-status" style={statusIsError ? { color: "var(--red, #ef4444)" } : undefined}>
          {status}
        </div>
      ) : null}
      {confirmSummary ? <div className="inline-status">{confirmSummary}</div> : null}

      <div className="upload-result">
        <div className="ur-title">Preview Rows · Link import</div>
        {rows.length === 0 ? (
          <div className="inline-status">No preview rows yet. Generate a preview to begin.</div>
        ) : rows.map((row, index) => {
          const previousRow = rows[index - 1];
          const stageKey = `${row.bracketLabel ?? ""}::${row.roundLabel ?? ""}`;
          const previousStageKey = previousRow ? `${previousRow.bracketLabel ?? ""}::${previousRow.roundLabel ?? ""}` : null;
          const showGroupHeader = index === 0 || stageKey !== previousStageKey;

          return (
            <div key={row.id} className="preview-card">
              {showGroupHeader ? (
                <div className="preview-group-header">
                  <div className="preview-group-title">{row.bracketLabel ?? "Bracket Match"}</div>
                  {row.roundLabel ? <div className="preview-group-round">{row.roundLabel}</div> : null}
                </div>
              ) : null}
              <div className="ur-team">
                {row.matchLabel ? <div className="match-chip">{row.matchLabel}</div> : null}
                <div className="team-avatar compact">{row.teamOne.name.slice(0, 2).toUpperCase()}</div>
                <span>{row.teamOne.name}</span>
                <span className="versus">vs</span>
                <span>{row.teamTwo.name}</span>
                <div className={`ur-status ${row.teamOne.status === "matched" && row.teamTwo.status === "matched" ? "ur-known" : "ur-new"}`}>
                  {row.score}
                </div>
              </div>
              <div className="match-meta">
                {row.bracketLabel ? (
                  <div className="match-meta-item match-meta-bracket">
                    <span className="match-meta-label">Stage</span>
                    <span className="match-meta-value">{row.bracketLabel}</span>
                  </div>
                ) : null}
                {row.roundLabel ? (
                  <div className="match-meta-item">
                    <span className="match-meta-label">Round</span>
                    <span className="match-meta-value">{row.roundLabel}</span>
                  </div>
                ) : null}
                {row.matchLabel ? (
                  <div className="match-meta-item">
                    <span className="match-meta-label">Match</span>
                    <span className="match-meta-value">{row.matchLabel}</span>
                  </div>
                ) : null}
                <div className="match-meta-item">
                  <span className="match-meta-label">Series Result</span>
                  <span className="match-meta-value">{row.score}</span>
                </div>
                <div className="match-meta-item">
                  <span className="match-meta-label">Winner</span>
                  <span className="match-meta-value match-winner">{row.winnerName}</span>
                </div>
              </div>
              <div className="resolution-grid">
                {(["teamOne", "teamTwo"] as const).map((side) => {
                  const sideData = row[side];
                  const defaultMode = sideData.matchedTeamId ? "match" : "unverified";
                  const current = getResolutionValue(row.id, side, defaultMode, sideData.matchedTeamId);
                  return (
                    <div key={side} className="resolution-block">
                      <select
                        className="form-input"
                        value={current.mode}
                        onChange={(event) =>
                          handleResolutionModeChange({
                            rowId: row.id,
                            side,
                            nextMode: event.target.value === "unverified" ? "unverified" : "match",
                            detectedName: sideData.name,
                            fallbackTeamId: sideData.matchedTeamId
                          })
                        }
                      >
                        <option value="match">Match existing team</option>
                        <option value="unverified">Track as unverified</option>
                      </select>
                      <ResolutionTeamSearch
                        label={side === "teamOne" ? row.teamOne.name : row.teamTwo.name}
                        teams={availableTeams}
                        candidateNames={sideData.candidates}
                        matchedTeamId={sideData.matchedTeamId}
                        selectedTeamId={current.teamId ?? ""}
                        disabled={current.mode !== "match"}
                        onSelect={(teamId) =>
                          updateResolution(
                            row.id,
                            side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId",
                            teamId
                          )
                        }
                        onClear={() =>
                          updateResolution(
                            row.id,
                            side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId",
                            "null"
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
