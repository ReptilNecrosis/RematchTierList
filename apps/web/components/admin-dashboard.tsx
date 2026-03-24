import type { AdminAccount, DashboardSnapshot, TournamentRecord } from "@rematch/shared-types";

function reasonLabel(reason: string) {
  return reason.replaceAll("_", " ");
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
          <div className="stat-value accent-blue">{snapshot.challenges.length}</div>
          <div className="stat-sub">Series in progress</div>
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
            <div key={challenge.id} className="challenge-item">
              <div className="ch-teams">
                <div className="ch-vs">
                  {challenge.challengerTeamName} <span>vs</span> {challenge.defenderTeamName}
                </div>
                <div className="ch-meta">{challenge.reason}</div>
              </div>
              <div className="ch-timer ch-warn">
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(challenge.expiresAt).getTime() - new Date("2026-03-22T12:00:00.000Z").getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                )}{" "}
                days left
              </div>
            </div>
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
