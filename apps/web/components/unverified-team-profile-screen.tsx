import Link from "next/link";

import type { UnverifiedTeamPageData } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

import { CheckIcon, XIcon } from "./icons";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function UnverifiedTeamProfileScreen({ data }: { data: UnverifiedTeamPageData }) {
  const profile = data.profile;

  if (!profile) {
    return (
      <div className="page">
        <div className="page-title">Unverified Team Profile</div>
        <div className="dash-card">
          <div className="empty-copy">This unverified team is no longer pending in the review queue.</div>
          <Link href="/admin/unverified" className="inline-link-button" style={{ marginTop: 16 }}>
            Back to unverified queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-title">Unverified Team Profile</div>
      <div className="profile-header">
        <div className="profile-avatar" aria-hidden="true" />
        <div>
          <div className="profile-name">{profile.teamName}</div>
          <div className="profile-tier">Pending admin review · Unverified queue</div>
          <div className="profile-sub">
            First seen {new Date(profile.firstSeenAt).toDateString()} · Last seen{" "}
            {new Date(profile.lastSeenAt).toDateString()}
          </div>
          <div className="profile-sub">
            {profile.autoPlaced
              ? "Ready for admin placement after 3+ tournament appearances."
              : `Auto-placement progress: ${Math.min(profile.distinctTournaments, 3)}/3 tournaments.`}
          </div>
          <div className="profile-sub">
            {profile.suggestedTierId
              ? `Suggested tier ${TIER_DEFINITIONS.find((tier) => tier.id === profile.suggestedTierId)?.shortLabel ?? profile.suggestedTierId.toUpperCase()} · ${formatPercent(profile.suggestedTierWinRate ?? 0)} win rate across ${profile.suggestedTierSeriesCount ?? 0} verified-team series`
              : "Suggested tier unavailable until enough verified-team series are recorded."}
          </div>
        </div>
        <div className="profile-stats">
          <div className="ps">
            <div className="ps-val">{profile.appearances}</div>
            <div className="ps-label">Appearances</div>
          </div>
          <div className="ps">
            <div className="ps-val">{profile.distinctTournaments}</div>
            <div className="ps-label">Tournaments</div>
          </div>
          <div className="ps">
            <div className="ps-val accent-green">{data.allTimeRecord.wins}</div>
            <div className="ps-label">All-Time Wins</div>
          </div>
          <div className="ps">
            <div className="ps-val">{data.allTimeRecord.losses}</div>
            <div className="ps-label">All-Time Losses</div>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <section className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">
              <span>📋</span> Queue Status
            </div>
            <Link href="/admin/unverified" className="inline-link-button">
              Back to queue
            </Link>
          </div>
          <div className="note-copy">
            This page is read-only review context for the pending unverified team. Confirm or reject actions still
            happen from the unverified queue.
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>📊</span> Win Ratio By Opponent Tier
          </div>
          <div className="record-list">
            {data.tierBreakdown.map((row) => {
              const tier = TIER_DEFINITIONS.find((entry) => entry.id === row.tierId);
              return (
                <div key={row.tierId} className="record-row">
                  <div className="record-main">
                    <div className="record-avatar">{tier?.shortLabel.replace("Tier ", "T").replace("Unverified", "UNV") ?? row.tierId.toUpperCase()}</div>
                    <div>
                      <div className="p-name">{tier?.shortLabel ?? row.tierId.toUpperCase()}</div>
                      <div className="p-reason">{row.seriesPlayed} series recorded</div>
                    </div>
                  </div>
                  <div className="record-metrics">
                    <div className="season-metric">
                      <span>Wins</span>
                      <b>{row.wins}</b>
                    </div>
                    <div className="season-metric">
                      <span>Losses</span>
                      <b>{row.losses}</b>
                    </div>
                    <div className="season-metric">
                      <span>Record</span>
                      <b>
                        {row.wins}-{row.losses}
                      </b>
                    </div>
                    <div className="season-metric">
                      <span>Win Rate</span>
                      <b>{formatPercent(row.winRate)}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>🗓️</span> Season Records
          </div>
          <div className="season-card-list">
            {data.availableSeasons.map((season) => (
              <Link
                key={season.key}
                href={`/admin/unverified/${encodeURIComponent(profile.normalizedName)}?month=${season.key}#season-match-history`}
                className={`season-card season-card-link ${season.key === data.selectedSeasonKey ? "active" : ""}`}
              >
                <div className="season-card-title">{season.label}</div>
                <div className="season-card-meta">
                  {season.seriesCount} series · {season.tournamentCount} events
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">
              <span>📌</span> Recent Results
            </div>
            <Link
              href={`/admin/unverified/${encodeURIComponent(profile.normalizedName)}?month=${data.currentSeasonKey}#season-match-history`}
              className="inline-link-button"
            >
              Show all {data.currentSeasonLabel}
            </Link>
          </div>
          {data.recentSeries.length === 0 ? (
            <div className="empty-copy">No confirmed matches recorded for {data.currentSeasonLabel}.</div>
          ) : (
            data.recentSeries.map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="h-icon">{entry.won ? <CheckIcon /> : <XIcon />}</div>
                <div className="h-info">
                  <div className="p-name">
                    {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                  </div>
                  <div className="h-date">
                    {new Date(entry.playedAt).toDateString()} · {entry.tournamentTitle} · Opponent{" "}
                    {entry.opponentTierId.toUpperCase()}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="dash-card full-span" id="season-match-history">
          <div className="dash-card-head">
            <div className="dash-card-title">
              <span>🧾</span> Full Match History · {data.selectedSeasonLabel}
            </div>
            {data.selectedSeasonKey !== data.currentSeasonKey ? (
              <Link
                href={`/admin/unverified/${encodeURIComponent(profile.normalizedName)}?month=${data.currentSeasonKey}#season-match-history`}
                className="inline-link-button"
              >
                Back to {data.currentSeasonLabel}
              </Link>
            ) : null}
          </div>
          {data.selectedSeasonSeries.length === 0 ? (
            <div className="empty-copy">No matches recorded for {data.selectedSeasonLabel}.</div>
          ) : (
            <div className="season-history-list">
              {data.selectedSeasonSeries.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div className="history-line">
                    <div className="season-history-main">
                      <div className="h-icon">{entry.won ? <CheckIcon /> : <XIcon />}</div>
                      <div className="h-info">
                        <div className="p-name">
                          {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                        </div>
                        <div className="h-date">
                          {new Date(entry.playedAt).toDateString()} · {entry.tournamentTitle} · Opponent{" "}
                          {entry.opponentTierId.toUpperCase()}
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
      </div>
    </div>
  );
}
