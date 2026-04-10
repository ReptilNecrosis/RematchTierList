"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  DashboardSnapshot,
  EligibilityColor,
  MovementType,
  TierId
} from "@rematch/shared-types";

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

function stagedMovementClass(stagedMovementByTeamId: Record<string, MovementType> | undefined, teamId: string) {
  return stagedMovementByTeamId?.[teamId] === "promotion"
    ? "team-card-stage-promotion"
    : stagedMovementByTeamId?.[teamId] === "demotion"
      ? "team-card-stage-demotion"
      : "";
}

function wrColor(wins: number, losses: number, rate: number): string {
  if (wins + losses === 0) return "var(--muted)";
  if (rate < 0.25) return "var(--red)";
  if (rate > 0.75) return "var(--green)";
  return "var(--yellow)";
}

function TeamCardContent({
  team
}: {
  team: DashboardSnapshot["tiers"][number]["teams"][number];
}) {
  return (
    <>
      <div className="team-avatar" aria-hidden="true" />
      <div className="team-info">
        <div className="team-name">{team.name}</div>
        <div className="team-meta">
          {team.wins}W · {team.losses}L · <span style={{ color: wrColor(team.wins, team.losses, team.sameTierWinRate), opacity: 0.9 }}>{Math.round(team.sameTierWinRate * 100)}%</span>
        </div>
        {team.pendingStaging ? <div className="team-meta">Pending publish preview</div> : null}
      </div>
      {team.inactivityFlag === "yellow" ? <div className="flag flag-y" /> : null}
      {team.inactivityFlag === "orange" ? <div className="flag flag-o" /> : null}
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
    </>
  );
}

type AdminDragDropConfig = {
  draggingTeamId: string | null;
  dropTargetTierId: TierId | null;
  busyTeamId?: string | null;
  disabled?: boolean;
  onDragStart: (teamId: string) => void;
  onDragEnd: () => void;
  onDropTargetChange: (tierId: TierId | null) => void;
  onDrop: (args: { teamId: string; targetTierId: TierId }) => void;
};

const HOLD_TO_DRAG_DELAY_MS = 50;
const HOLD_CANCEL_DISTANCE_PX = 8;

export function PublicTierList({
  snapshot,
  lastUpdatedLabel,
  lastTournamentLabel,
  lastTierUpdateLabel,
  defaultAllExpanded = false,
  stagedMovementByTeamId,
  adminDragDrop
}: {
  snapshot: DashboardSnapshot;
  lastUpdatedLabel?: string;
  lastTournamentLabel?: string;
  lastTierUpdateLabel?: string;
  defaultAllExpanded?: boolean;
  stagedMovementByTeamId?: Record<string, MovementType>;
  adminDragDrop?: AdminDragDropConfig;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    defaultAllExpanded
      ? {}
      : { tier4: true, tier5: true, tier6: true, tier7: true }
  );
  const [holdTeamId, setHoldTeamId] = useState<string | null>(null);
  const [armedDragTeamId, setArmedDragTeamId] = useState<string | null>(null);
  const tierListRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPointerRef = useRef<{
    teamId: string;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickTeamIdRef = useRef<string | null>(null);
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

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function clearHoldState() {
    clearHoldTimer();
    holdPointerRef.current = null;
    setHoldTeamId(null);
    setArmedDragTeamId(null);
  }

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, []);

  useEffect(() => {
    const { body } = document;
    body.classList.add("tier-list-scroll-optimized");

    return () => {
      body.classList.remove("tier-list-scroll-optimized");
    };
  }, []);

  useEffect(() => {
    if (adminDragDrop?.disabled) {
      clearHoldTimer();
      holdPointerRef.current = null;
      setHoldTeamId(null);
      setArmedDragTeamId(null);
    }
  }, [adminDragDrop?.disabled]);

  function handleTierDragOver(event: DragEvent<HTMLDivElement>, tierId: TierId) {
    if (!adminDragDrop || adminDragDrop.disabled) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    adminDragDrop.onDropTargetChange(tierId);
  }

  function handleTierDrop(event: DragEvent<HTMLDivElement>, targetTierId: TierId) {
    if (!adminDragDrop || adminDragDrop.disabled) {
      return;
    }

    event.preventDefault();
    const teamId =
      event.dataTransfer.getData("application/rematch-team-id") ||
      event.dataTransfer.getData("text/plain");

    adminDragDrop.onDropTargetChange(null);

    if (!teamId) {
      adminDragDrop.onDragEnd();
      return;
    }

    adminDragDrop.onDrop({ teamId, targetTierId });
  }

  function handleAdminPointerDown(
    event: PointerEvent<HTMLDivElement>,
    teamId: string,
    disabled: boolean
  ) {
    if (!adminDragDrop || disabled || event.button !== 0) {
      return;
    }

    suppressClickTeamIdRef.current = null;
    clearHoldState();
    holdPointerRef.current = {
      teamId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    setHoldTeamId(teamId);
    holdTimerRef.current = setTimeout(() => {
      if (holdPointerRef.current?.teamId !== teamId) {
        return;
      }

      holdPointerRef.current = null;
      setHoldTeamId(null);
      setArmedDragTeamId(teamId);
    }, HOLD_TO_DRAG_DELAY_MS);
  }

  function handleAdminPointerMove(event: PointerEvent<HTMLDivElement>, teamId: string) {
    const pointer = holdPointerRef.current;
    if (!pointer || pointer.teamId !== teamId || pointer.pointerId !== event.pointerId) {
      return;
    }

    const movedDistance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (movedDistance > HOLD_CANCEL_DISTANCE_PX) {
      clearHoldState();
    }
  }

  function handleAdminPointerUp(event: PointerEvent<HTMLDivElement>, teamId: string) {
    const pointer = holdPointerRef.current;
    if (pointer && pointer.teamId === teamId && pointer.pointerId === event.pointerId) {
      clearHoldState();
      return;
    }

    if (armedDragTeamId === teamId) {
      setArmedDragTeamId(null);
    }
  }

  function handleAdminPointerCancel() {
    clearHoldState();
  }

  function handleAdminCardClick(
    event: MouseEvent<HTMLDivElement>,
    teamId: string,
    teamSlug: string,
    teamAdminHref?: string
  ) {
    if (suppressClickTeamIdRef.current === teamId) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickTeamIdRef.current = null;
      return;
    }

    router.push(teamAdminHref ?? `/teams/${teamSlug}`);
  }

  return (
    <div className="page tier-list-page" ref={tierListRef}>
      <div className="page-title">
        Official Rankings · {snapshot.tiers.reduce((count, tier) => count + tier.teams.length, 0)} Teams{lastTournamentLabel && lastTierUpdateLabel ? ` · Last tournament: ${lastTournamentLabel} · Last Tier Update: ${lastTierUpdateLabel} · Beta Launch` : lastUpdatedLabel ? ` · ${lastUpdatedLabel}` : ""}
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
      </div>

      <div className="legend">
        <div className="legend-section">
          <div className="legend-section-title" style={{color: 'var(--yellow)'}}>Status</div>
          <div className="legend-item"><div className="leg-dot yellow" />1 tournament this month</div>
          <div className="legend-item"><div className="leg-dot red" />0 tournaments this month</div>
          <div className="legend-item"><div className="leg-dot orange" />2-3 tournaments (Tier 1 only)</div>
        </div>
        <div className="legend-section">
          <div className="legend-section-title" style={{color: 'var(--green)'}}>Promotion Eligible</div>
          <div className="legend-item"><div className="leg-dot green" />Same tier (75%+ win rate)</div>
          <div className="legend-item"><div className="leg-dot blue" />+1 tier (35%+ win rate)</div>
          <div className="legend-item"><div className="leg-dot violet" />+2 tiers (20%+ win rate)</div>
        </div>
        <div className="legend-section">
          <div className="legend-section-title" style={{color: 'var(--red)'}}>Demotion Eligible</div>
          <div className="legend-item"><div className="leg-dot yellow" />Same tier (below 25% win rate)</div>
          <div className="legend-item"><div className="leg-dot orange" />-1 tier (below 65% win rate)</div>
          <div className="legend-item"><div className="leg-dot dark-red" />-2 tiers (&lt;80% win rate)</div>
        </div>
        <div className="legend-section">
          <div className="legend-section-title" style={{color: '#ffffff'}}>Season</div>
          <div className="legend-item">15th — Midseason tier update</div>
          <div className="legend-item">End of month — Tier update & inactive teams removed</div>
          <div className="legend-item">Unverified teams placed at these times</div>
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
                  <div
                    className={`team-grid ${
                      adminDragDrop?.dropTargetTierId === tier.tier.id ? "team-grid-drop-active" : ""
                    }`}
                    onDragOver={(event) => handleTierDragOver(event, tier.tier.id)}
                    onDragEnter={() => adminDragDrop?.onDropTargetChange(tier.tier.id)}
                    onDragLeave={() => adminDragDrop?.onDropTargetChange(null)}
                    onDrop={(event) => handleTierDrop(event, tier.tier.id)}
                  >
                    {tier.teams.map((team) => (
                      adminDragDrop ? (
                        (() => {
                          const disabled = Boolean(adminDragDrop.disabled || adminDragDrop.busyTeamId === team.id);
                          const isHolding = holdTeamId === team.id;
                          const isArmed = armedDragTeamId === team.id;
                          return (
                            <div
                              key={team.id}
                              className={`team-card-shell ${
                                adminDragDrop.draggingTeamId === team.id ? "team-card-shell-dragging" : ""
                              }`}
                            >
                              <div
                                role="link"
                                tabIndex={disabled ? -1 : 0}
                                aria-label={`Open ${team.name}`}
                                className={`team-card team-card-admin-draggable ${
                                  stagedMovementClass(stagedMovementByTeamId, team.id)
                                } ${isHolding ? "team-card-admin-hold" : ""} ${
                                  isArmed ? "team-card-admin-armed" : ""
                                } ${disabled ? "team-card-admin-disabled" : ""}`}
                                draggable={isArmed && !disabled}
                                onClick={(event) =>
                                  handleAdminCardClick(event, team.id, team.slug, team.adminHref)
                                }
                                onKeyDown={(event) => {
                                  if (disabled) {
                                    return;
                                  }
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    router.push(team.adminHref ?? `/teams/${team.slug}`);
                                  }
                                }}
                                onPointerDown={(event) => handleAdminPointerDown(event, team.id, disabled)}
                                onPointerMove={(event) => handleAdminPointerMove(event, team.id)}
                                onPointerUp={(event) => handleAdminPointerUp(event, team.id)}
                                onPointerCancel={handleAdminPointerCancel}
                                onDragStart={(event) => {
                                  if (disabled || armedDragTeamId !== team.id) {
                                    event.preventDefault();
                                    return;
                                  }
                                  event.dataTransfer.setData("application/rematch-team-id", team.id);
                                  event.dataTransfer.setData("text/plain", team.id);
                                  event.dataTransfer.effectAllowed = "move";
                                  suppressClickTeamIdRef.current = team.id;
                                  setArmedDragTeamId(null);
                                  setHoldTeamId(null);
                                  holdPointerRef.current = null;
                                  adminDragDrop.onDragStart(team.id);
                                }}
                                onDragEnd={() => {
                                  suppressClickTeamIdRef.current = team.id;
                                  clearHoldState();
                                  adminDragDrop.onDragEnd();
                                  adminDragDrop.onDropTargetChange(null);
                                }}
                              >
                                <TeamCardContent team={team} />
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <Link
                          key={team.id}
                          href={team.adminHref ?? `/teams/${team.slug}`}
                          className={`team-card ${stagedMovementClass(stagedMovementByTeamId, team.id)}`}
                        >
                          <TeamCardContent team={team} />
                        </Link>
                      )
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
