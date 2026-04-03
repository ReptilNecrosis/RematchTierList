import assert from "node:assert/strict";

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
  teamOne: Team | { id?: string; name: string; tierId: Team["tierId"] };
  teamTwo: Team | { id?: string; name: string; tierId: Team["tierId"] };
  teamOneScore: number;
  teamTwoScore: number;
}): SeriesResult {
  return {
    id: args.id,
    tournamentId: "tour-1",
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

function run() {
  const referenceDate = new Date("2026-03-24T00:00:00.000Z");

  const alpha = makeTeam("alpha", "Alpha Prime", "tier2");
  const beta = makeTeam("beta", "Bravo XI", "tier2");
  const elite = makeTeam("elite", "Cinder", "tier1");
  const rookie = makeTeam("rookie", "Rookie Mix", "tier7", false);

  const seasonSeries: SeriesResult[] = [
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

  const seasonStats = calculateTeamStats([alpha, beta, elite, rookie], seasonSeries, referenceDate);
  assert.equal(seasonStats.alpha.sameTierWinRate, 0.8);
  assert.equal(seasonStats.alpha.oneTierUpWinRate, 0.4);
  assert.equal(seasonStats.alpha.seasonSeriesPlayed, 11);
  assert.equal(seasonStats.alpha.countedGames, 10);

  const seasonFlags = deriveEligibilityFlags(
    [alpha, beta, elite, rookie],
    seasonStats,
    referenceDate.toISOString()
  );
  assert.equal(
    seasonFlags.some((flag) => flag.teamId === "alpha" && flag.reason === "same_tier_promotion_rate"),
    true
  );
  assert.equal(
    seasonFlags.some((flag) => flag.teamId === "alpha" && flag.reason === "one_tier_up_win_rate"),
    true
  );

  const switchback = makeTeam("switchback", "Switchback", "tier4");
  const equalizer = makeTeam("equalizer", "Equalizer", "tier4");
  const crown = makeTeam("crown", "Crown", "tier2");
  const basement = makeTeam("basement", "Basement", "tier6");
  const stale = makeTeam("stale", "Stale Line", "tier3");
  const stalePeer = makeTeam("stale-peer", "Stale Peer", "tier3");

  const conflictSeries: SeriesResult[] = [
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

  const conflictStats = calculateTeamStats(
    [switchback, equalizer, crown, basement, stale, stalePeer],
    conflictSeries,
    referenceDate
  );
  const conflictFlags = deriveEligibilityFlags(
    [switchback, equalizer, crown, basement, stale, stalePeer],
    conflictStats,
    referenceDate.toISOString()
  ).filter((flag) => flag.teamId === "switchback");

  assert.equal(conflictFlags.length, 0);
  assert.equal(conflictStats.stale.inactivityFlag, "red");

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

  const challengeSeries: SeriesResult[] = [
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

  const challengeTeams = [...tier1Teams, climber, rival, slip, peer, ...tier5Teams];
  const challengeStats = calculateTeamStats(challengeTeams, challengeSeries, referenceDate);
  const challengeFlags = deriveEligibilityFlags(
    challengeTeams,
    challengeStats,
    referenceDate.toISOString()
  );
  const challengeCards = deriveTeamCards(challengeTeams, challengeStats, challengeFlags);
  const challenges = deriveBlockedChallenges(
    challengeTeams,
    challengeCards,
    challengeFlags,
    referenceDate
  );

  assert.equal(
    challenges.some((challenge) => challenge.blockedMovement === "promotion" && challenge.defenderTeamName === "Anchor"),
    true
  );
  assert.equal(
    challenges.some((challenge) => challenge.blockedMovement === "demotion" && challenge.challengerTeamName === "Aspire"),
    true
  );

  const topDog = makeTeam("top-dog", "Top Dog", "tier1");
  const underdog = makeTeam("underdog", "Underdog", "tier5");
  const trialA = makeTeam("trial-a", "Trial A", "tier3");
  const trialB = makeTeam("trial-b", "Trial B", "tier3");

  const snapshot = buildDashboardSnapshot({
    teams: [topDog, underdog, trialA, trialB],
    series: [
      makeSeries({ id: "r1", playedAt: "2026-03-20T00:00:00.000Z", teamOne: underdog, teamTwo: topDog, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "u1", playedAt: "2026-03-10T00:00:00.000Z", teamOne: { name: "Mystery Squad", tierId: "tier7" }, teamTwo: trialA, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "u2", playedAt: "2026-03-12T00:00:00.000Z", teamOne: { name: "Mystery Squad", tierId: "tier7" }, teamTwo: trialA, teamOneScore: 0, teamTwoScore: 2 }),
      makeSeries({ id: "u3", playedAt: "2026-03-14T00:00:00.000Z", teamOne: { name: "Mystery Squad", tierId: "tier7" }, teamTwo: trialB, teamOneScore: 2, teamTwoScore: 1 })
    ],
    appearances: [
      { id: "app-1", teamName: "Mystery Squad", normalizedName: "mystery squad", tournamentId: "tour-1", seenAt: "2026-03-10T00:00:00.000Z" },
      { id: "app-2", teamName: "Mystery Squad", normalizedName: "mystery squad", tournamentId: "tour-2", seenAt: "2026-03-12T00:00:00.000Z" },
      { id: "app-3", teamName: "Mystery Squad", normalizedName: "mystery squad", tournamentId: "tour-3", seenAt: "2026-03-14T00:00:00.000Z" }
    ],
    referenceDate
  });

  assert.equal(snapshot.reviewFlags.length, 2);
  assert.equal(snapshot.unverifiedTeams[0]?.suggestedTierId, "tier3");
  assert.equal(snapshot.unverifiedTeams[0]?.autoPlaced, true);

  const tier4 = makeTeam("tier4", "Tier Four", "tier4");
  const tier5 = makeTeam("tier5", "Tier Five", "tier5");
  const tier6 = makeTeam("tier6", "Tier Six", "tier6");
  const lowest = makeTeam("lowest", "Lowest", "tier7");
  const lowestPeer = makeTeam("lowest-peer", "Lowest Peer", "tier7");

  const lowestTierSeries: SeriesResult[] = [
    makeSeries({ id: "lowest-1", playedAt: "2026-03-10T00:00:00.000Z", teamOne: tier6, teamTwo: lowest, teamOneScore: 2, teamTwoScore: 0 }),
    makeSeries({ id: "lowest-2", playedAt: "2026-03-11T00:00:00.000Z", teamOne: lowest, teamTwo: tier5, teamOneScore: 2, teamTwoScore: 1 }),
    makeSeries({ id: "lowest-3", playedAt: "2026-03-12T00:00:00.000Z", teamOne: lowest, teamTwo: lowestPeer, teamOneScore: 2, teamTwoScore: 0 }),
    makeSeries({ id: "control-1", playedAt: "2026-03-13T00:00:00.000Z", teamOne: tier4, teamTwo: tier5, teamOneScore: 2, teamTwoScore: 0 })
  ];

  const lowestTierStats = calculateTeamStats(
    [tier4, tier5, tier6, lowest, lowestPeer],
    lowestTierSeries,
    referenceDate
  );

  assert.equal(lowestTierStats.tier6.countedGames, 1);
  assert.equal(lowestTierStats.tier6.oneTierDownGames, 0);
  assert.equal(lowestTierStats.tier5.countedGames, 2);
  assert.equal(lowestTierStats.tier5.twoTierDownGames, 0);
  assert.equal(lowestTierStats.tier4.oneTierDownGames, 1);
  assert.equal(lowestTierStats.lowest.oneTierUpGames, 1);
  assert.equal(lowestTierStats.lowest.twoTierUpGames, 1);
  assert.equal(lowestTierStats.lowest.sameTierGames, 1);

  const tier3 = makeTeam("tier3", "Tier Three", "tier3");
  const reviewSeries: SeriesResult[] = [
    makeSeries({ id: "review-lowest", playedAt: "2026-03-10T00:00:00.000Z", teamOne: lowest, teamTwo: tier4, teamOneScore: 2, teamTwoScore: 1 }),
    makeSeries({ id: "review-control", playedAt: "2026-03-11T00:00:00.000Z", teamOne: tier6, teamTwo: tier3, teamOneScore: 2, teamTwoScore: 1 })
  ];
  const liveReviewFlags = deriveReviewFlags([tier3, tier4, tier5, tier6, lowest], reviewSeries, referenceDate);

  assert.equal(liveReviewFlags.length, 2);
  assert.equal(liveReviewFlags.every((flag) => flag.seriesId === "review-control"), true);

  const previewTierMap = {
    [tier6.id]: "tier7" as const
  };
  const previewStats = calculateTeamStats(
    [tier3, tier4, tier5, tier6, lowest],
    [makeSeries({ id: "preview-buckets", playedAt: "2026-03-12T00:00:00.000Z", teamOne: tier6, teamTwo: tier5, teamOneScore: 2, teamTwoScore: 1 })],
    referenceDate,
    previewTierMap
  );

  assert.equal(previewStats.tier5.oneTierDownGames, 0);
  assert.equal(previewStats.tier5.countedGames, 1);
  assert.equal(previewStats.tier6.twoTierUpGames, 1);

  const previewSnapshot = buildDashboardSnapshot({
    teams: [tier3, tier4, tier5, tier6, lowest],
    series: [
      makeSeries({ id: "review-lowest", playedAt: "2026-03-10T00:00:00.000Z", teamOne: lowest, teamTwo: tier4, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "review-control", playedAt: "2026-03-11T00:00:00.000Z", teamOne: tier6, teamTwo: tier3, teamOneScore: 2, teamTwoScore: 1 })
    ],
    appearances: [],
    referenceDate,
    effectiveTierByTeamId: previewTierMap
  });

  assert.equal(previewSnapshot.reviewFlags.length, 0);

  console.log("rules-engine assertions passed");
}

run();
