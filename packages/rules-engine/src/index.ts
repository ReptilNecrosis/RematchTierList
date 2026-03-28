import type {
  ChallengeSeries,
  DashboardSnapshot,
  EligibilityColor,
  EligibilityFlag,
  EligibilityReason,
  InactivityFlag,
  ReviewFlag,
  SeriesResult,
  Team,
  TeamCardSnapshot,
  TeamStats,
  TierDefinition,
  TierId,
  UnverifiedAppearance,
  UnverifiedTeamProgress
} from "@rematch/shared-types";

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    id: "tier1",
    rank: 1,
    label: "Tier 1 - Elite",
    shortLabel: "Tier 1",
    description: "Elite",
    maxTeams: 8,
    badge: "Manual Oversight",
    icon: "🏆",
    accentVar: "var(--t1)",
    requiresManualOversight: true
  },
  {
    id: "tier2",
    rank: 2,
    label: "Tier 2 - High Competition",
    shortLabel: "Tier 2",
    description: "High competition",
    maxTeams: 16,
    badge: "Standard Rules",
    icon: "🥈",
    accentVar: "var(--t2)"
  },
  {
    id: "tier3",
    rank: 3,
    label: "Tier 3 - Mid High",
    shortLabel: "Tier 3",
    description: "Mid-high",
    maxTeams: 24,
    badge: "Standard Rules",
    icon: "🥉",
    accentVar: "var(--t3)"
  },
  {
    id: "tier4",
    rank: 4,
    label: "Tier 4 - Mid",
    shortLabel: "Tier 4",
    description: "Mid tier",
    maxTeams: 16,
    badge: "Standard Rules",
    icon: "🔷",
    accentVar: "var(--t4)"
  },
  {
    id: "tier5",
    rank: 5,
    label: "Tier 5 - Lower Mid",
    shortLabel: "Tier 5",
    description: "Lower mid",
    maxTeams: 12,
    badge: "Standard Rules",
    icon: "🔹",
    accentVar: "var(--t5)"
  },
  {
    id: "tier6",
    rank: 6,
    label: "Tier 6 - Low",
    shortLabel: "Tier 6",
    description: "Low tier",
    maxTeams: 8,
    badge: "Standard Rules",
    icon: "🔸",
    accentVar: "var(--t6)"
  },
  {
    id: "tier7",
    rank: 7,
    label: "Tier 7",
    shortLabel: "Tier 7",
    description: "Entry level teams",
    maxTeams: null,
    badge: "Entry Level",
    icon: "🔘",
    accentVar: "var(--t7)"
  }
];

const TIER_LOOKUP = new Map<TierId, TierDefinition>(
  TIER_DEFINITIONS.map((tier) => [tier.id, tier])
);

function getTierRank(tierId: TierId) {
  return TIER_LOOKUP.get(tierId)?.rank ?? Number.MAX_SAFE_INTEGER;
}

function getEffectiveTierId(
  team: Team,
  historicalTierId: TierId,
  effectiveTierByTeamId?: Record<string, TierId>
) {
  return effectiveTierByTeamId?.[team.id] ?? historicalTierId;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function roundRate(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function isPendingUnverifiedAppearance(appearance: UnverifiedAppearance) {
  return !appearance.resolutionStatus;
}

function daysBetween(referenceDate: Date, value: string) {
  const millis = referenceDate.getTime() - new Date(value).getTime();
  return Math.floor(millis / (1000 * 60 * 60 * 24));
}

function getSeasonBounds(referenceDate: Date) {
  const start = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return { start, end };
}

function isInCurrentSeason(referenceDate: Date, playedAt: string) {
  const playedAtDate = new Date(playedAt);
  const { start, end } = getSeasonBounds(referenceDate);
  return playedAtDate >= start && playedAtDate < end;
}

function getInactivityState(
  referenceDate: Date,
  lastPlayedAt: string | null,
  seasonSeriesPlayed: number
): { flag: InactivityFlag; removalFlag: boolean } {
  if (!lastPlayedAt) {
    return {
      flag: seasonSeriesPlayed < 5 ? "yellow" : "none",
      removalFlag: false
    };
  }

  const days = daysBetween(referenceDate, lastPlayedAt);
  if (days >= 30) {
    return {
      flag: "red",
      removalFlag: true
    };
  }
  if (days >= 20) {
    return {
      flag: "red",
      removalFlag: false
    };
  }
  if (days >= 10 || seasonSeriesPlayed < 5) {
    return {
      flag: "yellow",
      removalFlag: false
    };
  }
  return {
    flag: "none",
    removalFlag: false
  };
}

function getManualApprovalRequirement(teamTierId: TierId, movementType: "promotion" | "demotion") {
  if (teamTierId === "tier1") {
    return true;
  }

  return movementType === "promotion" && getTierRank(teamTierId) === 2;
}

function sortFlags(left: EligibilityFlag, right: EligibilityFlag) {
  return right.priorityScore - left.priorityScore || left.teamName.localeCompare(right.teamName);
}

function buildFlag(args: {
  team: Team;
  movementType: "promotion" | "demotion";
  reason: EligibilityReason;
  color: EligibilityColor;
  priorityScore: number;
  createdAt: string;
}): EligibilityFlag {
  return {
    id: `${args.team.id}-${args.movementType}-${args.reason}`,
    teamId: args.team.id,
    teamName: args.team.name,
    tierId: args.team.tierId,
    movementType: args.movementType,
    reason: args.reason,
    color: args.color,
    priorityScore: args.priorityScore,
    createdAt: args.createdAt,
    requiresManualApproval: getManualApprovalRequirement(args.team.tierId, args.movementType),
    conflicted: false
  };
}

export function calculateTeamStats(
  teams: Team[],
  series: SeriesResult[],
  referenceDate = new Date(),
  effectiveTierByTeamId?: Record<string, TierId>
): Record<string, TeamStats> {
  const stats: Record<string, TeamStats> = {};
  const teamLookup = new Map(teams.map((team) => [team.id, team]));

  for (const team of teams) {
    stats[team.id] = {
      teamId: team.id,
      sameTierWins: 0,
      sameTierLosses: 0,
      countedWins: 0,
      countedLosses: 0,
      sameTierGames: 0,
      countedGames: 0,
      seasonSeriesPlayed: 0,
      oneTierUpWins: 0,
      oneTierUpLosses: 0,
      oneTierUpGames: 0,
      oneTierDownWins: 0,
      oneTierDownLosses: 0,
      oneTierDownGames: 0,
      twoTierUpWins: 0,
      twoTierDownLosses: 0,
      overallWinRate: 0,
      sameTierWinRate: 0,
      oneTierUpWinRate: 0,
      oneTierDownWinRate: 0,
      inactivityFlag: "none",
      removalFlag: false,
      lastPlayedAt: null
    };
  }

  for (const match of series.filter((entry) => entry.confirmed)) {
    const inCurrentSeason = isInCurrentSeason(referenceDate, match.playedAt);

    if (match.teamOneId) {
      const teamOneStats = stats[match.teamOneId];
      if (teamOneStats) {
        teamOneStats.lastPlayedAt =
          !teamOneStats.lastPlayedAt || match.playedAt > teamOneStats.lastPlayedAt
            ? match.playedAt
            : teamOneStats.lastPlayedAt;
        if (inCurrentSeason) {
          teamOneStats.seasonSeriesPlayed += 1;
        }
      }
    }

    if (match.teamTwoId) {
      const teamTwoStats = stats[match.teamTwoId];
      if (teamTwoStats) {
        teamTwoStats.lastPlayedAt =
          !teamTwoStats.lastPlayedAt || match.playedAt > teamTwoStats.lastPlayedAt
            ? match.playedAt
            : teamTwoStats.lastPlayedAt;
        if (inCurrentSeason) {
          teamTwoStats.seasonSeriesPlayed += 1;
        }
      }
    }

    if (!inCurrentSeason || !match.teamOneId || !match.teamTwoId) {
      continue;
    }

    const teamOne = teamLookup.get(match.teamOneId);
    const teamTwo = teamLookup.get(match.teamTwoId);
    const teamOneStats = stats[match.teamOneId];
    const teamTwoStats = stats[match.teamTwoId];

    if (!teamOne || !teamTwo || !teamOneStats || !teamTwoStats) {
      continue;
    }

    if (!teamOne.verified || !teamTwo.verified) {
      continue;
    }

    const teamOneWon = match.teamOneScore > match.teamTwoScore;
    const teamTwoWon = match.teamTwoScore > match.teamOneScore;

    teamOneStats.countedGames += 1;
    teamTwoStats.countedGames += 1;

    if (teamOneWon) {
      teamOneStats.countedWins += 1;
      teamTwoStats.countedLosses += 1;
    } else if (teamTwoWon) {
      teamTwoStats.countedWins += 1;
      teamOneStats.countedLosses += 1;
    }

    const teamOneEffectiveTierRank = getTierRank(
      getEffectiveTierId(teamOne, match.teamOneTierId, effectiveTierByTeamId)
    );
    const teamTwoEffectiveTierRank = getTierRank(
      getEffectiveTierId(teamTwo, match.teamTwoTierId, effectiveTierByTeamId)
    );
    const teamOneOpponentTierRank = getTierRank(match.teamTwoTierId);
    const teamTwoOpponentTierRank = getTierRank(match.teamOneTierId);
    const teamOneTierGap = Math.abs(teamOneEffectiveTierRank - teamOneOpponentTierRank);
    const teamTwoTierGap = Math.abs(teamTwoEffectiveTierRank - teamTwoOpponentTierRank);

    if (teamOneTierGap === 0) {
      teamOneStats.sameTierGames += 1;
      if (teamOneWon) {
        teamOneStats.sameTierWins += 1;
      } else if (teamTwoWon) {
        teamOneStats.sameTierLosses += 1;
      }
    } else if (teamOneTierGap === 1) {
      if (teamOneEffectiveTierRank > teamOneOpponentTierRank) {
        teamOneStats.oneTierUpGames += 1;
        if (teamOneWon) {
          teamOneStats.oneTierUpWins += 1;
        } else if (teamTwoWon) {
          teamOneStats.oneTierUpLosses += 1;
        }
      } else {
        teamOneStats.oneTierDownGames += 1;
        if (teamOneWon) {
          teamOneStats.oneTierDownWins += 1;
        } else if (teamTwoWon) {
          teamOneStats.oneTierDownLosses += 1;
        }
      }
    } else if (teamOneTierGap === 2) {
      if (teamOneEffectiveTierRank > teamOneOpponentTierRank) {
        if (teamOneWon) {
          teamOneStats.twoTierUpWins += 1;
        }
      } else if (teamTwoWon) {
        teamOneStats.twoTierDownLosses += 1;
      }
    }

    if (teamTwoTierGap === 0) {
      teamTwoStats.sameTierGames += 1;
      if (teamTwoWon) {
        teamTwoStats.sameTierWins += 1;
      } else if (teamOneWon) {
        teamTwoStats.sameTierLosses += 1;
      }
    } else if (teamTwoTierGap === 1) {
      if (teamTwoEffectiveTierRank > teamTwoOpponentTierRank) {
        teamTwoStats.oneTierUpGames += 1;
        if (teamTwoWon) {
          teamTwoStats.oneTierUpWins += 1;
        } else if (teamOneWon) {
          teamTwoStats.oneTierUpLosses += 1;
        }
      } else {
        teamTwoStats.oneTierDownGames += 1;
        if (teamTwoWon) {
          teamTwoStats.oneTierDownWins += 1;
        } else if (teamOneWon) {
          teamTwoStats.oneTierDownLosses += 1;
        }
      }
    } else if (teamTwoTierGap === 2) {
      if (teamTwoEffectiveTierRank > teamTwoOpponentTierRank) {
        if (teamTwoWon) {
          teamTwoStats.twoTierUpWins += 1;
        }
      } else if (teamOneWon) {
        teamTwoStats.twoTierDownLosses += 1;
      }
    }
  }

  for (const team of teams) {
    const teamStats = stats[team.id];
    teamStats.sameTierWinRate =
      teamStats.sameTierGames > 0 ? roundRate(teamStats.sameTierWins / teamStats.sameTierGames) : 0;
    teamStats.overallWinRate =
      teamStats.countedGames > 0 ? roundRate(teamStats.countedWins / teamStats.countedGames) : 0;
    teamStats.oneTierUpWinRate =
      teamStats.oneTierUpGames > 0 ? roundRate(teamStats.oneTierUpWins / teamStats.oneTierUpGames) : 0;
    teamStats.oneTierDownWinRate =
      teamStats.oneTierDownGames > 0
        ? roundRate(teamStats.oneTierDownWins / teamStats.oneTierDownGames)
        : 0;

    const inactivity = getInactivityState(
      referenceDate,
      teamStats.lastPlayedAt,
      teamStats.seasonSeriesPlayed
    );
    teamStats.inactivityFlag = inactivity.flag;
    teamStats.removalFlag = inactivity.removalFlag;
  }

  return stats;
}

export function deriveUnverifiedProgress(
  appearances: UnverifiedAppearance[],
  series: SeriesResult[] = [],
  teams: Team[] = []
): UnverifiedTeamProgress[] {
  const grouped = new Map<string, UnverifiedTeamProgress>();
  const tournamentsByName = new Map<string, Set<string>>();
  const verifiedTeamLookup = new Map(teams.filter((team) => team.verified).map((team) => [team.id, team]));
  const suggestionStats = new Map<string, Map<TierId, { wins: number; games: number }>>();

  for (const appearance of appearances.filter(isPendingUnverifiedAppearance)) {
    const key = normalizeName(appearance.teamName);
    const existing = grouped.get(key);
    const tournamentSet = tournamentsByName.get(key) ?? new Set<string>();
    tournamentSet.add(appearance.tournamentId);
    tournamentsByName.set(key, tournamentSet);

    if (!existing) {
      grouped.set(key, {
        teamName: appearance.teamName,
        normalizedName: key,
        appearances: 1,
        distinctTournaments: tournamentSet.size,
        firstSeenAt: appearance.seenAt,
        lastSeenAt: appearance.seenAt,
        autoPlaced: false
      });
      continue;
    }

    existing.appearances += 1;
    existing.firstSeenAt = appearance.seenAt < existing.firstSeenAt ? appearance.seenAt : existing.firstSeenAt;
    existing.lastSeenAt = appearance.seenAt > existing.lastSeenAt ? appearance.seenAt : existing.lastSeenAt;
    existing.distinctTournaments = tournamentSet.size;
  }

  function recordSuggestion(
    unverifiedName: string,
    opponentTierId: TierId,
    win: boolean
  ) {
    const key = normalizeName(unverifiedName);
    const byTier = suggestionStats.get(key) ?? new Map<TierId, { wins: number; games: number }>();
    const bucket = byTier.get(opponentTierId) ?? { wins: 0, games: 0 };
    bucket.games += 1;
    if (win) {
      bucket.wins += 1;
    }
    byTier.set(opponentTierId, bucket);
    suggestionStats.set(key, byTier);
  }

  for (const match of series.filter((entry) => entry.confirmed)) {
    const teamOne = match.teamOneId ? teams.find((team) => team.id === match.teamOneId) : undefined;
    const teamTwo = match.teamTwoId ? teams.find((team) => team.id === match.teamTwoId) : undefined;
    const teamOneIsVerified = Boolean(teamOne?.verified && match.teamOneId && verifiedTeamLookup.has(match.teamOneId));
    const teamTwoIsVerified = Boolean(teamTwo?.verified && match.teamTwoId && verifiedTeamLookup.has(match.teamTwoId));
    const teamOneIsUnverified = !teamOneIsVerified;
    const teamTwoIsUnverified = !teamTwoIsVerified;

    if (teamOneIsUnverified && teamTwoIsVerified && teamTwo) {
      recordSuggestion(match.teamOneName, teamTwo.tierId, match.teamOneScore > match.teamTwoScore);
    }

    if (teamTwoIsUnverified && teamOneIsVerified && teamOne) {
      recordSuggestion(match.teamTwoName, teamOne.tierId, match.teamTwoScore > match.teamOneScore);
    }
  }

  return [...grouped.values()]
    .map((entry) => {
      const byTier = suggestionStats.get(entry.normalizedName);
      const suggestion = [...(byTier?.entries() ?? [])]
        .map(([tierId, bucket]) => ({
          tierId,
          games: bucket.games,
          winRate: bucket.games > 0 ? bucket.wins / bucket.games : 0
        }))
        .filter((bucket) => bucket.games >= 3 && bucket.winRate >= 0.35)
        .sort((left, right) => getTierRank(left.tierId) - getTierRank(right.tierId))[0];

      return {
        ...entry,
        autoPlaced: entry.distinctTournaments >= 3,
        suggestedTierId: suggestion?.tierId,
        suggestedTierSeriesCount: suggestion?.games,
        suggestedTierWinRate: suggestion ? roundRate(suggestion.winRate) : undefined
      };
    })
    .sort(
      (left, right) =>
        right.distinctTournaments - left.distinctTournaments ||
        right.appearances - left.appearances ||
        left.teamName.localeCompare(right.teamName)
    );
}

export function deriveEligibilityFlags(
  teams: Team[],
  stats: Record<string, TeamStats>,
  referenceDate = new Date().toISOString()
): EligibilityFlag[] {
  const rawFlags: EligibilityFlag[] = [];

  for (const team of teams) {
    const teamStats = stats[team.id];
    if (!teamStats || !team.verified) {
      continue;
    }

    if (
      team.tierId !== "tier1" &&
      teamStats.sameTierGames >= 5 &&
      teamStats.sameTierWinRate >= 0.75
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "promotion",
          reason: "same_tier_promotion_rate",
          color: "green",
          priorityScore: teamStats.sameTierWinRate,
          createdAt: referenceDate
        })
      );
    }

    if (
      team.tierId !== "tier1" &&
      teamStats.oneTierUpGames >= 5 &&
      teamStats.oneTierUpWinRate >= 0.35 &&
      teamStats.sameTierWinRate >= 0.45
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "promotion",
          reason: "one_tier_up_win_rate",
          color: "blue",
          priorityScore: 1 + teamStats.oneTierUpWinRate,
          createdAt: referenceDate
        })
      );
    }

    if (
      team.tierId !== "tier1" &&
      teamStats.twoTierUpWins >= 1 &&
      teamStats.sameTierWinRate >= 0.5
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "promotion",
          reason: "two_tier_up_series_win",
          color: "purple",
          priorityScore: 2 + teamStats.twoTierUpWins,
          createdAt: referenceDate
        })
      );
    }

    if (
      team.tierId !== "tier7" &&
      teamStats.sameTierGames >= 5 &&
      teamStats.sameTierWinRate < 0.25
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "demotion",
          reason: "same_tier_demotion_rate",
          color: "yellow",
          priorityScore: 1 - teamStats.sameTierWinRate,
          createdAt: referenceDate
        })
      );
    }

    if (
      team.tierId !== "tier7" &&
      teamStats.oneTierDownGames >= 5 &&
      teamStats.oneTierDownWinRate < 0.65 &&
      teamStats.sameTierWinRate <= 0.45
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "demotion",
          reason: "one_tier_down_retention_rate",
          color: "orange",
          priorityScore: 1 + (1 - teamStats.oneTierDownWinRate),
          createdAt: referenceDate
        })
      );
    }

    if (
      team.tierId !== "tier7" &&
      teamStats.twoTierDownLosses >= 1 &&
      teamStats.sameTierWinRate <= 0.5
    ) {
      rawFlags.push(
        buildFlag({
          team,
          movementType: "demotion",
          reason: "two_tier_down_series_loss",
          color: "dark_red",
          priorityScore: 2 + teamStats.twoTierDownLosses,
          createdAt: referenceDate
        })
      );
    }
  }

  const movementSummary = new Map<string, { promotion: boolean; demotion: boolean }>();
  for (const flag of rawFlags) {
    const current = movementSummary.get(flag.teamId) ?? { promotion: false, demotion: false };
    current[flag.movementType] = true;
    movementSummary.set(flag.teamId, current);
  }

  return rawFlags
    .map((flag) => {
      const summary = movementSummary.get(flag.teamId);
      return {
        ...flag,
        conflicted: Boolean(summary?.promotion && summary?.demotion)
      };
    })
    .sort(sortFlags);
}

export function deriveTeamCards(
  teams: Team[],
  stats: Record<string, TeamStats>,
  flags: EligibilityFlag[]
): TeamCardSnapshot[] {
  return teams.map((team) => {
    const teamStats = stats[team.id];
    const teamFlags = flags.filter((flag) => flag.teamId === team.id);
    const promotionEligible = teamFlags.some((flag) => flag.movementType === "promotion");
    const demotionEligible = teamFlags.some((flag) => flag.movementType === "demotion");
    const hasEligibilityConflict = promotionEligible && demotionEligible;

    return {
      id: team.id,
      slug: team.slug,
      name: team.name,
      shortCode: team.shortCode,
      tierId: team.tierId,
      verified: team.verified,
      wins: teamStats?.countedWins ?? 0,
      losses: teamStats?.countedLosses ?? 0,
      sameTierWinRate: teamStats?.sameTierWinRate ?? 0,
      overallWinRate: teamStats?.overallWinRate ?? 0,
      inactivityFlag: teamStats?.inactivityFlag ?? "none",
      removalFlag: teamStats?.removalFlag ?? false,
      promotionEligible,
      demotionEligible,
      hasEligibilityConflict,
      eligibilityColors: [...new Set(teamFlags.map((flag) => flag.color))],
      statusLabel: !team.verified
        ? "Unverified"
        : teamStats?.removalFlag
          ? "Removal Review"
          : teamStats?.inactivityFlag === "red"
            ? "Inactive - Red"
            : teamStats?.inactivityFlag === "yellow"
              ? "Inactive - Yellow"
              : "Active"
    };
  });
}

export function deriveReviewFlags(
  teams: Team[],
  series: SeriesResult[],
  referenceDate = new Date()
): ReviewFlag[] {
  const teamLookup = new Map(teams.map((team) => [team.id, team]));
  const flags: ReviewFlag[] = [];

  for (const match of series.filter((entry) => entry.confirmed)) {
    if (!isInCurrentSeason(referenceDate, match.playedAt) || !match.teamOneId || !match.teamTwoId) {
      continue;
    }

    const teamOne = teamLookup.get(match.teamOneId);
    const teamTwo = teamLookup.get(match.teamTwoId);
    if (!teamOne || !teamTwo || !teamOne.verified || !teamTwo.verified) {
      continue;
    }

    const teamOneRank = getTierRank(teamOne.tierId);
    const teamTwoRank = getTierRank(teamTwo.tierId);
    const gap = Math.abs(teamOneRank - teamTwoRank);
    if (gap < 3) {
      continue;
    }

    const lowerTeam = teamOneRank > teamTwoRank ? teamOne : teamTwo;
    const higherTeam = teamOneRank < teamTwoRank ? teamOne : teamTwo;
    const lowerTeamWon = teamOneRank > teamTwoRank ? match.teamOneScore > match.teamTwoScore : match.teamTwoScore > match.teamOneScore;

    if (!lowerTeamWon) {
      continue;
    }

    flags.push({
      id: `${match.id}-${lowerTeam.id}-review-win`,
      seriesId: match.id,
      teamId: lowerTeam.id,
      teamName: lowerTeam.name,
      tierId: lowerTeam.tierId,
      opponentTeamId: higherTeam.id,
      opponentTeamName: higherTeam.name,
      opponentTierId: higherTeam.tierId,
      reason: "win_vs_three_plus_higher",
      createdAt: match.playedAt,
      sourceRef: match.sourceRef
    });

    flags.push({
      id: `${match.id}-${higherTeam.id}-review-loss`,
      seriesId: match.id,
      teamId: higherTeam.id,
      teamName: higherTeam.name,
      tierId: higherTeam.tierId,
      opponentTeamId: lowerTeam.id,
      opponentTeamName: lowerTeam.name,
      opponentTierId: lowerTeam.tierId,
      reason: "loss_vs_three_plus_lower",
      createdAt: match.playedAt,
      sourceRef: match.sourceRef
    });
  }

  return flags.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deriveBlockedChallenges(
  teams: Team[],
  teamCards: TeamCardSnapshot[],
  flags: EligibilityFlag[],
  referenceDate = new Date()
): ChallengeSeries[] {
  const challenges: ChallengeSeries[] = [];
  const activePromotionFlags = flags
    .filter((flag) => flag.movementType === "promotion" && !flag.conflicted)
    .sort(sortFlags);
  const activeDemotionFlags = flags
    .filter((flag) => flag.movementType === "demotion" && !flag.conflicted)
    .sort(sortFlags);

  for (const tier of TIER_DEFINITIONS) {
    const createdAt = referenceDate.toISOString();
    const expiresAt = new Date(referenceDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const aboveTier = TIER_DEFINITIONS.find((entry) => entry.rank === tier.rank - 1);
    const belowTier = TIER_DEFINITIONS.find((entry) => entry.rank === tier.rank + 1);

    if (aboveTier) {
      const aboveTierTeams = teamCards
        .filter((card) => card.tierId === aboveTier.id)
        .sort(
          (left, right) =>
            left.overallWinRate - right.overallWinRate ||
            left.sameTierWinRate - right.sameTierWinRate ||
            left.name.localeCompare(right.name)
        );
      const aboveTierIsFull =
        aboveTier.maxTeams !== null && aboveTierTeams.length >= aboveTier.maxTeams;
      const promotionCandidate = activePromotionFlags.find((flag) => flag.tierId === tier.id);
      const upperTierHasDemotionCandidate = activeDemotionFlags.some(
        (flag) => flag.tierId === aboveTier.id
      );

      if (aboveTierIsFull && promotionCandidate && !upperTierHasDemotionCandidate && aboveTierTeams[0]) {
        const defender = aboveTierTeams[0];
        challenges.push({
          id: `challenge-promotion-${promotionCandidate.teamId}-${defender.id}`,
          state: "pending",
          createdAt,
          expiresAt,
          challengerTeamId: promotionCandidate.teamId,
          challengerTeamName: promotionCandidate.teamName,
          defenderTeamId: defender.id,
          defenderTeamName: defender.name,
          challengerTierId: promotionCandidate.tierId,
          defenderTierId: defender.tierId,
          reason: `Promotion blocked because ${aboveTier.shortLabel} is full`,
          blockedMovement: "promotion",
          challengerWins: 0,
          defenderWins: 0
        });
      }
    }

    if (belowTier) {
      const belowTierTeams = teamCards
        .filter((card) => card.tierId === belowTier.id)
        .sort(
          (left, right) =>
            right.overallWinRate - left.overallWinRate ||
            right.sameTierWinRate - left.sameTierWinRate ||
            left.name.localeCompare(right.name)
        );
      const belowTierIsFull =
        belowTier.maxTeams !== null && belowTierTeams.length >= belowTier.maxTeams;
      const demotionCandidate = activeDemotionFlags.find((flag) => flag.tierId === tier.id);
      const lowerTierHasPromotionCandidate = activePromotionFlags.some(
        (flag) => flag.tierId === belowTier.id
      );
      const challenger = belowTierTeams[0];

      if (belowTierIsFull && demotionCandidate && !lowerTierHasPromotionCandidate && challenger) {
        challenges.push({
          id: `challenge-demotion-${challenger.id}-${demotionCandidate.teamId}`,
          state: "pending",
          createdAt,
          expiresAt,
          challengerTeamId: challenger.id,
          challengerTeamName: challenger.name,
          defenderTeamId: demotionCandidate.teamId,
          defenderTeamName: demotionCandidate.teamName,
          challengerTierId: challenger.tierId,
          defenderTierId: demotionCandidate.tierId,
          reason: `Demotion blocked because ${belowTier.shortLabel} is full`,
          blockedMovement: "demotion",
          challengerWins: 0,
          defenderWins: 0
        });
      }
    }
  }

  return challenges;
}

export function buildDashboardSnapshot(args: {
  teams: Team[];
  series: SeriesResult[];
  appearances: UnverifiedAppearance[];
  referenceDate?: Date;
  challenges?: ChallengeSeries[];
  activity?: DashboardSnapshot["activity"];
  effectiveTierByTeamId?: Record<string, TierId>;
}): DashboardSnapshot {
  const referenceDate = args.referenceDate ?? new Date();
  const teamStats = calculateTeamStats(
    args.teams,
    args.series,
    referenceDate,
    args.effectiveTierByTeamId
  );
  const pendingFlags = deriveEligibilityFlags(args.teams, teamStats, referenceDate.toISOString());
  const teamCards = deriveTeamCards(args.teams, teamStats, pendingFlags);
  const derivedChallenges = deriveBlockedChallenges(
    args.teams,
    teamCards,
    pendingFlags,
    referenceDate
  );
  const challenges = args.challenges?.length ? args.challenges : derivedChallenges;
  const reviewFlags = deriveReviewFlags(args.teams, args.series, referenceDate);
  const unverifiedTeams = deriveUnverifiedProgress(args.appearances, args.series, args.teams);

  const tiers = TIER_DEFINITIONS.map((tier) => {
    const tierTeams = teamCards
      .filter((team) => team.tierId === tier.id)
      .sort(
        (left, right) =>
          right.overallWinRate - left.overallWinRate ||
          right.sameTierWinRate - left.sameTierWinRate ||
          left.name.localeCompare(right.name)
      );

    return {
      tier,
      teams: tierTeams,
      openSpots: tier.maxTeams === null ? null : Math.max(tier.maxTeams - tierTeams.length, 0),
      promotionEligibleCount: tierTeams.filter((team) => team.promotionEligible).length,
      demotionEligibleCount: tierTeams.filter((team) => team.demotionEligible).length,
      unverifiedCount: tierTeams.filter((team) => !team.verified).length
    };
  });

  return {
    tiers,
    pendingFlags,
    challenges,
    reviewFlags,
    unverifiedTeams,
    teamStats,
    activity: args.activity ?? []
  };
}
