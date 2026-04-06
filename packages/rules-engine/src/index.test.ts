import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SeriesResult, Team } from "@rematch/shared-types";

import {
  buildDashboardSnapshot,
  calculateTeamStats,
  deriveBlockedChallenges,
  deriveEligibilityFlags,
  deriveReviewFlags,
  deriveTeamCards
} from "./index";

function makeTeam(id: string, name: string, tierId: Team["tierId"], verified = true): Team {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    shortCode: name.slice(0, 3).toUpperCase(),
    tierId,
    verified,
    createdAt: "2026-03-01T00:00:00.000Z",
    addedBy: "owner"
  };
}

function makeSeries(args: {
  id: string;
  playedAt: string;
  tournamentId?: string;
  teamOne: Team | { id?: string; name: string; tierId: Team["tierId"] };
  teamTwo: Team | { id?: string; name: string; tierId: Team["tierId"] };
  teamOneScore: number;
  teamTwoScore: number;
}): SeriesResult {
  return {
    id: args.id,
    tournamentId: args.tournamentId ?? "tour-1",
    playedAt: args.playedAt,
    teamOneName: args.teamOne.name,
    teamTwoName: args.teamTwo.name,
    teamOneId: args.teamOne.id,
    teamTwoId: args.teamTwo.id,
    teamOneTierId: args.teamOne.tierId,
    teamTwoTierId: args.teamTwo.tierId,
    teamOneScore: args.teamOneScore,
    teamTwoScore: args.teamTwoScore,
    source: "battlefy",
    sourceRef: args.id,
    confirmed: true
  };
}

const referenceDate = new Date("2026-03-24T00:00:00.000Z");

describe("rules engine", () => {
  it("applies season-only verified trackers and one-tier promotion thresholds", () => {
    const alpha = makeTeam("alpha", "Alpha Prime", "tier2");
    const beta = makeTeam("beta", "Bravo XI", "tier2");
    const elite = makeTeam("elite", "Cinder", "tier1");
    const rookie = makeTeam("rookie", "Rookie Mix", "tier7", false);

    const series: SeriesResult[] = [
      makeSeries({ id: "m1", playedAt: "2026-03-10T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "m2", playedAt: "2026-03-11T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "m3", playedAt: "2026-03-12T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "m4", playedAt: "2026-03-13T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "m5", playedAt: "2026-03-14T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "m6", playedAt: "2026-03-15T00:00:00.000Z", teamOne: alpha, teamTwo: elite, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "m7", playedAt: "2026-03-16T00:00:00.000Z", teamOne: elite, teamTwo: alpha, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "m8", playedAt: "2026-03-17T00:00:00.000Z", teamOne: alpha, teamTwo: elite, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "m9", playedAt: "2026-03-18T00:00:00.000Z", teamOne: elite, teamTwo: alpha, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "m10", playedAt: "2026-03-19T00:00:00.000Z", teamOne: elite, teamTwo: alpha, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "m11", playedAt: "2026-03-21T00:00:00.000Z", teamOne: alpha, teamTwo: rookie, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "m12", playedAt: "2026-02-27T00:00:00.000Z", teamOne: alpha, teamTwo: beta, teamOneScore: 2, teamTwoScore: 0 })
    ];

    const stats = calculateTeamStats([alpha, beta, elite, rookie], series, referenceDate);

    assert.equal(stats.alpha.sameTierWins, 4);
    assert.equal(stats.alpha.sameTierLosses, 1);
    assert.equal(stats.alpha.sameTierGames, 5);
    assert.equal(stats.alpha.sameTierWinRate, 0.8);
    assert.equal(stats.alpha.overallWinRate, 0.636);
    assert.equal(stats.alpha.oneTierUpWins, 2);
    assert.equal(stats.alpha.oneTierUpGames, 5);
    assert.equal(stats.alpha.oneTierUpWinRate, 0.4);
    assert.equal(stats.alpha.seasonSeriesPlayed, 11);
    assert.equal(stats.alpha.countedGames, 10);
    assert.equal(stats.alpha.countedWins, 6);
    assert.equal(stats.alpha.countedLosses, 4);

    const flags = deriveEligibilityFlags([alpha, beta, elite, rookie], stats, referenceDate.toISOString());
    const alphaFlags = flags.filter((flag) => flag.teamId === "alpha");

    assert.deepEqual(
      alphaFlags.map((flag) => flag.reason).sort(),
      ["one_tier_up_win_rate", "same_tier_promotion_rate"]
    );
    assert.equal(alphaFlags.every((flag) => flag.requiresManualApproval), true);
  });

  it("marks conflict states and updated inactivity thresholds", () => {
    const switchback = makeTeam("switchback", "Switchback", "tier4");
    const equalizer = makeTeam("equalizer", "Equalizer", "tier4");
    const crown = makeTeam("crown", "Crown", "tier2");
    const basement = makeTeam("basement", "Basement", "tier6");
    const idle = makeTeam("idle", "Idle Squad", "tier3");
    const stale = makeTeam("stale", "Stale Line", "tier3");
    const stalePeer = makeTeam("stale-peer", "Stale Peer", "tier3");

    const series: SeriesResult[] = [
      makeSeries({ id: "c1", playedAt: "2026-03-05T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "c2", playedAt: "2026-03-06T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "c3", playedAt: "2026-03-07T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "c4", playedAt: "2026-03-08T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "c5", playedAt: "2026-03-09T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "c6", playedAt: "2026-03-10T00:00:00.000Z", teamOne: switchback, teamTwo: equalizer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "c7", playedAt: "2026-03-11T00:00:00.000Z", teamOne: switchback, teamTwo: crown, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "c8", playedAt: "2026-03-12T00:00:00.000Z", teamOne: switchback, teamTwo: basement, teamOneScore: 1, teamTwoScore: 2 }),
      makeSeries({ id: "c9", playedAt: "2026-03-01T00:00:00.000Z", teamOne: stale, teamTwo: stalePeer, teamOneScore: 0, teamTwoScore: 2 })
    ];

    const stats = calculateTeamStats(
      [switchback, equalizer, crown, basement, idle, stale, stalePeer],
      series,
      referenceDate
    );
    const flags = deriveEligibilityFlags(
      [switchback, equalizer, crown, basement, idle, stale, stalePeer],
      stats,
      referenceDate.toISOString()
    );
    const switchbackFlags = flags.filter((flag) => flag.teamId === "switchback");

    assert.equal(switchbackFlags.length, 0);
    // idle has 0 tournaments this month → red flag on day 24
    assert.equal(stats.idle.inactivityFlag, "red");
    // stale has 1 tournament (tour-1) this month → yellow flag
    assert.equal(stats.stale.inactivityFlag, "yellow");
    assert.equal(stats.stale.removalFlag, false);

    const removalStats = calculateTeamStats(
      [stale, stalePeer],
      series.filter((entry) => entry.id === "c9"),
      new Date("2026-03-31T00:00:00.000Z")
    );
    assert.equal(removalStats.stale.removalFlag, true);
  });

  it("creates promotion and demotion blocked challenges", () => {
    const tier1Teams = Array.from({ length: 8 }, (_, index) =>
      makeTeam(`elite-${index + 1}`, index === 0 ? "Anchor" : `Elite ${index + 1}`, "tier1")
    );
    const climber = makeTeam("climber", "Climber", "tier2");
    const rival = makeTeam("rival", "Rival", "tier2");
    const slip = makeTeam("slip", "Slip", "tier4");
    const peer = makeTeam("peer", "Peer", "tier4");
    const tier5Teams = [
      makeTeam("aspire", "Aspire", "tier5"),
      makeTeam("bench", "Bench", "tier5"),
      ...Array.from({ length: 10 }, (_, index) => makeTeam(`filler-${index + 1}`, `Filler ${index + 1}`, "tier5"))
    ];

    const series: SeriesResult[] = [
      makeSeries({ id: "p1", playedAt: "2026-03-10T00:00:00.000Z", teamOne: climber, teamTwo: rival, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "p2", playedAt: "2026-03-11T00:00:00.000Z", teamOne: climber, teamTwo: rival, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "p3", playedAt: "2026-03-12T00:00:00.000Z", teamOne: climber, teamTwo: rival, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "p4", playedAt: "2026-03-13T00:00:00.000Z", teamOne: climber, teamTwo: rival, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "p5", playedAt: "2026-03-14T00:00:00.000Z", teamOne: climber, teamTwo: rival, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "d1", playedAt: "2026-03-15T00:00:00.000Z", teamOne: slip, teamTwo: peer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "d2", playedAt: "2026-03-16T00:00:00.000Z", teamOne: slip, teamTwo: peer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "d3", playedAt: "2026-03-17T00:00:00.000Z", teamOne: slip, teamTwo: peer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "d4", playedAt: "2026-03-18T00:00:00.000Z", teamOne: slip, teamTwo: peer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "d5", playedAt: "2026-03-19T00:00:00.000Z", teamOne: slip, teamTwo: peer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "a1", playedAt: "2026-03-20T00:00:00.000Z", teamOne: tier5Teams[0], teamTwo: tier5Teams[1], teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "a2", playedAt: "2026-03-21T00:00:00.000Z", teamOne: tier5Teams[0], teamTwo: tier5Teams[1], teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "a3", playedAt: "2026-03-22T00:00:00.000Z", teamOne: tier5Teams[0], teamTwo: tier5Teams[1], teamOneScore: 2, teamTwoScore: 0 })
    ];

    const teams = [...tier1Teams, climber, rival, slip, peer, ...tier5Teams];
    const stats = calculateTeamStats(teams, series, referenceDate);
    const flags = deriveEligibilityFlags(teams, stats, referenceDate.toISOString());
    const cards = deriveTeamCards(teams, stats, flags);
    const challenges = deriveBlockedChallenges(teams, cards, flags, referenceDate);

    assert.equal(challenges.some((challenge) => challenge.blockedMovement === "promotion" && challenge.challengerTeamName === "Climber" && challenge.defenderTeamName === "Anchor"), true);
    assert.equal(challenges.some((challenge) => challenge.blockedMovement === "demotion" && challenge.challengerTeamName === "Aspire" && challenge.defenderTeamName === "Slip"), true);
  });

  it("builds review flags and suggested tiers for unverified teams", () => {
    const topDog = makeTeam("top-dog", "Top Dog", "tier1");
    const underdog = makeTeam("underdog", "Underdog", "tier5");
    const trialA = makeTeam("trial-a", "Trial A", "tier3");
    const trialB = makeTeam("trial-b", "Trial B", "tier3");

    const series: SeriesResult[] = [
      makeSeries({ id: "r1", playedAt: "2026-03-20T00:00:00.000Z", teamOne: underdog, teamTwo: topDog, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({
        id: "u1",
        playedAt: "2026-03-10T00:00:00.000Z",
        teamOne: { name: "Mystery Squad", tierId: "tier7" },
        teamTwo: trialA,
        teamOneScore: 2,
        teamTwoScore: 0
      }),
      makeSeries({
        id: "u2",
        playedAt: "2026-03-12T00:00:00.000Z",
        teamOne: { name: "Mystery Squad", tierId: "tier7" },
        teamTwo: trialA,
        teamOneScore: 0,
        teamTwoScore: 2
      }),
      makeSeries({
        id: "u3",
        playedAt: "2026-03-14T00:00:00.000Z",
        teamOne: { name: "Mystery Squad", tierId: "tier7" },
        teamTwo: trialB,
        teamOneScore: 2,
        teamTwoScore: 1
      })
    ];

    const snapshot = buildDashboardSnapshot({
      teams: [topDog, underdog, trialA, trialB],
      series,
      appearances: [
        {
          id: "app-1",
          teamName: "Mystery Squad",
          normalizedName: "mystery squad",
          tournamentId: "tour-1",
          seenAt: "2026-03-10T00:00:00.000Z"
        },
        {
          id: "app-2",
          teamName: "Mystery Squad",
          normalizedName: "mystery squad",
          tournamentId: "tour-2",
          seenAt: "2026-03-12T00:00:00.000Z"
        },
        {
          id: "app-3",
          teamName: "Mystery Squad",
          normalizedName: "mystery squad",
          tournamentId: "tour-3",
          seenAt: "2026-03-14T00:00:00.000Z"
        }
      ],
      referenceDate
    });

    assert.equal(snapshot.reviewFlags.length, 2);
    assert.equal(snapshot.reviewFlags.some((flag) => flag.reason === "win_vs_three_plus_higher"), true);
    assert.equal(snapshot.reviewFlags.some((flag) => flag.reason === "loss_vs_three_plus_lower"), true);
    assert.equal(snapshot.unverifiedTeams[0]?.autoPlaced, true);
    assert.equal(snapshot.unverifiedTeams[0]?.firstSeenAt, "2026-03-10T00:00:00.000Z");
    assert.equal(snapshot.unverifiedTeams[0]?.suggestedTierId, "tier3");
    assert.equal(snapshot.unverifiedTeams[0]?.suggestedTierSeriesCount, 3);
    assert.equal(snapshot.unverifiedTeams[0]?.suggestedTierWinRate, 0.667);
  });

  it("counts lowest-tier promo-demotion buckets only for the lowest-tier team", () => {
    const tier4 = makeTeam("tier4", "Tier Four", "tier4");
    const tier5 = makeTeam("tier5", "Tier Five", "tier5");
    const tier6 = makeTeam("tier6", "Tier Six", "tier6");
    const lowest = makeTeam("lowest", "Lowest", "tier7");
    const lowestPeer = makeTeam("lowest-peer", "Lowest Peer", "tier7");

    const series: SeriesResult[] = [
      makeSeries({
        id: "lowest-1",
        playedAt: "2026-03-10T00:00:00.000Z",
        teamOne: tier6,
        teamTwo: lowest,
        teamOneScore: 2,
        teamTwoScore: 0
      }),
      makeSeries({
        id: "lowest-2",
        playedAt: "2026-03-11T00:00:00.000Z",
        teamOne: lowest,
        teamTwo: tier5,
        teamOneScore: 2,
        teamTwoScore: 1
      }),
      makeSeries({
        id: "lowest-3",
        playedAt: "2026-03-12T00:00:00.000Z",
        teamOne: lowest,
        teamTwo: lowestPeer,
        teamOneScore: 2,
        teamTwoScore: 0
      }),
      makeSeries({
        id: "control-1",
        playedAt: "2026-03-13T00:00:00.000Z",
        teamOne: tier4,
        teamTwo: tier5,
        teamOneScore: 2,
        teamTwoScore: 0
      })
    ];

    const stats = calculateTeamStats([tier4, tier5, tier6, lowest, lowestPeer], series, referenceDate);

    assert.equal(stats.tier6.countedGames, 1);
    assert.equal(stats.tier6.countedWins, 1);
    assert.equal(stats.tier6.oneTierDownGames, 0);
    assert.equal(stats.tier6.oneTierDownWins, 0);
    assert.equal(stats.tier5.countedGames, 2);
    assert.equal(stats.tier5.countedLosses, 2);
    assert.equal(stats.tier5.twoTierDownGames, 0);
    assert.equal(stats.tier5.twoTierDownLosses, 0);
    assert.equal(stats.tier4.oneTierDownGames, 1);
    assert.equal(stats.tier4.oneTierDownWins, 1);
    assert.equal(stats.lowest.oneTierUpGames, 1);
    assert.equal(stats.lowest.oneTierUpLosses, 1);
    assert.equal(stats.lowest.twoTierUpGames, 1);
    assert.equal(stats.lowest.twoTierUpWins, 1);
    assert.equal(stats.lowest.sameTierGames, 1);
    assert.equal(stats.lowest.sameTierWins, 1);
  });

  it("suppresses lowest-tier review flags and honors preview-tier overrides", () => {
    const tier3 = makeTeam("tier3", "Tier Three", "tier3");
    const tier4 = makeTeam("tier4", "Tier Four", "tier4");
    const tier5 = makeTeam("tier5", "Tier Five", "tier5");
    const tier6 = makeTeam("tier6", "Tier Six", "tier6");
    const lowest = makeTeam("lowest", "Lowest", "tier7");

    const series: SeriesResult[] = [
      makeSeries({
        id: "review-lowest",
        playedAt: "2026-03-10T00:00:00.000Z",
        teamOne: lowest,
        teamTwo: tier4,
        teamOneScore: 2,
        teamTwoScore: 1
      }),
      makeSeries({
        id: "review-control",
        playedAt: "2026-03-11T00:00:00.000Z",
        teamOne: tier6,
        teamTwo: tier3,
        teamOneScore: 2,
        teamTwoScore: 1
      })
    ];

    const liveFlags = deriveReviewFlags([tier3, tier4, tier6, lowest], series, referenceDate);

    assert.equal(liveFlags.length, 2);
    assert.equal(liveFlags.every((flag) => flag.seriesId === "review-control"), true);

    const previewTierMap = {
      [tier6.id]: "tier7" as const
    };
    const previewStats = calculateTeamStats(
      [tier3, tier4, tier5, tier6, lowest],
      [
        makeSeries({
          id: "preview-buckets",
          playedAt: "2026-03-12T00:00:00.000Z",
          teamOne: tier6,
          teamTwo: tier5,
          teamOneScore: 2,
          teamTwoScore: 1
        })
      ],
      referenceDate,
      previewTierMap
    );

    assert.equal(previewStats.tier5.oneTierDownGames, 0);
    assert.equal(previewStats.tier5.countedGames, 1);
    assert.equal(previewStats.tier6.twoTierUpGames, 1);
    assert.equal(previewStats.tier6.twoTierUpWins, 1);

    const previewSnapshot = buildDashboardSnapshot({
      teams: [tier3, tier4, tier5, tier6, lowest],
      series,
      appearances: [],
      referenceDate,
      effectiveTierByTeamId: previewTierMap
    });

    assert.equal(previewSnapshot.reviewFlags.length, 0);
  });

  it("ignores resolved appearances when building the pending unverified queue", () => {
    const verified = makeTeam("verified", "Verified Team", "tier3");

    const snapshot = buildDashboardSnapshot({
      teams: [verified],
      series: [],
      appearances: [
        {
          id: "pending-1",
          teamName: "Queue Team",
          normalizedName: "queue team",
          tournamentId: "tour-1",
          seenAt: "2026-03-10T00:00:00.000Z"
        },
        {
          id: "dismissed-1",
          teamName: "Dismissed Team",
          normalizedName: "dismissed team",
          tournamentId: "tour-2",
          seenAt: "2026-03-11T00:00:00.000Z",
          resolutionStatus: "dismissed"
        },
        {
          id: "confirmed-1",
          teamName: "Confirmed Team",
          normalizedName: "confirmed team",
          tournamentId: "tour-3",
          seenAt: "2026-03-12T00:00:00.000Z",
          resolutionStatus: "confirmed",
          resolvedTeamId: verified.id
        }
      ],
      referenceDate
    });

    assert.equal(snapshot.unverifiedTeams.length, 1);
    assert.equal(snapshot.unverifiedTeams[0]?.normalizedName, "queue team");
  });

  it("simulates a full season lifecycle across eligibility, inactivity, blocked movement, and rollover", () => {
    const marchReferenceDate = new Date("2026-03-31T00:00:00.000Z");
    const marchTier1Teams = Array.from({ length: 8 }, (_, index) =>
      makeTeam(`march-elite-${index + 1}`, index === 0 ? "Anchor" : `March Elite ${index + 1}`, "tier1")
    );
    const climberSeason = makeTeam("season-climber", "Season Climber", "tier2");
    const rivalSeason = makeTeam("season-rival", "Season Rival", "tier2");
    const riser = makeTeam("season-riser", "Season Riser", "tier3");
    const foil = makeTeam("season-foil", "Season Foil", "tier3");
    const idleSeason = makeTeam("season-idle", "Season Idle", "tier3");
    const staleSeason = makeTeam("season-stale", "Season Stale", "tier3");
    const staleSeasonPeer = makeTeam("season-stale-peer", "Season Stale Peer", "tier3");
    const dormant = makeTeam("season-dormant", "Season Dormant", "tier3");
    const dormantPeer = makeTeam("season-dormant-peer", "Season Dormant Peer", "tier3");
    const removed = makeTeam("season-removed", "Season Removed", "tier3");
    const removedPeer = makeTeam("season-removed-peer", "Season Removed Peer", "tier3");
    const slipSeason = makeTeam("season-slip", "Season Slip", "tier4");
    const peerSeason = makeTeam("season-peer", "Season Peer", "tier4");
    const aspireSeason = makeTeam("season-aspire", "Season Aspire", "tier5");
    const benchSeason = makeTeam("season-bench", "Season Bench", "tier5");
    const tier5Fillers = Array.from({ length: 10 }, (_, index) =>
      makeTeam(`season-tier5-filler-${index + 1}`, `Season Tier 5 Filler ${index + 1}`, "tier5")
    );
    const faller = makeTeam("season-faller", "Season Faller", "tier6");
    const dune = makeTeam("season-dune", "Season Dune", "tier6");
    const aprilPeer = makeTeam("season-april-peer", "Season April Peer", "tier7");

    const seasonFlowTeams = [
      ...marchTier1Teams,
      climberSeason,
      rivalSeason,
      riser,
      foil,
      idleSeason,
      staleSeason,
      staleSeasonPeer,
      dormant,
      dormantPeer,
      removed,
      removedPeer,
      slipSeason,
      peerSeason,
      aspireSeason,
      benchSeason,
      ...tier5Fillers,
      faller,
      dune,
      aprilPeer
    ];

    const marchSeasonSeries: SeriesResult[] = [
      makeSeries({ id: "season-riser-1", playedAt: "2026-03-01T00:00:00.000Z", teamOne: riser, teamTwo: foil, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-riser-2", playedAt: "2026-03-02T00:00:00.000Z", teamOne: riser, teamTwo: foil, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "season-riser-3", playedAt: "2026-03-03T00:00:00.000Z", teamOne: riser, teamTwo: foil, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-riser-4", playedAt: "2026-03-04T00:00:00.000Z", teamOne: riser, teamTwo: foil, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "season-riser-5", playedAt: "2026-03-05T00:00:00.000Z", teamOne: riser, teamTwo: foil, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-climber-1", playedAt: "2026-03-06T00:00:00.000Z", teamOne: climberSeason, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-climber-2", playedAt: "2026-03-07T00:00:00.000Z", teamOne: climberSeason, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "season-climber-3", playedAt: "2026-03-08T00:00:00.000Z", teamOne: climberSeason, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-climber-4", playedAt: "2026-03-09T00:00:00.000Z", teamOne: climberSeason, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "season-climber-5", playedAt: "2026-03-10T00:00:00.000Z", teamOne: climberSeason, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-slip-1", playedAt: "2026-03-11T00:00:00.000Z", teamOne: slipSeason, teamTwo: peerSeason, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-slip-2", playedAt: "2026-03-12T00:00:00.000Z", teamOne: slipSeason, teamTwo: peerSeason, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-slip-3", playedAt: "2026-03-13T00:00:00.000Z", teamOne: slipSeason, teamTwo: peerSeason, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-slip-4", playedAt: "2026-03-14T00:00:00.000Z", teamOne: slipSeason, teamTwo: peerSeason, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-slip-5", playedAt: "2026-03-15T00:00:00.000Z", teamOne: slipSeason, teamTwo: peerSeason, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-faller-1", playedAt: "2026-03-16T00:00:00.000Z", teamOne: faller, teamTwo: dune, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-faller-2", playedAt: "2026-03-17T00:00:00.000Z", teamOne: faller, teamTwo: dune, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-faller-3", playedAt: "2026-03-18T00:00:00.000Z", teamOne: faller, teamTwo: dune, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-faller-4", playedAt: "2026-03-19T00:00:00.000Z", teamOne: faller, teamTwo: dune, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-faller-5", playedAt: "2026-03-20T00:00:00.000Z", teamOne: faller, teamTwo: dune, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-aspire-1", playedAt: "2026-03-21T00:00:00.000Z", teamOne: aspireSeason, teamTwo: benchSeason, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-aspire-2", playedAt: "2026-03-22T00:00:00.000Z", teamOne: aspireSeason, teamTwo: benchSeason, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "season-aspire-3", playedAt: "2026-03-23T00:00:00.000Z", teamOne: aspireSeason, teamTwo: benchSeason, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "season-stale-1", playedAt: "2026-03-20T00:00:00.000Z", teamOne: staleSeason, teamTwo: staleSeasonPeer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-dormant-1", playedAt: "2026-03-10T00:00:00.000Z", teamOne: dormant, teamTwo: dormantPeer, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "season-removed-1", playedAt: "2026-02-28T00:00:00.000Z", teamOne: removed, teamTwo: removedPeer, teamOneScore: 0, teamTwoScore: 2 })
    ];

    const marchSnapshot = buildDashboardSnapshot({
      teams: seasonFlowTeams,
      series: marchSeasonSeries,
      appearances: [],
      referenceDate: marchReferenceDate
    });

    assert.equal(
      marchSnapshot.pendingFlags.some(
        (flag) => flag.teamId === riser.id && flag.movementType === "promotion" && flag.reason === "same_tier_promotion_rate"
      ),
      true
    );
    assert.equal(
      marchSnapshot.pendingFlags.some(
        (flag) => flag.teamId === climberSeason.id && flag.movementType === "promotion" && flag.reason === "same_tier_promotion_rate"
      ),
      true
    );
    assert.equal(
      marchSnapshot.pendingFlags.some(
        (flag) => flag.teamId === slipSeason.id && flag.movementType === "demotion" && flag.reason === "same_tier_demotion_rate"
      ),
      true
    );
    assert.equal(
      marchSnapshot.pendingFlags.some(
        (flag) => flag.teamId === faller.id && flag.movementType === "demotion" && flag.reason === "same_tier_demotion_rate"
      ),
      true
    );
    assert.equal(
      marchSnapshot.challenges.some(
        (challenge) =>
          challenge.blockedMovement === "promotion" &&
          challenge.challengerTeamName === "Season Climber" &&
          challenge.defenderTeamName === "Anchor"
      ),
      true
    );
    assert.equal(
      marchSnapshot.challenges.some(
        (challenge) =>
          challenge.blockedMovement === "demotion" &&
          challenge.challengerTeamName === "Season Aspire" &&
          challenge.defenderTeamName === "Season Slip"
      ),
      true
    );
    // March 31 is last day of month — consequences apply
    // idleSeason: 0 tournaments in March → red flag, removal eligible
    assert.equal(marchSnapshot.teamStats[idleSeason.id].inactivityFlag, "red");
    assert.equal(marchSnapshot.teamStats[idleSeason.id].removalFlag, true);
    // staleSeason: 1 tournament (tour-1) in March → yellow flag, removal eligible on last day
    assert.equal(marchSnapshot.teamStats[staleSeason.id].inactivityFlag, "yellow");
    assert.equal(marchSnapshot.teamStats[staleSeason.id].removalFlag, true);
    // dormant: 1 tournament (tour-1) in March → yellow flag, removal eligible on last day
    assert.equal(marchSnapshot.teamStats[dormant.id].inactivityFlag, "yellow");
    assert.equal(marchSnapshot.teamStats[dormant.id].removalFlag, true);
    // removed: played in February only (0 March tournaments) → red flag, removal eligible
    assert.equal(marchSnapshot.teamStats[removed.id].inactivityFlag, "red");
    assert.equal(marchSnapshot.teamStats[removed.id].removalFlag, true);

    const aprilTeams = seasonFlowTeams.map((team) => {
      if (team.id === riser.id) {
        return { ...team, tierId: "tier2" as const };
      }
      if (team.id === faller.id) {
        return { ...team, tierId: "tier7" as const };
      }
      return { ...team };
    });
    const aprilSnapshot = buildDashboardSnapshot({
      teams: aprilTeams,
      series: [
        ...marchSeasonSeries,
        makeSeries({ id: "season-april-riser-1", playedAt: "2026-04-10T00:00:00.000Z", teamOne: { ...riser, tierId: "tier2" }, teamTwo: rivalSeason, teamOneScore: 2, teamTwoScore: 0 }),
        makeSeries({ id: "season-april-faller-1", playedAt: "2026-04-12T00:00:00.000Z", teamOne: { ...faller, tierId: "tier7" }, teamTwo: aprilPeer, teamOneScore: 0, teamTwoScore: 2 })
      ],
      appearances: [],
      referenceDate: new Date("2026-04-15T00:00:00.000Z")
    });

    assert.equal(aprilSnapshot.teamStats[riser.id].seasonSeriesPlayed, 1);
    assert.equal(aprilSnapshot.teamStats[riser.id].sameTierGames, 1);
    assert.equal(aprilSnapshot.teamStats[faller.id].seasonSeriesPlayed, 1);
    assert.equal(aprilSnapshot.teamStats[faller.id].sameTierGames, 1);
    assert.equal(aprilSnapshot.teamStats[climberSeason.id].seasonSeriesPlayed, 0);
    assert.equal(
      aprilSnapshot.pendingFlags.some((flag) =>
        [riser.id, climberSeason.id, slipSeason.id, faller.id].includes(flag.teamId)
      ),
      false
    );
    assert.equal(aprilSnapshot.challenges.length, 0);
  });

  it("applies monthly tournament-count inactivity rules", () => {
    const tier1Team = makeTeam("t1", "Apex", "tier1");
    const tier2Team = makeTeam("t2", "Beta", "tier2");
    const tier3Team = makeTeam("t3", "Gamma", "tier3");

    // Three distinct tournaments in April
    const seriesInTour1 = makeSeries({ id: "i1", tournamentId: "tour-april-1", playedAt: "2026-04-16T00:00:00.000Z", teamOne: tier1Team, teamTwo: tier2Team, teamOneScore: 2, teamTwoScore: 0 });
    const seriesInTour2 = makeSeries({ id: "i2", tournamentId: "tour-april-2", playedAt: "2026-04-17T00:00:00.000Z", teamOne: tier1Team, teamTwo: tier2Team, teamOneScore: 2, teamTwoScore: 1 });
    const seriesInTour3 = makeSeries({ id: "i3", tournamentId: "tour-april-3", playedAt: "2026-04-18T00:00:00.000Z", teamOne: tier1Team, teamTwo: tier2Team, teamOneScore: 1, teamTwoScore: 2 });
    // Extra series in tour-april-1 (same tournament, should not count twice)
    const seriesInTour1Again = makeSeries({ id: "i4", tournamentId: "tour-april-1", playedAt: "2026-04-19T00:00:00.000Z", teamOne: tier1Team, teamTwo: tier3Team, teamOneScore: 2, teamTwoScore: 0 });

    // Day 1-14: no flags regardless of activity
    const dayFourStats = calculateTeamStats([tier1Team, tier2Team, tier3Team], [seriesInTour1, seriesInTour2, seriesInTour3], new Date("2026-04-04T00:00:00.000Z"));
    assert.equal(dayFourStats[tier1Team.id].inactivityFlag, "none");
    assert.equal(dayFourStats[tier2Team.id].inactivityFlag, "none");
    assert.equal(dayFourStats[tier3Team.id].inactivityFlag, "none");

    // Day 15: mid-season flags kick in
    // tier3Team: 0 tournaments → red
    // tier2Team: 3 tournaments → no flag (Tier 2-7 needs 2+)
    // tier1Team: 3 distinct tournaments (tour-1 counts once) → orange (Tier 1 needs 4+)
    const day15Stats = calculateTeamStats(
      [tier1Team, tier2Team, tier3Team],
      [seriesInTour1, seriesInTour2, seriesInTour3, seriesInTour1Again],
      new Date("2026-04-15T00:00:00.000Z")
    );
    assert.equal(day15Stats[tier3Team.id].inactivityFlag, "red");
    assert.equal(day15Stats[tier3Team.id].removalFlag, false);
    assert.equal(day15Stats[tier2Team.id].inactivityFlag, "none");
    assert.equal(day15Stats[tier1Team.id].inactivityFlag, "orange");
    assert.equal(day15Stats[tier1Team.id].removalFlag, false);
    assert.equal(day15Stats[tier1Team.id].inactivityDemotionEligible, false);
    assert.equal(day15Stats[tier1Team.id].tournamentsPlayedThisMonth, 3);

    // Exactly 1 tournament → yellow
    const oneTourn = makeSeries({ id: "i5", tournamentId: "tour-april-only", playedAt: "2026-04-20T00:00:00.000Z", teamOne: tier3Team, teamTwo: tier2Team, teamOneScore: 2, teamTwoScore: 0 });
    const oneStats = calculateTeamStats([tier1Team, tier2Team, tier3Team], [oneTourn], new Date("2026-04-20T00:00:00.000Z"));
    assert.equal(oneStats[tier3Team.id].inactivityFlag, "yellow");
    assert.equal(oneStats[tier2Team.id].inactivityFlag, "yellow");

    // Last day of month: consequences apply
    // tier1Team with 3 tournaments → orange + demotionEligible
    // tier2Team with 1 tournament → yellow + removalFlag
    // tier3Team with 0 tournaments → red + removalFlag
    const lastDayStats = calculateTeamStats(
      [tier1Team, tier2Team, tier3Team],
      [seriesInTour1, seriesInTour2, seriesInTour3, seriesInTour1Again],
      new Date("2026-04-30T00:00:00.000Z")
    );
    assert.equal(lastDayStats[tier1Team.id].inactivityFlag, "orange");
    assert.equal(lastDayStats[tier1Team.id].removalFlag, false);
    assert.equal(lastDayStats[tier1Team.id].inactivityDemotionEligible, true);
    assert.equal(lastDayStats[tier2Team.id].inactivityFlag, "none"); // tier2 has 3 tournaments
    assert.equal(lastDayStats[tier2Team.id].removalFlag, false);
    assert.equal(lastDayStats[tier3Team.id].inactivityFlag, "red");
    assert.equal(lastDayStats[tier3Team.id].removalFlag, true);

    // Tier 1 with 4+ tournaments → no flag
    const tour4 = makeSeries({ id: "i6", tournamentId: "tour-april-4", playedAt: "2026-04-21T00:00:00.000Z", teamOne: tier1Team, teamTwo: tier3Team, teamOneScore: 2, teamTwoScore: 1 });
    const fullTier1Stats = calculateTeamStats(
      [tier1Team, tier2Team, tier3Team],
      [seriesInTour1, seriesInTour2, seriesInTour3, seriesInTour1Again, tour4],
      new Date("2026-04-25T00:00:00.000Z")
    );
    assert.equal(fullTier1Stats[tier1Team.id].inactivityFlag, "none");
    assert.equal(fullTier1Stats[tier1Team.id].tournamentsPlayedThisMonth, 4);
  });
});
