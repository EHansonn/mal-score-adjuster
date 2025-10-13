import type { AdjustedAnimeData } from "./calculator";

export function printTopAnime(
  adjustedAnimes: AdjustedAnimeData[],
  count: number = 50,
  title: string = "Top Anime by Adjusted Score"
): void {
  console.log(`\n=== ${title} ===\n`);
  console.log(
    "Adj# | MAL# | Title                          | Year | Orig | Adj  | Diff | %ile"
  );
  console.log(
    "-----|------|--------------------------------|------|------|------|------|------"
  );

  for (let i = 0; i < Math.min(count, adjustedAnimes.length); i++) {
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
    const percentileStr = anime.percentileInYear.toFixed(1);

    console.log(
      `${anime.adjustedRank.toString().padStart(4)} | ${anime.rank
        .toString()
        .padStart(4)} | ${titleShort.padEnd(30)} | ${yearStr.padStart(
        4
      )} | ${anime.mean.toFixed(2)} | ${anime.adjustedScore.toFixed(
        2
      )} | ${diffStr.padStart(5)} | ${percentileStr.padStart(5)}`
    );
  }
  console.log();
}

export function printTopAnimeByOriginalRank(
  adjustedAnimes: AdjustedAnimeData[],
  count: number = 200,
  title: string = "Top Anime: Original vs Adjusted Scores"
): void {
  console.log(`\n=== ${title} ===\n`);
  console.log("Rank | Title (Year) | Original | Adjusted | Diff | Users");
  console.log("-----|--------------|----------|----------|------|-------");

  // Sort by original MAL rank
  const sortedByOriginal = adjustedAnimes.slice().sort((a, b) => a.rank - b.rank);

  for (let i = 0; i < Math.min(count, sortedByOriginal.length); i++) {
    const anime = sortedByOriginal[i];
    const yearStr = anime.startYear ? `(${anime.startYear})` : "(N/A)";
    const titleDisplay =
      anime.title.length > 40
        ? anime.title.substring(0, 37) + "..."
        : anime.title;

    const diffStr =
      anime.scoreDifference > 0
        ? `+${anime.scoreDifference.toFixed(2)}`
        : anime.scoreDifference.toFixed(2);

    console.log(
      `${anime.rank.toString().padStart(4)} | ${(
        titleDisplay +
        " " +
        yearStr
      ).padEnd(45)} | ${anime.mean.toFixed(2)}     | ${anime.adjustedScore.toFixed(
        2
      )}     | ${diffStr.padStart(5)} | ${(anime.numScoringUsers / 1000).toFixed(0)}K`
    );
  }
  console.log();
}

export function printStatistics(
  adjustedAnimes: AdjustedAnimeData[],
  baselinePeriod: string
): void {
  console.log("\n=== Summary Statistics ===\n");

  const avgOriginal =
    adjustedAnimes.reduce((sum, a) => sum + a.mean, 0) / adjustedAnimes.length;
  const avgAdjusted =
    adjustedAnimes.reduce((sum, a) => sum + a.adjustedScore, 0) /
    adjustedAnimes.length;
  const avgDiff = avgAdjusted - avgOriginal;

  console.log(`Baseline Period: ${baselinePeriod}`);
  console.log(`Total Anime: ${adjustedAnimes.length.toLocaleString()}`);
  console.log(`Average Original Score: ${avgOriginal.toFixed(4)}`);
  console.log(`Average Adjusted Score: ${avgAdjusted.toFixed(4)}`);
  console.log(
    `Average Difference: ${avgDiff > 0 ? "+" : ""}${avgDiff.toFixed(4)}\n`
  );

  // Biggest decreases (most inflated)
  console.log("Top 10 Biggest Score DECREASES (Most Inflated):");
  console.log("-".repeat(70));
  const biggestDecreases = adjustedAnimes
    .slice()
    .sort((a, b) => a.scoreDifference - b.scoreDifference)
    .slice(0, 10);

  for (const anime of biggestDecreases) {
    console.log(
      `${anime.title} (${anime.startYear || "N/A"}): ${anime.mean.toFixed(
        2
      )} → ${anime.adjustedScore.toFixed(2)} (${anime.scoreDifference.toFixed(2)})`
    );
  }

  console.log();

  // Biggest increases (most deflated)
  console.log("Top 10 Biggest Score INCREASES (Most Deflated):");
  console.log("-".repeat(70));
  const biggestIncreases = adjustedAnimes
    .slice()
    .sort((a, b) => b.scoreDifference - a.scoreDifference)
    .slice(0, 10);

  for (const anime of biggestIncreases) {
    console.log(
      `${anime.title} (${anime.startYear || "N/A"}): ${anime.mean.toFixed(
        2
      )} → ${anime.adjustedScore.toFixed(2)} (${
        anime.scoreDifference > 0 ? "+" : ""
      }${anime.scoreDifference.toFixed(2)})`
    );
  }
  console.log();
}
