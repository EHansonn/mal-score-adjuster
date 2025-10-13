// Shared calculation logic for score adjustment

// Configuration
export const CONFIG = {
  MIN_SCORING_USERS: 25000,
  BASELINE_START_YEAR: 2012,
  BASELINE_END_YEAR: 2014,
  PERCENTILE_CAPS: {
    95: 8.29,
    99: 8.69,
    100: 8.88,
  },
};

export interface AnimeData {
  id: number;
  title: string;
  mean: number;
  rank: number;
  startYear: number | null;
  numScoringUsers: number;
}

export interface AdjustedAnimeData extends AnimeData {
  adjustedScore: number;
  adjustedRank: number;
  scoreDifference: number;
}

export interface YearStats {
  year: number;
  scores: number[];
  medianScore: number;
  count: number;
}

// Math utilities
export function calculateMedian(scores: number[]): number {
  const sorted = scores.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function calculatePercentile(
  sortedScores: number[],
  score: number
): number {
  let count = 0;
  for (const s of sortedScores) {
    if (s < score) count++;
    else break;
  }
  return (count / sortedScores.length) * 100;
}

export function getScoreAtPercentile(
  sortedScores: number[],
  percentile: number
): number {
  const index = Math.floor((percentile / 100) * sortedScores.length);
  return sortedScores[Math.min(index, sortedScores.length - 1)];
}

export function estimatePercentile(score: number): number {
  if (score >= 8.5) {
    return 85 + ((score - 8.5) / 1.5) * 15;
  } else if (score >= 8.0) {
    return 70 + ((score - 8.0) / 0.5) * 15;
  } else if (score >= 7.5) {
    return 50 + ((score - 7.5) / 0.5) * 20;
  } else if (score >= 7.0) {
    return 30 + ((score - 7.0) / 0.5) * 20;
  } else if (score >= 6.5) {
    return 15 + ((score - 6.5) / 0.5) * 15;
  } else {
    return (score / 6.5) * 15;
  }
}

// Build year statistics from anime list
export function buildYearStats(animeList: AnimeData[]): Map<number, YearStats> {
  const statsByYear = new Map<number, YearStats>();

  // Group by year
  const animeByYear = new Map<number, AnimeData[]>();
  for (const anime of animeList) {
    if (anime.startYear) {
      if (!animeByYear.has(anime.startYear)) {
        animeByYear.set(anime.startYear, []);
      }
      animeByYear.get(anime.startYear)!.push(anime);
    }
  }

  // Calculate stats for each year
  for (const [year, yearAnime] of animeByYear.entries()) {
    if (yearAnime.length >= 10) {
      const scores = yearAnime.map((a) => a.mean).sort((a, b) => a - b);
      statsByYear.set(year, {
        year,
        scores,
        medianScore: calculateMedian(scores),
        count: scores.length,
      });
    }
  }

  return statsByYear;
}

// Build baseline score distribution
export function buildBaselineScores(
  animeList: AnimeData[]
): { scores: number[]; median: number } {
  const baselineScores: number[] = [];

  for (const anime of animeList) {
    if (
      anime.startYear &&
      anime.startYear >= CONFIG.BASELINE_START_YEAR &&
      anime.startYear <= CONFIG.BASELINE_END_YEAR
    ) {
      baselineScores.push(anime.mean);
    }
  }

  const sorted = baselineScores.sort((a, b) => a - b);
  return {
    scores: sorted,
    median: calculateMedian(sorted),
  };
}

// Main calculation function
export function calculateAdjustedScores(
  animeList: AnimeData[]
): AdjustedAnimeData[] {
  console.log("\n=== Calculating Adjusted Scores ===");
  console.log(
    `Baseline: ${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}`
  );

  // Build year statistics
  const yearStats = buildYearStats(animeList);

  // Build baseline distribution
  const baseline = buildBaselineScores(animeList);
  console.log(`Baseline median: ${baseline.median.toFixed(2)}`);
  console.log(`Baseline sample size: ${baseline.scores.length} anime`);
  console.log(`95th percentile cap: ${CONFIG.PERCENTILE_CAPS[95]}`);
  console.log(`Max cap: ${CONFIG.PERCENTILE_CAPS[100]}\n`);

  const results: AdjustedAnimeData[] = [];

  // Calculate adjusted score for each anime
  for (const anime of animeList) {
    let percentileInYear = 50;

    // Find percentile in release year
    if (anime.startYear && yearStats.has(anime.startYear)) {
      const yearData = yearStats.get(anime.startYear)!;
      percentileInYear = calculatePercentile(yearData.scores, anime.mean);
    } else if (anime.startYear) {
      // Estimate for years without enough data
      percentileInYear = estimatePercentile(anime.mean);
    }

    // Map to baseline distribution
    let adjustedScore = getScoreAtPercentile(
      baseline.scores,
      percentileInYear
    );

    // Apply hard caps based on baseline percentiles
    if (percentileInYear >= 99) {
      adjustedScore = Math.min(adjustedScore, CONFIG.PERCENTILE_CAPS[100]);
    } else if (percentileInYear >= 95) {
      adjustedScore = Math.min(adjustedScore, CONFIG.PERCENTILE_CAPS[95]);
    }

    results.push({
      ...anime,
      adjustedScore: Math.round(adjustedScore * 100) / 100,
      adjustedRank: 0, // Will be assigned after sorting
      scoreDifference: Math.round((adjustedScore - anime.mean) * 100) / 100,
    });
  }

  // Sort by adjusted score and assign ranks
  results.sort((a, b) => b.adjustedScore - a.adjustedScore);
  results.forEach((anime, index) => {
    anime.adjustedRank = index + 1;
  });

  console.log(
    `✓ Calculated adjusted scores for ${results.length} anime\n`
  );

  return results;
}
