// Shared MAL API fetching logic

export interface MalApiConfig {
  clientId: string;
  minScoringUsers?: number;
  limit?: number;
  maxEntries?: number;
  rateLimit?: number;
}

export interface MainPicture {
  medium: string;
  large: string;
}

export interface StartSeason {
  year: number;
  season: string;
}

export interface AnimeNode {
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

export interface Ranking {
  rank: number;
}

export interface MalRankingData {
  node: AnimeNode;
  ranking: Ranking;
}

export interface ApiResponse {
  data: MalRankingData[];
  paging?: {
    next?: string;
  };
}

export interface FetchedAnime {
  id: number;
  title: string;
  mean: number;
  rank: number;
  startYear: number | null;
  startSeason: string | null;
  numScoringUsers: number;
  numListUsers: number;
  popularity: number;
  mediaType: string;
  nsfw: string;
  status: string;
  mediumPicture: string | null;
  largePicture: string | null;
}

export async function fetchAnimeFromMAL(
  config: MalApiConfig
): Promise<FetchedAnime[]> {
  const {
    clientId,
    minScoringUsers = 0,
    limit = 500,
    maxEntries = 20000,
    rateLimit = 3000,
  } = config;

  console.log("\n=== Fetching Anime from MAL API ===");
  console.log(`Limit per request: ${limit}`);
  console.log(`Max entries: ${maxEntries}`);
  console.log(`Min scoring users filter: ${minScoringUsers}\n`);

  const animeList: FetchedAnime[] = [];
  let offset = 0;
  let skipped = 0;

  while (offset < maxEntries) {
    const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=all&limit=${limit}&offset=${offset}&fields=mean,nsfw,media_type,num_list_users,num_scoring_users,popularity,status,start_season`;

    try {
      console.log(
        `Fetching ${offset + 1}-${Math.min(offset + limit, maxEntries)}...`
      );

      const response = await fetch(url, {
        headers: {
          "X-MAL-CLIENT-ID": clientId,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as ApiResponse;

      // Process each anime
      for (const item of data.data) {
        const { node, ranking } = item;

        // Check if meets minimum scoring users requirement
        if (node.num_scoring_users < minScoringUsers) {
          skipped++;
          continue;
        }

        // Skip if no mean score
        if (node.mean === undefined) {
          skipped++;
          continue;
        }

        animeList.push({
          id: node.id,
          title: node.title,
          mean: node.mean,
          rank: ranking.rank,
          startYear: node.start_season?.year ?? null,
          startSeason: node.start_season?.season ?? null,
          numScoringUsers: node.num_scoring_users,
          numListUsers: node.num_list_users,
          popularity: node.popularity,
          mediaType: node.media_type,
          nsfw: node.nsfw,
          status: node.status,
          mediumPicture: node.main_picture?.medium ?? null,
          largePicture: node.main_picture?.large ?? null,
        });
      }

      offset += limit;

      // Rate limiting
      if (offset < maxEntries) {
        await new Promise((resolve) => setTimeout(resolve, rateLimit));
      }
    } catch (error) {
      console.error(`Error fetching at offset ${offset}:`, error);
      throw error;
    }
  }

  console.log(`\n✓ Fetched ${animeList.length} anime`);
  console.log(`  Skipped: ${skipped} (not meeting criteria)\n`);

  return animeList;
}
