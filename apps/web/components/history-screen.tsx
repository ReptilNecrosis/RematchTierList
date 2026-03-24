"use client";

import Link from "next/link";

import type { HistoryPageData } from "@rematch/shared-types";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function HistoryScreen({ data }: { data: HistoryPageData }) {
  return (
    <div className="page">
      <div className="page-title">
        Season History · {data.selectedSeasonLabel} · {data.totalSeriesCount} total series logged
      </div>

      <div className="history-filters">
        {data.availableSeasons.map((season) => (
          <Link
            key={season.key}
            href={`/history?month=${season.key}`}
            className={`season-chip ${season.key === data.selectedSeasonKey ? "active" : ""}`}
          >
            <span>{season.label}</span>
            <b>
              {season.seriesCount} series · {season.tournamentCount} events
            </b>
          </Link>
        ))}
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Season Series</div>
          <div className="stat-value">{data.selectedSeries.length}</div>
          <div className="stat-sub">{data.selectedSeasonLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Season Events</div>
          <div className="stat-value accent-blue">{data.selectedTournaments.length}</div>
          <div className="stat-sub">Imported tournaments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Teams Active</div>
          <div className="stat-value accent-green">
            {data.teamRecords.filter((team) => team.selectedSeason.seriesPlayed > 0).length}
          </div>
          <div className="stat-sub">Played at least one series</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Review Flags</div>
          <div className="stat-value accent-yellow">{data.selectedSnapshot.reviewFlags.length}</div>
          <div className="stat-sub">3+ tier gap results</div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <div className="dash-card-title">
            <span>🏟️</span> Tournaments In {data.selectedSeasonLabel}
          </div>
          {data.selectedTournaments.length === 0 ? (
            <div className="empty-copy">No tournaments recorded for this month yet.</div>
          ) : (
            data.selectedTournaments.map((tournament) => (
              <div key={tournament.id} className="history-item">
                <div className="history-line">
                  <div>
                    <div className="p-name">{tournament.title}</div>
                    <div className="p-reason">{new Date(tournament.eventDate).toDateString()}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>🧾</span> Recent Series In {data.selectedSeasonLabel}
          </div>
          {data.selectedSeries.length === 0 ? (
            <div className="empty-copy">No series recorded for this month yet.</div>
          ) : (
            data.selectedSeries.slice(0, 10).map((series) => {
              const winnerName =
                series.teamOneScore > series.teamTwoScore ? series.teamOneName : series.teamTwoName;
              return (
                <div key={series.id} className="history-item">
                  <div className="history-line">
                    <div>
                      <div className="p-name">
                        {series.teamOneName} <span className="versus">vs</span> {series.teamTwoName}
                      </div>
                      <div className="p-reason">
                        {new Date(series.playedAt).toDateString()} · Winner: {winnerName}
                      </div>
                    </div>
                    <div className="season-record-pill">
                      {series.teamOneScore}-{series.teamTwoScore}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <section className="dash-card full-span">
        <div className="dash-card-title">
          <span>📊</span> Team Records
        </div>
        <div className="record-list">
          {data.teamRecords.map((record) => (
            <Link key={record.teamId} href={`/teams/${record.slug}`} className="record-row">
              <div className="record-main">
                <div className="record-avatar">{record.shortCode}</div>
                <div>
                  <div className="p-name">
                    {record.teamName} {!record.verified ? <span className="record-unverified">UNVERIFIED</span> : null}
                  </div>
                  <div className="p-reason">
                    {record.tierId.toUpperCase()} · {record.selectedSeason.seriesPlayed} series this month
                  </div>
                </div>
              </div>
              <div className="record-metrics">
                <div className="season-metric">
                  <span>Season</span>
                  <b>
                    {record.selectedSeason.wins}-{record.selectedSeason.losses}
                  </b>
                </div>
                <div className="season-metric">
                  <span>Season WR</span>
                  <b>{formatPercent(record.selectedSeason.overallWinRate)}</b>
                </div>
                <div className="season-metric">
                  <span>All-Time</span>
                  <b>
                    {record.allTime.wins}-{record.allTime.losses}
                  </b>
                </div>
                <div className="season-metric">
                  <span>Last Played</span>
                  <b>{record.allTime.lastPlayedAt ? new Date(record.allTime.lastPlayedAt).toDateString() : "Never"}</b>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
