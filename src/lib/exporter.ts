import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "./calculator";

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
}

export function exportToJSON(adjustedAnimes: ExportableAnime[]): void {
  console.log("\n=== Exporting to JSON for Extension ===\n");

  const exportData: ExportData = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalAnime: adjustedAnimes.length,
      baselinePeriod: `${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}`,
      minScoringUsers: CONFIG.MIN_SCORING_USERS,
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
