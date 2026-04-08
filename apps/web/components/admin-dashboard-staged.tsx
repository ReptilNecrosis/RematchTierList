"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Toast } from "./toast";
import { useRouter } from "next/navigation";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";
import type {
  AdminAccount,
  ChallengeSeries,
  DashboardSnapshot,
  PendingUnverifiedPlacement,
  PublishPhase,
  ReviewFlag,
  StagedMoveValidationIssue,
  StagedTeamMove,
  TierId,
  TournamentRecord,
} from "@rematch/shared-types";

import { PublicTierList } from "./public-tier-list";

function reasonLabel(reason: string) {
  return reason.replaceAll("_", " ");
}

function reviewReasonLabel(reason: ReviewFlag["reason"]) {
  if (reason === "win_vs_three_plus_higher") return "Win vs. team 3+ tiers higher";
  return "Loss vs. team 3+ tiers lower";
}

function tierLabel(tierId: string) {
  return (
    TIER_DEFINITIONS.find((tier) => tier.id === tierId)?.shortLabel ?? tierId
  );
}

function movementLabel(movementType: "promotion" | "demotion") {
  return movementType === "promotion" ? "Promote" : "Demote";
}

function buildMutationError(
  payload: { message?: string; issues?: StagedMoveValidationIssue[] } | null,
  fallbackMessage: string,
) {
  if (payload?.issues?.length) {
    return payload.issues.map((issue) => issue.message).join(" ");
  }

  return payload?.message ?? fallbackMessage;
}

function TeamProfileLink({
  href,
  label,
  className = "admin-inline-team-link",
}: {
  href?: string;
  label: string;
  className?: string;
}) {
  if (!href) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function ChallengeItem({
  challenge,
  challengerHref,
  defenderHref,
}: {
  challenge: ChallengeSeries;
  challengerHref?: string;
  defenderHref?: string;
}) {
  const router = useRouter();

  async function handleConfirm() {
    await fetch("/api/challenges/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(challenge),
    });
    router.refresh();
  }

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(challenge.expiresAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    ),
  );

  if (challenge.state === "pending") {
    return (
      <div className="challenge-item">
        <div className="ch-teams">
          <div className="ch-vs">
            <TeamProfileLink
              href={challengerHref}
              label={challenge.challengerTeamName}
            />
            <span>vs</span>
            <TeamProfileLink
              href={defenderHref}
              label={challenge.defenderTeamName}
            />
          </div>
          <div className="ch-meta">{challenge.reason}</div>
        </div>
        <button className="p-action p-review" onClick={handleConfirm}>
          Confirm Pairing
        </button>
      </div>
    );
  }

  if (challenge.state === "expired") {
    return (
      <div className="challenge-item">
        <div className="ch-teams">
          <div className="ch-vs">
            <TeamProfileLink
              href={challengerHref}
              label={challenge.challengerTeamName}
            />
            <span>vs</span>
            <TeamProfileLink
              href={defenderHref}
              label={challenge.defenderTeamName}
            />
          </div>
          <div className="ch-meta">{challenge.reason}</div>
        </div>
        <div
          className="ch-timer"
          style={{ color: "var(--accent-red, #ef4444)" }}
        >
          EXPIRED - outcome pending
        </div>
      </div>
    );
  }

  return (
    <div className="challenge-item">
      <div className="ch-teams">
        <div className="ch-vs">
          <TeamProfileLink
            href={challengerHref}
            label={challenge.challengerTeamName}
          />
          <span>vs</span>
          <TeamProfileLink
            href={defenderHref}
            label={challenge.defenderTeamName}
          />
        </div>
        <div className="ch-meta">{challenge.reason}</div>
      </div>
      <div className="ch-timer ch-warn">{daysLeft} days left</div>
    </div>
  );
}

export function AdminDashboard({
  previewSnapshot,
  stagedMoves,
  pendingPlacements,
  publishValidationIssues,
  availableSeasons,
  selectedSeasonKey,
  selectedSeasonLabel,
  tournaments,
  stagedInactiveRemovals,
  viewer,
}: {
  previewSnapshot: DashboardSnapshot;
  stagedMoves: Array<StagedTeamMove & { teamName: string }>;
  pendingPlacements: PendingUnverifiedPlacement[];
  publishValidationIssues: StagedMoveValidationIssue[];
  availableSeasons: Array<{
    key: string;
    label: string;
    seriesCount: number;
    tournamentCount: number;
  }>;
  selectedSeasonKey: string;
  selectedSeasonLabel: string;
  tournaments: TournamentRecord[];
  stagedInactiveRemovals: Array<{ teamId: string; teamName: string }>;
  viewer: AdminAccount;
}) {
  const router = useRouter();
  const activeChallenges = previewSnapshot.challenges.filter(
    (challenge) => challenge.state === "active",
  );
  const pendingChallenges = previewSnapshot.challenges.filter(
    (challenge) => challenge.state === "pending",
  );
  const teamPathById = useMemo(() => {
    const entries = [...previewSnapshot.tiers]
      .flatMap((tier) => tier.teams)
      .map(
        (team) => [team.id, team.adminHref ?? `/teams/${team.slug}`] as const,
      );
    return new Map(entries);
  }, [previewSnapshot.tiers]);

  const tournamentById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments],
  );

  const [open, setOpen] = useState({
    previewTierlist: false,
    movements: false,
    challenges: false,
    inactivity: false,
    reviewFlags: false,
    activity: false,
  });
  const [activityFilter, setActivityFilter] = useState<"all" | "movements" | "teams" | "merges" | "tournaments">("all");
  const [busySeriesId, setBusySeriesId] = useState<string | null>(null);
  const [busyTeamAction, setBusyTeamAction] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "publish" | "reset" | "stage_all" | null
  >(null);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishedLocally, setPublishedLocally] = useState(false);
  const [draggingTeamId, setDraggingTeamId] = useState<string | null>(null);
  const [dropTargetTierId, setDropTargetTierId] = useState<TierId | null>(null);
  const [showRemoveInactiveConfirm, setShowRemoveInactiveConfirm] =
    useState(false);

  const removalEligibleTeams = useMemo(
    () =>
      previewSnapshot.tiers
        .flatMap((tier) => tier.teams)
        .filter(
          (team) =>
            team.removalFlag ||
            team.inactivityConsequence === "removal_pending",
        ),
    [previewSnapshot.tiers],
  );

  const visibleStagedInactiveRemovals = publishedLocally
    ? []
    : stagedInactiveRemovals;

  const removalTeamIdSet = useMemo(
    () => new Set(visibleStagedInactiveRemovals.map((r) => r.teamId)),
    [visibleStagedInactiveRemovals],
  );

  const removalAdjustedSnapshot = useMemo(() => {
    if (removalTeamIdSet.size === 0) return previewSnapshot;
    return {
      ...previewSnapshot,
      tiers: previewSnapshot.tiers.map((tier) => {
        const removedCount = tier.teams.filter((t) =>
          removalTeamIdSet.has(t.id),
        ).length;
        return {
          ...tier,
          teams: tier.teams.filter((t) => !removalTeamIdSet.has(t.id)),
          openSpots: (tier.openSpots ?? 0) + removedCount,
        };
      }),
    };
  }, [previewSnapshot, removalTeamIdSet]);

  const visibleStagedMoves = useMemo(
    () => (publishedLocally ? [] : stagedMoves),
    [publishedLocally, stagedMoves],
  );
  const visiblePendingPlacements = useMemo(
    () => (publishedLocally ? [] : pendingPlacements),
    [publishedLocally, pendingPlacements],
  );
  const visiblePublishValidationIssues = useMemo(
    () => (publishedLocally ? [] : publishValidationIssues),
    [publishedLocally, publishValidationIssues],
  );
  const visibleStagedMoveByTeamId = useMemo(
    () => new Map(visibleStagedMoves.map((move) => [move.teamId, move])),
    [visibleStagedMoves],
  );
  const visiblePreviewStagedMovementByTeamId = useMemo(
    () =>
      Object.fromEntries(
        visibleStagedMoves.map(
          (move) => [move.teamId, move.movementType] as const,
        ),
      ) as Record<string, "promotion" | "demotion">,
    [visibleStagedMoves],
  );
  const totalQueuedChanges =
    visibleStagedMoves.length +
    visiblePendingPlacements.length +
    visibleStagedInactiveRemovals.length;

  function toggle(
    key:
      | "previewTierlist"
      | "movements"
      | "challenges"
      | "inactivity"
      | "reviewFlags"
      | "activity",
  ) {
    if (key === "challenges" || key === "inactivity") {
      setOpen((current) => ({
        ...current,
        challenges: !current[key],
        inactivity: !current[key],
      }));
    } else {
      setOpen((current) => ({ ...current, [key]: !current[key] }));
    }
  }

  async function postMoveAction(
    body: Record<string, unknown>,
    fallbackError: string,
  ): Promise<{
    ok?: boolean;
    message?: string;
    issues?: StagedMoveValidationIssue[];
  } | null> {
    try {
      const response = await fetch("/api/teams/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        issues?: StagedMoveValidationIssue[];
      };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(buildMutationError(payload, fallbackError));
        return null;
      }

      return payload;
    } catch {
      setErrorPopup(fallbackError);
      return null;
    }
  }

  async function handleStage(
    teamId: string,
    movementType: "promotion" | "demotion",
  ) {
    setBusyTeamAction(`stage:${teamId}`);
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishedLocally(false);

    const payload = await postMoveAction(
      { action: "stage", teamId, movementType },
      "Could not stage the move.",
    );

    if (payload) {
      setSuccessPopup(payload.message ?? "Staged move updated.");
      router.refresh();
    }

    setBusyTeamAction(null);
  }

  async function handleRemove(teamId: string) {
    setBusyTeamAction(`remove:${teamId}`);
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishedLocally(false);

    const payload = await postMoveAction(
      { action: "remove", teamId },
      "Could not remove the staged move.",
    );
    if (payload) {
      setSuccessPopup(payload.message ?? "Removed staged move.");
      router.refresh();
    }

    setBusyTeamAction(null);
  }

  async function handleStageAllPending() {
    setBusyAction("stage_all");
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishedLocally(false);

    const payload = await postMoveAction(
      { action: "stage_bulk_pending", selectedSeasonKey },
      "Could not stage the pending moves.",
    );

    if (payload) {
      setSuccessPopup(payload.message ?? "Staged pending moves.");
      router.refresh();
    }

    setBusyAction(null);
  }

  async function handleDirectStage(teamId: string, targetTierId: TierId) {
    setBusyTeamAction(`drag:${teamId}`);
    setDraggingTeamId(null);
    setDropTargetTierId(null);
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishedLocally(false);

    const payload = await postMoveAction(
      { action: "stage", teamId, targetTierId },
      "Could not stage the dragged team.",
    );

    if (payload) {
      setSuccessPopup(payload.message ?? "Staged move updated.");
      router.refresh();
    }

    setBusyTeamAction(null);
  }

  function openPublishModal() {
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishModalOpen(true);
  }

  async function handlePublish(publishPhase: PublishPhase) {
    setBusyAction("publish");
    setPublishModalOpen(false);
    setErrorPopup(null);
    setSuccessPopup(null);

    const payload = await postMoveAction(
      { action: "publish", publishPhase, selectedSeasonKey },
      "Could not publish staged moves.",
    );
    if (payload) {
      setPublishedLocally(true);
      setSuccessPopup(payload.message ?? "Published staged moves.");
      router.refresh();
    }

    setBusyAction(null);
  }

  async function handleReset() {
    setBusyAction("reset");
    setErrorPopup(null);
    setSuccessPopup(null);
    setPublishedLocally(false);

    const payload = await postMoveAction(
      { action: "reset" },
      "Could not clear staged moves.",
    );
    if (payload) {
      setSuccessPopup(payload.message ?? "Cleared staged moves.");
      router.refresh();
    }

    setBusyAction(null);
  }

  async function handleStageInactiveRemovals() {
    const teamIds = removalEligibleTeams.map((team) => team.id);
    if (teamIds.length === 0) return;
    setBusyAction("reset");
    setErrorPopup(null);
    setSuccessPopup(null);
    setShowRemoveInactiveConfirm(false);
    try {
      const response = await fetch("/api/admin/inactive-removals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage", teamIds }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not stage inactive removals.");
      } else {
        setSuccessPopup(
          payload.message ?? "Staged inactive teams for removal.",
        );
        router.refresh();
      }
    } catch {
      setErrorPopup("Could not stage inactive removals.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveSeries(seriesId: string) {
    setBusySeriesId(seriesId);
    setErrorPopup(null);
    setSuccessPopup(null);
    try {
      const response = await fetch(`/api/series/${seriesId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not remove the series result.");
      } else {
        setSuccessPopup(payload.message ?? "Series result removed.");
        router.refresh();
      }
    } catch {
      setErrorPopup("Could not remove the series result.");
    } finally {
      setBusySeriesId(null);
    }
  }

  const promoCount = previewSnapshot.pendingFlags.filter(
    (f) => f.movementType === "promotion",
  ).length;
  const demoCount = previewSnapshot.pendingFlags.filter(
    (f) => f.movementType === "demotion",
  ).length;
  const midseasonReached = new Date().getUTCDate() >= 15;

  const allInactiveTeams = midseasonReached
    ? removalAdjustedSnapshot.tiers
        .flatMap((tier) => tier.teams)
        .filter((team) => team.inactivityFlag !== "none")
    : [];
  const inactiveCount = allInactiveTeams.length;
  const yellowFlagCount = allInactiveTeams.filter((t) => t.inactivityFlag === "yellow").length;
  const orangeFlagCount = allInactiveTeams.filter((t) => t.inactivityFlag === "orange").length;
  const redFlagCount = allInactiveTeams.filter((t) => t.inactivityFlag === "red").length;

  const publishBlocked =
    totalQueuedChanges === 0 ||
    visiblePublishValidationIssues.length > 0 ||
    busyAction !== null;

  function getActorAvatar(displayName: string) {
    const initials = displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    return initials || displayName.slice(0, 2).toUpperCase() || "AD";
  }

  return (
    <div className="page">
      <div className="page-title">
        Admin Dashboard - Logged in as {viewer.displayName} (
        {viewer.role.replace("_", " ")})
      </div>

      <section className="dash-card">
        <div className="dash-card-title">Season View</div>
        <div className="activity-log-toolbar">
          <div className="p-reason">
            Previewing admin moves from {selectedSeasonLabel}. This supports
            end-of-month tournaments that are reviewed in the next month.
          </div>
          <div className="activity-log-season-filters">
            {availableSeasons.map((season) => (
              <Link
                key={season.key}
                href={`/admin?month=${season.key}`}
                className={`season-chip ${season.key === selectedSeasonKey ? "active" : ""}`}
              >
                <span>{season.label}</span>
                <b>{season.seriesCount} series</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {errorPopup ? (
        <div className="modal-overlay" onClick={() => setErrorPopup(null)}>
          <div
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title">Cannot Complete Action</div>
            <div className="modal-body">{errorPopup}</div>
            <button
              className="btn-login"
              type="button"
              onClick={() => setErrorPopup(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {successPopup ? (
        <Toast message={successPopup} onDismiss={() => setSuccessPopup(null)} />
      ) : null}

      {publishModalOpen ? (
        <div className="modal-overlay" onClick={() => setPublishModalOpen(false)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">Choose Publish Type</div>
            <div className="modal-body">
              Confirm how to publish the staged moves for {selectedSeasonLabel}.
            </div>
            <div className="admin-cta-row" style={{ marginTop: 16 }}>
              <button
                className="btn-login"
                type="button"
                onClick={() => {
                  void handlePublish("midseason");
                }}
              >
                Midseason - {selectedSeasonLabel}
              </button>
              <button
                className="btn-login"
                type="button"
                onClick={() => {
                  void handlePublish("end_season");
                }}
              >
                End Season - {selectedSeasonLabel}
              </button>
            </div>
            <button
              className="btn-login danger"
              type="button"
              style={{ marginTop: 12 }}
              onClick={() => setPublishModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Total Teams</div>
          <div className="stat-value">
            {previewSnapshot.tiers.reduce(
              (count, tier) => count + tier.teams.length,
              0,
            )}
          </div>
          <div className="stat-sub">Across 7 tiers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staged Moves</div>
          <div className="stat-value accent-yellow">{totalQueuedChanges}</div>
          <div className="stat-sub">
            {visiblePublishValidationIssues.length > 0
              ? `${visiblePublishValidationIssues.length} validation issue(s)`
              : "Ready for review"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Actions</div>
          <div className="stat-value accent-blue">
            {previewSnapshot.pendingFlags.length}
          </div>
          <div className="stat-sub">Previewed rule output</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Challenges</div>
          <div className="stat-value accent-violet">
            {activeChallenges.length}
          </div>
          <div className="stat-sub">
            {pendingChallenges.length > 0
              ? `${pendingChallenges.length} awaiting confirmation`
              : "Series in progress"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Review Flags</div>
          <div className="stat-value accent-yellow">
            {previewSnapshot.reviewFlags.length}
          </div>
          <div className="stat-sub">3+ tier gap results</div>
        </div>
      </div>

      <section className="dash-card">
        <div className="dash-card-title">Move Controls</div>
        <div className="admin-cta-row">
          <button
            className="btn-login"
            type="button"
            disabled={publishBlocked}
            onClick={() => {
              openPublishModal();
            }}
          >
            {busyAction === "publish" ? "Publishing..." : "Confirm Moves"}
          </button>
          <button
            className="btn-login danger"
            type="button"
            disabled={totalQueuedChanges === 0 || busyAction !== null}
            onClick={() => {
              void handleReset();
            }}
          >
            {busyAction === "reset" ? "Resetting..." : "Reset"}
          </button>
          <button
            className="btn-login danger"
            type="button"
            disabled={
              busyAction !== null ||
              removalEligibleTeams.length === 0 ||
              visibleStagedInactiveRemovals.length > 0
            }
            onClick={() => setShowRemoveInactiveConfirm(true)}
          >
            {visibleStagedInactiveRemovals.length > 0
              ? `Removals Staged (${visibleStagedInactiveRemovals.length})`
              : `Remove Inactive (${removalEligibleTeams.length})`}
          </button>
        </div>
        {showRemoveInactiveConfirm ? (
          <div className="admin-remove-inactive-confirm">
            <span>
              Stage <strong>{removalEligibleTeams.length}</strong> inactive team
              {removalEligibleTeams.length === 1 ? "" : "s"} for removal. Reset
              to undo · Confirm Moves to make official.
            </span>
            <button
              className="btn-login danger"
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleStageInactiveRemovals()}
            >
              Remove Inactive
            </button>
            <button
              className="btn-login"
              type="button"
              onClick={() => setShowRemoveInactiveConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {visiblePublishValidationIssues.length > 0 ? (
          <div className="admin-validation-list">
            {visiblePublishValidationIssues.map((issue, index) => (
              <div
                key={`${issue.teamId ?? "global"}-${index}`}
                className="admin-validation-item"
              >
                {issue.message}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="dash-card">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          onClick={() => toggle("previewTierlist")}
        >
          <span>Admin Tier List Preview</span>
          <span className="dash-badges">
            {promoCount > 0 && (
              <span className="staged-badge badge-green">{promoCount} promo</span>
            )}
            {demoCount > 0 && (
              <span className="staged-badge badge-red">{demoCount} demo</span>
            )}
            {yellowFlagCount > 0 && (
              <span className="staged-badge badge-yellow">{yellowFlagCount}</span>
            )}
            {orangeFlagCount > 0 && (
              <span className="staged-badge badge-orange">{orangeFlagCount}</span>
            )}
            {redFlagCount > 0 && (
              <span className="staged-badge badge-red-flag">{redFlagCount}</span>
            )}
            {totalQueuedChanges > 0 && (
              <span className="staged-badge">PREVIEW (staged)</span>
            )}
          </span>
          <span className="dash-chevron">
            {open.previewTierlist ? "v" : ">"}
          </span>
        </button>
        {open.previewTierlist ? (
          <PublicTierList
            snapshot={removalAdjustedSnapshot}
            lastUpdatedLabel={
              totalQueuedChanges > 0 ? "Preview" : "Matches live standings"
            }
            defaultAllExpanded
            stagedMovementByTeamId={visiblePreviewStagedMovementByTeamId}
            adminDragDrop={{
              draggingTeamId,
              dropTargetTierId,
              busyTeamId:
                busyTeamAction?.startsWith("drag:") ||
                busyTeamAction?.startsWith("stage:")
                  ? (busyTeamAction.split(":")[1] ?? null)
                  : null,
              disabled: busyAction !== null || busyTeamAction !== null,
              onDragStart: (teamId) => setDraggingTeamId(teamId),
              onDragEnd: () => setDraggingTeamId(null),
              onDropTargetChange: setDropTargetTierId,
              onDrop: ({ teamId, targetTierId }) => {
                void handleDirectStage(teamId, targetTierId);
              },
            }}
          />
        ) : null}
      </section>

      <div className="dash-grid">
        <section className="dash-card">
          <button
            type="button"
            className="dash-card-title dash-accordion-toggle"
            style={{ marginBottom: 12 }}
            onClick={() => toggle("movements")}
          >
            <span>Pending Movements</span>
            <span className="dash-badges">
              {promoCount > 0 && (
                <span className="staged-badge badge-green">{promoCount}</span>
              )}
              {demoCount > 0 && (
                <span className="staged-badge badge-red">{demoCount}</span>
              )}
            </span>
            <span className="dash-chevron">{open.movements ? "v" : ">"}</span>
          </button>
          {open.movements ? (
            previewSnapshot.pendingFlags.length > 0 ? (
              <>
                <div className="admin-pending-actions">
                  <button
                    className="btn-login"
                    type="button"
                    disabled={
                      previewSnapshot.pendingFlags.length === 0 ||
                      busyAction !== null ||
                      busyTeamAction !== null
                    }
                    onClick={() => {
                      void handleStageAllPending();
                    }}
                  >
                    {busyAction === "stage_all"
                      ? "Staging all..."
                      : "Stage All Pending"}
                  </button>
                  <div className="admin-cta-note admin-pending-note">
                    Stages the pending moves shown for {selectedSeasonLabel}.
                    Skips pending moves that involve Tier 1. Manual drag can
                    still stage those teams.
                  </div>
                </div>
                {previewSnapshot.pendingFlags.map((flag) => {
                  const stagedMove = visibleStagedMoveByTeamId.get(flag.teamId);
                  const busy = busyTeamAction === `stage:${flag.teamId}`;
                  return (
                    <div key={flag.id} className="pending-item">
                      <div className="p-avatar">
                        {flag.teamName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="p-info">
                        <div className="p-name">
                          <TeamProfileLink
                            href={teamPathById.get(flag.teamId)}
                            label={flag.teamName}
                          />
                        </div>
                        <div className="p-reason">
                          {flag.movementType === "promotion"
                            ? "Promotion"
                            : "Demotion"}{" "}
                          - {reasonLabel(flag.reason)}
                        </div>
                        {flag.recentManualMoveAt ? (
                          <div className="p-recent-move">Moved &lt;24h ago</div>
                        ) : null}
                        {stagedMove ? (
                          <div className="p-staged-copy">
                            Staged to {tierLabel(stagedMove.stagedTierId)} (
                            {stagedMove.movementType})
                          </div>
                        ) : null}
                      </div>
                      <button
                        className={`p-action ${flag.movementType === "promotion" ? "p-up" : "p-down"}`}
                        disabled={
                          busy || busyAction !== null || busyTeamAction !== null
                        }
                        onClick={() => {
                          void handleStage(flag.teamId, flag.movementType);
                        }}
                      >
                        {busy
                          ? `${movementLabel(flag.movementType)}...`
                          : movementLabel(flag.movementType)}
                      </button>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="empty-copy">
                No pending movements in the current preview.
              </div>
            )
          ) : null}
        </section>

        <section className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Staged Queue</div>
          </div>
          {totalQueuedChanges > 0 ? (
            <>
              {visibleStagedMoves.map((move) => {
                const busy = busyTeamAction === `remove:${move.teamId}`;
                return (
                  <div key={move.id} className="pending-item">
                    <div className="p-avatar">
                      {move.teamName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="p-info">
                      <div className="p-name">
                        <TeamProfileLink
                          href={teamPathById.get(move.teamId)}
                          label={move.teamName}
                        />
                      </div>
                      <div className="p-reason">
                        {tierLabel(move.liveTierId)} to{" "}
                        {tierLabel(move.stagedTierId)} - {move.movementType}
                      </div>
                      <div className="p-staged-copy">
                        Last updated {new Date(move.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="p-action p-review"
                      disabled={busy || busyAction !== null}
                      onClick={() => {
                        void handleRemove(move.teamId);
                      }}
                    >
                      {busy ? "Removing..." : "Remove"}
                    </button>
                  </div>
                );
              })}
              {visiblePendingPlacements.map((placement) => (
                <div key={placement.id} className="pending-item">
                  <div className="p-avatar" aria-hidden="true" />
                  <div className="p-info">
                    <div className="p-name">
                      <TeamProfileLink
                        href={placement.adminHref}
                        label={placement.teamName}
                      />
                    </div>
                    <div className="p-reason">
                      Pending publish from unverified queue to{" "}
                      {tierLabel(placement.tierId)}
                    </div>
                    <div className="p-staged-copy">
                      {placement.stagedAt
                        ? `Staged ${new Date(placement.stagedAt).toLocaleString()}`
                        : "Waiting for Confirm Moves"}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-copy">No staged moves yet.</div>
          )}
        </section>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <button
            type="button"
            className="dash-card-title dash-accordion-toggle"
            onClick={() => toggle("challenges")}
          >
            <span>Challenge Series Tracker</span>
            {previewSnapshot.challenges.length > 0 && (
              <span className="staged-badge">{previewSnapshot.challenges.length}</span>
            )}
            <span className="dash-chevron">{open.challenges ? "v" : ">"}</span>
          </button>
          {open.challenges ? (
            previewSnapshot.challenges.length > 0 ? (
              previewSnapshot.challenges.map((challenge) => (
                <ChallengeItem
                  key={challenge.id}
                  challenge={challenge}
                  challengerHref={teamPathById.get(challenge.challengerTeamId)}
                  defenderHref={teamPathById.get(challenge.defenderTeamId)}
                />
              ))
            ) : (
              <div className="empty-copy">No active challenge series.</div>
            )
          ) : null}
        </section>

        <section className="dash-card">
          <button
            type="button"
            className="dash-card-title dash-accordion-toggle"
            onClick={() => toggle("inactivity")}
          >
            <span>Inactivity Flags</span>
            {inactiveCount > 0 && (
              <span className="staged-badge">{inactiveCount}</span>
            )}
            <span className="dash-chevron">{open.inactivity ? "v" : ">"}</span>
          </button>
          {open.inactivity ? (
            !midseasonReached ? (
              <div className="empty-copy">Inactivity check starts on the 15th.</div>
            ) : allInactiveTeams.slice(0, 6).length > 0 ? (
              allInactiveTeams.slice(0, 6).map((team) => (
                <div key={team.id} className="pending-item">
                  <div className="p-avatar" aria-hidden="true" />
                  <div className="p-info">
                    <div className="p-name">
                      <TeamProfileLink
                        href={`/teams/${team.slug}`}
                        label={team.name}
                      />
                    </div>
                    <div className="p-reason">
                      {team.inactivityFlag === "red" ? "Red" : team.inactivityFlag === "orange" ? "Orange" : "Yellow"}{" "}
                      inactivity flag
                    </div>
                  </div>
                  <button className="p-action p-review" disabled>
                    Clear
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-copy">
                No inactivity flags in the current preview.
              </div>
            )
          ) : null}
        </section>
      </div>

      <section className="dash-card">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          style={{ marginBottom: 12 }}
          onClick={() => toggle("reviewFlags")}
        >
          <span>Review Flags</span>
          {previewSnapshot.reviewFlags.length > 0 && (
            <span className="staged-badge">{previewSnapshot.reviewFlags.length}</span>
          )}
          <span className="dash-chevron">{open.reviewFlags ? "v" : ">"}</span>
        </button>
        {open.reviewFlags ? (
          previewSnapshot.reviewFlags.length > 0 ? (
            <>
              {previewSnapshot.reviewFlags.map((flag) => {
                const tournament = tournamentById.get(flag.tournamentId);
                const dateLabel = tournament
                  ? tournament.title
                  : new Date(flag.createdAt).toLocaleDateString();
                const busy = busySeriesId === flag.seriesId;
                return (
                  <div key={flag.id} className="pending-item">
                    <div className="p-info" style={{ flex: 1 }}>
                      <div className="p-name">
                        <TeamProfileLink
                          href={teamPathById.get(flag.teamId)}
                          label={`${flag.teamName} (${tierLabel(flag.tierId)})`}
                        />
                        <span style={{ margin: "0 4px", fontWeight: 700 }}>
                          {flag.teamScore}–{flag.opponentScore}
                        </span>
                        <TeamProfileLink
                          href={teamPathById.get(flag.opponentTeamId)}
                          label={`${flag.opponentTeamName} (${tierLabel(flag.opponentTierId)})`}
                        />
                      </div>
                      <div className="p-reason">{reviewReasonLabel(flag.reason)}</div>
                      <div className="p-staged-copy">{dateLabel}</div>
                    </div>
                    <button
                      className="p-action p-down"
                      disabled={busy || busySeriesId !== null}
                      onClick={() => void handleRemoveSeries(flag.seriesId)}
                    >
                      {busy ? "Removing..." : "Remove"}
                    </button>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="empty-copy">No review flags for {selectedSeasonLabel}.</div>
          )
        ) : null}
      </section>

      <section className="dash-card" id="activity-log">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          onClick={() => toggle("activity")}
        >
          <span>Activity Log</span>
          {previewSnapshot.activity.length > 0 && (
            <span className="staged-badge">{previewSnapshot.activity.length}</span>
          )}
          <span className="dash-chevron">{open.activity ? "v" : ">"}</span>
        </button>
        {open.activity ? (
          <>
            <div className="activity-log-toolbar">
              <div className="p-reason">
                Showing actions from {selectedSeasonLabel}
              </div>
              <div className="activity-log-season-filters">
                {availableSeasons.map((season) => (
                  <Link
                    key={season.key}
                    href={`/admin?month=${season.key}#activity-log`}
                    className={`season-chip ${season.key === selectedSeasonKey ? "active" : ""}`}
                  >
                    <span>{season.label}</span>
                    <b>{season.seriesCount} series</b>
                  </Link>
                ))}
              </div>
              <div className="activity-verb-filters">
                {(["all", "movements", "teams", "merges", "tournaments"] as const).map((f) => {
                  const labels = { all: "All", movements: "Moves", teams: "Teams", merges: "Merges", tournaments: "Tourney" };
                  const count = f === "all"
                    ? previewSnapshot.activity.length
                    : previewSnapshot.activity.filter((e) => {
                        if (f === "movements") return e.verb.startsWith("published");
                        if (f === "merges") return e.verb.startsWith("merged");
                        if (f === "tournaments") return e.verb === "logged";
                        if (f === "teams") return ["confirmed", "rejected", "dismissed", "updated team"].includes(e.verb);
                        return true;
                      }).length;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setActivityFilter(f)}
                      className={`season-chip ${activityFilter === f ? "active" : ""}`}
                    >
                      <span>{labels[f]}</span>
                      <b>{count}</b>
                    </button>
                  );
                })}
              </div>
            </div>
            {previewSnapshot.activity.length > 0 ? (
              <div className="activity-log-scroll">
                {previewSnapshot.activity
                  .filter((entry) => {
                    if (activityFilter === "all") return true;
                    if (activityFilter === "movements") return entry.verb.startsWith("published");
                    if (activityFilter === "merges") return entry.verb.startsWith("merged");
                    if (activityFilter === "tournaments") return entry.verb === "logged";
                    if (activityFilter === "teams") return ["confirmed", "rejected", "dismissed", "updated team"].includes(entry.verb);
                    return true;
                  })
                  .map((entry) => (
                    <div key={entry.id} className="pending-item">
                      <div className="p-avatar">
                        {getActorAvatar(entry.actorDisplayName)}
                      </div>
                      <div className="p-info">
                        <div className="p-name">
                          {entry.actorDisplayName} {entry.verb} {entry.subject}
                        </div>
                        <div className="p-reason">
                          {new Date(entry.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="empty-copy">
                No activity recorded for {selectedSeasonLabel}.
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
