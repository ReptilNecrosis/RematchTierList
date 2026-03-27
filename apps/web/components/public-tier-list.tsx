"use client";

import { toPng } from "html-to-image";
import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

import type { DashboardSnapshot } from "@rematch/shared-types";

export function PublicTierList({
  snapshot,
  lastUpdatedLabel,
  teamHrefBase = "/teams",
  statusMessage
}: {
  snapshot: DashboardSnapshot;
  lastUpdatedLabel: string;
  teamHrefBase?: string;
  statusMessage?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    tier4: true,
    tier5: true,
    tier6: true,
    tier7: true
  });
  const tierListRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const visibleTiers = snapshot.tiers
    .map((tier) => ({
      ...tier,
      teams: tier.teams.filter((team) =>
        deferredQuery ? team.name.toLowerCase().includes(deferredQuery) : true
      )
    }))
    .filter((tier) => tier.teams.length > 0 || !deferredQuery);

  async function handleExport() {
    if (!tierListRef.current) {
      return;
    }

    try {
      setExportStatus("Exporting image...");
      const dataUrl = await toPng(tierListRef.current, {
        cacheBust: true,
        pixelRatio: 2
      });
      const link = document.createElement("a");
      link.download = "rematch-tier-list.png";
      link.href = dataUrl;
      link.click();
      setExportStatus("Tier list image downloaded.");
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Export failed.");
    }
  }

  return (
    <div className="page" ref={tierListRef}>
      <div className="page-title">
        Official Rankings · {snapshot.tiers.reduce((count, tier) => count + tier.teams.length, 0)} Teams · {lastUpdatedLabel}
      </div>

      <div className="toolbar">
        <label className="search-wrap">
          <span>Search Teams</span>
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find any team instantly"
          />
        </label>
        <button className="btn-login" type="button" onClick={handleExport}>
          Export As Image
        </button>
      </div>
      {statusMessage ? <div className="inline-status">{statusMessage}</div> : null}
      {exportStatus ? <div className="inline-status">{exportStatus}</div> : null}

      <div className="legend">
        <div className="legend-item">
          <div className="leg-dot yellow" />
          Inactive 15+ days
        </div>
        <div className="legend-item">
          <div className="leg-dot red" />
          Inactive 30+ days
        </div>
        <div className="legend-item">
          <div className="leg-dot blue" />
          Promotion eligible
        </div>
        <div className="legend-item">
          <div className="leg-dot violet" />
          Unverified
        </div>
      </div>

      {visibleTiers.map((tier) => {
        const isCollapsed = collapsed[tier.tier.id] ?? false;
        return (
          <section key={tier.tier.id} className={`tier ${tier.tier.id} ${isCollapsed ? "collapsed" : ""}`}>
            <button
              className="tier-header"
              type="button"
              onClick={() =>
                setCollapsed((current) => ({
                  ...current,
                  [tier.tier.id]: !isCollapsed
                }))
              }
            >
              <div className="tier-icon">{tier.tier.icon}</div>
              <div className="tier-label">{tier.tier.label}</div>
              <div className="tier-badge">{tier.tier.badge}</div>
              <div className="tier-count">
                {tier.teams.length} / {tier.tier.maxTeams ?? "∞"}
              </div>
              <div className="tier-chevron">{isCollapsed ? "▶" : "▼"}</div>
            </button>

            {!isCollapsed ? (
              <>
                <div className="tier-body">
                  <div className="team-grid">
                    {tier.teams.map((team) => (
                      <Link key={team.id} href={`${teamHrefBase}/${team.slug}`} className="team-card">
                        <div className="team-avatar">{team.shortCode}</div>
                        <div className="team-info">
                          <div className="team-name">{team.name}</div>
                          <div className="team-meta">
                            {team.wins}W · {team.losses}L · {Math.round(team.overallWinRate * 100)}%
                          </div>
                        </div>
                        {team.inactivityFlag === "yellow" ? <div className="flag flag-y" /> : null}
                        {team.inactivityFlag === "red" ? <div className="flag flag-r" /> : null}
                        {!team.verified ? <div className="flag flag-u" /> : null}
                        {team.promotionEligible ? <div className="elig-badge elig-up">PROMO</div> : null}
                        {team.demotionEligible ? <div className="elig-badge elig-down">REVIEW</div> : null}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="tier-footer">
                  <span>
                    <b>{tier.teams.length}</b> teams
                  </span>
                  {tier.openSpots !== null ? (
                    <span>
                      <b>{tier.openSpots}</b> spots open
                    </span>
                  ) : null}
                  <span>
                    <b>{tier.promotionEligibleCount}</b> promo eligible
                  </span>
                  <span>
                    <b>{tier.unverifiedCount}</b> unverified
                  </span>
                </div>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
