import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { exportToJSON } from "./lib/exporter";
import {
  CONFIG,
  AnimeData,
  AdjustedAnimeData,
  calculateAdjustedScores
} from "./lib/calculator";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

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

function calculatePercentile(sortedScores: number[], score: number): number {
  // Find how many scores are below this score
  let count = 0;
  for (const s of sortedScores) {
    if (s < score) count++;
    else break;
  }
  return (count / sortedScores.length) * 100;
}

function getScoreAtPercentile(sortedScores: number[], percentile: number): number {
  const index = Math.floor((percentile / 100) * sortedScores.length);
  return sortedScores[Math.min(index, sortedScores.length - 1)];
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

function writeResultsToFile(
  yearStatsMap: Map<number, YearStats>,
  adjustedAnimes: AdjustedAnimeData[]
): void {
  const outputDir = path.join(process.cwd(), "output");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `anime-adjusted-scores-${timestamp}.txt`);

  let output = "";

  output += "=".repeat(80) + "\n";
  output += "MAL SCORE INFLATION ANALYZER - RESULTS\n";
  output += "=".repeat(80) + "\n\n";
  output += `Generated: ${new Date().toLocaleString()}\n`;
  output += `Minimum scoring users: ${CONFIG.MIN_SCORING_USERS.toLocaleString()}\n`;
  output += `Baseline period: ${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}\n`;
  output += `Total anime analyzed: ${adjustedAnimes.length.toLocaleString()}\n\n`;

  // Year statistics
  output += "=".repeat(80) + "\n";
  output += "SCORE TRENDS BY YEAR\n";
  output += "=".repeat(80) + "\n\n";
  output += "Year | Median | Mean   | Count | Adjustment\n";
  output += "-----|--------|--------|-------|------------\n";

  const sortedYears = Array.from(yearStatsMap.values()).sort((a, b) => a.year - b.year);
  for (const stats of sortedYears) {
    output += `${stats.year} | ${stats.medianScore.toFixed(2)}   | ${stats.meanScore.toFixed(2)}   | ${stats.count.toString().padStart(5)} | ${stats.adjustmentFactor > 0 ? '+' : ''}${stats.adjustmentFactor.toFixed(2)}\n`;
  }

  // All anime sorted by adjusted score
  output += "\n" + "=".repeat(80) + "\n";
  output += "ALL ANIME RANKED BY ADJUSTED SCORE\n";
  output += "=".repeat(80) + "\n\n";
  output += "New Rank | MAL Rank | Title | Year | Original | Adjusted | Diff | Scoring Users\n";
  output += "---------|----------|-------|------|----------|----------|------|---------------\n";

  const sortedByAdjusted = adjustedAnimes
    .slice()
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  for (let i = 0; i < sortedByAdjusted.length; i++) {
    const anime = sortedByAdjusted[i];
    const yearStr = anime.startYear?.toString() || "N/A";
    const diffStr = anime.scoreDifference > 0
      ? `+${anime.scoreDifference.toFixed(2)}`
      : anime.scoreDifference.toFixed(2);

    output += `${(i + 1).toString().padStart(8)} | ${anime.rank.toString().padStart(8)} | ${anime.title.padEnd(60)} | ${yearStr.padStart(4)} | ${anime.mean.toFixed(2).padStart(8)} | ${anime.adjustedScore.toFixed(2).padStart(8)} | ${diffStr.padStart(6)} | ${anime.numScoringUsers.toLocaleString().padStart(13)}\n`;
  }

  // Summary statistics
  output += "\n" + "=".repeat(80) + "\n";
  output += "SUMMARY STATISTICS\n";
  output += "=".repeat(80) + "\n\n";

  const avgOriginal = adjustedAnimes.reduce((sum, a) => sum + a.mean, 0) / adjustedAnimes.length;
  const avgAdjusted = adjustedAnimes.reduce((sum, a) => sum + a.adjustedScore, 0) / adjustedAnimes.length;
  const avgDiff = avgAdjusted - avgOriginal;

  output += `Average Original Score: ${avgOriginal.toFixed(4)}\n`;
  output += `Average Adjusted Score: ${avgAdjusted.toFixed(4)}\n`;
  output += `Average Difference: ${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(4)}\n\n`;

  // Biggest changes
  output += "Top 20 Biggest Score DECREASES (Most Inflated):\n";
  output += "-".repeat(80) + "\n";
  const biggestDecreases = adjustedAnimes
    .slice()
    .sort((a, b) => a.scoreDifference - b.scoreDifference)
    .slice(0, 20);

  for (const anime of biggestDecreases) {
    output += `${anime.title} (${anime.startYear || "N/A"}): ${anime.mean.toFixed(2)} → ${anime.adjustedScore.toFixed(2)} (${anime.scoreDifference.toFixed(2)})\n`;
  }

  output += "\n";
  output += "Top 20 Biggest Score INCREASES (Most Deflated):\n";
  output += "-".repeat(80) + "\n";
  const biggestIncreases = adjustedAnimes
    .slice()
    .sort((a, b) => b.scoreDifference - a.scoreDifference)
    .slice(0, 20);

  for (const anime of biggestIncreases) {
    output += `${anime.title} (${anime.startYear || "N/A"}): ${anime.mean.toFixed(2)} → ${anime.adjustedScore.toFixed(2)} (${anime.scoreDifference > 0 ? '+' : ''}${anime.scoreDifference.toFixed(2)})\n`;
  }

  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`\n✓ Results written to: ${outputPath}`);
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

    // Step 2: Fetch anime data and calculate adjusted scores using shared logic
    const animeList = await fetchAnimeFromDatabase();
    const adjustedAnimes = calculateAdjustedScores(animeList);

    // Step 2.5: Write results to file
    writeResultsToFile(yearStatsMap, adjustedAnimes);

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
    exportToJSON(sortedByAdjusted);

    // Step 3: Display top 200 by original MAL rank
    console.log("\n\n=== Top 200 Anime: Original vs Adjusted Scores ===\n");
    console.log("Rank | Title (Year) | Original | Adjusted | Diff | Users");
    console.log("-----|--------------|----------|----------|------|-------");

    for (let i = 0; i < Math.min(200, adjustedAnimes.length); i++) {
      const anime = adjustedAnimes[i];
      const yearStr = anime.startYear ? `(${anime.startYear})` : "(N/A)";
      const titleDisplay = anime.title.length > 40
        ? anime.title.substring(0, 37) + "..."
        : anime.title;

      const diffStr = anime.scoreDifference > 0
        ? `+${anime.scoreDifference.toFixed(2)}`
        : anime.scoreDifference.toFixed(2);

      console.log(
        `${anime.rank.toString().padStart(4)} | ${(titleDisplay + " " + yearStr).padEnd(45)} | ${anime.mean.toFixed(2)}     | ${anime.adjustedScore.toFixed(2)}     | ${diffStr.padStart(5)} | ${(anime.numScoringUsers / 1000).toFixed(0)}K`
      );
    }

    // Step 4: Display top 50 by adjusted score (using already sorted data)
    console.log("\n\n=== Top 50 by ADJUSTED Score (New Rankings) ===\n");
    console.log("New | Old  | Title (Year) | Original | Adjusted | Diff");
    console.log("----|------|--------------|----------|----------|------");

    for (let i = 0; i < Math.min(50, sortedByAdjusted.length); i++) {
      const anime = sortedByAdjusted[i];
      const yearStr = anime.startYear ? `(${anime.startYear})` : "(N/A)";
      const titleDisplay = anime.title.length > 35
        ? anime.title.substring(0, 32) + "..."
        : anime.title;

      const diffStr = anime.scoreDifference > 0
        ? `+${anime.scoreDifference.toFixed(2)}`
        : anime.scoreDifference.toFixed(2);

      console.log(
        `${(i + 1).toString().padStart(3)} | ${anime.rank.toString().padStart(4)} | ${(titleDisplay + " " + yearStr).padEnd(40)} | ${anime.mean.toFixed(2)}     | ${anime.adjustedScore.toFixed(2)}     | ${diffStr}`
      );
    }

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
