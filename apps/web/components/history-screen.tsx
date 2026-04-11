"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useState, type CSSProperties } from "react";

import type { HistoryPageData, TierId } from "@rematch/shared-types";
import { HeadToHeadSearch } from "./head-to-head-search";

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

const tierOrder: TierId[] = ["tier1", "tier2", "tier3", "tier4", "tier5", "tier6", "tier7"];

const tierColors: Record<TierId, string> = {
  tier1: "var(--t1)",
  tier2: "var(--t2)",
  tier3: "var(--t3)",
  tier4: "var(--t4)",
  tier5: "var(--t5)",
  tier6: "var(--t6)",
  tier7: "var(--t7)"
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string) {
  return fullDateFormatter.format(new Date(value));
}

function formatCompactDate(value: string) {
  return compactDateFormatter.format(new Date(value));
}

function formatTierShortLabel(tierId: TierId) {
  return `T${tierId.replace("tier", "")}`;
}

function compareRecordsBySeason(left: HistoryPageData["teamRecords"][number], right: HistoryPageData["teamRecords"][number]) {
  return (
    right.selectedSeason.overallWinRate - left.selectedSeason.overallWinRate ||
    right.selectedSeason.wins - left.selectedSeason.wins ||
    left.teamName.localeCompare(right.teamName)
  );
}

function getTierSeriesCounts(data: HistoryPageData, verifiedTeamIds: Set<string>) {
  const counts = new Map<TierId, number>(tierOrder.map((tierId) => [tierId, 0]));

  data.selectedSeries.forEach((series) => {
    const contributingTiers = new Set<TierId>();

    if (series.teamOneId && verifiedTeamIds.has(series.teamOneId)) {
      contributingTiers.add(series.teamOneTierId);
    }

    if (series.teamTwoId && verifiedTeamIds.has(series.teamTwoId)) {
      contributingTiers.add(series.teamTwoTierId);
    }

    contributingTiers.forEach((tierId) => {
      counts.set(tierId, (counts.get(tierId) ?? 0) + 1);
    });
  });

  return counts;
}

export function HistoryScreen({ data }: { data: HistoryPageData }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(
    data.selectedTournaments[0]?.id ?? null
  );
  const [seriesQuery, setSeriesQuery] = useState("");
  const deferredSeriesQuery = useDeferredValue(seriesQuery.trim().toLowerCase());

  const snapshotByTier = new Map(data.selectedSnapshot.tiers.map((snapshot) => [snapshot.tier.id, snapshot]));

  const tierGroups = tierOrder.map((tierId) => {
    const snapshot = snapshotByTier.get(tierId);
    const records = data.teamRecords.filter((record) => record.tierId === tierId);
    const activeCount = records.filter((record) => record.selectedSeason.seriesPlayed > 0).length;

    return {
      tierId,
      snapshot,
      records,
      activeCount
    };
  });

  const [tierOpen, setTierOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    let hasOpenedTier = false;

    tierGroups.forEach((group) => {
      const shouldOpen = !hasOpenedTier && group.records.length > 0;
      initial[group.tierId] = shouldOpen;
      if (shouldOpen) {
        hasOpenedTier = true;
      }
    });

    return initial;
  });

  const filteredTierGroups = tierGroups
    .map((group) => ({
      ...group,
      filteredRecords: deferredQuery
        ? group.records.filter((record) => record.teamName.toLowerCase().includes(deferredQuery))
        : group.records
    }))
    .filter((group) => !deferredQuery || group.filteredRecords.length > 0);

  const visibleRecordCount = filteredTierGroups.reduce((total, group) => total + group.filteredRecords.length, 0);
  const activeRecords = data.teamRecords.filter((record) => record.selectedSeason.seriesPlayed > 0);
  const featuredRecords = [...activeRecords].sort(compareRecordsBySeason).slice(0, 3);
  const leadingRecord = featuredRecords[0] ?? null;
  const verifiedTeamIds = new Set(
    data.teamRecords.filter((record) => record.verified).map((record) => record.teamId)
  );
  const verificationRate = data.teamRecords.length
    ? Math.round((data.teamRecords.filter((record) => record.verified).length / data.teamRecords.length) * 100)
    : 0;
  const undefeatedCount = activeRecords.filter(
    (record) => record.selectedSeason.wins > 0 && record.selectedSeason.losses === 0
  ).length;
  const activeTierCount = tierGroups.filter((group) => group.activeCount > 0).length;
  const tierSeriesCounts = getTierSeriesCounts(data, verifiedTeamIds);
  const busiestTier =
    tierGroups.length > 0
      ? tierGroups.reduce((best, current) =>
          (tierSeriesCounts.get(current.tierId) ?? 0) > (tierSeriesCounts.get(best.tierId) ?? 0) ? current : best
        )
      : null;
  const tournamentSeries = (() => {
    const base = selectedTournamentId
      ? data.selectedSeries.filter((s) => s.tournamentId === selectedTournamentId)
      : data.selectedSeries.slice(0, 12);
    if (!deferredSeriesQuery) return base;
    return base.filter(
      (s) =>
        s.teamOneName.toLowerCase().includes(deferredSeriesQuery) ||
        s.teamTwoName.toLowerCase().includes(deferredSeriesQuery)
    );
  })();

  return (
    <div className="page history-dashboard">
      <section className="history-hero">
        <div className="history-hero-main">
          <div className="history-section-kicker">History command center</div>
          <h1 className="history-hero-title">Season history for {data.selectedSeasonLabel}</h1>
          <div className="history-hero-metrics">
            <div className="history-metric-card history-tone-gold">
              <span className="history-stat-label">Season series</span>
              <strong className="history-metric-value">{data.selectedSeries.length}</strong>
            </div>
            <div className="history-metric-card history-tone-blue">
              <span className="history-stat-label">Season events</span>
              <strong className="history-metric-value">{data.selectedTournaments.length}</strong>
            </div>
            <div className="history-metric-card history-tone-green">
              <span className="history-stat-label">Teams active</span>
              <strong className="history-metric-value">{activeRecords.length}</strong>
            </div>
            <div className="history-metric-card history-tone-orange">
              <span className="history-stat-label">Review flags</span>
              <strong className="history-metric-value">{data.selectedSnapshot.reviewFlags.length}</strong>
            </div>
          </div>

          <div className="history-season-rail">
            {data.availableSeasons.map((season) => (
              <Link
                key={season.key}
                href={`/history?month=${season.key}`}
                className={`history-season-chip ${season.key === data.selectedSeasonKey ? "active" : ""}`}
              >
                <span className="history-stat-label">Season</span>
                <strong>{season.label}</strong>
                <b>
                  {season.seriesCount} series - {season.tournamentCount} events
                </b>
              </Link>
            ))}
          </div>
        </div>

        <aside className="history-hero-side">
          <section className="history-spotlight-card">
            <div>
              <div className="history-section-kicker">Season pulse</div>
              <div className="dash-card-title">Top performers</div>
            </div>

            {leadingRecord ? (
              <Link
                href={`/teams/${leadingRecord.slug}`}
                className="history-spotlight-leader"
                style={{ "--tc": tierColors[leadingRecord.tierId] } as CSSProperties}
              >
                <div className="history-spotlight-leader-top">
                  <span className="history-stat-label">Current leader</span>
                  <div className="history-spotlight-leader-badges">
                    <span className="history-spotlight-rank">#1</span>
                    <span className="history-spotlight-tier">{formatTierShortLabel(leadingRecord.tierId)}</span>
                  </div>
                </div>
                <div className="history-spotlight-name">{leadingRecord.teamName}</div>
                <div className="history-spotlight-meta">
                  <span>
                    {leadingRecord.selectedSeason.wins}-{leadingRecord.selectedSeason.losses}
                  </span>
                  <span>{formatPercent(leadingRecord.selectedSeason.overallWinRate)} WR</span>
                </div>
              </Link>
            ) : (
              <div className="history-empty-state">No active teams have logged a set in this season yet.</div>
            )}

            <div className="history-spotlight-grid">
              <div className="history-pulse-stat">
                <span className="history-stat-label">Verified</span>
                <strong>{verificationRate}%</strong>
              </div>
              <div className="history-pulse-stat">
                <span className="history-stat-label">Undefeated</span>
                <strong>{undefeatedCount}</strong>
              </div>
              <div className="history-pulse-stat">
                <span className="history-stat-label">Most series</span>
                <strong>{busiestTier?.snapshot?.tier.shortLabel ?? "N/A"}</strong>
              </div>
            </div>

            <div className="history-spotlight-list">
              {featuredRecords.slice(1).map((record, index) => (
                <Link
                  key={record.teamId}
                  href={`/teams/${record.slug}`}
                  className="history-spotlight-item"
                  style={{ "--tc": tierColors[record.tierId] } as CSSProperties}
                >
                  <span className="history-spotlight-rank">#{index + 2}</span>
                  <span className="history-spotlight-item-name">{record.teamName}</span>
                  <span className="history-spotlight-item-metric">{formatPercent(record.selectedSeason.overallWinRate)}</span>
                </Link>
              ))}
            </div>
          </section>
        </aside>

        <div className="history-hero-h2h">
          <HeadToHeadSearch teams={data.allTeams} allSeries={data.allSeries} />
        </div>
      </section>

      <section className="history-command-grid">
        <div className="history-command-main">
          <section className="history-panel history-board-card">
            <div className="history-card-head history-board-head">
              <div>
                <div className="dash-card-title">Team records by tier</div>
              </div>

              <div className="history-board-tools">
                <div className="history-board-count">
                  {visibleRecordCount} of {data.teamRecords.length} teams
                </div>
                <div className="history-board-search-wrap">
                  <svg className="history-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    className="history-board-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search teams…"
                  />
                  {query && (
                    <button type="button" className="history-search-clear" onClick={() => setQuery("")} aria-label="Clear">✕</button>
                  )}
                </div>
              </div>
            </div>

            {filteredTierGroups.length === 0 ? (
              <div className="history-empty-state">No teams match that search.</div>
            ) : (
              <div className="history-tier-stack">
                {filteredTierGroups.map((group) => {
                  const isExpanded = deferredQuery ? true : Boolean(tierOpen[group.tierId]);

                  return (
                    <div
                      key={group.tierId}
                      className={`history-tier-lane${isExpanded ? " open" : ""}`}
                      style={{ "--tc": tierColors[group.tierId] } as CSSProperties}
                    >
                      <button
                        type="button"
                        className="history-tier-toggle"
                        onClick={() => setTierOpen((prev) => ({ ...prev, [group.tierId]: !prev[group.tierId] }))}
                      >
                        <div className="history-tier-rail">
                          <div className="history-tier-short">
                            {group.snapshot?.tier.shortLabel ?? formatTierShortLabel(group.tierId)}
                          </div>
                          <div className="history-tier-name">
                            {group.snapshot?.tier.description ?? group.tierId.toUpperCase()}
                          </div>
                        </div>

                        <div className="history-tier-toggle-main">
                          <div className="history-tier-badges">
                            <span className="history-tier-badge">
                              {deferredQuery ? `${group.filteredRecords.length}/${group.records.length}` : group.records.length} teams
                            </span>
                            <span className="history-tier-badge">{group.activeCount} active</span>
                          </div>
                        </div>

                        <span className={`history-tier-chevron${isExpanded ? " open" : ""}`}>▶</span>
                      </button>

                      {isExpanded ? (
                        <div className="history-tier-content">
                          <div className="history-tier-grid">
                            {group.filteredRecords.map((record) => (
                              <Link key={record.teamId} href={`/teams/${record.slug}`} className="history-record-card">
                                <div className="history-record-top">
                                  <div className="history-record-identity">
                                    <div className="history-record-avatar" aria-hidden={!record.logoUrl || undefined}>
                                      {record.logoUrl ? (
                                        <Image
                                          src={record.logoUrl}
                                          alt={record.teamName}
                                          width={36}
                                          height={36}
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            borderRadius: "inherit"
                                          }}
                                        />
                                      ) : (
                                        <span>{formatTierShortLabel(record.tierId)}</span>
                                      )}
                                    </div>

                                    <div className="history-record-copy">
                                      <div className="history-record-name">{record.teamName}</div>
                                      <div className="history-record-subtitle">
                                        {formatTierShortLabel(record.tierId)} - {record.selectedSeason.seriesPlayed} season series
                                      </div>
                                    </div>
                                  </div>

                                  {!record.verified ? <span className="history-record-flag">Unverified</span> : null}
                                </div>

                                <div className="history-record-grid">
                                  <div className="history-record-stat">
                                    <span>Season</span>
                                    <b>
                                      {record.selectedSeason.wins}-{record.selectedSeason.losses}
                                    </b>
                                  </div>
                                  <div className="history-record-stat">
                                    <span>Win rate</span>
                                    <b>{formatPercent(record.selectedSeason.overallWinRate)}</b>
                                  </div>
                                  <div className="history-record-stat">
                                    <span>All-time</span>
                                    <b>
                                      {record.allTime.wins}-{record.allTime.losses}
                                    </b>
                                  </div>
                                  <div className="history-record-stat">
                                    <span>Last played</span>
                                    <b>{record.allTime.lastPlayedAt ? formatCompactDate(record.allTime.lastPlayedAt) : "Never"}</b>
                                  </div>
                                </div>
                              </Link>
                            ))}

                            {!deferredQuery && group.snapshot?.openSpots
                              ? Array.from({ length: group.snapshot.openSpots }).map((_, index) => (
                                  <div key={`${group.tierId}-open-${index}`} className="history-ghost-slot">
                                    Open slot
                                  </div>
                                ))
                              : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="history-panel history-tournaments-full-card">
            <div className="history-card-head history-side-head">
              <div>
                <div className="dash-card-title">Tournaments in {data.selectedSeasonLabel}</div>
              </div>
              <div className="history-side-count">{data.selectedTournaments.length}</div>
            </div>

            {data.selectedTournaments.length === 0 ? (
              <div className="history-empty-state">No tournaments recorded for this season yet.</div>
            ) : (
              <div className="history-tournaments-full-grid">
                {data.selectedTournaments.map((tournament) => (
                  <button
                    key={tournament.id}
                    type="button"
                    className={`history-event-row history-tournament-btn${selectedTournamentId === tournament.id ? " active" : ""}`}
                    onClick={() => setSelectedTournamentId(tournament.id)}
                  >
                    <div className="history-panel-copy">
                      <div className="history-panel-name">{tournament.title}</div>
                      <div className="history-panel-meta">
                        {formatDate(tournament.eventDate)} - {tournament.sourceLinks.length} source links
                      </div>
                    </div>
                    <div className="history-date-pill">{formatCompactDate(tournament.eventDate)}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="history-panel history-series-full-card">
            <div className="history-card-head history-series-head">
              <div className="dash-card-title">
                {selectedTournamentId
                  ? (data.selectedTournaments.find((t) => t.id === selectedTournamentId)?.title ?? "Confirmed series")
                  : "Latest confirmed series"}
              </div>
              <div className="history-series-search-wrap">
                <svg className="history-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  className="history-series-search-input"
                  value={seriesQuery}
                  onChange={(e) => setSeriesQuery(e.target.value)}
                  placeholder="Search team…"
                />
                {seriesQuery && (
                  <button type="button" className="history-search-clear" onClick={() => setSeriesQuery("")} aria-label="Clear">✕</button>
                )}
              </div>
              <div className="history-side-count">{tournamentSeries.length}</div>
            </div>

            {tournamentSeries.length === 0 ? (
              <div className="history-empty-state">No series recorded for this tournament yet.</div>
            ) : (
              <div className="history-series-full-grid">
                {tournamentSeries.map((series) => {
                  const winnerName =
                    series.teamOneScore > series.teamTwoScore ? series.teamOneName : series.teamTwoName;

                  return (
                    <div key={series.id} className="history-series-row">
                      <div className="history-panel-copy">
                        <div className="history-panel-name">
                          {series.teamOneName} <span className="history-vs">vs</span> {series.teamTwoName}
                        </div>
                        <div className="history-panel-meta">
                          {formatDate(series.playedAt)} - Winner: {winnerName}
                        </div>
                      </div>

                      <div className="history-series-right">
                        <span
                          className="history-mini-tier"
                          style={{ "--tc": tierColors[series.teamOneTierId] } as CSSProperties}
                        >
                          {formatTierShortLabel(series.teamOneTierId)}
                        </span>
                        <span
                          className="history-mini-tier"
                          style={{ "--tc": tierColors[series.teamTwoTierId] } as CSSProperties}
                        >
                          {formatTierShortLabel(series.teamTwoTierId)}
                        </span>
                        <span className="history-score-pill">
                          {series.teamOneScore}-{series.teamTwoScore}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
