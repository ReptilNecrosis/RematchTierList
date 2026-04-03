"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { ImportPreviewRow, TournamentRecord } from "@rematch/shared-types";

type ImportSearchTeam = {
  id: string;
  name: string;
  shortCode: string;
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
  const normalizedShortCode = normalizeFuzzyValue(team.shortCode);

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

  if (normalizedShortCode && (normalizedShortCode === normalizedQuery || normalizedShortCode.includes(normalizedQuery))) {
    score += 0.1;
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

      const searchableValue = normalizeFuzzyValue(`${team.name} ${team.shortCode} ${team.tierId}`);
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
  return `${team.verified ? team.tierId.toUpperCase() : "UNVERIFIED"} · ${team.shortCode}`;
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
  initialScreenshotRows,
  availableTeams
}: {
  initialRows: ImportPreviewRow[];
  initialMessage: string;
  initialScreenshotRows: ImportPreviewRow[];
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
  const [sourceMode, setSourceMode] = useState<"links" | "screenshot">("links");
  const [confirmSummary, setConfirmSummary] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({});
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTournaments, setHistoryTournaments] = useState<TournamentRecord[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleScreenshotFile(file: File) {
    setSourceMode("screenshot");
    setConfirmSummary(null);
    setResolutions({});
    setSelectedFileName(file.name);
    setStatus("Parsing screenshot...");

    const formData = new FormData();
    formData.append("tournamentTitle", title);
    formData.append("eventDate", eventDate);
    formData.append("file", file);

    const response = await fetch("/api/imports/screenshot-preview", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as PreviewPayload & {
      dryRun?: boolean;
      cleanupPolicy?: string;
    };

    setRows(payload.preview?.previewRows ?? initialScreenshotRows);
    setWarnings(
      payload.preview?.warnings ??
        [payload.cleanupPolicy ?? payload.message ?? "Screenshot preview complete."]
    );
    setStatus(payload.message ?? "Screenshot preview complete.");
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
    if (sourceMode === "links") {
      const sourceLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
      const seen = new Set<string>();
      for (const url of sourceLinks) {
        if (seen.has(url)) {
          setErrorPopup(`Duplicate URL entered: ${url}`);
          return;
        }
        seen.add(url);
      }
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
        sourceMode,
        sourceLinks:
          sourceMode === "links"
            ? links.split("\n").map((line) => line.trim()).filter(Boolean)
            : [],
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
    if (historyTournaments !== null) return;
    const response = await fetch("/api/tournaments");
    const payload = (await response.json()) as { ok: boolean; tournaments?: TournamentRecord[] };
    setHistoryTournaments(payload.tournaments ?? []);
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
      <div className="page-title">Result Logging · Links primary, screenshot fallback ready</div>

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

      <div className="callout">
        Screenshot fallback is transient input only. This implementation processes screenshots in-memory and does not persist them to Supabase or anywhere else.
      </div>

      <button
        type="button"
        className={`upload-zone ${isDragging ? "dragging" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void handleScreenshotFile(file);
          }
        }}
      >
        <div className="upload-icon">📸</div>
        <div className="upload-title">Drop Tournament Screenshot Here</div>
        <div className="upload-sub">
          Anthropic parses team names and series scores without saving the uploaded image.
        </div>
        <div className="upload-file">{selectedFileName ?? "PNG or JPG screenshot"}</div>
      </button>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleScreenshotFile(file);
          }
        }}
      />

      <div className="inline-actions">
        <button className="btn-login" type="button" onClick={() => { void handlePreview(); }}>
          Generate Preview
        </button>
        <button
          className="btn-login"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Parse Screenshot
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
          {historyTournaments === null ? (
            <div className="inline-status">Loading...</div>
          ) : historyTournaments.length === 0 ? (
            <div className="inline-status">No tournaments logged yet.</div>
          ) : (
            historyTournaments.map((t) => (
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
        </div>
      ) : null}

      {status ? (
        <div className="inline-status" style={statusIsError ? { color: "var(--red, #ef4444)" } : undefined}>
          {status}
        </div>
      ) : null}
      {confirmSummary ? <div className="inline-status">{confirmSummary}</div> : null}

      <div className="upload-result">
        <div className="ur-title">Preview Rows · {sourceMode === "screenshot" ? "Screenshot fallback" : "Link import"}</div>
        {rows.length === 0 ? (
          <div className="inline-status">No preview rows yet. Generate a preview or parse a screenshot to begin.</div>
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
