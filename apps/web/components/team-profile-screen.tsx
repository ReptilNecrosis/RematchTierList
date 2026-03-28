import Link from "next/link";

import type {
  AdminAccount,
  DashboardSnapshot,
  StagedTeamMove,
  Team,
  TeamAllTimeRecord,
  TeamMatchHistoryEntry,
  TeamSeasonRecord,
  TeamTierHistoryEntry
} from "@rematch/shared-types";
import { AccordionCard } from "./accordion-card";
import { LinkedAccordionPair } from "./linked-accordion-pair";
import { TeamProfileAdminActions } from "./team-profile-admin-actions";

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
  selectedSeasonSeries,
  stagedMove,
  viewer
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
  stagedMove?: StagedTeamMove;
  viewer?: AdminAccount | null;
}) {
  const teamStats = snapshot.teamStats[team.id];
  const tier = snapshot.tiers.find((entry) => entry.tier.id === team.tierId)?.tier;
  const teamPath = `/teams/${team.slug}`;
  const teamCard = snapshot.tiers.flatMap((entry) => entry.teams).find((entry) => entry.id === team.id);
  const teamPendingFlag = snapshot.pendingFlags.find((flag) => flag.teamId === team.id);

  return (
    <div className="page">
      <div className="page-title">Team Profile</div>

      <div className="profile-top">
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

        <div className="profile-season-sidebar">
          <div className="dash-card-title"><span>🗓️</span> Season Records</div>
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
        </div>
      </div>

      <div className="profile-grid">
        {viewer ? (
          <AccordionCard title="Admin Actions" className="full-span">
            <div className="team-admin-copy">
              Signed in as {viewer.displayName}. Team actions on this page use the shared admin staging workflow.
            </div>
            {teamPendingFlag ? (
              <div className="team-admin-copy">
                Current rules suggest {teamPendingFlag.movementType} because {teamPendingFlag.reason.replaceAll("_", " ")}.
              </div>
            ) : null}
            <TeamProfileAdminActions
              teamId={team.id}
              teamName={team.name}
              liveTierId={team.tierId}
              stagedMove={stagedMove}
              inactivityFlag={teamCard?.inactivityFlag ?? "none"}
            />
          </AccordionCard>
        ) : null}

        <LinkedAccordionPair
          leftTitle="Tier History"
          leftIcon="📈"
          leftChildren={history.map((entry) => (
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
          rightTitle="Recent Results"
          rightIcon="📋"
          rightChildren={recentSeries.map((entry) => (
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
          ))}
        />

        <AccordionCard
          title={`Full Match History · ${selectedSeasonLabel}`}
          icon="🧾"
          className="full-span"
          openOnHash="season-match-history"
          headerExtra={
            selectedSeasonKey !== currentSeasonKey ? (
              <Link
                href={`${teamPath}?month=${currentSeasonKey}#season-match-history`}
                className="inline-link-button"
              >
                Back to {currentSeasonLabel}
              </Link>
            ) : undefined
          }
        >
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
        </AccordionCard>

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
