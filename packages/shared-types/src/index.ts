export type TierId =
  | "tier1"
  | "tier2"
  | "tier3"
  | "tier4"
  | "tier5"
  | "tier6"
  | "tier7";

export type TeamStatus = "active" | "inactive_yellow" | "inactive_red" | "unverified";
export type AdminRole = "super_admin" | "admin";
export type MovementType = "promotion" | "demotion";
export type EligibilityReason =
  | "same_tier_promotion_rate"
  | "one_tier_up_win_rate"
  | "two_tier_up_series_win"
  | "same_tier_demotion_rate"
  | "one_tier_down_retention_rate"
  | "two_tier_down_series_loss";
export type ChallengeState = "pending" | "active" | "expired" | "resolved";
export type ChallengeOutcome = "challenger_wins" | "defender_wins" | "expired";
export type ImportSource = "battlefy" | "startgg" | "screenshot";
export type ImportMatchStatus = "matched" | "unmatched" | "ambiguous";
export type InactivityFlag = "none" | "yellow" | "red";
export type DiscordJobType = "resync_summary" | "movement_post" | "test_post";
export type EligibilityColor = "green" | "blue" | "purple" | "yellow" | "orange" | "dark_red";
export type ReviewReason = "win_vs_three_plus_higher" | "loss_vs_three_plus_lower";
export type UnverifiedResolutionStatus = "confirmed" | "dismissed";
export type ResolveUnverifiedAction = "confirm" | "dismiss";

export interface TierDefinition {
  id: TierId;
  rank: number;
  label: string;
  shortLabel: string;
  description: string;
  maxTeams: number | null;
  badge: string;
  icon: string;
  accentVar: string;
  requiresManualOversight?: boolean;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  tierId: TierId;
  verified: boolean;
  createdAt: string;
  addedBy: string;
  notes?: string;
}

export interface TeamAlias {
  id: string;
  teamId: string;
  alias: string;
  createdAt: string;
}

export interface TeamTierHistoryEntry {
  id: string;
  teamId: string;
  fromTierId: TierId | null;
  toTierId: TierId;
  movementType: MovementType | "placement";
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface TournamentRecord {
  id: string;
  title: string;
  eventDate: string;
  sourceLinks: ImportSourceLink[];
  createdBy: string;
  createdAt: string;
}

export interface ImportSourceLink {
  id: string;
  url: string;
  source: ImportSource;
}

export interface SeriesResult {
  id: string;
  tournamentId: string;
  playedAt: string;
  teamOneName: string;
  teamTwoName: string;
  teamOneId?: string;
  teamTwoId?: string;
  teamOneTierId: TierId;
  teamTwoTierId: TierId;
  teamOneScore: number;
  teamTwoScore: number;
  source: ImportSource;
  sourceRef: string;
  confirmed: boolean;
}

export interface TeamStats {
  teamId: string;
  sameTierWins: number;
  sameTierLosses: number;
  countedWins: number;
  countedLosses: number;
  sameTierGames: number;
  countedGames: number;
  seasonSeriesPlayed: number;
  oneTierUpWins: number;
  oneTierUpLosses: number;
  oneTierUpGames: number;
  oneTierDownWins: number;
  oneTierDownLosses: number;
  oneTierDownGames: number;
  twoTierUpWins: number;
  twoTierDownLosses: number;
  overallWinRate: number;
  sameTierWinRate: number;
  oneTierUpWinRate: number;
  oneTierDownWinRate: number;
  inactivityFlag: InactivityFlag;
  removalFlag: boolean;
  lastPlayedAt: string | null;
}

export interface EligibilityFlag {
  id: string;
  teamId: string;
  teamName: string;
  tierId: TierId;
  movementType: MovementType;
  reason: EligibilityReason;
  color: EligibilityColor;
  priorityScore: number;
  createdAt: string;
  requiresManualApproval: boolean;
  conflicted: boolean;
}

export interface ChallengeSeries {
  id: string;
  state: ChallengeState;
  createdAt: string;
  expiresAt: string;
  challengerTeamId: string;
  challengerTeamName: string;
  defenderTeamId: string;
  defenderTeamName: string;
  challengerTierId: TierId;
  defenderTierId: TierId;
  reason: string;
  blockedMovement: MovementType;
  challengerWins: number;
  defenderWins: number;
  resolvedAt?: string;
  outcome?: ChallengeOutcome;
  approvedByAdminId?: string;
}

export interface UnverifiedAppearance {
  id: string;
  teamName: string;
  normalizedName: string;
  tournamentId: string;
  seenAt: string;
  resolutionStatus?: UnverifiedResolutionStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedTeamId?: string;
}

export interface UnverifiedTeamProgress {
  teamName: string;
  normalizedName: string;
  appearances: number;
  distinctTournaments: number;
  firstSeenAt: string;
  lastSeenAt: string;
  autoPlaced: boolean;
  suggestedTierId?: TierId;
  suggestedTierWinRate?: number;
  suggestedTierSeriesCount?: number;
}

export interface ResolveUnverifiedRequest {
  action: ResolveUnverifiedAction;
  normalizedName: string;
  teamName?: string;
  shortCode?: string;
  tierId?: TierId;
}

export interface ResolveUnverifiedResponse {
  ok: boolean;
  message: string;
  teamId?: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  role: AdminRole;
  displayName: string;
}

export interface AdminNote {
  id: string;
  teamId: string;
  body: string;
  createdAt: string;
  createdBy: string;
}

export interface ActivityEntry {
  id: string;
  actorUsername: string;
  verb: string;
  subject: string;
  createdAt: string;
}

export interface ImportPreviewTeamResolution {
  name: string;
  status: ImportMatchStatus;
  matchedTeamId?: string;
  matchedTeamName?: string;
  candidates?: string[];
}

export interface ImportPreviewRow {
  id: string;
  playedAt: string;
  source: ImportSource;
  bracketLabel?: string;
  roundLabel?: string;
  matchLabel?: string;
  teamOne: ImportPreviewTeamResolution;
  teamTwo: ImportPreviewTeamResolution;
  winnerName: string;
  score: string;
}

export interface ImportDraft {
  tournamentTitle: string;
  eventDate: string;
  sourceLinks: string[];
}

export interface DiscordSyncJob {
  id: string;
  type: DiscordJobType;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "failed" | "completed";
  createdAt: string;
}

export interface SettingsRecord {
  startGgApiKeySet: boolean;
  discordConfigured: boolean;
  discordChannelId?: string;
  pinnedMessageId?: string;
}

export interface TeamCardSnapshot {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  tierId: TierId;
  verified: boolean;
  wins: number;
  losses: number;
  sameTierWinRate: number;
  overallWinRate: number;
  inactivityFlag: InactivityFlag;
  removalFlag: boolean;
  promotionEligible: boolean;
  demotionEligible: boolean;
  hasEligibilityConflict: boolean;
  eligibilityColors: EligibilityColor[];
  statusLabel: string;
}

export interface TierSnapshot {
  tier: TierDefinition;
  teams: TeamCardSnapshot[];
  openSpots: number | null;
  promotionEligibleCount: number;
  demotionEligibleCount: number;
  unverifiedCount: number;
}

export interface DashboardSnapshot {
  tiers: TierSnapshot[];
  pendingFlags: EligibilityFlag[];
  challenges: ChallengeSeries[];
  reviewFlags: ReviewFlag[];
  unverifiedTeams: UnverifiedTeamProgress[];
  teamStats: Record<string, TeamStats>;
  activity: ActivityEntry[];
}

export interface ReviewFlag {
  id: string;
  seriesId: string;
  teamId: string;
  teamName: string;
  tierId: TierId;
  opponentTeamId: string;
  opponentTeamName: string;
  opponentTierId: TierId;
  reason: ReviewReason;
  createdAt: string;
  sourceRef: string;
}

export interface SeasonOption {
  key: string;
  label: string;
  seriesCount: number;
  tournamentCount: number;
}

export interface TeamSeasonRecord {
  seasonKey: string;
  seasonLabel: string;
  wins: number;
  losses: number;
  seriesPlayed: number;
  sameTierWinRate: number;
  overallWinRate: number;
  oneTierUpWinRate: number;
  oneTierDownWinRate: number;
  inactivityFlag: InactivityFlag;
  removalFlag: boolean;
  lastPlayedAt: string | null;
}

export interface TeamAllTimeRecord {
  wins: number;
  losses: number;
  seriesPlayed: number;
  lastPlayedAt: string | null;
}

export interface TeamMatchHistoryEntry {
  id: string;
  seasonKey: string;
  playedAt: string;
  tournamentId: string;
  tournamentTitle: string;
  opponentName: string;
  opponentTierId: TierId;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  source: ImportSource;
  sourceRef: string;
}

export interface HistoryTeamRecord {
  teamId: string;
  slug: string;
  teamName: string;
  shortCode: string;
  tierId: TierId;
  verified: boolean;
  allTime: TeamAllTimeRecord;
  selectedSeason: TeamSeasonRecord;
}

export interface HistoryPageData {
  availableSeasons: SeasonOption[];
  selectedSeasonKey: string;
  selectedSeasonLabel: string;
  selectedSnapshot: DashboardSnapshot;
  selectedTournaments: TournamentRecord[];
  selectedSeries: SeriesResult[];
  teamRecords: HistoryTeamRecord[];
  totalSeriesCount: number;
  totalTournamentCount: number;
}
