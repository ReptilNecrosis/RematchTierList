"use client";

import { toPng } from "html-to-image";
import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

import type { DashboardSnapshot, EligibilityColor, MovementType } from "@rematch/shared-types";

function eligColorClass(color: EligibilityColor): string {
  switch (color) {
    case "green":    return "green";
    case "blue":     return "blue";
    case "purple":   return "violet";
    case "yellow":   return "yellow";
    case "orange":   return "orange";
    case "dark_red": return "dark-red";
  }
}

export function PublicTierList({
  snapshot,
  lastUpdatedLabel,
  defaultAllExpanded = false,
  stagedMovementByTeamId
}: {
  snapshot: DashboardSnapshot;
  lastUpdatedLabel: string;
  defaultAllExpanded?: boolean;
  stagedMovementByTeamId?: Record<string, MovementType>;
}) {
  const [query, setQuery] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    defaultAllExpanded
      ? {}
      : { tier4: true, tier5: true, tier6: true, tier7: true }
  );
  const tierListRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const visibleTiers = snapshot.tiers
    .map((tier) => ({
      ...tier,
      teams: tier.teams
        .filter((team) =>
          deferredQuery ? team.name.toLowerCase().includes(deferredQuery) : true
        )
        .sort((a, b) => b.sameTierWinRate - a.sameTierWinRate)
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
      {exportStatus ? <div className="inline-status">{exportStatus}</div> : null}

      <div className="legend">
        <div className="legend-section">
          <div className="legend-section-title">Status</div>
          <div className="legend-item"><div className="leg-dot yellow" />Inactive 10+ days / &lt;5 series</div>
          <div className="legend-item"><div className="leg-dot red" />Inactive 20+ days</div>
          <div className="legend-item"><div className="leg-dot violet" />Unverified</div>
        </div>
        <div className="legend-section">
          <div className="legend-section-title">Promotion Eligible</div>
          <div className="legend-item"><div className="leg-dot green" />Same tier (75%+ win rate)</div>
          <div className="legend-item"><div className="leg-dot blue" />±1 tier (35%+ win rate)</div>
          <div className="legend-item"><div className="leg-dot violet" />±2 tiers (1 series win)</div>
        </div>
        <div className="legend-section">
          <div className="legend-section-title">Demotion Risk</div>
          <div className="legend-item"><div className="leg-dot yellow" />Same tier (below 25% win rate)</div>
          <div className="legend-item"><div className="leg-dot orange" />±1 tier (below 65% win rate)</div>
          <div className="legend-item"><div className="leg-dot dark-red" />±2 tiers (1 series loss)</div>
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
                      <Link
                        key={team.id}
                        href={`/teams/${team.slug}`}
                        className={`team-card ${
                          stagedMovementByTeamId?.[team.id] === "promotion"
                            ? "team-card-stage-promotion"
                            : stagedMovementByTeamId?.[team.id] === "demotion"
                              ? "team-card-stage-demotion"
                              : ""
                        }`}
                      >
                        <div className="team-avatar">{team.shortCode}</div>
                        <div className="team-info">
                          <div className="team-name">{team.name}</div>
                          <div className="team-meta">
                            {team.wins}W · {team.losses}L · {Math.round(team.sameTierWinRate * 100)}%
                          </div>
                        </div>
                        {team.inactivityFlag === "yellow" ? <div className="flag flag-y" /> : null}
                        {team.inactivityFlag === "red" ? <div className="flag flag-r" /> : null}
                        {!team.verified ? <div className="flag flag-u" /> : null}
                        {team.eligibilityColors.some((c) => c === "green" || c === "blue" || c === "purple") ? (
                          <div className="elig-dots elig-dots-promo">
                            {team.eligibilityColors
                              .filter((c) => c === "green" || c === "blue" || c === "purple")
                              .map((color) => (
                                <div key={color} className={`leg-dot ${eligColorClass(color)}`} />
                              ))}
                          </div>
                        ) : null}
                        {team.eligibilityColors.some((c) => c === "yellow" || c === "orange" || c === "dark_red") ? (
                          <div className="elig-dots elig-dots-demo">
                            {team.eligibilityColors
                              .filter((c) => c === "yellow" || c === "orange" || c === "dark_red")
                              .map((color) => (
                                <div key={color} className={`leg-dot ${eligColorClass(color)}`} />
                              ))}
                          </div>
                        ) : null}
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
