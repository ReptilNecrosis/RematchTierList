"use client";

import Link from "next/link";
import { useDeferredValue, useState, type FormEvent } from "react";

import type { DashboardSnapshot, ResolveUnverifiedRequest, TierId } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

const COMPETITIVE_TIERS = TIER_DEFINITIONS.filter((tier) => tier.id !== "tier7");

const DISMISS_REASONS = [
  "Duplicate / alias of existing team",
  "Not a competitive team",
  "Inactive / disbanded",
  "Wrong game or region",
  "Bot or test entry",
  "Spam",
  "Other"
];

type ConfirmDraft = {
  teamName: string;
  shortCode: string;
  tierId: TierId | "";
};

type RejectDraft = {
  reason: string;
  note: string;
};

function buildShortCodeSuggestion(teamName: string) {
  const initials = teamName
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk[0] ?? "")
    .join("")
    .toUpperCase();

  if (initials.length >= 2) {
    return initials.slice(0, 8);
  }

  return teamName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
}

export function UnverifiedTeamsWorkflowScreen({ snapshot, canEdit = true }: { snapshot: DashboardSnapshot; canEdit?: boolean }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const [activeConfirmName, setActiveConfirmName] = useState<string | null>(null);
  const [activeRejectName, setActiveRejectName] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft>({
    teamName: "",
    shortCode: "",
    tierId: ""
  });
  const [rejectDraft, setRejectDraft] = useState<RejectDraft>({ reason: "", note: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [resolvedNames, setResolvedNames] = useState<string[]>([]);

  const tierOpenSpots = Object.fromEntries(
    snapshot.tiers.map((ts) => [ts.tier.id, ts.openSpots])
  );

  const visibleTeams = snapshot.unverifiedTeams.filter(
    (team) => !resolvedNames.includes(team.normalizedName)
  );

  const searchedTeams = deferredQuery
    ? visibleTeams.filter((team) => team.teamName.toLowerCase().includes(deferredQuery))
    : visibleTeams;

  async function postResolution(body: ResolveUnverifiedRequest) {
    const response = await fetch("/api/admin/unverified/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
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
    })() as { ok?: boolean; message?: string };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? "Could not update the unverified team.");
    }

    return payload.message ?? "Unverified team updated.";
  }

  function openConfirm(team: DashboardSnapshot["unverifiedTeams"][number]) {
    setActiveConfirmName(team.normalizedName);
    setActiveRejectName(null);
    setStatus(null);
    setStatusIsError(false);
    setConfirmDraft({
      teamName: team.teamName,
      shortCode: buildShortCodeSuggestion(team.teamName),
      tierId: team.suggestedTierId && team.suggestedTierId !== "tier7" ? team.suggestedTierId : ""
    });
  }

  function openReject(normalizedName: string) {
    setActiveRejectName(normalizedName);
    setActiveConfirmName(null);
    setStatus(null);
    setStatusIsError(false);
    setRejectDraft({ reason: "", note: "" });
  }

  async function handleConfirmSubmit(event: FormEvent<HTMLFormElement>, normalizedName: string) {
    event.preventDefault();
    setStatus(null);
    setStatusIsError(false);

    const teamName = confirmDraft.teamName.trim();
    const shortCode = confirmDraft.shortCode.trim();
    if (!teamName) {
      setStatus("Team name is required.");
      setStatusIsError(true);
      return;
    }
    if (!shortCode) {
      setStatus("Short code is required.");
      setStatusIsError(true);
      return;
    }
    if (!confirmDraft.tierId) {
      setStatus("Choose a competitive tier before confirming.");
      setStatusIsError(true);
      return;
    }

    try {
      setBusyName(normalizedName);
      const message = await postResolution({
        action: "confirm",
        normalizedName,
        teamName,
        shortCode,
        tierId: confirmDraft.tierId
      });

      setResolvedNames((current) => [...current, normalizedName]);
      setActiveConfirmName(null);
      setStatus(message);
      setStatusIsError(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not confirm unverified team.");
      setStatusIsError(true);
    } finally {
      setBusyName(null);
    }
  }

  async function handleRejectSubmit(event: FormEvent<HTMLFormElement>, normalizedName: string) {
    event.preventDefault();
    setStatus(null);
    setStatusIsError(false);

    if (!rejectDraft.reason) {
      setStatus("Choose a reason before rejecting.");
      setStatusIsError(true);
      return;
    }

    try {
      setBusyName(normalizedName);
      const message = await postResolution({
        action: "dismiss",
        normalizedName,
        dismissReason: rejectDraft.reason,
        dismissNote: rejectDraft.note.trim() || undefined
      });

      setResolvedNames((current) => [...current, normalizedName]);
      setActiveRejectName(null);
      setStatus(message);
      setStatusIsError(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reject unverified team.");
      setStatusIsError(true);
    } finally {
      setBusyName(null);
    }
  }

  return (
    <div className="page">
      <div className="page-title">
        Unverified Teams ·{" "}
        {deferredQuery ? `${searchedTeams.length} of ${visibleTeams.length}` : visibleTeams.length} awaiting confirmation
      </div>
      <input
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find any team instantly"
      />
      {status ? (
        <div className="inline-status" style={statusIsError ? { color: "var(--red, #ef4444)" } : undefined}>
          {status}
        </div>
      ) : null}
      {visibleTeams.length === 0 ? (
        <div className="dash-card">
          <div className="empty-copy">No pending unverified teams are waiting for review.</div>
        </div>
      ) : null}
      {searchedTeams.map((team) => (
        <div key={team.normalizedName} className="unv-item">
          <Link
            href={`/admin/unverified/${encodeURIComponent(team.normalizedName)}`}
            className="unv-avatar"
            aria-label={`View ${team.teamName} unverified team profile`}
            title="View match history and tier win ratios"
          >
            {team.teamName.slice(0, 2).toUpperCase()}
          </Link>
          <div className="unv-info">
            <div className="unv-name">{team.teamName}</div>
            <div className="unv-meta">
              {team.appearances} appearances · {team.distinctTournaments} tournaments · First seen{" "}
              {new Date(team.firstSeenAt).toDateString()} · Last seen {new Date(team.lastSeenAt).toDateString()}
            </div>
            <div className="unv-progress">
              {[0, 1, 2].map((index) => (
                <div key={index} className={`unv-dot ${index < team.distinctTournaments ? "filled" : ""}`} />
              ))}
            </div>
            <div className="unv-meta">
              {team.autoPlaced
                ? "Ready for admin placement, but still stays in the Unverified queue until confirmed."
                : `Auto-placement progress: ${Math.min(team.distinctTournaments, 3)}/3 tournaments.`}
            </div>
            {team.suggestedTierId ? (
              <div className="unv-suggestion">
                Suggested tier:{" "}
                {COMPETITIVE_TIERS.find((tier) => tier.id === team.suggestedTierId)?.shortLabel ??
                  team.suggestedTierId.toUpperCase()}{" "}
                · {Math.round((team.suggestedTierWinRate ?? 0) * 100)}% win rate across{" "}
                {team.suggestedTierSeriesCount ?? 0} verified-team series
              </div>
            ) : (
              <div className="unv-suggestion">Suggested tier: not enough verified-team data yet.</div>
            )}
            {canEdit && activeRejectName === team.normalizedName ? (
              <form
                className="unv-confirm-form"
                onSubmit={(event) => void handleRejectSubmit(event, team.normalizedName)}
              >
                <label className="form-stack">
                  <span className="form-label">Reason</span>
                  <select
                    className="form-input unv-reject-reasons"
                    size={4}
                    value={rejectDraft.reason}
                    onChange={(event) => setRejectDraft((current) => ({ ...current, reason: event.target.value }))}
                  >
                    {DISMISS_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="form-stack">
                  <span className="form-label">Note (optional)</span>
                  <textarea
                    className="form-textarea"
                    placeholder="Add any extra context..."
                    value={rejectDraft.note}
                    onChange={(event) => setRejectDraft((current) => ({ ...current, note: event.target.value }))}
                  />
                </label>
                <div className="unv-confirm-actions">
                  <button
                    className="btn-reject"
                    type="submit"
                    disabled={busyName === team.normalizedName}
                  >
                    {busyName === team.normalizedName ? "Rejecting..." : "Confirm Reject"}
                  </button>
                  <button
                    className="p-action p-review"
                    type="button"
                    onClick={() => setActiveRejectName(null)}
                    disabled={busyName === team.normalizedName}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
            {canEdit && activeConfirmName === team.normalizedName ? (
              <form
                className="unv-confirm-form"
                onSubmit={(event) => void handleConfirmSubmit(event, team.normalizedName)}
              >
                <label className="form-stack">
                  <span className="form-label">Canonical Team Name</span>
                  <input
                    className="form-input"
                    value={confirmDraft.teamName}
                    onChange={(event) =>
                      setConfirmDraft((current) => ({
                        ...current,
                        teamName: event.target.value
                      }))
                    }
                  />
                </label>
                <div className="unv-confirm-grid">
                  <label className="form-stack">
                    <span className="form-label">Short Code</span>
                    <input
                      className="form-input"
                      value={confirmDraft.shortCode}
                      onChange={(event) =>
                        setConfirmDraft((current) => ({
                          ...current,
                          shortCode: event.target.value.toUpperCase()
                        }))
                      }
                    />
                  </label>
                  <label className="form-stack">
                    <span className="form-label">Competitive Tier</span>
                    <select
                      className="form-input"
                      value={confirmDraft.tierId}
                      onChange={(event) =>
                        setConfirmDraft((current) => ({
                          ...current,
                          tierId: event.target.value as ConfirmDraft["tierId"]
                        }))
                      }
                    >
                      <option value="">Choose tier</option>
                      {COMPETITIVE_TIERS.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.shortLabel}
                          {tier.maxTeams != null
                            ? ` (${tier.maxTeams - (tierOpenSpots[tier.id] ?? 0)}/${tier.maxTeams} Teams)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="unv-confirm-actions">
                  <button
                    className="btn-confirm"
                    type="submit"
                    disabled={busyName === team.normalizedName}
                  >
                    {busyName === team.normalizedName ? "Saving..." : "Create Verified Team"}
                  </button>
                  <button
                    className="p-action p-review"
                    type="button"
                    onClick={() => setActiveConfirmName(null)}
                    disabled={busyName === team.normalizedName}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          {canEdit ? (
            <div className="unv-actions">
              <button
                className="btn-confirm"
                type="button"
                onClick={() => openConfirm(team)}
                disabled={busyName === team.normalizedName}
              >
                Confirm
              </button>
              <button
                className="btn-reject"
                type="button"
                onClick={() => openReject(team.normalizedName)}
                disabled={busyName === team.normalizedName}
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
