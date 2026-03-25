"use client";

import { useState, type FormEvent } from "react";

import type { DashboardSnapshot, ResolveUnverifiedRequest, TierId } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

const COMPETITIVE_TIERS = TIER_DEFINITIONS.filter((tier) => tier.id !== "tier7");

type ConfirmDraft = {
  teamName: string;
  shortCode: string;
  tierId: TierId | "";
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

export function UnverifiedTeamsWorkflowScreen({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [activeConfirmName, setActiveConfirmName] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft>({
    teamName: "",
    shortCode: "",
    tierId: ""
  });
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [resolvedNames, setResolvedNames] = useState<string[]>([]);

  const visibleTeams = snapshot.unverifiedTeams.filter(
    (team) => !resolvedNames.includes(team.normalizedName)
  );

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
    setStatus(null);
    setStatusIsError(false);
    setConfirmDraft({
      teamName: team.teamName,
      shortCode: buildShortCodeSuggestion(team.teamName),
      tierId: team.suggestedTierId && team.suggestedTierId !== "tier7" ? team.suggestedTierId : ""
    });
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

  async function handleDismiss(normalizedName: string, teamName: string) {
    if (!window.confirm(`Dismiss ${teamName} from the current unverified queue?`)) {
      return;
    }

    try {
      setBusyName(normalizedName);
      setStatus(null);
      setStatusIsError(false);
      const message = await postResolution({
        action: "dismiss",
        normalizedName
      });

      setResolvedNames((current) => [...current, normalizedName]);
      if (activeConfirmName === normalizedName) {
        setActiveConfirmName(null);
      }
      setStatus(message);
      setStatusIsError(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not dismiss unverified team.");
      setStatusIsError(true);
    } finally {
      setBusyName(null);
    }
  }

  return (
    <div className="page">
      <div className="page-title">Unverified Teams · {visibleTeams.length} awaiting confirmation</div>
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
      {visibleTeams.map((team) => (
        <div key={team.normalizedName} className="unv-item">
          <div className="unv-avatar">{team.teamName.slice(0, 2).toUpperCase()}</div>
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
            {activeConfirmName === team.normalizedName ? (
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
              onClick={() => void handleDismiss(team.normalizedName, team.teamName)}
              disabled={busyName === team.normalizedName}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
