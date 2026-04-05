"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { UnverifiedTeamPageData, UnverifiedTierBreakdownRow } from "@rematch/shared-types";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";

import { CheckIcon, XIcon } from "./icons";
import { LinkedAccordionPair } from "./linked-accordion-pair";

type BreakdownView = "month" | "all-time";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
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
  rows: UnverifiedTierBreakdownRow[];
  view: BreakdownView;
  onViewChange: (value: BreakdownView) => void;
  selectedSeasonLabel: string;
  ariaLabel: string;
}) {
  return (
    <>
      <div className="profile-breakdown-toolbar">
        <div className="profile-breakdown-meta">
          {view === "month" ? `Showing ${selectedSeasonLabel}` : "Showing all confirmed series"}
        </div>
        <BreakdownViewToggle value={view} onChange={onViewChange} ariaLabel={ariaLabel} />
      </div>
      <div className="record-list">
        {rows.map((row) => {
          const tier = TIER_DEFINITIONS.find((entry) => entry.id === row.tierId);
          return (
            <div key={row.tierId} className="record-row">
              <div className="record-main">
                <div className="record-avatar">
                  {tier?.shortLabel.replace("Tier ", "T").replace("Unverified", "UNV") ?? row.tierId.toUpperCase()}
                </div>
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
    </>
  );
}

export function UnverifiedTeamProfileScreen({ data }: { data: UnverifiedTeamPageData }) {
  const router = useRouter();
  const [pairedView, setPairedView] = useState<BreakdownView>("month");
  const [mergeTargetId, setMergeTargetId] = useState(data.allTeams[0]?.id ?? "");
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergePending, setMergePending] = useState(false);
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

  const resolvedProfile = profile;

  const pairedBreakdown = pairedView === "month" ? data.tierBreakdown : data.allTimeTierBreakdown;
  const suggestedTierLabel =
    profile.suggestedTierId
      ? TIER_DEFINITIONS.find((tier) => tier.id === profile.suggestedTierId)?.shortLabel ??
        profile.suggestedTierId.toUpperCase()
      : null;
  const pendingTierLabel =
    profile.pendingTierId
      ? TIER_DEFINITIONS.find((tier) => tier.id === profile.pendingTierId)?.shortLabel ??
        profile.pendingTierId.toUpperCase()
      : null;

  async function handleMergeIntoExistingTeam() {
    setMergePending(true);
    setMergeError(null);
    setMergeStatus(null);

    try {
      const response = await fetch("/api/admin/unverified/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge_into_existing",
          normalizedName: resolvedProfile.normalizedName,
          targetTeamId: mergeTargetId
        })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; teamId?: string };

      if (!response.ok || payload.ok === false) {
        setMergeError(payload.message ?? "Could not merge the unverified profile.");
        return;
      }

      if (payload.teamId) {
        const targetTeam = data.allTeams.find((entry) => entry.id === payload.teamId);
        if (targetTeam) {
          router.push(`/teams/${targetTeam.slug}`);
          router.refresh();
          return;
        }
      }

      setMergeStatus(payload.message ?? "Merged the unverified profile into an existing team.");
      router.refresh();
    } catch {
      setMergeError("Could not merge the unverified profile.");
    } finally {
      setMergePending(false);
    }
  }

  return (
    <div className="page unverified-profile-page">
      <div className="page-title">Unverified Team Profile</div>

      <div className="profile-header unverified-profile-hero">
        <div className="profile-avatar unverified-profile-avatar">{profile.teamName.slice(0, 2).toUpperCase()}</div>

        <div className="unverified-profile-main">
          <div className="unverified-profile-badge-row">
            <div className="unverified-profile-badge">{profile.pending ? "Pending" : "Pending Admin Review"}</div>
            <div className="unverified-profile-badge unverified-profile-badge-muted">
              {profile.pending ? "Staged In Admin Preview" : "Unverified Queue"}
            </div>
          </div>

          <div className="profile-name">{profile.teamName}</div>

          <div className="unverified-profile-meta">
            <span>First seen {new Date(profile.firstSeenAt).toDateString()}</span>
            <span>Last seen {new Date(profile.lastSeenAt).toDateString()}</span>
          </div>

          <div className="profile-sub unverified-profile-highlight">
            {profile.pending
              ? `Currently staged for admin preview${pendingTierLabel ? ` in ${pendingTierLabel}` : ""}.`
              : profile.autoPlaced
              ? "Ready for admin placement after 3+ tournament appearances."
              : `Auto-placement progress: ${Math.min(profile.distinctTournaments, 3)}/3 tournaments.`}
          </div>

          <div className="profile-sub unverified-profile-sub">Suggested placement</div>
          <div className="profile-sub unverified-profile-sub">
            {suggestedTierLabel
              ? `${suggestedTierLabel} · ${formatPercent(profile.suggestedTierWinRate ?? 0)} win rate across ${
                  profile.suggestedTierSeriesCount ?? 0
                } verified-team series`
              : "Unavailable until enough verified-team series are recorded."}
          </div>
        </div>

        <div className="profile-stats unverified-profile-stats">
          <div className="ps unverified-profile-stat">
            <div className="ps-val">{profile.appearances}</div>
            <div className="ps-label">Appearances</div>
          </div>
          <div className="ps unverified-profile-stat">
            <div className="ps-val">{profile.distinctTournaments}</div>
            <div className="ps-label">Tournaments</div>
          </div>
          <div className="ps unverified-profile-stat">
            <div className="ps-val accent-green">{data.allTimeRecord.wins}</div>
            <div className="ps-label">All-Time Wins</div>
          </div>
          <div className="ps unverified-profile-stat">
            <div className="ps-val">{data.allTimeRecord.losses}</div>
            <div className="ps-label">All-Time Losses</div>
          </div>
        </div>
      </div>

      <div className="profile-grid unverified-profile-grid">
        <div className="full-span unverified-main-pair" id="season-match-history">
          <LinkedAccordionPair
            leftTitle="Win Ratio By Opponent Tier"
            leftIcon="WR"
            leftChildren={
              <TierBreakdownContent
                rows={pairedBreakdown}
                view={pairedView}
                onViewChange={setPairedView}
                selectedSeasonLabel={data.selectedSeasonLabel}
                ariaLabel="Paired opponent tier breakdown view"
              />
            }
            rightTitle={`Full Match History · ${data.selectedSeasonLabel}`}
            rightIcon="MH"
            rightChildren={
              data.selectedSeasonSeries.length === 0 ? (
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
              )
            }
          />
        </div>

        <section className="dash-card unverified-season-card">
          <div className="dash-card-title">Season Records</div>
          <div className="season-card-list">
            {data.availableSeasons.map((season) => (
              <Link
                key={season.key}
                href={`/admin/unverified/${encodeURIComponent(resolvedProfile.normalizedName)}?month=${season.key}#season-match-history`}
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

        <section className="dash-card unverified-recent-card">
          <div className="dash-card-title">Merge Into Existing Team</div>
          <div className="team-admin-copy">
            Use this when the unverified name is just an alias or tournament-specific variant of a real team.
          </div>
          <div className="form-stack settings-form-block" style={{ marginTop: 16 }}>
            <span className="form-label">Canonical Team</span>
            <select
              className="form-input"
              value={mergeTargetId}
              onChange={(event) => {
                setMergeTargetId(event.target.value);
              }}
              disabled={mergePending || data.allTeams.length === 0}
            >
              {data.allTeams.length === 0 ? <option value="">No verified teams available</option> : null}
              {data.allTeams.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-login"
            type="button"
            disabled={mergePending || !mergeTargetId}
            onClick={() => {
              void handleMergeIntoExistingTeam();
            }}
            style={{ marginTop: 16 }}
          >
            {mergePending ? "Merging..." : "Merge Into Existing Team"}
          </button>
          {mergeError ? <div className="empty-copy" style={{ marginTop: 12 }}>{mergeError}</div> : null}
          {mergeStatus ? <div className="empty-copy" style={{ marginTop: 12 }}>{mergeStatus}</div> : null}
        </section>

        <section className="dash-card unverified-recent-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Recent Results</div>
            <Link
              href={`/admin/unverified/${encodeURIComponent(resolvedProfile.normalizedName)}?month=${data.currentSeasonKey}#season-match-history`}
              className="inline-link-button"
            >
              Show all {data.currentSeasonLabel}
            </Link>
          </div>
          {data.recentSeries.length === 0 ? (
            <div className="empty-copy">No confirmed matches recorded for {data.currentSeasonLabel}.</div>
          ) : (
            <div className="unverified-recent-list">
              {data.recentSeries.map((entry) => (
                <div key={entry.id} className="history-item unverified-recent-item">
                  <div className="h-icon">{entry.won ? <CheckIcon /> : <XIcon />}</div>
                  <div className="h-info">
                    <div className="p-name">
                      {entry.won ? "Win" : "Loss"} vs {entry.opponentName}
                    </div>
                    <div className="h-date">
                      {new Date(entry.playedAt).toDateString()} · {entry.tournamentTitle}
                    </div>
                  </div>
                  <div className="unverified-result-pill">Opponent {entry.opponentTierId.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
