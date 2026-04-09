"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminAccount,
  ChallengeSeries,
  DashboardSnapshot,
  TournamentRecord
} from "@rematch/shared-types";
import { PublicTierList } from "./public-tier-list";

function reasonLabel(reason: string) {
  return reason.replaceAll("_", " ");
}

function ChallengeItem({ challenge }: { challenge: ChallengeSeries }) {
  const router = useRouter();

  async function handleConfirm() {
    await fetch("/api/challenges/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(challenge)
    });
    router.refresh();
  }

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  if (challenge.state === "pending") {
    return (
      <div className="challenge-item">
        <div className="ch-teams">
          <div className="ch-vs">
            {challenge.challengerTeamName} <span>vs</span> {challenge.defenderTeamName}
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
            {challenge.challengerTeamName} <span>vs</span> {challenge.defenderTeamName}
          </div>
          <div className="ch-meta">{challenge.reason}</div>
        </div>
        <div className="ch-timer" style={{ color: "var(--accent-red, #ef4444)" }}>
          EXPIRED - outcome pending
        </div>
      </div>
    );
  }

  return (
    <div className="challenge-item">
      <div className="ch-teams">
        <div className="ch-vs">
          {challenge.challengerTeamName} <span>vs</span> {challenge.defenderTeamName}
        </div>
        <div className="ch-meta">{challenge.reason}</div>
      </div>
      <div className="ch-timer ch-warn">{daysLeft} days left</div>
    </div>
  );
}

export function AdminDashboard({
  snapshot,
  viewer
}: {
  snapshot: DashboardSnapshot;
  tournaments: TournamentRecord[];
  viewer: AdminAccount;
}) {
  const router = useRouter();
  const activeChallenges = snapshot.challenges.filter((challenge) => challenge.state === "active");
  const pendingChallenges = snapshot.challenges.filter((challenge) => challenge.state === "pending");

  const [open, setOpen] = useState({
    tierlist: false,
    movements: false,
    challenges: false,
    inactivity: false,
    activity: false
  });
  const [movingTeamId, setMovingTeamId] = useState<string | null>(null);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);

  function toggle(key: "tierlist" | "movements" | "challenges" | "inactivity" | "activity") {
    if (key === "challenges" || key === "inactivity") {
      setOpen((current) => ({ ...current, challenges: !current[key], inactivity: !current[key] }));
    } else {
      setOpen((current) => ({ ...current, [key]: !current[key] }));
    }
  }

  async function handleMovement(teamId: string, movementType: "promotion" | "demotion") {
    setMovingTeamId(teamId);
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, movementType })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not complete the tier move.");
        return;
      }

      setSuccessPopup(payload.message ?? "Team movement completed.");
      router.refresh();
    } catch {
      setErrorPopup("Could not complete the tier move.");
    } finally {
      setMovingTeamId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-title">
        Admin Dashboard - Logged in as {viewer.displayName} ({viewer.role.replace("_", " ")})
      </div>

      <section className="dash-card">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          onClick={() => toggle("tierlist")}
        >
          <span>🏆 Current Standings</span>
          <span className="dash-chevron">{open.tierlist ? "v" : ">"}</span>
        </button>
        {open.tierlist && (
          <PublicTierList
            snapshot={snapshot}
            lastUpdatedLabel="Live"
            defaultAllExpanded
          />
        )}
      </section>

      {errorPopup ? (
        <div className="modal-overlay" onClick={() => setErrorPopup(null)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">Cannot Complete Action</div>
            <div className="modal-body">{errorPopup}</div>
            <button className="btn-login" type="button" onClick={() => setErrorPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {successPopup ? (
        <div className="modal-overlay" onClick={() => setSuccessPopup(null)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title modal-title-success">Movement Completed</div>
            <div className="modal-body">{successPopup}</div>
            <button className="btn-login" type="button" onClick={() => setSuccessPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Total Teams</div>
          <div className="stat-value">
            {snapshot.tiers.reduce((count, tier) => count + tier.teams.length, 0)}
          </div>
          <div className="stat-sub">Across 7 tiers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Actions</div>
          <div className="stat-value accent-yellow">{snapshot.pendingFlags.length}</div>
          <div className="stat-sub">Require review</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Challenges</div>
          <div className="stat-value accent-blue">{activeChallenges.length}</div>
          <div className="stat-sub">
            {pendingChallenges.length > 0
              ? `${pendingChallenges.length} awaiting confirmation`
              : "Series in progress"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unverified Teams</div>
          <div className="stat-value accent-violet">{snapshot.unverifiedTeams.length}</div>
          <div className="stat-sub">Awaiting confirmation</div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <button
            type="button"
            className="dash-card-title dash-accordion-toggle"
            onClick={() => toggle("movements")}
          >
            <span>Pending Movements</span>
            <span className="dash-chevron">{open.movements ? "v" : ">"}</span>
          </button>
          {open.movements &&
            snapshot.pendingFlags.slice(0, 5).map((flag) => (
              <div key={flag.id} className="pending-item">
                <div className="p-avatar">{flag.teamName.slice(0, 2).toUpperCase()}</div>
                <div className="p-info">
                  <div className="p-name">{flag.teamName}</div>
                  <div className="p-reason">
                    {flag.movementType === "promotion" ? "Promotion" : "Demotion"} -{" "}
                    {reasonLabel(flag.reason)}
                  </div>
                  {flag.recentManualMoveAt ? (
                    <div className="p-recent-move">Moved &lt;24h ago</div>
                  ) : null}
                </div>
                <button
                  className={`p-action ${flag.movementType === "promotion" ? "p-up" : "p-down"}`}
                  disabled={movingTeamId === flag.teamId}
                  onClick={() => {
                    void handleMovement(flag.teamId, flag.movementType);
                  }}
                >
                  {movingTeamId === flag.teamId
                    ? flag.movementType === "promotion"
                      ? "Promoting..."
                      : "Demoting..."
                    : flag.movementType === "promotion"
                      ? "Promote"
                      : "Demote"}
                </button>
              </div>
            ))}
        </section>

        <section className="dash-card">
          <button
            type="button"
            className="dash-card-title dash-accordion-toggle"
            onClick={() => toggle("challenges")}
          >
            <span>Challenge Series Tracker</span>
            <span className="dash-chevron">{open.challenges ? "v" : ">"}</span>
          </button>
          {open.challenges &&
            snapshot.challenges.map((challenge) => (
              <ChallengeItem key={challenge.id} challenge={challenge} />
            ))}
        </section>
      </div>

      <section className="dash-card">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          onClick={() => toggle("inactivity")}
        >
          <span>Inactivity Flags</span>
          <span className="dash-chevron">{open.inactivity ? "v" : ">"}</span>
        </button>
        {open.inactivity &&
          snapshot.tiers
            .flatMap((tier) => tier.teams)
            .filter((team) => team.inactivityFlag !== "none")
            .slice(0, 4)
            .map((team) => (
              <div key={team.id} className="pending-item">
                <div className="p-avatar" aria-hidden="true" />
                <div className="p-info">
                  <div className="p-name">{team.name}</div>
                  <div className="p-reason">
                    {team.inactivityFlag === "red" ? "Red" : "Yellow"} inactivity flag
                  </div>
                </div>
                <button className="p-action p-review">Clear</button>
              </div>
            ))}
      </section>

      <section className="dash-card">
        <button
          type="button"
          className="dash-card-title dash-accordion-toggle"
          onClick={() => toggle("activity")}
        >
          <span>Activity Log</span>
          <span className="dash-chevron">{open.activity ? "v" : ">"}</span>
        </button>
        {open.activity &&
          snapshot.activity.map((entry) => (
            <div key={entry.id} className="pending-item">
              <div className="p-info">
                <div className="p-name">
                  {entry.actorUsername} {entry.verb} {entry.subject}
                </div>
                <div className="p-reason">{new Date(entry.createdAt).toDateString()}</div>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
