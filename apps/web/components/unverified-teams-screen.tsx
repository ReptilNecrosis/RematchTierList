"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DashboardSnapshot } from "@rematch/shared-types";

export function UnverifiedTeamsScreen({ snapshot }: { snapshot: DashboardSnapshot }) {
  const router = useRouter();
  const [loading, setLoading] = useState<Record<string, "confirm" | "reject" | null>>({});

  async function handleAction(normalizedName: string, action: "confirm" | "reject") {
    setLoading((prev) => ({ ...prev, [normalizedName]: action }));
    try {
      const res = await fetch("/api/teams/unverified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, normalizedName })
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) {
        alert(data.message ?? "Action failed.");
      } else {
        router.refresh();
      }
    } finally {
      setLoading((prev) => ({ ...prev, [normalizedName]: null }));
    }
  }

  return (
    <div className="page">
      <div className="page-title">Unverified Teams · {snapshot.unverifiedTeams.length} awaiting confirmation</div>
      {snapshot.unverifiedTeams.map((team) => {
        const busy = loading[team.normalizedName];
        return (
          <div key={team.normalizedName} className="unv-item">
            <div className="unv-info">
              <div className="unv-name">{team.teamName}</div>
              <div className="unv-meta">
                {team.distinctTournaments} appearances · {team.autoPlaced ? "Auto-placed in Tier 7" : "Not yet placed"} ·
                Last seen {new Date(team.lastSeenAt).toDateString()}
                {team.suggestedTierId
                  ? ` · Suggested: ${team.suggestedTierId.replace("tier", "Tier ")}${team.suggestedTierWinRate !== undefined ? ` (${Math.round(team.suggestedTierWinRate * 100)}%` : ""}${team.suggestedTierSeriesCount !== undefined ? ` @ ${team.suggestedTierSeriesCount} series)` : ""}`
                  : null}
              </div>
              <div className="unv-progress">
                {[0, 1, 2].map((index) => (
                  <div key={index} className={`unv-dot ${index < team.distinctTournaments ? "filled" : ""}`} />
                ))}
              </div>
            </div>
            <div className="unv-actions">
              <button
                className="btn-confirm"
                disabled={busy !== null && busy !== undefined}
                onClick={() => handleAction(team.normalizedName, "confirm")}
              >
                {busy === "confirm" ? "…" : "✓ Confirm"}
              </button>
              <button
                className="btn-reject"
                disabled={busy !== null && busy !== undefined}
                onClick={() => handleAction(team.normalizedName, "reject")}
              >
                {busy === "reject" ? "…" : "✕ Reject"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
