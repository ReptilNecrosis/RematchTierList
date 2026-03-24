import type { DashboardSnapshot, DiscordSyncJob, EligibilityFlag, TeamCardSnapshot } from "@rematch/shared-types";

function formatTierLine(team: TeamCardSnapshot) {
  const badges: string[] = [];
  if (team.promotionEligible) {
    badges.push("UP");
  }
  if (team.demotionEligible) {
    badges.push("DOWN");
  }
  if (!team.verified) {
    badges.push("UNVERIFIED");
  }
  if (team.inactivityFlag === "yellow") {
    badges.push("YELLOW");
  }
  if (team.inactivityFlag === "red") {
    badges.push("RED");
  }
  const badgeSuffix = badges.length ? ` [${badges.join(" | ")}]` : "";
  return `• ${team.name} (${team.wins}-${team.losses}, ${Math.round(team.overallWinRate * 100)}%)${badgeSuffix}`;
}

export function buildDiscordTierSummary(snapshot: DashboardSnapshot) {
  const sections = snapshot.tiers.map((tier) => {
    const header = `**${tier.tier.shortLabel}** · ${tier.teams.length}/${tier.tier.maxTeams ?? "∞"}`;
    const teamLines = tier.teams.slice(0, 12).map(formatTierLine);
    return [header, ...teamLines].join("\n");
  });

  return [`# Rematch Tier List`, ...sections].join("\n\n");
}

export function buildMovementPost(flag: EligibilityFlag, destinationLabel: string) {
  const action = flag.movementType === "promotion" ? "promoted" : "demoted";
  return `**${flag.teamName}** has been ${action} to ${destinationLabel}. Reason: ${flag.reason}.`;
}

export function createDiscordSyncJobs(snapshot: DashboardSnapshot, mode: "summary" | "test" = "summary"): DiscordSyncJob[] {
  const now = new Date().toISOString();
  if (mode === "test") {
    return [
      {
        id: `job-test-${now}`,
        type: "test_post",
        payload: {
          message: "Discord test sync from Rematch Tier List."
        },
        status: "pending",
        createdAt: now
      }
    ];
  }

  return [
    {
      id: `job-summary-${now}`,
      type: "resync_summary",
      payload: {
        message: buildDiscordTierSummary(snapshot)
      },
      status: "pending",
      createdAt: now
    }
  ];
}
