"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState, type FormEvent } from "react";

import type { DashboardSnapshot, ResolveUnverifiedRequest, TierId } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

import { AccordionCard } from "./accordion-card";

const PLACEMENT_TIERS = TIER_DEFINITIONS;

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
  tierId: TierId | "";
};

type RejectDraft = {
  reason: string;
  note: string;
};

type UnverifiedTeam = DashboardSnapshot["unverifiedTeams"][number];

function getTierShortLabel(tierId: TierId | undefined) {
  return tierId ? PLACEMENT_TIERS.find((tier) => tier.id === tierId)?.shortLabel ?? tierId.toUpperCase() : null;
}

export function UnverifiedTeamsWorkflowScreen({ snapshot, canEdit = true }: { snapshot: DashboardSnapshot; canEdit?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const [activeConfirmName, setActiveConfirmName] = useState<string | null>(null);
  const [activeRejectName, setActiveRejectName] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft>({
    teamName: "",
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
  const tierTeamCounts = Object.fromEntries(
    snapshot.tiers.map((ts) => [ts.tier.id, ts.teams.length])
  );

  const visibleTeams = snapshot.unverifiedTeams.filter(
    (team) => !resolvedNames.includes(team.normalizedName)
  );

  const searchedTeams = deferredQuery
    ? visibleTeams.filter((team) => team.teamName.toLowerCase().includes(deferredQuery))
    : visibleTeams;
  const suggestedTeams = searchedTeams.filter((team) => !!team.suggestedTierId);
  const unsuggestedTeams = searchedTeams.filter((team) => !team.suggestedTierId);

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

  function openConfirm(team: UnverifiedTeam) {
    setActiveConfirmName(team.normalizedName);
    setActiveRejectName(null);
    setStatus(null);
    setStatusIsError(false);
    setConfirmDraft({
      teamName: team.teamName,
      tierId: team.suggestedTierId ?? ""
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
    if (!teamName) {
      setStatus("Team name is required.");
      setStatusIsError(true);
      return;
    }
    if (!confirmDraft.tierId) {
      setStatus("Choose a tier before confirming.");
      setStatusIsError(true);
      return;
    }

    try {
      setBusyName(normalizedName);
      const message = await postResolution({
        action: "confirm",
        normalizedName,
        teamName,
        tierId: confirmDraft.tierId
      });

      setActiveConfirmName(null);
      setStatus(message);
      setStatusIsError(false);
      router.refresh();
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
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reject unverified team.");
      setStatusIsError(true);
    } finally {
      setBusyName(null);
    }
  }

  async function handleCancelPending(normalizedName: string) {
    try {
      setBusyName(normalizedName);
      setStatus(null);
      setStatusIsError(false);

      const message = await postResolution({
        action: "cancel_pending",
        normalizedName
      });

      setStatus(message);
      setStatusIsError(false);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not cancel the pending staging.");
      setStatusIsError(true);
    } finally {
      setBusyName(null);
    }
  }

  function getTierOptionLabel(tier: (typeof PLACEMENT_TIERS)[number]) {
    const teamCount =
      tier.maxTeams != null
        ? tier.maxTeams - (tierOpenSpots[tier.id] ?? 0)
        : (tierTeamCounts[tier.id] ?? 0);

    return `${tier.shortLabel} (${teamCount}/${tier.maxTeams ?? "∞"} Teams)`;
  }

  function renderTeamCard(team: UnverifiedTeam) {
    const pendingTierLabel = getTierShortLabel(team.pendingTierId);
    return (
      <div key={team.normalizedName} className="unv-item">
        <Link
          href={`/admin/unverified/${encodeURIComponent(team.normalizedName)}`}
          className="unv-avatar"
          aria-label={`View ${team.teamName} unverified team profile`}
          title="View match history and tier win ratios"
        />
        <div className="unv-info">
          <div className="unv-name">
            {team.teamName}
            {team.pending ? <span className="unverified-profile-badge" style={{ marginLeft: 8 }}>Pending</span> : null}
          </div>
          <div className="unv-meta">
            {team.appearances} appearances - {team.distinctTournaments} tournaments - First seen{" "}
            {new Date(team.firstSeenAt).toDateString()} - Last seen {new Date(team.lastSeenAt).toDateString()}
          </div>
          <div className="unv-progress">
            {[0, 1, 2].map((index) => (
              <div key={index} className={`unv-dot ${index < team.distinctTournaments ? "filled" : ""}`} />
            ))}
          </div>
          <div className="unv-meta">
            {team.pending
              ? `Currently staged for admin preview${pendingTierLabel ? ` in ${pendingTierLabel}` : ""}.`
              : team.autoPlaced
              ? "Ready for admin placement, but still stays in the Unverified queue until confirmed."
              : `Auto-placement progress: ${Math.min(team.distinctTournaments, 3)}/3 tournaments.`}
          </div>
          {team.suggestedTierId ? (
            <div className="unv-suggestion">
              Suggested tier:{" "}
              {PLACEMENT_TIERS.find((tier) => tier.id === team.suggestedTierId)?.shortLabel ??
                team.suggestedTierId.toUpperCase()}{" "}
              - {Math.round((team.suggestedTierWinRate ?? 0) * 100)}% win rate across{" "}
              {team.suggestedTierSeriesCount ?? 0} verified-team series
            </div>
          ) : (
            <div className="unv-suggestion">Suggested tier: not enough verified-team data yet.</div>
          )}
          {canEdit && !team.pending && activeRejectName === team.normalizedName ? (
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
                    <option key={r} value={r}>
                      {r}
                    </option>
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
          {canEdit && !team.pending && activeConfirmName === team.normalizedName ? (
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
                  <span className="form-label">Tier</span>
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
                    {PLACEMENT_TIERS.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {getTierOptionLabel(tier)}
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
                  {busyName === team.normalizedName ? "Saving..." : "Stage Verified Team"}
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
            {team.pending ? (
              <button
                className="p-action p-review"
                type="button"
                onClick={() => {
                  void handleCancelPending(team.normalizedName);
                }}
                disabled={busyName === team.normalizedName}
              >
                {busyName === team.normalizedName ? "Cancelling..." : "Cancel Pending"}
              </button>
            ) : (
              <>
                <button
                  className="btn-confirm"
                  type="button"
                  onClick={() => openConfirm(team)}
                  disabled={busyName === team.normalizedName}
                >
                  Stage Verified Team
                </button>
                <button
                  className="btn-reject"
                  type="button"
                  onClick={() => openReject(team.normalizedName)}
                  disabled={busyName === team.normalizedName}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  function renderTeamGroup(title: string, teams: UnverifiedTeam[], defaultOpen = false) {
    return (
      <AccordionCard title={`${title} (${teams.length})`} defaultOpen={defaultOpen}>
        {teams.length > 0 ? teams.map((team) => renderTeamCard(team)) : <div className="empty-copy">No teams in this group.</div>}
      </AccordionCard>
    );
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
      {false ? searchedTeams.map((team) => (
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
                {PLACEMENT_TIERS.find((tier) => tier.id === team.suggestedTierId)?.shortLabel ??
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
                      {PLACEMENT_TIERS.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                          {getTierOptionLabel(tier)}
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
      )) : null}
      {renderTeamGroup("Has auto suggestion", suggestedTeams, true)}
      {renderTeamGroup("No auto suggestion", unsuggestedTeams)}
    </div>
  );
}
