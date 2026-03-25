"use client";

import { useRef, useState } from "react";

import type { ImportPreviewRow } from "@rematch/shared-types";

type PreviewPayload = {
  preview?: {
    parsedSources: Array<Record<string, unknown>>;
    previewRows: ImportPreviewRow[];
    warnings: string[];
  };
  message?: string;
};

type ResolutionState = {
  teamOneMode?: "match" | "unverified";
  teamTwoMode?: "match" | "unverified";
  teamOneTeamId?: string | null;
  teamTwoTeamId?: string | null;
};

export function ResultLoggingPage({
  initialRows,
  initialMessage,
  initialScreenshotRows
}: {
  initialRows: ImportPreviewRow[];
  initialMessage: string;
  initialScreenshotRows: ImportPreviewRow[];
}) {
  const [title, setTitle] = useState("Tournament #15");
  const [eventDate, setEventDate] = useState("2026-03-22");
  const [links, setLinks] = useState(
    "https://start.gg/tournament/demo-15/event/open/brackets/555/666\nhttps://battlefy.com/demo/tournament-15/stage/bbb"
  );
  const [rows, setRows] = useState(initialRows);
  const [warnings, setWarnings] = useState<string[]>([initialMessage]);
  const [status, setStatus] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"links" | "screenshot">("links");
  const [confirmSummary, setConfirmSummary] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({});
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    setSourceMode("links");
    setConfirmSummary(null);
    setResolutions({});
    setStatus("Generating preview...");
    const response = await fetch("/api/imports/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tournamentTitle: title,
        eventDate,
        sourceLinks: links
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      })
    });
    const payload = (await response.json()) as PreviewPayload;
    setRows(payload.preview?.previewRows ?? []);
    setWarnings(payload.preview?.warnings ?? [payload.message ?? "Preview complete."]);
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

  function updateResolution(
    rowId: string,
    key: keyof ResolutionState,
    value: string
  ) {
    setResolutions((current) => ({
      ...current,
      [rowId]: {
        ...current[rowId],
        [key]: value === "" ? undefined : value === "null" ? null : value
      }
    }));
  }

  async function handleDatabaseLog() {
    setLogError(null);
    const sourceLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    for (const url of sourceLinks) {
      if (seen.has(url)) {
        setLogError(`Duplicate URL entered: ${url}`);
        return;
      }
      seen.add(url);
    }
    const response = await fetch("/api/imports/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentTitle: title, eventDate, sourceLinks })
    });
    const payload = (await response.json()) as { ok: boolean; message?: string };
    if (!payload.ok) {
      setLogError(payload.message ?? "Could not log tournament.");
      return;
    }
    setStatus("Tournament logged to database.");
  }

  async function handleConfirm() {
    setStatus("Confirming import...");
    setConfirmSummary(null);

    const resolutionPayload = Object.entries(resolutions).map(([rowId, value]) => ({
      rowId,
      ...value
    }));

    const response = await fetch("/api/imports/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tournamentTitle: title,
        eventDate,
        sourceMode,
        sourceLinks:
          sourceMode === "links"
            ? links
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
            : [],
        previewRows: rows,
        resolutions: resolutionPayload
      })
    });

    const payload = (await response.json()) as {
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

  function getResolutionValue(
    rowId: string,
    side: "teamOne" | "teamTwo",
    fallbackMode: "match" | "unverified"
  ) {
    const resolution = resolutions[rowId];
    const modeKey = side === "teamOne" ? "teamOneMode" : "teamTwoMode";
    const teamIdKey = side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId";
    return {
      mode: resolution?.[modeKey] ?? fallbackMode,
      teamId: resolution?.[teamIdKey] ?? ""
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
        <button className="btn-login" type="button" onClick={handlePreview}>
          Generate Preview
        </button>
        <button
          className="btn-login"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Parse Screenshot
        </button>
        <button className="btn-login danger" type="button" onClick={handleConfirm}>
          Confirm Import
        </button>
        <button className="btn-login" type="button" onClick={() => { void handleDatabaseLog(); }}>
          Database Log
        </button>
      </div>

      {logError ? (
        <div className="modal-overlay" onClick={() => setLogError(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Cannot Log Tournament</div>
            <div className="modal-body">{logError}</div>
            <button className="btn-login" type="button" onClick={() => setLogError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {status ? <div className="inline-status">{status}</div> : null}
      {confirmSummary ? <div className="inline-status">{confirmSummary}</div> : null}

      <div className="upload-result">
        <div className="ur-title">Preview Rows · {sourceMode === "screenshot" ? "Screenshot fallback" : "Link import"}</div>
        {rows.map((row, index) => {
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
                const current = getResolutionValue(row.id, side, defaultMode);
                return (
                  <div key={side} className="resolution-block">
                    <div className="resolution-title">
                      {side === "teamOne" ? row.teamOne.name : row.teamTwo.name}
                    </div>
                    <select
                      className="form-input"
                      value={current.mode}
                      onChange={(event) =>
                        updateResolution(
                          row.id,
                          side === "teamOne" ? "teamOneMode" : "teamTwoMode",
                          event.target.value
                        )
                      }
                    >
                      <option value="match">Match existing team</option>
                      <option value="unverified">Track as unverified</option>
                    </select>
                    <select
                      className="form-input"
                      value={current.teamId ?? ""}
                      disabled={current.mode !== "match"}
                      onChange={(event) =>
                        updateResolution(
                          row.id,
                          side === "teamOne" ? "teamOneTeamId" : "teamTwoTeamId",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Use detected match / choose candidate</option>
                      {sideData.matchedTeamId ? (
                        <option value={sideData.matchedTeamId}>
                          {sideData.matchedTeamName ?? sideData.name}
                        </option>
                      ) : null}
                      {sideData.candidates?.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )})}
      </div>

      <section className="dash-card">
        <div className="dash-card-title">
          <span>📝</span> Review Notes
        </div>
        {warnings.map((warning, index) => (
          <div key={`${warning}-${index}`} className="pending-item">
            <div className="p-avatar">!</div>
            <div className="p-info">
              <div className="p-name">{warning}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
