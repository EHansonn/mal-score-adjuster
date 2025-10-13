import * as dotenv from "dotenv";
import {
  AnimeData,
  AdjustedAnimeData,
  calculateAdjustedScores,
  CONFIG,
} from "./lib/calculator";
import { fetchAnimeFromMAL, FetchedAnime } from "./lib/fetcher";
import { exportToJSON } from "./lib/exporter";

// Load environment variables
dotenv.config();

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

function printTopAnime(adjustedAnimes: AdjustedAnimeData[]): void {
  console.log("=== Top 50 Anime by Adjusted Score ===\n");
  console.log(
    "Adj# | MAL# | Title                          | Year | Orig | Adj  | Diff"
  );
  console.log(
    "-----|------|--------------------------------|------|------|------|------"
  );

  for (let i = 0; i < Math.min(50, adjustedAnimes.length); i++) {
    const anime = adjustedAnimes[i];
    const yearStr = anime.startYear?.toString() || "N/A ";
    const titleShort =
      anime.title.length > 30
        ? anime.title.substring(0, 27) + "..."
        : anime.title;
    const diffStr =
      anime.scoreDifference > 0
        ? `+${anime.scoreDifference.toFixed(2)}`
        : anime.scoreDifference.toFixed(2);

    console.log(
      `${anime.adjustedRank.toString().padStart(4)} | ${anime.rank
        .toString()
        .padStart(4)} | ${titleShort.padEnd(30)} | ${yearStr.padStart(
        4
      )} | ${anime.mean.toFixed(2)} | ${anime.adjustedScore.toFixed(
        2
      )} | ${diffStr.padStart(5)}`
    );
  }
  console.log();
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

    // Calculate adjusted scores using shared logic
    const adjustedAnimes = calculateAdjustedScores(animeList);

    // Export to JSON for extension
    exportToJSON(adjustedAnimes);

    // Print summary
    printTopAnime(adjustedAnimes);

    console.log("=".repeat(70));
    console.log("✓ Complete! JSON ready for GitHub repo & browser extension");
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exit(1);
  }
}

main();
