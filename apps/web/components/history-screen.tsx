"use client";

import Link from "next/link";
import { useState } from "react";

import type { HistoryPageData, TierId } from "@rematch/shared-types";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const tierOrder: TierId[] = ["tier1", "tier2", "tier3", "tier4", "tier5", "tier6", "tier7"];

const tierColors: Record<string, string> = {
  tier1: "var(--t1)",
  tier2: "var(--t2)",
  tier3: "var(--t3)",
  tier4: "var(--t4)",
  tier5: "var(--t5)",
  tier6: "var(--t6)",
  tier7: "var(--t7)",
};

export function HistoryScreen({ data }: { data: HistoryPageData }) {
  const recordsByTier = tierOrder
    .map((tid) => ({ tierId: tid, records: data.teamRecords.filter((r) => r.tierId === tid) }))
    .filter((g) => g.records.length > 0);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    recordsByTier.forEach((g, i) => {
      initial[g.tierId] = i === 0;
    });
    return initial;
  });

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

      <section className="dash-card full-span">
        <button
          type="button"
          className="dash-accordion-toggle"
          style={{ width: "100%" }}
          onClick={() => setHistoryOpen((o) => !o)}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", flex: 1 }}>
            <span className="dash-card-title" style={{ margin: 0 }}>🏟️ Tournaments In {data.selectedSeasonLabel}</span>
            <span className="dash-card-title" style={{ margin: 0 }}>🧾 Recent Series In {data.selectedSeasonLabel}</span>
          </div>
          <span className="dash-chevron">{historyOpen ? "▼" : "▶"}</span>
        </button>
        {historyOpen && (
          <div className="dash-grid" style={{ marginTop: "0.75rem" }}>
            <div>
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
            </div>
            <div>
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
            </div>
          </div>
        )}
      </section>

      <section className="dash-card full-span">
        <div className="dash-card-title">
          <span>📊</span> Team Records
        </div>
        {recordsByTier.map(({ tierId, records }) => (
          <div key={tierId}>
            <button
              type="button"
              className="tier-accordion-btn"
              style={{ "--tc": tierColors[tierId] } as React.CSSProperties}
              onClick={() => setTierOpen((prev) => ({ ...prev, [tierId]: !prev[tierId] }))}
            >
              <span className="tier-acc-label">{tierId.replace("tier", "TIER ")}</span>
              <span className="tier-acc-count">{records.length} teams</span>
              <span className={`tier-acc-chevron${tierOpen[tierId] ? " open" : ""}`}>▶</span>
            </button>
            {tierOpen[tierId] && (
              <div className="record-list" style={{ paddingTop: "0.75rem" }}>
                {records.map((record) => (
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
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
