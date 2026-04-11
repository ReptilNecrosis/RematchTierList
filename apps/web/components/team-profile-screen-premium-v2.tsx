"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";

import { TIER_DEFINITIONS } from "@rematch/rules-engine";
import type {
  AdminAccount,
  DashboardSnapshot,
  HeadToHeadTeam,
  OpponentTierBreakdownRow,
  SeriesResult,
  StagedTeamMove,
  Team,
  TeamAllTimeRecord,
  TeamMatchHistoryEntry,
  TeamSeasonRecord,
  TeamTierHistoryEntry,
} from "@rematch/shared-types";

import { AccordionCard } from "./accordion-card";
import { HeadToHeadSearch } from "./head-to-head-search";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  XIcon,
} from "./icons";
import { LinkedAccordionPair } from "./linked-accordion-pair";
import { TeamProfileAdminActions } from "./team-profile-admin-actions";

type BreakdownView = "month" | "all-time";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getTierRank(tierId: Team["tierId"]) {
  return Number.parseInt(tierId.replace("tier", ""), 10);
}

function getTeamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getWinRateTone(record: TeamSeasonRecord | null) {
  if (!record || record.seriesPlayed === 0) {
    return "empty";
  }

  if (record.overallWinRate < 0.25) {
    return "danger";
  }

  if (record.overallWinRate > 0.75) {
    return "success";
  }

  return "warning";
}

function buildAllTimeSeasonRecord(args: {
  teamId: string;
  allSeries: SeriesResult[];
}): TeamSeasonRecord {
  let wins = 0;
  let losses = 0;
  let sameTierWins = 0;
  let sameTierGames = 0;
  let oneTierUpWins = 0;
  let oneTierUpGames = 0;
  let oneTierDownWins = 0;
  let oneTierDownGames = 0;
  let lastPlayedAt: string | null = null;

  for (const entry of args.allSeries) {
    if (!entry.confirmed) {
      continue;
    }

    const isTeamOne = entry.teamOneId === args.teamId;
    const isTeamTwo = entry.teamTwoId === args.teamId;
    if (!isTeamOne && !isTeamTwo) {
      continue;
    }

    lastPlayedAt =
      lastPlayedAt === null || entry.playedAt.localeCompare(lastPlayedAt) > 0
        ? entry.playedAt
        : lastPlayedAt;

    const teamScore = isTeamOne ? entry.teamOneScore : entry.teamTwoScore;
    const opponentScore = isTeamOne ? entry.teamTwoScore : entry.teamOneScore;
    const won = teamScore > opponentScore;

    if (won) {
      wins += 1;
    } else {
      losses += 1;
    }

    const teamTierRank = getTierRank(
      isTeamOne ? entry.teamOneTierId : entry.teamTwoTierId,
    );
    const opponentTierRank = getTierRank(
      isTeamOne ? entry.teamTwoTierId : entry.teamOneTierId,
    );
    const tierGap = Math.abs(teamTierRank - opponentTierRank);

    if (tierGap === 0) {
      sameTierGames += 1;
      if (won) {
        sameTierWins += 1;
      }
    } else if (tierGap === 1) {
      if (teamTierRank > opponentTierRank) {
        oneTierUpGames += 1;
        if (won) {
          oneTierUpWins += 1;
        }
      } else {
        oneTierDownGames += 1;
        if (won) {
          oneTierDownWins += 1;
        }
      }
    }
  }

  const seriesPlayed = wins + losses;

  return {
    seasonKey: "all-time",
    seasonLabel: "All Time",
    wins,
    losses,
    seriesPlayed,
    sameTierWinRate: sameTierGames > 0 ? sameTierWins / sameTierGames : 0,
    overallWinRate: seriesPlayed > 0 ? wins / seriesPlayed : 0,
    oneTierUpWinRate: oneTierUpGames > 0 ? oneTierUpWins / oneTierUpGames : 0,
    oneTierDownWinRate:
      oneTierDownGames > 0 ? oneTierDownWins / oneTierDownGames : 0,
    inactivityFlag: "none",
    removalFlag: false,
    lastPlayedAt,
  };
}

function renderSeasonRecordCardContent(record: TeamSeasonRecord) {
  return (
    <>
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
    </>
  );
}

function BreakdownViewToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: BreakdownView;
  onChange: (value: BreakdownView) => void;
  ariaLabel: string;
}) {
  return (
    <div className="profile-view-toggle" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={`profile-view-toggle-button${value === "month" ? " active" : ""}`}
        aria-pressed={value === "month"}
        onClick={() => onChange("month")}
      >
        Month
      </button>
      <button
        type="button"
        className={`profile-view-toggle-button${value === "all-time" ? " active" : ""}`}
        aria-pressed={value === "all-time"}
        onClick={() => onChange("all-time")}
      >
        All Time
      </button>
    </div>
  );
}

function TierBreakdownContent({
  rows,
  view,
  onViewChange,
  selectedSeasonLabel,
  ariaLabel,
}: {
  rows: OpponentTierBreakdownRow[];
  view: BreakdownView;
  onViewChange: (value: BreakdownView) => void;
  selectedSeasonLabel: string;
  ariaLabel: string;
}) {
  return (
    <>
      <div className="profile-breakdown-toolbar">
        <div className="profile-breakdown-meta">
          {view === "month"
            ? `Showing ${selectedSeasonLabel}`
            : "Showing all confirmed series"}
        </div>
        <BreakdownViewToggle
          value={view}
          onChange={onViewChange}
          ariaLabel={ariaLabel}
        />
      </div>
      <div className="record-list">
        {rows.map((row) => {
          const tier = TIER_DEFINITIONS.find(
            (entry) => entry.id === row.tierId,
          );
          return (
            <div
              key={row.tierId}
              className="record-row team-profile-record-row"
            >
              <div className="record-main">
                <div className="record-avatar">
                  {tier?.shortLabel
                    .replace("Tier ", "T")
                    .replace("Unverified", "UNV") ?? row.tierId.toUpperCase()}
                </div>
                <div>
                  <div className="p-name">
                    {tier?.shortLabel ?? row.tierId.toUpperCase()}
                  </div>
                  <div className="p-reason">
                    {row.seriesPlayed} series recorded
                  </div>
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
    </>
  );
}

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
  tierBreakdown,
  allTimeTierBreakdown,
  stagedMove,
  viewer,
  allSeries,
  allTeams,
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
  tierBreakdown: OpponentTierBreakdownRow[];
  allTimeTierBreakdown: OpponentTierBreakdownRow[];
  stagedMove?: StagedTeamMove;
  viewer?: AdminAccount | null;
  allSeries: SeriesResult[];
  allTeams: HeadToHeadTeam[];
}) {
  const [breakdownView, setBreakdownView] = useState<BreakdownView>("month");
  const [seasonRecordView, setSeasonRecordView] =
    useState<BreakdownView>("month");
  const teamStats = snapshot.teamStats[team.id];
  const tier = snapshot.tiers.find(
    (entry) => entry.tier.id === team.tierId,
  )?.tier;
  const teamPath = `/teams/${team.slug}`;
  const teamCard = snapshot.tiers
    .flatMap((entry) => entry.teams)
    .find((entry) => entry.id === team.id);
  const teamPendingFlag = snapshot.pendingFlags.find(
    (flag) => flag.teamId === team.id,
  );
  const visibleBreakdown =
    breakdownView === "month" ? tierBreakdown : allTimeTierBreakdown;
  const allTimeSeasonRecord = buildAllTimeSeasonRecord({
    teamId: team.id,
    allSeries,
  });
  const selectedSeasonRecord =
    seasonRecords.find((record) => record.seasonKey === selectedSeasonKey) ??
    seasonRecords[0] ??
    null;
  const selectedSeasonIndex = selectedSeasonRecord
    ? seasonRecords.findIndex(
        (record) => record.seasonKey === selectedSeasonRecord.seasonKey,
      )
    : -1;
  const [localSeasonIndex, setLocalSeasonIndex] = useState(selectedSeasonIndex);
  const slideDir = useRef<"left" | "right">("left");
  const localSeasonRecord = seasonRecords[localSeasonIndex] ?? selectedSeasonRecord;
  const localPrevRecord =
    localSeasonIndex >= 0 && localSeasonIndex < seasonRecords.length - 1
      ? seasonRecords[localSeasonIndex + 1]
      : null;
  const localNextRecord =
    localSeasonIndex > 0 ? seasonRecords[localSeasonIndex - 1] : null;
  const goToPrev = () => {
    slideDir.current = "left";
    setLocalSeasonIndex((i) => i + 1);
  };
  const goToNext = () => {
    slideDir.current = "right";
    setLocalSeasonIndex((i) => i - 1);
  };
  const displayedSeasonRecord =
    seasonRecordView === "month" ? selectedSeasonRecord : allTimeSeasonRecord;
  const displayedWinRatePercent =
    displayedSeasonRecord && displayedSeasonRecord.seriesPlayed > 0
      ? Math.round(displayedSeasonRecord.overallWinRate * 100)
      : 0;
  const winRateTone = getWinRateTone(displayedSeasonRecord);
  const barRecord =
    seasonRecordView === "month" ? localSeasonRecord : allTimeSeasonRecord;
  const barWinRatePct = Math.round((barRecord?.overallWinRate ?? 0) * 100);
  const barTone = !barRecord?.seriesPlayed
    ? "empty"
    : barWinRatePct < 25
      ? "danger"
      : barWinRatePct <= 75
        ? "warning"
        : "success";
  const barLabel = barRecord?.seriesPlayed
    ? `${barWinRatePct}%`
    : "No games played";
  const crossTierWins =
    (teamStats?.oneTierUpWins ?? 0) + (teamStats?.twoTierUpWins ?? 0);
  const allTimeWins = allTimeRecord?.wins ?? allTimeSeasonRecord.wins;
  const allTimeLosses = allTimeRecord?.losses ?? allTimeSeasonRecord.losses;
  const profileAccentStyle = {
    "--profile-accent": tier?.accentVar ?? "var(--t1)",
  } as CSSProperties;

  return (
    <div className="page team-profile-page">
      <div className="page-title">Team Profile</div>

      <div
        className="profile-top team-profile-premium"
        style={profileAccentStyle}
      >
        <section className="profile-header team-profile-hero">
          <div className="team-profile-hero-main">
            <div className="team-profile-kicker">Elite Team Overview</div>
            <div className="team-profile-title-row">
              <div
                className="profile-avatar team-profile-avatar"
                aria-hidden={!team.logoUrl || undefined}
              >
                {team.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt={team.name}
                    width={76}
                    height={76}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      borderRadius: "inherit",
                    }}
                  />
                ) : (
                  <span className="team-profile-avatar-fallback">
                    {getTeamInitials(team.name)}
                  </span>
                )}
              </div>

              <div className="team-profile-title-block">
                <div className="profile-name">{team.name}</div>
                <div className="profile-tier">
                  {tier?.icon} {tier?.label} ·{" "}
                  {team.verified ? "Verified" : "Unverified"}
                </div>
              </div>
            </div>

            <div className="team-profile-meta-row">
              <span className="team-profile-chip">{selectedSeasonLabel}</span>
              <span className="team-profile-chip">
                {team.verified ? "Roster verified" : "Needs verification"}
              </span>
              <span className="team-profile-chip">Added by {team.addedBy}</span>
              <span className="team-profile-chip">
                {new Date(team.createdAt).toDateString()}
              </span>
            </div>

            <div className="profile-sub team-profile-sub">
              Performance snapshot for {team.name} across the live ladder,
              confirmed match history, and seasonal form.
            </div>

            {teamPendingFlag ? (
              <div className="team-profile-highlight">
                Pending rules signal: {teamPendingFlag.movementType} because{" "}
                {teamPendingFlag.reason.replaceAll("_", " ")}.
              </div>
            ) : null}

            <div className="profile-stats team-profile-stats-grid">
              <div className="ps team-profile-stat-card">
                <div className="ps-val accent-green">
                  {Math.round(
                    (selectedSeasonRecord?.overallWinRate ?? 0) * 100,
                  )}
                  %
                </div>
                <div className="ps-label">{selectedSeasonLabel} Win Rate</div>
              </div>
              <div className="ps team-profile-stat-card">
                <div className="ps-val">{allTimeWins}</div>
                <div className="ps-label">All-Time Wins</div>
              </div>
              <div className="ps team-profile-stat-card">
                <div className="ps-val">{allTimeLosses}</div>
                <div className="ps-label">All-Time Losses</div>
              </div>
              <div className="ps team-profile-stat-card">
                <div className="ps-val accent-blue">{crossTierWins}</div>
                <div className="ps-label">Cross-Tier Wins</div>
              </div>
            </div>

            <div className="team-profile-winrate-wrap">
              <div className="team-profile-winrate-header">
                <span>W/R Form</span>
                <span>
                  {displayedSeasonRecord?.seriesPlayed
                    ? `${displayedWinRatePercent}%`
                    : "No games played"}
                </span>
              </div>
              <div className="team-profile-winrate-track" aria-hidden="true">
                <div
                  className={`team-profile-winrate-fill team-profile-winrate-${winRateTone}`}
                  style={{ width: `${displayedWinRatePercent}%` }}
                />
              </div>
            </div>
          </div>

          <aside className="profile-season-sidebar team-profile-season-panel">
            <div className="team-profile-panel-head">
              <div>
                <div className="team-profile-panel-kicker">
                  Season Intelligence
                </div>
                <div className="dash-card-title">Season Records</div>
              </div>
              <BreakdownViewToggle
                value={seasonRecordView}
                onChange={setSeasonRecordView}
                ariaLabel="Team profile season record view"
              />
            </div>

            <div className="season-card-list team-profile-season-list">
              {seasonRecordView === "month" ? (
                localSeasonRecord ? (
                  <div className="season-card team-profile-season-card active team-profile-season-card-nav-wrap">
                    {localPrevRecord && (
                      <button
                        type="button"
                        className="team-profile-season-ghost-btn team-profile-season-ghost-prev"
                        onClick={goToPrev}
                        aria-label="Previous season"
                      >
                        ‹
                      </button>
                    )}
                    {localNextRecord && (
                      <button
                        type="button"
                        className="team-profile-season-ghost-btn team-profile-season-ghost-next"
                        onClick={goToNext}
                        aria-label="Next season"
                      >
                        ›
                      </button>
                    )}
                    <Link
                      key={localSeasonIndex}
                      href={`${teamPath}#season-match-history`}
                      className={`team-profile-season-card-slide team-profile-season-card-slide-${slideDir.current}`}
                    >
                      <div className="team-profile-season-card-topline">
                        <div className="season-card-title">
                          {localSeasonRecord.seasonLabel}
                        </div>
                        <div className="team-profile-season-rate">
                          {Math.round(localSeasonRecord.overallWinRate * 100)}%
                        </div>
                      </div>
                      <div className="season-card-meta">
                        {localSeasonRecord.wins}-{localSeasonRecord.losses} ·{" "}
                        {localSeasonRecord.seriesPlayed} series
                      </div>
                      <div className="season-card-grid">
                        <div className="season-card-stat">
                          <span>Wins</span>
                          <b>{localSeasonRecord.wins}</b>
                        </div>
                        <div className="season-card-stat">
                          <span>Losses</span>
                          <b>{localSeasonRecord.losses}</b>
                        </div>
                        <div className="season-card-stat">
                          <span>Same Tier</span>
                          <b>
                            {Math.round(
                              localSeasonRecord.sameTierWinRate * 100,
                            )}
                            %
                          </b>
                        </div>
                        <div className="season-card-stat">
                          <span>+1 Tier</span>
                          <b>
                            {Math.round(
                              localSeasonRecord.oneTierUpWinRate * 100,
                            )}
                            %
                          </b>
                        </div>
                      </div>
                    </Link>
                  </div>
                ) : (
                  <div className="empty-copy">
                    No season records are available yet.
                  </div>
                )
              ) : (
                <div className="season-card team-profile-season-card">
                  {renderSeasonRecordCardContent(allTimeSeasonRecord)}
                </div>
              )}
            </div>
          </aside>
        </section>

        <div className="team-profile-wr-bar">
          <div className="team-profile-wr-bar-header">
            <span>W/R</span>
            <span>{barLabel}</span>
          </div>
          <div className="team-profile-wr-bar-track" aria-hidden="true">
            <div
              className={`team-profile-wr-bar-fill team-profile-wr-bar-${barTone}`}
              style={{ width: `${barWinRatePct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="profile-grid team-profile-data-grid">
        {viewer ? (
          <AccordionCard title="Admin Actions" className="full-span">
            <div className="team-admin-copy">
              Signed in as {viewer.displayName}. Team actions on this page use
              the shared admin staging workflow.
            </div>
            {teamPendingFlag ? (
              <div className="team-admin-copy">
                Current rules suggest {teamPendingFlag.movementType} because{" "}
                {teamPendingFlag.reason.replaceAll("_", " ")}.
              </div>
            ) : null}
            <TeamProfileAdminActions
              teamId={team.id}
              teamName={team.name}
              liveTierId={team.tierId}
              stagedMove={stagedMove}
              inactivityFlag={teamCard?.inactivityFlag ?? "none"}
              allTeams={allTeams}
            />
          </AccordionCard>
        ) : null}

        <LinkedAccordionPair
          leftTitle="Win Ratio By Opponent Tier"
          leftIcon="WR"
          leftChildren={
            <TierBreakdownContent
              rows={visibleBreakdown}
              view={breakdownView}
              onViewChange={setBreakdownView}
              selectedSeasonLabel={selectedSeasonLabel}
              ariaLabel="Opponent tier breakdown view"
            />
          }
          rightTitle={`Full Match History · ${selectedSeasonLabel}`}
          rightIcon="MH"
          rightHeaderExtra={
            selectedSeasonKey !== currentSeasonKey ? (
              <Link
                href={`${teamPath}?month=${currentSeasonKey}#season-match-history`}
                className="inline-link-button"
              >
                Back to {currentSeasonLabel}
              </Link>
            ) : undefined
          }
          rightChildren={
            selectedSeasonSeries.length === 0 ? (
              <div className="empty-copy">
                No matches recorded for {selectedSeasonLabel}.
              </div>
            ) : (
              <div className="season-history-list">
                {selectedSeasonSeries.map((entry) => (
                  <div
                    key={entry.id}
                    className="history-item team-profile-history-item"
                  >
                    <div className="history-line">
                      <div className="season-history-main">
                        <div className="h-icon">
                          {entry.won ? <CheckIcon /> : <XIcon />}
                        </div>
                        <div className="h-info">
                          <div className="p-name">
                            {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                          </div>
                          <div className="h-date">
                            {new Date(entry.playedAt).toDateString()} ·{" "}
                            {entry.tournamentTitle} · Opponent{" "}
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
            )
          }
        />

        <LinkedAccordionPair
          leftTitle="Tier History"
          leftIcon="TH"
          leftChildren={history.map((entry) => (
            <div
              key={entry.id}
              className="history-item team-profile-history-item"
            >
              <div className="h-icon">
                {entry.movementType === "promotion" ? (
                  <ArrowUpIcon />
                ) : entry.movementType === "demotion" ? (
                  <ArrowDownIcon />
                ) : (
                  <ArrowRightIcon />
                )}
              </div>
              <div className="h-info">
                <div className="p-name">
                  {entry.movementType === "placement"
                    ? "Placed"
                    : entry.movementType === "promotion"
                      ? "Promoted"
                      : "Moved"}{" "}
                  to {entry.toTierId.toUpperCase()}
                </div>
                <div className="h-date">
                  {new Date(entry.createdAt).toDateString()} · {entry.reason}
                </div>
              </div>
            </div>
          ))}
          rightTitle="Recent Results"
          rightIcon="RR"
          rightChildren={recentSeries.map((entry) => (
            <div
              key={entry.id}
              className="history-item team-profile-history-item"
            >
              <div className="h-icon">
                {entry.won ? <CheckIcon /> : <XIcon />}
              </div>
              <div className="h-info">
                <div className="p-name">
                  {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                </div>
                <div className="h-date">
                  {new Date(entry.playedAt).toDateString()} ·{" "}
                  {entry.tournamentTitle} · {entry.teamScore}-
                  {entry.opponentScore}
                </div>
              </div>
            </div>
          ))}
        />

        <AccordionCard
          title="Head to Head"
          icon="H2H"
          className="full-span h2h-dropdown-card"
        >
          <HeadToHeadSearch
            teams={allTeams}
            allSeries={allSeries}
            prefilledTeam={{ id: team.id, name: team.name }}
          />
        </AccordionCard>
      </div>
    </div>
  );
}
