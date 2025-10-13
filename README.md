# MAL Score Adjuster

A TypeScript application to fetch anime ranking data from [MyAnimeList](https://myanimelist.net/) API, and to calculate adjusted rankings and ratings, and a FireFox extension to show that data.

Calculated output should be stored in `output/adjusted-scores.json`


I believe that anime ratings on MAL, over time, have become inflated. For example a show that receives an 8.5/10 in 2025 probably would have gotten a 7-7.5/10 a decade earlier.

Mainly just a proof of concept demo I'm playing around with. For example in 2013, Attack on Titan received around an 8.56. It had an insane budget, with incredible animation, and a unique story. Now compare it with any show that received above an 8.5 rating in 2025. There's no comparison in my mind which show should have a higher rating. Don't take it too seriously! Whatever results this shows is 100% biased towards my opinions and most likely not realistic.



I made this in like an hour, the prisma stuff was just reused from an old project, the other half of the code was vibe coded 🤦 I just wanted a proof of concept!



See how the scores are modified [https://ehansonn.github.io/mal-score-adjuster/](https://ehansonn.github.io/mal-score-adjuster/)

## How It Works

The MAL Score Adjuster uses a **percentile-based normalization system** to correct for score inflation over time. Here's the detailed process:

### 1. **Baseline Period Selection**
You choose a date range (e.g., 2010) that you consider to have "accurate" scoring standards. This becomes your reference baseline.

### 2. **Percentile Mapping Algorithm**
For each anime, the tool:
- **Calculates the anime's percentile rank** within its release year (e.g., "this 2015 anime was in the 85th percentile of 2015 anime")
- **Maps that percentile to the baseline period** (e.g., "85th percentile in 2015 → what score was 85th percentile in 2010?")
- **Assigns the adjusted score** based on the baseline distribution

### 3. **High-Precision Percentile Calculation**
The algorithm uses:
- **0.1% precision percentile lookup tables** for maximum accuracy
- **Linear interpolation** between percentile values
- **Hard caps** at 95th, 99th, and 100th percentiles to prevent extreme adjustments

### 4. **Inflation-Only Correction**
By default, the tool only **decreases scores** (corrects inflation), never increases them. This means:
- A 2015 anime with 8.5/10 might become 7.5/10 (using 2010 standards)
- But a 2015 anime with 6.0/10 would stay 6.0/10 (no artificial inflation)

### 5. **Example**
If you set 2010 as your baseline:
- **2010 anime**: Scores stay the same (this is your reference)
- **2015 anime**: An 8.5/10 that was 85th percentile in 2015 gets adjusted to whatever score was 85th percentile in 2010 (maybe 7.8/10)
- **2020 anime**: An 8.8/10 that was 80th percentile in 2020 gets adjusted to whatever score was 80th percentile in 2010 (maybe 7.5/10)

This creates a **consistent scoring standard** across all time periods, eliminating the inflation bias that has accumulated over the years on MyAnimeList.

## What's Next

### Sequel Score Normalization
I'm planning to add an option to recalculate scores for anime sequels and multi-season series. Here's the problem:

**The Sequel Inflation Effect**: When a show has multiple seasons (like Attack on Titan with 4 seasons), the average score tends to increase over time. This happens because:

- **Audience Filtering**: People who didn't like Season 1 drop out, leaving only the dedicated fans
- **Self-Selection Bias**: Only viewers who enjoyed the previous seasons continue watching
- **Hype Accumulation**: Later seasons benefit from established fanbase and anticipation

**The Solution**: The tool will analyze sequel score patterns and normalize them based on the original season's performance, ensuring that a show's quality is judged consistently across all seasons rather than being artificially inflated by its most dedicated viewers.

This will help identify which sequels genuinely improved versus those that simply retained their most enthusiastic audience.



## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your MyAnimeList Client ID:

```
MAL_SECRET=your_actual_mal_client_id
DATABASE_URL="postgresql://maluser:malpassword@localhost:5432/mal_db"
```

### 3. Start PostgreSQL Database

Start the PostgreSQL database using Docker Compose:

```bash
docker-compose up -d
```

This will start a PostgreSQL database on port 5432.

### 4. Set Up Database Schema

Push the Prisma schema to the database:

```bash
npm run db:push
```

Or create a migration:

```bash
npm run db:migrate
```

Generate Prisma Client:

```bash
npm run db:generate
```

### 5. Choose Your Workflow

There are two ways to generate adjusted scores:

#### Option A: Using Database (Recommended for Development)

1. **Seed the database** - Fetch anime data from MyAnimeList API and store in PostgreSQL:
```bash
npm run seed
```

2. **Generate adjusted scores** - Calculate scores from database data:
```bash
npm run main
```

This workflow allows you to:
- Store anime data persistently in PostgreSQL
- Query and analyze data using Prisma Studio (`npm run db:studio`)
- Rerun calculations without re-fetching from the API

#### Option B: Standalone (No Database Required)

**Generate adjusted scores directly** - Fetch data in-memory and calculate scores:
```bash
npm run standalone
```

This will:
1. Fetch anime data from MyAnimeList API (in-memory, no database)
2. Calculate adjusted scores based on the baseline period
3. Generate `output/adjusted-scores.json`
4. Generate `output/percentile-visualization.html`

This is the workflow used by GitHub Actions for automated updates.

## Available Scripts

### Core Application
- `npm run seed` - Fetch anime data from MyAnimeList API and store in PostgreSQL database
- `npm run main` - Calculate adjusted scores using data from the database
- `npm run standalone` - Fetch data in-memory and generate adjusted scores (no database required)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled seed script

### Database Management
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio to view/edit data

### Browser Extension
- `npm run build:extension` - Build the browser extension for distribution

## Database Schema

The application stores anime data with the following fields:

- `id` - Anime ID (primary key)
- `title` - Anime title
- `mediumPicture` - URL to medium-sized cover image
- `largePicture` - URL to large cover image
- `mean` - Average score
- `nsfw` - NSFW rating
- `mediaType` - Type of media (tv, movie, ova, etc.)
- `numListUsers` - Number of users who added to their list
- `numScoringUsers` - Number of users who scored
- `popularity` - Popularity rank
- `status` - Airing status
- `rank` - Overall ranking
- `createdAt` - Record creation timestamp
- `updatedAt` - Record last update timestamp

## Stopping the Database

```bash
docker-compose down
```

To remove the database volume as well:

```bash
docker-compose down -v
```
