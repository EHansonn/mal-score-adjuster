import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { exportToJSON, writeResultsToFile } from "./lib/exporter";
import {
  AnimeData,
  AdjustedAnimeData,
  calculateAdjustedScores,
  CalculatorConfig,
  DEFAULT_CONFIG,
  createConfig,
} from "./lib/calculator";
import { printTopAnime, printTopAnimeByOriginalRank, printStatistics } from "./lib/printer";
import { generateVisualization } from "./lib/visualizer";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

const CONFIG: CalculatorConfig = DEFAULT_CONFIG;


interface YearStats {
  year: number;
  medianScore: number;
  meanScore: number;
  count: number;
  adjustmentFactor: number;
  scores: number[]; // Store all scores for percentile calculation
}

function calculateMedian(scores: number[]): number {
  const sorted = scores.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function calculateMean(scores: number[]): number {
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}


async function calculateYearStatistics(): Promise<{ yearStatsMap: Map<number, YearStats>; baselineScores: number[] }> {
  console.log("\n=== Calculating Score Statistics by Year ===\n");

  // Fetch all anime with sufficient scoring users and a start year
  const animes = await prisma.anime.findMany({
    where: {
      numScoringUsers: {
        gte: CONFIG.MIN_SCORING_USERS,
      },
      startYear: {
        not: null,
      },
    },
    select: {
      mean: true,
      startYear: true,
    },
  });

  // Group scores by year
  const scoresByYear = new Map<number, number[]>();

  for (const anime of animes) {
    if (anime.startYear && anime.mean) {
      if (!scoresByYear.has(anime.startYear)) {
        scoresByYear.set(anime.startYear, []);
      }
      scoresByYear.get(anime.startYear)!.push(anime.mean);
    }
  }

  // Calculate statistics for each year
  const yearStatsMap = new Map<number, YearStats>();

  for (const [year, scores] of scoresByYear.entries()) {
    if (scores.length < 10) continue; // Skip years with too few anime

    const sortedScores = scores.slice().sort((a, b) => a - b);
    const medianScore = calculateMedian(scores);
    const meanScore = calculateMean(scores);

    yearStatsMap.set(year, {
      year,
      medianScore,
      meanScore,
      count: scores.length,
      adjustmentFactor: 0, // Will calculate after we have baseline
      scores: sortedScores,
    });
  }

  // Calculate baseline median from the baseline period
  const baselineScores: number[] = [];
  for (const [year, scores] of scoresByYear.entries()) {
    if (year >= CONFIG.BASELINE_START_YEAR && year <= CONFIG.BASELINE_END_YEAR) {
      baselineScores.push(...scores);
    }
  }

  const baselineMedian = baselineScores.length > 0
    ? calculateMedian(baselineScores)
    : 7.30; // Fallback if no baseline data

  console.log(`Baseline median (${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}): ${baselineMedian.toFixed(2)}`);
  console.log(`Baseline sample size: ${baselineScores.length} anime\n`);

  // Calculate adjustment factors (still useful for display purposes)
  for (const stats of yearStatsMap.values()) {
    stats.adjustmentFactor = baselineMedian - stats.medianScore;
  }

  return { yearStatsMap, baselineScores };
}

async function fetchAnimeFromDatabase(): Promise<AnimeData[]> {
  const animes = await prisma.anime.findMany({
    where: {
      numScoringUsers: {
        gte: CONFIG.MIN_SCORING_USERS,
      },
    },
    select: {
      id: true,
      title: true,
      rank: true,
      mean: true,
      startYear: true,
      numScoringUsers: true,
    },
    orderBy: {
      rank: "asc",
    },
  });

  return animes.map(anime => ({
    id: anime.id,
    title: anime.title,
    rank: anime.rank,
    mean: anime.mean,
    startYear: anime.startYear,
    numScoringUsers: anime.numScoringUsers,
  }));
}

async function main() {
  try {
    console.log("=== MAL Score Inflation Analyzer ===");
    console.log(`Minimum scoring users: ${CONFIG.MIN_SCORING_USERS.toLocaleString()}`);
    console.log(`Baseline period: ${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}\n`);

    // Step 1: Calculate year-based statistics (for display purposes)
    const { yearStatsMap, baselineScores } = await calculateYearStatistics();

    // Display year statistics
    const sortedYears = Array.from(yearStatsMap.values()).sort((a, b) => a.year - b.year);
    console.log("\n--- Score Trends by Year ---");
    console.log("Year | Median | Mean   | Count | Adjustment");
    console.log("-----|--------|--------|-------|------------");
    for (const stats of sortedYears) {
      console.log(
        `${stats.year} | ${stats.medianScore.toFixed(2)}   | ${stats.meanScore.toFixed(2)}   | ${stats.count.toString().padStart(5)} | ${stats.adjustmentFactor > 0 ? '+' : ''}${stats.adjustmentFactor.toFixed(2)}`
      );
    }

    // Step 2: Fetch anime data and calculate adjusted scores using configurable calculator
    const animeList = await fetchAnimeFromDatabase();
    const adjustedAnimes = calculateAdjustedScores(animeList, CONFIG);

    // Step 2.5: Write results to file
    writeResultsToFile(yearStatsMap, adjustedAnimes, CONFIG);

    // Step 2.6: Save adjusted scores to database
    console.log("\n=== Saving Adjusted Scores to Database ===\n");

    // Sort by adjusted score to get adjusted rankings
    const sortedByAdjusted = adjustedAnimes
      .slice()
      .sort((a, b) => b.adjustedScore - a.adjustedScore);

    // Assign adjusted ranks
    sortedByAdjusted.forEach((anime, index) => {
      anime.adjustedRank = index + 1;
    });

    // Update database in batches
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < adjustedAnimes.length; i += batchSize) {
      const batch = adjustedAnimes.slice(i, i + batchSize);

      await Promise.all(
        batch.map((anime) =>
          prisma.anime.update({
            where: { id: anime.id },
            data: {
              adjustedScore: anime.adjustedScore,
              adjustedRank: anime.adjustedRank,
            },
          })
        )
      );

      updated += batch.length;
      console.log(`Updated ${updated}/${adjustedAnimes.length} anime...`);
    }

    console.log(`\n✓ Successfully saved adjusted scores and ranks to database!`);

    // Step 2.7: Export to JSON for extension
    exportToJSON(sortedByAdjusted, CONFIG);

    // Step 2.8: Generate percentile visualization
    generateVisualization(animeList, CONFIG);

    // Step 3 & 4: Display results using shared printer
    const baselinePeriod = `${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}`;

    printTopAnimeByOriginalRank(adjustedAnimes, 200);
    printTopAnime(sortedByAdjusted, 50, "Top 50 by ADJUSTED Score (New Rankings)");
    printStatistics(adjustedAnimes, baselinePeriod);

  } catch (error) {
    console.error("\n✗ Error in main:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed script
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
