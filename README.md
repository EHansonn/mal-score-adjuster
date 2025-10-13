# MAL Score Adjuster

A TypeScript application to fetch anime ranking data from MyAnimeList API and store it in PostgreSQL using Prisma.

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

### 5. Run the Application

```bash
npm run dev
```

This will:
1. Fetch top 10 anime from MyAnimeList API
2. Save the data to PostgreSQL
3. Display the saved anime from the database

## Available Scripts

- `npm run dev` - Run the application in development mode
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled application
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio to view/edit data

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
