import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

interface Env {
  MAL_SECRET: string;
}

const env: Env = {
  MAL_SECRET: process.env.MAL_SECRET || "",
};

type MalRankingType = "all" | "airing" | "upcoming" | "tv" | "movie" | "ova" | "ona" | "special" | "bypopularity" | "favorite";

interface MainPicture {
  medium: string;
  large: string;
}

interface StartSeason {
  year: number;
  season: string;
}

interface AnimeNode {
  id: number;
  title: string;
  main_picture?: MainPicture;
  mean?: number;
  nsfw: string;
  media_type: string;
  num_list_users: number;
  num_scoring_users: number;
  popularity: number;
  status: string;
  start_season?: StartSeason;
}

interface Ranking {
  rank: number;
}

interface MalRankingData {
  node: AnimeNode;
  ranking: Ranking;
}

interface ApiResponse {
  data: MalRankingData[];
  paging?: {
    next?: string;
  };
}

async function fetchAndUpsertAnime(
  offset: number,
  limit: number,
  type: MalRankingType = "all"
): Promise<void> {
  const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=${type}&limit=${limit}&offset=${offset}&fields=mean,nsfw,media_type,num_list_users,num_scoring_users,popularity,status,start_season`;
  const config = {
    headers: {
      "X-MAL-CLIENT-ID": env.MAL_SECRET,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as ApiResponse;

    console.log(JSON.stringify(data, null, 2));
    // Process and upsert each anime
    for (const item of data.data) {
      const { node, ranking } = item;

      // Skip anime without mean score
      if (node.mean === undefined) {
        console.log(`⊘ Skipped: ${node.title} (No mean score available)`);
        continue;
      }

      try {
        const anime = await prisma.anime.upsert({
          where: { id: node.id },
          update: {
            title: node.title,
            mediumPicture: node.main_picture?.medium ?? null,
            largePicture: node.main_picture?.large ?? null,
            mean: node.mean,
            nsfw: node.nsfw,
            mediaType: node.media_type,
            numListUsers: node.num_list_users,
            numScoringUsers: node.num_scoring_users,
            popularity: node.popularity,
            status: node.status,
            rank: ranking.rank,
            startSeason: node.start_season?.season ?? null,
            startYear: node.start_season?.year ?? null,
          },
          create: {
            id: node.id,
            title: node.title,
            mediumPicture: node.main_picture?.medium ?? null,
            largePicture: node.main_picture?.large ?? null,
            mean: node.mean,
            nsfw: node.nsfw,
            mediaType: node.media_type,
            numListUsers: node.num_list_users,
            numScoringUsers: node.num_scoring_users,
            popularity: node.popularity,
            status: node.status,
            rank: ranking.rank,
            startSeason: node.start_season?.season ?? null,
            startYear: node.start_season?.year ?? null,
          },
        });

        console.log(`✓ Saved: ${anime.title} (Rank #${anime.rank}) - ${node.start_season?.season ?? 'N/A'} ${node.start_season?.year ?? ''}`);
      } catch (error) {
        console.error(`✗ Failed to save anime ${node.id} (${node.title}):`, error);
      }
    }
  } catch (error) {
    console.error(`Error fetching anime at offset ${offset}:`, error);
    throw error;
  }
}

async function main() {
  const limit = 500; // MAL API allows max 500 per request
  let offset = 0;
  let count = 0;
  const totalEntries = 20000; 
  const totalLoops = Math.ceil(totalEntries / limit);

  console.log(`Starting to fetch and save top ${totalEntries} anime...`);
  console.log(`This will take approximately ${(totalLoops * 15) / 60} minutes with rate limiting.\n`);

  try {
    while (offset < totalEntries) {
      const startOffset = offset;
      console.log(`\n[${count + 1}/${totalLoops}] Fetching anime ${startOffset + 1}-${Math.min(startOffset + limit, totalEntries)}...`);

      await fetchAndUpsertAnime(offset, limit);

      offset += limit;
      count++;

      console.log(`[${count}/${totalLoops}] Completed batch ${startOffset + 1}-${Math.min(startOffset + limit, totalEntries)}`);

      // Rate limiting: wait between requests to avoid hitting API limits
      if (offset < totalEntries) {
        console.log("Waiting before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    console.log("\n✓ All anime data fetched and saved successfully!");

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
