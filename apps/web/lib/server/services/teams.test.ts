import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { EligibilityFlag } from "@rematch/shared-types";

import { activityLog, stagedTeamMoves, teams, tierHistory } from "../../sample-data/demo";
import { getStagedMoveValidationIssues, moveTeam, publishStagedMoves, stagePendingMoves } from "./teams";

const initialTeams = structuredClone(teams);
const initialStagedTeamMoves = structuredClone(stagedTeamMoves);
const initialActivityLog = structuredClone(activityLog);
const initialTierHistory = structuredClone(tierHistory);

function restoreDemoState() {
  teams.splice(0, teams.length, ...structuredClone(initialTeams));
  stagedTeamMoves.splice(0, stagedTeamMoves.length, ...structuredClone(initialStagedTeamMoves));
  activityLog.splice(0, activityLog.length, ...structuredClone(initialActivityLog));
  tierHistory.splice(0, tierHistory.length, ...structuredClone(initialTierHistory));
}

function makePendingFlag(args: {
  teamId: string;
  teamName: string;
  tierId: EligibilityFlag["tierId"];
  movementType: EligibilityFlag["movementType"];
  reason?: EligibilityFlag["reason"];
}): EligibilityFlag {
  return {
    id: `${args.teamId}-${args.movementType}`,
    teamId: args.teamId,
    teamName: args.teamName,
    tierId: args.tierId,
    movementType: args.movementType,
    reason: args.reason ?? "same_tier_promotion_rate",
    color: args.movementType === "promotion" ? "green" : "yellow",
    priorityScore: 1,
    createdAt: "2026-03-30T12:00:00.000Z",
    requiresManualApproval: false,
    conflicted: false
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  restoreDemoState();
});

describe("teams staging service", () => {
  it("stages a direct target above the live tier as a promotion", async () => {
    const result = await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier2",
      actorAdminId: "admin-1"
    });

    assert.equal(result.ok, true);
    assert.equal(result.stagedMove?.stagedTierId, "tier2");
    assert.equal(result.stagedMove?.movementType, "promotion");
  });

  it("stages a direct target below the live tier as a demotion", async () => {
    const result = await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier6",
      actorAdminId: "admin-1"
    });

    assert.equal(result.ok, true);
    assert.equal(result.stagedMove?.stagedTierId, "tier6");
    assert.equal(result.stagedMove?.movementType, "demotion");
  });

  it("removes a staged move when the direct target matches the live tier", async () => {
    await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier6",
      actorAdminId: "admin-1"
    });

    const result = await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier4",
      actorAdminId: "admin-1"
    });

    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
    assert.equal(stagedTeamMoves.some((move) => move.teamId === "team-cf"), false);
  });

  it("bulk stages pending moves, skips Tier 1-related moves, and overwrites existing staged entries", async () => {
    await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier6",
      actorAdminId: "admin-1"
    });

    const result = await stagePendingMoves({
      actorAdminId: "admin-1",
      pendingFlags: [
        makePendingFlag({
          teamId: "team-vg",
          teamName: "Vanguard",
          tierId: "tier1",
          movementType: "demotion",
          reason: "same_tier_demotion_rate"
        }),
        makePendingFlag({
          teamId: "team-nv",
          teamName: "Nova",
          tierId: "tier2",
          movementType: "promotion"
        }),
        makePendingFlag({
          teamId: "team-cf",
          teamName: "Coldfront",
          tierId: "tier6",
          movementType: "promotion"
        }),
        makePendingFlag({
          teamId: "team-sk",
          teamName: "Skyline",
          tierId: "tier4",
          movementType: "demotion",
          reason: "same_tier_demotion_rate"
        })
      ]
    });

    assert.equal(result.ok, true);
    assert.equal(result.stagedCount, 2);
    assert.equal(result.skippedCount, 2);
    assert.match(result.message, /Staged 2 pending moves\./);
    assert.match(result.message, /Skipped 2 Tier 1-related moves\./);
    assert.equal(stagedTeamMoves.find((move) => move.teamId === "team-cf")?.stagedTierId, "tier5");
    assert.equal(stagedTeamMoves.find((move) => move.teamId === "team-sk")?.stagedTierId, "tier5");
  });

  it("keeps invalid staged capacity states and reports validation issues", async () => {
    await moveTeam({ teamId: "team-nv", targetTierId: "tier1", actorAdminId: "admin-1" });
    await moveTeam({ teamId: "team-bl", targetTierId: "tier1", actorAdminId: "admin-1" });
    await moveTeam({ teamId: "team-cr", targetTierId: "tier1", actorAdminId: "admin-1" });
    await moveTeam({ teamId: "team-kr", targetTierId: "tier1", actorAdminId: "admin-1" });

    const issues = getStagedMoveValidationIssues(teams, stagedTeamMoves);

    assert.equal(stagedTeamMoves.length, 4);
    assert.equal(issues.some((issue) => issue.message === "Tier 1 is full"), true);
  });

  it("records the selected publish phase in demo history and activity logs", async () => {
    await moveTeam({
      teamId: "team-cf",
      targetTierId: "tier3",
      actorAdminId: "admin-1"
    });

    const result = await publishStagedMoves({
      actorAdminId: "admin-1",
      publishPhase: "midseason",
      selectedSeasonKey: "2026-01"
    });

    assert.equal(result.ok, true);
    assert.match(result.message, /midseason/i);
    assert.match(result.message, /Jan 2026/);
    assert.equal(tierHistory[0]?.reason, "Published midseason promotion for Jan 2026");
    assert.equal(activityLog[0]?.verb, "published midseason promotion");
    assert.equal(activityLog[0]?.subject.includes("Jan 2026"), true);
  });
});
