// ============================================================
// MAL SCORE ADJUSTER - CONFIGURABLE CALCULATOR
// ============================================================
// Configurable calculation logic for score adjustment with custom baseline periods
// This is a drop-in replacement for calculator.ts that allows specifying any date range

// ============================================================
// 🎚️ CONFIGURATION TOGGLE - EASY ON/OFF SWITCH
// ============================================================
// Set to true to allow scores to increase (correct for deflation)
// Set to false to only allow scores to decrease (correct for inflation only)
//
// CURRENT SETTING:
export const ALLOW_SCORE_INCREASES = false; // ← CHANGE THIS to true/false
//
// false = Only decrease scores (correct inflation) ✅ DEFAULT
// true  = Allow increases too (correct inflation AND deflation)
// ============================================================

export interface CalculatorConfig {
  MIN_SCORING_USERS: number;
  BASELINE_START_YEAR: number;
  BASELINE_END_YEAR: number;
}

// Default configuration
export const DEFAULT_CONFIG: CalculatorConfig = {
  MIN_SCORING_USERS: 17500,
  BASELINE_START_YEAR: 2010,
  BASELINE_END_YEAR: 2010,
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
  percentileInYear: number; // What percentile this anime is in its release year
}

export interface YearStats {
  year: number;
  scores: number[];
  medianScore: number;
  count: number;
  percentiles?: {
    50: number;
    75: number;
    90: number;
    95: number;
    99: number;
    100: number;
  };
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
  // Clamp percentile to 0-100 range
  percentile = Math.max(0, Math.min(100, percentile));

  // Use linear interpolation for more precise percentile calculation
  const position = (percentile / 100) * (sortedScores.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper || upper >= sortedScores.length) {
    return sortedScores[lower];
  }

  // Linear interpolation between two nearest values
  const weight = position - lower;
  return sortedScores[lower] * (1 - weight) + sortedScores[upper] * weight;
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

// Calculate percentiles for a given score array (more dynamic - every 1%)
function calculatePercentiles(sortedScores: number[]): {
  50: number;
  75: number;
  90: number;
  95: number;
  99: number;
  100: number;
} {
  return {
    50: getScoreAtPercentile(sortedScores, 50),
    75: getScoreAtPercentile(sortedScores, 75),
    90: getScoreAtPercentile(sortedScores, 90),
    95: getScoreAtPercentile(sortedScores, 95),
    99: getScoreAtPercentile(sortedScores, 99),
    100: sortedScores[sortedScores.length - 1],
  };
}

// Build a complete percentile lookup table (0-100 with 0.1% precision)
function buildPercentileLookup(sortedScores: number[]): Map<number, number> {
  const lookup = new Map<number, number>();

  // Pre-compute percentiles at 0.1% intervals for maximum precision
  for (let p = 0; p <= 1000; p++) {
    const percentile = p / 10; // 0.0, 0.1, 0.2, ... 99.9, 100.0
    lookup.set(percentile, getScoreAtPercentile(sortedScores, percentile));
  }

  return lookup;
}

// Get score from pre-computed lookup table with interpolation fallback
function getScoreFromLookup(
  lookup: Map<number, number>,
  percentile: number,
  fallbackScores: number[]
): number {
  // Round to nearest 0.1%
  const rounded = Math.round(percentile * 10) / 10;

  const score = lookup.get(rounded);
  if (score !== undefined) {
    return score;
  }

  // Fallback to direct calculation if not in lookup
  return getScoreAtPercentile(fallbackScores, percentile);
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
      const percentiles = calculatePercentiles(scores);

      statsByYear.set(year, {
        year,
        scores,
        medianScore: calculateMedian(scores),
        count: scores.length,
        percentiles,
      });
    }
  }

  return statsByYear;
}

// Build baseline score distribution with percentiles
export function buildBaselineScores(
  animeList: AnimeData[],
  config: CalculatorConfig
): {
  scores: number[];
  median: number;
  percentiles: {
    50: number;
    75: number;
    90: number;
    95: number;
    99: number;
    100: number;
  };
} {
  const baselineScores: number[] = [];

  for (const anime of animeList) {
    if (
      anime.startYear &&
      anime.startYear >= config.BASELINE_START_YEAR &&
      anime.startYear <= config.BASELINE_END_YEAR
    ) {
      baselineScores.push(anime.mean);
    }
  }

  const sorted = baselineScores.sort((a, b) => a - b);
  const percentiles = calculatePercentiles(sorted);

  return {
    scores: sorted,
    median: calculateMedian(sorted),
    percentiles,
  };
}

// Main calculation function with configurable baseline period
export function calculateAdjustedScores(
  animeList: AnimeData[],
  config: CalculatorConfig = DEFAULT_CONFIG
): AdjustedAnimeData[] {
  console.log("\n=== Calculating Adjusted Scores (Dynamic Percentile System) ===");
  console.log(
    `Baseline Period: ${config.BASELINE_START_YEAR}-${config.BASELINE_END_YEAR}`
  );
  console.log(`Min Scoring Users: ${config.MIN_SCORING_USERS.toLocaleString()}`);
  console.log(`Allow Score Increases: ${ALLOW_SCORE_INCREASES ? 'YES (can correct deflation)' : 'NO (only correct inflation)'}`);

  // Build year statistics
  const yearStats = buildYearStats(animeList);

  // Build baseline distribution with percentiles
  const baseline = buildBaselineScores(animeList, config);

  // Build high-precision percentile lookup table for baseline
  console.log(`\nBuilding percentile lookup table (0.1% precision)...`);
  const baselineLookup = buildPercentileLookup(baseline.scores);
  console.log(`✓ Created lookup table with ${baselineLookup.size} entries\n`);

  console.log(`Baseline Statistics:`);
  console.log(`  Sample size: ${baseline.scores.length} anime`);
  console.log(`  Median: ${baseline.median.toFixed(2)}`);
  console.log(`  50th percentile: ${baseline.percentiles[50].toFixed(2)}`);
  console.log(`  75th percentile: ${baseline.percentiles[75].toFixed(2)}`);
  console.log(`  90th percentile: ${baseline.percentiles[90].toFixed(2)}`);
  console.log(`  95th percentile: ${baseline.percentiles[95].toFixed(2)}`);
  console.log(`  99th percentile: ${baseline.percentiles[99].toFixed(2)}`);
  console.log(`  Max: ${baseline.percentiles[100].toFixed(2)}\n`);

  // Determine caps from config or baseline
  const cap95 = baseline.percentiles[95];
  const cap99 = baseline.percentiles[99];
  const cap100 = baseline.percentiles[100];

  console.log(`Percentile Caps:`);
  console.log(`  95th percentile cap: ${cap95.toFixed(2)}`);
  console.log(`  99th percentile cap: ${cap99.toFixed(2)}`);
  console.log(`  Max cap: ${cap100.toFixed(2)}\n`);

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

    // Map to baseline distribution using high-precision lookup table
    // This is the key: an anime at X percentile in its year gets the score
    // that represented X percentile in the baseline period
    let adjustedScore = getScoreFromLookup(
      baselineLookup,
      percentileInYear,
      baseline.scores
    );

    // Apply hard caps based on baseline percentiles
    if (percentileInYear >= 99) {
      adjustedScore = Math.min(adjustedScore, cap100);
    } else if (percentileInYear >= 95) {
      adjustedScore = Math.min(adjustedScore, cap95);
    }

    // Apply score increase/decrease policy based on toggle
    if (!ALLOW_SCORE_INCREASES) {
      // Only correct for inflation: adjusted score should never be higher than original
      adjustedScore = Math.min(adjustedScore, anime.mean);
    }
    // If ALLOW_SCORE_INCREASES is true, scores can go up or down freely

    results.push({
      ...anime,
      adjustedScore: Math.round(adjustedScore * 100) / 100,
      adjustedRank: 0, // Will be assigned after sorting
      scoreDifference: Math.round((adjustedScore - anime.mean) * 100) / 100,
      percentileInYear: Math.round(percentileInYear * 100) / 100, // Round to 2 decimals
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

// Helper function to create a custom config
export function createConfig(
  baselineStartYear: number,
  baselineEndYear: number,
  minScoringUsers: number = 17500
): CalculatorConfig {
  return {
    MIN_SCORING_USERS: minScoringUsers,
    BASELINE_START_YEAR: baselineStartYear,
    BASELINE_END_YEAR: baselineEndYear,
  };
}

// Export a pre-configured function that uses default config
export function calculateAdjustedScoresDefault(
  animeList: AnimeData[]
): AdjustedAnimeData[] {
  return calculateAdjustedScores(animeList, DEFAULT_CONFIG);
}
