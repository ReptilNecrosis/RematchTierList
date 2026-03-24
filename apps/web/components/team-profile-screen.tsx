import Link from "next/link";

import type {
  DashboardSnapshot,
  Team,
  TeamAllTimeRecord,
  TeamMatchHistoryEntry,
  TeamSeasonRecord,
  TeamTierHistoryEntry
} from "@rematch/shared-types";

export function TeamProfileScreen({
  team,
  snapshot,
  history,
  recentSeries,
  seasonRecords,
  allTimeRecord,
  currentSeasonKey,
  currentSeasonLabel,
  selectedSeasonKey,
  selectedSeasonLabel,
  selectedSeasonSeries
}: {
  team: Team;
  snapshot: DashboardSnapshot;
  history: TeamTierHistoryEntry[];
  recentSeries: TeamMatchHistoryEntry[];
  seasonRecords: TeamSeasonRecord[];
  allTimeRecord: TeamAllTimeRecord | null;
  currentSeasonKey: string;
  currentSeasonLabel: string;
  selectedSeasonKey: string;
  selectedSeasonLabel: string;
  selectedSeasonSeries: TeamMatchHistoryEntry[];
}) {
  const teamStats = snapshot.teamStats[team.id];
  const tier = snapshot.tiers.find((entry) => entry.tier.id === team.tierId)?.tier;
  const teamPath = `/teams/${team.slug}`;

  return (
    <div className="page">
      <div className="page-title">Team Profile</div>
      <div className="profile-header">
        <div className="profile-avatar">{team.shortCode}</div>
        <div>
          <div className="profile-name">{team.name}</div>
          <div className="profile-tier">
            {tier?.icon} {tier?.label} · {team.verified ? "Verified" : "Unverified"}
          </div>
          <div className="profile-sub">Added by {team.addedBy} · {new Date(team.createdAt).toDateString()}</div>
        </div>
        <div className="profile-stats">
          <div className="ps">
            <div className="ps-val accent-green">{Math.round((teamStats?.overallWinRate ?? 0) * 100)}%</div>
            <div className="ps-label">Current Month WR</div>
          </div>
          <div className="ps">
            <div className="ps-val">{allTimeRecord?.wins ?? 0}</div>
            <div className="ps-label">All-Time Wins</div>
          </div>
          <div className="ps">
            <div className="ps-val">{allTimeRecord?.losses ?? 0}</div>
            <div className="ps-label">All-Time Losses</div>
          </div>
          <div className="ps">
            <div className="ps-val accent-blue">{(teamStats?.oneTierUpWins ?? 0) + (teamStats?.twoTierUpWins ?? 0)}</div>
            <div className="ps-label">Cross-Tier Wins</div>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <section className="dash-card">
          <div className="dash-card-title">
            <span>📈</span> Tier History
          </div>
          {history.map((entry) => (
            <div key={entry.id} className="history-item">
              <div className="h-icon">{entry.movementType === "promotion" ? "🏆" : "⚔️"}</div>
              <div className="h-info">
                <div className="p-name">
                  {entry.movementType === "placement" ? "Placed" : entry.movementType === "promotion" ? "Promoted" : "Moved"} to{" "}
                  {entry.toTierId.toUpperCase()}
                </div>
                <div className="h-date">
                  {new Date(entry.createdAt).toDateString()} · {entry.reason}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>🗓️</span> Season Records
          </div>
          <div className="season-card-list">
            {seasonRecords.map((record) => (
              <Link
                key={record.seasonKey}
                href={`${teamPath}?month=${record.seasonKey}#season-match-history`}
                className={`season-card season-card-link ${record.seasonKey === selectedSeasonKey ? "active" : ""}`}
              >
                <div className="season-card-title">{record.seasonLabel}</div>
                <div className="season-card-meta">
                  {record.wins}-{record.losses} · {record.seriesPlayed} series
                </div>
                <div className="season-card-grid">
                  <div className="season-card-stat">
                    <span>Overall</span>
                    <b>{Math.round(record.overallWinRate * 100)}%</b>
                  </div>
                  <div className="season-card-stat">
                    <span>Same Tier</span>
                    <b>{Math.round(record.sameTierWinRate * 100)}%</b>
                  </div>
                  <div className="season-card-stat">
                    <span>+1 Tier</span>
                    <b>{Math.round(record.oneTierUpWinRate * 100)}%</b>
                  </div>
                  <div className="season-card-stat">
                    <span>-1 Tier</span>
                    <b>{Math.round(record.oneTierDownWinRate * 100)}%</b>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">
              <span>📋</span> Recent Results
            </div>
            <Link
              href={`${teamPath}?month=${currentSeasonKey}#season-match-history`}
              className="inline-link-button"
            >
              Show all {currentSeasonLabel}
            </Link>
          </div>
          {recentSeries.map((entry) => {
            return (
              <div key={entry.id} className="history-item">
                <div className="h-icon">{entry.won ? "✅" : "❌"}</div>
                <div className="h-info">
                  <div className="p-name">
                    {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                  </div>
                  <div className="h-date">
                    {new Date(entry.playedAt).toDateString()} · {entry.tournamentTitle} · {entry.teamScore}-{entry.opponentScore}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="dash-card full-span" id="season-match-history">
          <div className="dash-card-head">
            <div className="dash-card-title">
              <span>🧾</span> Full Match History · {selectedSeasonLabel}
            </div>
            {selectedSeasonKey !== currentSeasonKey ? (
              <Link href={`${teamPath}?month=${currentSeasonKey}#season-match-history`} className="inline-link-button">
                Back to {currentSeasonLabel}
              </Link>
            ) : null}
          </div>
          {selectedSeasonSeries.length === 0 ? (
            <div className="empty-copy">No matches recorded for {selectedSeasonLabel}.</div>
          ) : (
            <div className="season-history-list">
              {selectedSeasonSeries.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div className="history-line">
                    <div className="season-history-main">
                      <div className="h-icon">{entry.won ? "✅" : "❌"}</div>
                      <div className="h-info">
                        <div className="p-name">
                          {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                        </div>
                        <div className="h-date">
                          {new Date(entry.playedAt).toDateString()} · {entry.tournamentTitle} · Opponent {entry.opponentTierId.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="season-record-pill">
                      {entry.teamScore}-{entry.opponentScore}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dash-card full-span">
          <div className="dash-card-title">
            <span>📝</span> Admin Notes
          </div>
          <div className="note-copy">
            {team.notes ??
              "Strong consistent performers. Keep an eye on challenge outcomes and cross-tier upsets when reviewing movement flags."}
          </div>
        </section>
      </div>
    </div>
  );
}
