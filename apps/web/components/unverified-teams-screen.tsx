import type { DashboardSnapshot } from "@rematch/shared-types";

export function UnverifiedTeamsScreen({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="page">
      <div className="page-title">Unverified Teams · {snapshot.unverifiedTeams.length} awaiting confirmation</div>
      {snapshot.unverifiedTeams.map((team) => (
        <div key={team.normalizedName} className="unv-item">
          <div className="unv-avatar">{team.teamName.slice(0, 2).toUpperCase()}</div>
          <div className="unv-info">
            <div className="unv-name">{team.teamName}</div>
            <div className="unv-meta">
              {team.distinctTournaments} appearances · {team.autoPlaced ? "Auto-placed in Tier 7" : "Not yet placed"} · Last seen{" "}
              {new Date(team.lastSeenAt).toDateString()}
            </div>
            <div className="unv-progress">
              {[0, 1, 2].map((index) => (
                <div key={index} className={`unv-dot ${index < team.distinctTournaments ? "filled" : ""}`} />
              ))}
            </div>
          </div>
          <div className="unv-actions">
            <button className="btn-confirm">✓ Confirm</button>
            <button className="btn-reject">✕ Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
