import type {
  ActivityEntry,
  AdminAccount,
  ChallengeSeries,
  ImportDraft,
  ImportPreviewRow,
  SeriesResult,
  StagedTeamMove,
  SettingsRecord,
  Team,
  TeamAlias,
  TeamTierHistoryEntry,
  TournamentRecord,
  UnverifiedAppearance
} from "@rematch/shared-types";
import { buildImportPreview, type CanonicalSeriesRow } from "@rematch/import-adapters";
import { TIER_DEFINITIONS, buildDashboardSnapshot } from "@rematch/rules-engine";

function iso(day: number) {
  return `2026-03-${String(day).padStart(2, "0")}T12:00:00.000Z`;
}

export const adminAccounts: AdminAccount[] = [
  { id: "admin-1", username: "owner", role: "super_admin", displayName: "Owner" },
  { id: "admin-2", username: "coowner", role: "super_admin", displayName: "Co-Owner" },
  { id: "admin-3", username: "ops", role: "admin", displayName: "Ops Admin" }
];

export const teams: Team[] = [
  { id: "team-nx", slug: "nexforce", name: "NexForce", tierId: "tier1", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-vg", slug: "vanguard", name: "Vanguard", tierId: "tier1", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-ik", slug: "ironknights", name: "IronKnights", tierId: "tier1", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-zn", slug: "zenith", name: "Zenith", tierId: "tier1", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-px", slug: "phantom-xi", name: "Phantom XI", tierId: "tier1", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-nv", slug: "nova", name: "Nova", tierId: "tier2", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-bl", slug: "bladelight", name: "BladeLight", tierId: "tier2", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-cr", slug: "crimsonrush", name: "CrimsonRush", tierId: "tier2", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-kr", slug: "kryptos", name: "Kryptos", tierId: "tier2", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-rv", slug: "revenant", name: "Revenant", tierId: "tier2", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-ar", slug: "arcane", name: "Arcane", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-hl", slug: "hollow", name: "Hollow", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-dk", slug: "darkside", name: "Darkside", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-rz", slug: "razorback", name: "Razorback", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-sw", slug: "swiftblade", name: "Swiftblade", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-pt", slug: "penitent", name: "Penitent", tierId: "tier3", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-cf", slug: "coldfront", name: "Coldfront", tierId: "tier4", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-sk", slug: "skyline", name: "Skyline", tierId: "tier4", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-vx", slug: "vortex", name: "Vortex", tierId: "tier4", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-ec", slug: "eclipse", name: "Eclipse", tierId: "tier5", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-hb", slug: "harbor", name: "Harbor", tierId: "tier5", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-rm", slug: "remnant", name: "Remnant", tierId: "tier5", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-pn", slug: "pinion", name: "Pinion", tierId: "tier6", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-em", slug: "ember", name: "Ember", tierId: "tier6", verified: true, createdAt: iso(1), addedBy: "owner" },
  { id: "team-rk", slug: "rookie-fc", name: "Rookie FC", tierId: "tier7", verified: true, createdAt: iso(1), addedBy: "owner" }
];

export const teamAliases: TeamAlias[] = [
  { id: "alias-1", teamId: "team-bl", alias: "Blade Light", createdAt: iso(3) },
  { id: "alias-2", teamId: "team-nx", alias: "Nex Force", createdAt: iso(3) }
];

function createSeries(
  id: string,
  day: number,
  teamOneId: string,
  teamTwoId: string,
  teamOneScore: number,
  teamTwoScore: number,
  source: "battlefy" | "startgg",
  tournamentId: string
): SeriesResult {
  const teamOne = teams.find((team) => team.id === teamOneId);
  const teamTwo = teams.find((team) => team.id === teamTwoId);
  if (!teamOne || !teamTwo) {
    throw new Error(`Unknown team in series ${id}`);
  }
  return {
    id,
    tournamentId,
    playedAt: iso(day),
    teamOneName: teamOne.name,
    teamTwoName: teamTwo.name,
    teamOneId,
    teamTwoId,
    teamOneTierId: teamOne.tierId,
    teamTwoTierId: teamTwo.tierId,
    teamOneScore,
    teamTwoScore,
    source,
    sourceRef: `${source}-${tournamentId}-${id}`,
    confirmed: true
  };
}

export const tournaments: TournamentRecord[] = [
  { id: "tour-12", title: "Tournament #12", eventDate: iso(12), createdBy: "owner", createdAt: iso(12), sourceLinks: [{ id: "src-12", url: "https://battlefy.com/demo/tournament-12/stage/aaa", source: "battlefy" }] },
  { id: "tour-13", title: "Tournament #13", eventDate: iso(17), createdBy: "owner", createdAt: iso(17), sourceLinks: [{ id: "src-13", url: "https://start.gg/tournament/demo-13/event/open/brackets/111/222", source: "startgg" }] },
  { id: "tour-14", title: "Tournament #14", eventDate: iso(20), createdBy: "owner", createdAt: iso(20), sourceLinks: [{ id: "src-14", url: "https://start.gg/tournament/demo-14/event/open/brackets/333/444", source: "startgg" }] }
];

export const series: SeriesResult[] = [
  createSeries("s1", 3, "team-nx", "team-vg", 2, 1, "battlefy", "tour-12"),
  createSeries("s2", 4, "team-nx", "team-ik", 2, 0, "battlefy", "tour-12"),
  createSeries("s3", 5, "team-vg", "team-px", 2, 0, "battlefy", "tour-12"),
  createSeries("s4", 6, "team-zn", "team-px", 2, 1, "battlefy", "tour-12"),
  createSeries("s5", 7, "team-px", "team-nx", 0, 2, "battlefy", "tour-12"),
  createSeries("s6", 8, "team-px", "team-vg", 0, 2, "battlefy", "tour-12"),
  createSeries("s7", 9, "team-zn", "team-vg", 1, 2, "battlefy", "tour-12"),
  createSeries("s8", 10, "team-bl", "team-cr", 2, 0, "battlefy", "tour-12"),
  createSeries("s9", 11, "team-bl", "team-kr", 2, 1, "battlefy", "tour-12"),
  createSeries("s10", 12, "team-bl", "team-rv", 2, 0, "battlefy", "tour-12"),
  createSeries("s11", 13, "team-cr", "team-kr", 2, 0, "startgg", "tour-13"),
  createSeries("s12", 14, "team-cr", "team-rv", 2, 1, "startgg", "tour-13"),
  createSeries("s13", 15, "team-cr", "team-nv", 2, 0, "startgg", "tour-13"),
  createSeries("s14", 16, "team-kr", "team-rv", 0, 2, "startgg", "tour-13"),
  createSeries("s15", 17, "team-bl", "team-px", 2, 1, "startgg", "tour-13"),
  createSeries("s16", 17, "team-ar", "team-hl", 2, 0, "startgg", "tour-13"),
  createSeries("s17", 18, "team-ar", "team-dk", 2, 1, "startgg", "tour-13"),
  createSeries("s18", 19, "team-ar", "team-rz", 2, 0, "startgg", "tour-14"),
  createSeries("s19", 20, "team-ar", "team-sw", 2, 0, "startgg", "tour-14"),
  createSeries("s20", 20, "team-rm", "team-hb", 2, 1, "startgg", "tour-14"),
  createSeries("s21", 20, "team-pn", "team-em", 2, 1, "startgg", "tour-14")
];

export const activityLog: ActivityEntry[] = [
  { id: "act-1", actorUsername: "owner", actorDisplayName: "Owner", verb: "Logged", subject: "Tournament #14", createdAt: iso(20) },
  { id: "act-2", actorUsername: "ops", actorDisplayName: "Ops Admin", verb: "Cleared", subject: "Inactivity flag on Revenant", createdAt: iso(18) },
  { id: "act-3", actorUsername: "owner", actorDisplayName: "Owner", verb: "Added", subject: "Greystone to Tier 7", createdAt: iso(17) }
];

export const challengeSeries: ChallengeSeries[] = [
  {
    id: "ch-1",
    state: "active",
    createdAt: iso(14),
    expiresAt: "2026-03-28T12:00:00.000Z",
    challengerTeamId: "team-bl",
    challengerTeamName: "BladeLight",
    defenderTeamId: "team-px",
    defenderTeamName: "Phantom XI",
    challengerTierId: "tier2",
    defenderTierId: "tier1",
    reason: "Promotion blocked because Tier 1 is full",
    blockedMovement: "promotion",
    challengerWins: 0,
    defenderWins: 0
  },
  {
    id: "ch-2",
    state: "active",
    createdAt: iso(18),
    expiresAt: "2026-04-01T12:00:00.000Z",
    challengerTeamId: "team-ar",
    challengerTeamName: "Arcane",
    defenderTeamId: "team-kr",
    defenderTeamName: "Kryptos",
    challengerTierId: "tier3",
    defenderTierId: "tier2",
    reason: "Demotion blocked because Tier 3 is full",
    blockedMovement: "demotion",
    challengerWins: 0,
    defenderWins: 0
  }
];

export const unverifiedAppearances: UnverifiedAppearance[] = [
  { id: "unv-1", teamName: "Greystone", normalizedName: "greystone", tournamentId: "tour-12", seenAt: iso(12) },
  { id: "unv-2", teamName: "Greystone", normalizedName: "greystone", tournamentId: "tour-13", seenAt: iso(17) },
  { id: "unv-3", teamName: "Greystone", normalizedName: "greystone", tournamentId: "tour-14", seenAt: iso(20) },
  { id: "unv-4", teamName: "ZeroRisk", normalizedName: "zerorisk", tournamentId: "tour-12", seenAt: iso(12) },
  { id: "unv-5", teamName: "ZeroRisk", normalizedName: "zerorisk", tournamentId: "tour-13", seenAt: iso(17) },
  { id: "unv-6", teamName: "ZeroRisk", normalizedName: "zerorisk", tournamentId: "tour-14", seenAt: iso(20) },
  { id: "unv-7", teamName: "UnknownTeam99", normalizedName: "unknownteam99", tournamentId: "tour-14", seenAt: iso(20) }
];

export const tierHistory: TeamTierHistoryEntry[] = [
  { id: "hist-1", teamId: "team-nx", fromTierId: "tier2", toTierId: "tier1", movementType: "promotion", reason: "Win% 72% vs Tier 1", createdAt: iso(12), createdBy: "owner" },
  { id: "hist-2", teamId: "team-nx", fromTierId: "tier4", toTierId: "tier2", movementType: "promotion", reason: "Initial seeded placement", createdAt: iso(2), createdBy: "owner" }
];

export const stagedTeamMoves: StagedTeamMove[] = [];

export const settings: SettingsRecord = {
  startGgApiKeySet: false,
  discordConfigured: false
};

export const currentSnapshot = buildDashboardSnapshot({
  teams,
  series,
  appearances: unverifiedAppearances,
  challenges: challengeSeries,
  activity: activityLog,
  referenceDate: new Date("2026-03-22T12:00:00.000Z")
});

export const latestTierUpdateLabel = "Last updated Mar 22 2026";

export const canonicalImportRows: CanonicalSeriesRow[] = [
  {
    id: "preview-1",
    playedAt: iso(20),
    source: "startgg",
    sourceRef: "preview-1",
    teamOneName: "Nex Force",
    teamTwoName: "BladeLight",
    teamOneScore: 2,
    teamTwoScore: 1
  },
  {
    id: "preview-2",
    playedAt: iso(20),
    source: "startgg",
    sourceRef: "preview-2",
    teamOneName: "Greystone",
    teamTwoName: "UnknownTeam99",
    teamOneScore: 2,
    teamTwoScore: 0
  }
];

export const sampleImportDraft: ImportDraft = {
  tournamentTitle: "Tournament #15",
  eventDate: "2026-03-22",
  sourceLinks: [
    "https://start.gg/tournament/demo-15/event/open/brackets/555/666",
    "https://battlefy.com/demo/tournament-15/stage/bbb"
  ]
};

export const sampleImportPreview = buildImportPreview({
  draft: sampleImportDraft,
  sourceRows: canonicalImportRows,
  teams,
  aliases: teamAliases
});

export const canonicalScreenshotRows: CanonicalSeriesRow[] = [
  {
    id: "screenshot-1",
    playedAt: iso(22),
    source: "screenshot",
    sourceRef: "screenshot-demo-1",
    teamOneName: "Blade Light",
    teamTwoName: "Nova",
    teamOneScore: 2,
    teamTwoScore: 0
  },
  {
    id: "screenshot-2",
    playedAt: iso(22),
    source: "screenshot",
    sourceRef: "screenshot-demo-2",
    teamOneName: "Greystone",
    teamTwoName: "UnknownTeam99",
    teamOneScore: 2,
    teamTwoScore: 1
  }
];

export const sampleScreenshotPreview = buildImportPreview({
  draft: {
    tournamentTitle: "Screenshot Upload Demo",
    eventDate: "2026-03-22",
    sourceLinks: []
  },
  sourceRows: canonicalScreenshotRows,
  teams,
  aliases: teamAliases
});

export function getTeamBySlug(slug: string) {
  return teams.find((team) => team.slug === slug);
}

export function getTeamTierHistory(teamId: string) {
  return tierHistory.filter((entry) => entry.teamId === teamId);
}

export function getTeamRecentSeries(teamId: string) {
  return series
    .filter((entry) => entry.teamOneId === teamId || entry.teamTwoId === teamId)
    .sort((left, right) => right.playedAt.localeCompare(left.playedAt))
    .slice(0, 6);
}

export function getTierDefinition(tierId: Team["tierId"]) {
  return TIER_DEFINITIONS.find((tier) => tier.id === tierId);
}

export function getImportPreviewRows(): ImportPreviewRow[] {
  return sampleImportPreview.previewRows;
}

export function getScreenshotPreviewRows(): ImportPreviewRow[] {
  return sampleScreenshotPreview.previewRows;
}
