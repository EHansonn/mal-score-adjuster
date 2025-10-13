import * as fs from "fs";
import * as path from "path";
import type { CalculatorConfig } from "./calculator";
import type { AdjustedAnimeData } from "./calculator";

interface YearStats {
  year: number;
  medianScore: number;
  meanScore: number;
  count: number;
  adjustmentFactor: number;
  scores: number[];
}

export interface ExportData {
  metadata: {
    lastUpdated: string;
    totalAnime: number;
    baselinePeriod: string;
    minScoringUsers: number;
    algorithm: string;
  };
  anime: Record<
    number,
    {
      title: string;
      originalScore: number;
      originalRank: number;
      adjustedScore: number;
      adjustedRank: number;
      year: number | null;
      percentileInYear: number; // What percentile this anime is in its release year
    }
  >;
}

export interface ExportableAnime {
  id: number;
  title: string;
  mean?: number;
  originalScore?: number;
  rank: number;
  adjustedScore: number;
  adjustedRank?: number;
  startYear: number | null;
  percentileInYear?: number;
}

export function exportToJSON(
  adjustedAnimes: ExportableAnime[],
  config: CalculatorConfig
): void {
  console.log("\n=== Exporting to JSON for Extension ===\n");

  const exportData: ExportData = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalAnime: adjustedAnimes.length,
      baselinePeriod: `${config.BASELINE_START_YEAR}-${config.BASELINE_END_YEAR}`,
      minScoringUsers: config.MIN_SCORING_USERS,
      algorithm: "Percentile-based score normalization with hard caps",
    },
    anime: {},
  };

  // Convert to Record format for O(1) lookup by MAL ID
  for (const anime of adjustedAnimes) {
    exportData.anime[anime.id] = {
      title: anime.title,
      originalScore: anime.originalScore ?? anime.mean ?? 0,
      originalRank: anime.rank,
      adjustedScore: anime.adjustedScore,
      adjustedRank: anime.adjustedRank ?? 0,
      year: anime.startYear,
      percentileInYear: anime.percentileInYear ?? 0,
    };
  }

  // Create output directory
  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write JSON file
  const outputPath = path.join(outputDir, "adjusted-scores.json");
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

  const fileSizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
  console.log(`✓ Exported to: ${outputPath}`);
  console.log(`  File size: ${fileSizeKB} KB`);
  console.log(`  Total anime: ${adjustedAnimes.length}\n`);
}

export function writeResultsToFile(
  yearStatsMap: Map<number, YearStats>,
  adjustedAnimes: AdjustedAnimeData[],
  config: CalculatorConfig
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
  output += `Minimum scoring users: ${config.MIN_SCORING_USERS.toLocaleString()}\n`;
  output += `Baseline period: ${config.BASELINE_START_YEAR}-${config.BASELINE_END_YEAR}\n`;
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
  output += "New Rank | MAL Rank | Title | Year | Original | Adjusted | Diff | Percentile | Scoring Users\n";
  output += "---------|----------|-------|------|----------|----------|------|------------|---------------\n";

  const sortedByAdjusted = adjustedAnimes
    .slice()
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  for (let i = 0; i < sortedByAdjusted.length; i++) {
    const anime = sortedByAdjusted[i];
    const yearStr = anime.startYear?.toString() || "N/A";
    const diffStr = anime.scoreDifference > 0
      ? `+${anime.scoreDifference.toFixed(2)}`
      : anime.scoreDifference.toFixed(2);
    const percentileStr = anime.percentileInYear.toFixed(1) + "%";

    // Truncate title if longer than 60 characters
    const titleFormatted = anime.title.length > 60
      ? anime.title.substring(0, 57) + "..."
      : anime.title.padEnd(60);

    output += `${(i + 1).toString().padStart(8)} | ${anime.rank.toString().padStart(8)} | ${titleFormatted} | ${yearStr.padStart(4)} | ${anime.mean.toFixed(2).padStart(8)} | ${anime.adjustedScore.toFixed(2).padStart(8)} | ${diffStr.padStart(6)} | ${percentileStr.padStart(10)} | ${anime.numScoringUsers.toLocaleString().padStart(13)}\n`;
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
