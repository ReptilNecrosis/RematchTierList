import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ActivityEntry,
  ChallengeSeries,
  SeriesResult,
  Team,
  TournamentRecord,
  UnverifiedAppearance
} from "@rematch/shared-types";

import { buildAdminDashboardPayload } from "./repository";

function makeTeam(id: string, name: string, tierId: Team["tierId"]): Team {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    tierId,
    verified: true,
    createdAt: "2024-03-01T00:00:00.000Z",
    addedBy: "owner"
  };
}

function makeSeries(args: {
  id: string;
  playedAt: string;
  tournamentId: string;
  teamOne: Team;
  teamTwo: Team;
  teamOneScore: number;
  teamTwoScore: number;
}): SeriesResult {
  return {
    id: args.id,
    tournamentId: args.tournamentId,
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

describe("admin dashboard season payload", () => {
  it("builds the admin preview from the selected season instead of the latest season", () => {
    const marchMover = makeTeam("march-mover", "March Mover", "tier2");
    const marchPeer = makeTeam("march-peer", "March Peer", "tier2");
    const aprilMover = makeTeam("april-mover", "April Mover", "tier3");
    const aprilPeer = makeTeam("april-peer", "April Peer", "tier3");
    const teams = [marchMover, marchPeer, aprilMover, aprilPeer];

    const tournaments: TournamentRecord[] = [
      {
        id: "tour-march",
        title: "March Cup",
        eventDate: "2024-03-31T18:00:00.000Z",
        createdBy: "owner",
        createdAt: "2024-03-31T18:00:00.000Z",
        sourceLinks: []
      },
      {
        id: "tour-april",
        title: "April Cup",
        eventDate: "2024-04-10T18:00:00.000Z",
        createdBy: "owner",
        createdAt: "2024-04-10T18:00:00.000Z",
        sourceLinks: []
      }
    ];

    const series: SeriesResult[] = [
      makeSeries({ id: "march-1", tournamentId: "tour-march", playedAt: "2024-03-27T00:00:00.000Z", teamOne: marchMover, teamTwo: marchPeer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "march-2", tournamentId: "tour-march", playedAt: "2024-03-28T00:00:00.000Z", teamOne: marchMover, teamTwo: marchPeer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "march-3", tournamentId: "tour-march", playedAt: "2024-03-29T00:00:00.000Z", teamOne: marchMover, teamTwo: marchPeer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "march-4", tournamentId: "tour-march", playedAt: "2024-03-30T00:00:00.000Z", teamOne: marchMover, teamTwo: marchPeer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "march-5", tournamentId: "tour-march", playedAt: "2024-03-31T00:00:00.000Z", teamOne: marchMover, teamTwo: marchPeer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "april-1", tournamentId: "tour-april", playedAt: "2024-04-10T00:00:00.000Z", teamOne: aprilMover, teamTwo: aprilPeer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "april-2", tournamentId: "tour-april", playedAt: "2024-04-11T00:00:00.000Z", teamOne: aprilMover, teamTwo: aprilPeer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "april-3", tournamentId: "tour-april", playedAt: "2024-04-12T00:00:00.000Z", teamOne: aprilMover, teamTwo: aprilPeer, teamOneScore: 2, teamTwoScore: 0 }),
      makeSeries({ id: "april-4", tournamentId: "tour-april", playedAt: "2024-04-13T00:00:00.000Z", teamOne: aprilMover, teamTwo: aprilPeer, teamOneScore: 2, teamTwoScore: 1 }),
      makeSeries({ id: "april-5", tournamentId: "tour-april", playedAt: "2024-04-14T00:00:00.000Z", teamOne: aprilMover, teamTwo: aprilPeer, teamOneScore: 2, teamTwoScore: 0 })
    ];

    const activity: ActivityEntry[] = [
      {
        id: "act-march",
        actorUsername: "owner",
        actorDisplayName: "Owner",
        verb: "logged",
        subject: "March Cup",
        createdAt: "2024-03-31T20:00:00.000Z"
      },
      {
        id: "act-april",
        actorUsername: "owner",
        actorDisplayName: "Owner",
        verb: "logged",
        subject: "April Cup",
        createdAt: "2024-04-10T20:00:00.000Z"
      }
    ];

    const challenges: ChallengeSeries[] = [
      {
        id: "live-only",
        state: "active",
        createdAt: "2024-04-11T00:00:00.000Z",
        expiresAt: "2024-04-25T00:00:00.000Z",
        challengerTeamId: aprilMover.id,
        challengerTeamName: aprilMover.name,
        defenderTeamId: aprilPeer.id,
        defenderTeamName: aprilPeer.name,
        challengerTierId: aprilMover.tierId,
        defenderTierId: aprilPeer.tierId,
        reason: "Current season only",
        blockedMovement: "promotion",
        challengerWins: 0,
        defenderWins: 0
      }
    ];

    const payload = buildAdminDashboardPayload({
      teams,
      series,
      appearances: [] satisfies UnverifiedAppearance[],
      tournaments,
      activity,
      challenges,
      recentManualMoves: new Map(),
      stagedMoves: [],
      selectedSeasonKey: "2024-03"
    });

    assert.equal(payload.selectedSeasonKey, "2024-03");
    assert.equal(payload.selectedSeasonLabel, "Mar 2024");
    assert.deepEqual(
      payload.previewSnapshot.pendingFlags.map((flag) => flag.teamId).sort(),
      [marchMover.id, marchPeer.id].sort()
    );
    assert.equal(
      payload.previewSnapshot.pendingFlags.some((flag) => flag.teamId === aprilMover.id),
      false
    );
    assert.equal(payload.previewSnapshot.activity.length, 1);
    assert.equal(payload.previewSnapshot.activity[0]?.id, "act-march");
    assert.equal(payload.tournaments.length, 1);
    assert.equal(payload.tournaments[0]?.id, "tour-march");
    assert.equal(payload.previewSnapshot.challenges.length, 0);
  });

  it("returns the latest available season when no admin season is provided", () => {
    const teamA = makeTeam("team-a", "Team A", "tier2");
    const teamB = makeTeam("team-b", "Team B", "tier2");

    const payload = buildAdminDashboardPayload({
      teams: [teamA, teamB],
      series: [
        makeSeries({
          id: "latest-series",
          tournamentId: "tour-april",
          playedAt: "2024-04-14T00:00:00.000Z",
          teamOne: teamA,
          teamTwo: teamB,
          teamOneScore: 2,
          teamTwoScore: 0
        })
      ],
      appearances: [],
      tournaments: [
        {
          id: "tour-april",
          title: "April Cup",
          eventDate: "2024-04-14T18:00:00.000Z",
          createdBy: "owner",
          createdAt: "2024-04-14T18:00:00.000Z",
          sourceLinks: []
        }
      ],
      activity: [],
      challenges: [],
      recentManualMoves: new Map(),
      stagedMoves: []
    });

    assert.equal(payload.selectedSeasonKey, "2024-04");
    assert.equal(payload.availableSeasons[0]?.key, "2024-04");
  });

  it("admin preview uses preview tiers so promoted teams do not show as eligible based on old-tier wins", () => {
    const currentSeasonKey = new Date().toISOString().slice(0, 7);
    const currentMonthStart = `${currentSeasonKey}-10T00:00:00.000Z`;
    const currentMonthFollowUp = `${currentSeasonKey}-11T00:00:00.000Z`;
    const promoted = makeTeam("wildcats", "Wildcats", "tier6");
    const opponent = makeTeam("entry-peer", "Entry Peer", "tier7");

    const payload = buildAdminDashboardPayload({
      teams: [promoted, opponent],
      series: [
        {
          id: "played-in-tier7-1",
          tournamentId: "tour-current",
          playedAt: currentMonthStart,
          teamOneName: promoted.name,
          teamTwoName: opponent.name,
          teamOneId: promoted.id,
          teamTwoId: opponent.id,
          teamOneTierId: "tier7",
          teamTwoTierId: "tier7",
          teamOneScore: 2,
          teamTwoScore: 0,
          source: "battlefy",
          sourceRef: "played-in-tier7-1",
          confirmed: true
        },
        {
          id: "played-in-tier7-2",
          tournamentId: "tour-current",
          playedAt: currentMonthFollowUp,
          teamOneName: promoted.name,
          teamTwoName: opponent.name,
          teamOneId: promoted.id,
          teamTwoId: opponent.id,
          teamOneTierId: "tier7",
          teamTwoTierId: "tier7",
          teamOneScore: 2,
          teamTwoScore: 1,
          source: "battlefy",
          sourceRef: "played-in-tier7-2",
          confirmed: true
        }
      ],
      appearances: [],
      tournaments: [
        {
          id: "tour-current",
          title: "Current Month Cup",
          eventDate: currentMonthStart,
          createdBy: "owner",
          createdAt: currentMonthStart,
          sourceLinks: []
        }
      ],
      activity: [],
      challenges: [],
      recentManualMoves: new Map(),
      stagedMoves: [],
      selectedSeasonKey: currentSeasonKey
    });

    const promotedStats = payload.previewSnapshot.teamStats[promoted.id];

    assert.equal(promotedStats?.sameTierGames, 0);
    assert.equal(promotedStats?.oneTierUpGames, 0);
  });
});
