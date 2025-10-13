import * as dotenv from "dotenv";
import {
  AnimeData,
  AdjustedAnimeData,
  calculateAdjustedScores,
  CalculatorConfig,
  DEFAULT_CONFIG,
  createConfig,
} from "./lib/calculator";
import { fetchAnimeFromMAL, FetchedAnime } from "./lib/fetcher";
import { exportToJSON } from "./lib/exporter";
import { printTopAnime, printStatistics } from "./lib/printer";
import { generateVisualization } from "./lib/visualizer";

// Load environment variables
dotenv.config();

const CONFIG: CalculatorConfig = DEFAULT_CONFIG;

function convertToAnimeData(fetchedAnime: FetchedAnime[]): AnimeData[] {
  return fetchedAnime.map((anime) => ({
    id: anime.id,
    title: anime.title,
    mean: anime.mean,
    rank: anime.rank,
    startYear: anime.startYear,
    numScoringUsers: anime.numScoringUsers,
  }));
}


async function main() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("MAL SCORE ADJUSTER - STANDALONE (No Database)");
    console.log("=".repeat(70));

    const malClientId = process.env.MAL_SECRET || "";
    if (!malClientId) {
      throw new Error("MAL_SECRET environment variable is required");
    }

    // Fetch all anime from MAL API into memory
    const fetchedAnime = await fetchAnimeFromMAL({
      clientId: malClientId,
      minScoringUsers: CONFIG.MIN_SCORING_USERS,
      limit: 500,
      maxEntries: 20000,
      rateLimit: 3000,
    });

    // Convert to AnimeData format for calculator
    const animeList = convertToAnimeData(fetchedAnime);

    // Calculate adjusted scores using configurable calculator
    const adjustedAnimes = calculateAdjustedScores(animeList, CONFIG);

    // Export to JSON for extension
    exportToJSON(adjustedAnimes, CONFIG);

    // Generate percentile visualization
    generateVisualization(animeList, CONFIG);

    // Print results using shared printer
    const baselinePeriod = `${CONFIG.BASELINE_START_YEAR}-${CONFIG.BASELINE_END_YEAR}`;
    printTopAnime(adjustedAnimes, 50);
    printStatistics(adjustedAnimes, baselinePeriod);

    console.log("=".repeat(70));
    console.log("✓ Complete! JSON ready for GitHub repo & browser extension");
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exit(1);
  }
}

main();
