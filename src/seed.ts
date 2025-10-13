import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { fetchAnimeFromMAL } from "./lib/fetcher";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function upsertAnimeToDB() {
  const malClientId = process.env.MAL_SECRET || "";
  if (!malClientId) {
    throw new Error("MAL_SECRET environment variable is required");
  }

  console.log("\n=== Fetching and Seeding Database ===\n");

  // Use shared fetcher
  const animeList = await fetchAnimeFromMAL({
    clientId: malClientId,
    minScoringUsers: 0, // Get all anime, filter later if needed
    limit: 500,
    maxEntries: 20000,
    rateLimit: 3000,
  });

  console.log(`\n=== Upserting ${animeList.length} anime to database ===\n`);

  let saved = 0;
  let skipped = 0;

  // Upsert each anime
  for (const anime of animeList) {

    try {
      await prisma.anime.upsert({
        where: { id: anime.id },
        update: {
          title: anime.title,
          mediumPicture: anime.mediumPicture,
          largePicture: anime.largePicture,
          mean: anime.mean,
          nsfw: anime.nsfw,
          mediaType: anime.mediaType,
          numListUsers: anime.numListUsers,
          numScoringUsers: anime.numScoringUsers,
          popularity: anime.popularity,
          status: anime.status,
          rank: anime.rank,
          startSeason: anime.startSeason,
          startYear: anime.startYear,
        },
        create: {
          id: anime.id,
          title: anime.title,
          mediumPicture: anime.mediumPicture,
          largePicture: anime.largePicture,
          mean: anime.mean,
          nsfw: anime.nsfw,
          mediaType: anime.mediaType,
          numListUsers: anime.numListUsers,
          numScoringUsers: anime.numScoringUsers,
          popularity: anime.popularity,
          status: anime.status,
          rank: anime.rank,
          startSeason: anime.startSeason,
          startYear: anime.startYear,
        },
      });

      saved++;
      if (saved % 100 === 0) {
        console.log(`✓ Saved ${saved}/${animeList.length} anime...`);
      }
    } catch (error) {
      console.error(`✗ Failed to save anime ${anime.id} (${anime.title}):`, error);
      skipped++;
    }
  }

  console.log(`\n✓ Complete! Saved: ${saved}, Skipped: ${skipped}`);
}

async function main() {
  try {
    // Fetch and upsert to database
    await upsertAnimeToDB();

    // Display summary statistics
    const totalCount = await prisma.anime.count();
    console.log(`\n--- Database Summary ---`);
    console.log(`Total anime in database: ${totalCount}`);

    // Show top 10
    console.log(`\n--- Top 10 Anime ---`);
    const topAnime = await prisma.anime.findMany({
      orderBy: { rank: "asc" },
      take: 10,
    });

    topAnime.forEach((anime: typeof topAnime[number]) => {
      console.log(`#${anime.rank} - ${anime.title} (Score: ${anime.mean})`);
    });
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
