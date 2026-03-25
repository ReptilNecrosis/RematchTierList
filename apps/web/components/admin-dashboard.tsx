"use client";

import { useRouter } from "next/navigation";
import type { AdminAccount, ChallengeSeries, DashboardSnapshot, TournamentRecord } from "@rematch/shared-types";

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
    Math.ceil(
      (new Date(challenge.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
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
          EXPIRED — outcome pending
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
  tournaments,
  viewer
}: {
  snapshot: DashboardSnapshot;
  tournaments: TournamentRecord[];
  viewer: AdminAccount;
}) {
  const activeChallenges = snapshot.challenges.filter((c) => c.state === "active");
  const pendingChallenges = snapshot.challenges.filter((c) => c.state === "pending");

  return (
    <div className="page">
      <div className="page-title">
        Admin Dashboard · Logged in as {viewer.displayName} ({viewer.role.replace("_", " ")})
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Total Teams</div>
          <div className="stat-value">{snapshot.tiers.reduce((count, tier) => count + tier.teams.length, 0)}</div>
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
          <div className="dash-card-title">
            <span>⚠️</span> Pending Movements
          </div>
          {snapshot.pendingFlags.slice(0, 5).map((flag) => (
            <div key={flag.id} className="pending-item">
              <div className="p-avatar">{flag.teamName.slice(0, 2).toUpperCase()}</div>
              <div className="p-info">
                <div className="p-name">{flag.teamName}</div>
                <div className="p-reason">
                  {flag.movementType === "promotion" ? "Promotion" : "Demotion"} · {reasonLabel(flag.reason)}
                </div>
              </div>
              <button className={`p-action ${flag.movementType === "promotion" ? "p-up" : "p-down"}`}>
                {flag.movementType === "promotion" ? "▲ Promote" : "▼ Demote"}
              </button>
            </div>
          ))}
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>🚩</span> Challenge Series Tracker
          </div>
          {snapshot.challenges.map((challenge) => (
            <ChallengeItem key={challenge.id} challenge={challenge} />
          ))}
        </section>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <div className="dash-card-title">
            <span>📋</span> Recent Match History
          </div>
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="pending-item">
              <div className="p-avatar">📸</div>
              <div className="p-info">
                <div className="p-name">{tournament.title} logged</div>
                <div className="p-reason">{new Date(tournament.eventDate).toDateString()}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>🚨</span> Inactivity Flags
          </div>
          {snapshot.tiers
            .flatMap((tier) => tier.teams)
            .filter((team) => team.inactivityFlag !== "none")
            .slice(0, 4)
            .map((team) => (
              <div key={team.id} className="pending-item">
                <div className="p-avatar">{team.shortCode}</div>
                <div className="p-info">
                  <div className="p-name">{team.name}</div>
                  <div className="p-reason">
                    {team.inactivityFlag === "red" ? "🔴" : "🟡"} {team.inactivityFlag} inactivity flag
                  </div>
                </div>
                <button className="p-action p-review">Clear</button>
              </div>
            ))}
        </section>
      </div>

      <section className="dash-card">
        <div className="dash-card-title">
          <span>🧾</span> Activity Log
        </div>
        {snapshot.activity.map((entry) => (
          <div key={entry.id} className="pending-item">
            <div className="p-avatar">{entry.actorUsername.slice(0, 2).toUpperCase()}</div>
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
