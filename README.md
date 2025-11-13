# React News

Concise guide for running and verifying the NewsList demo.

## Supabase Setup
- Create a Supabase project and generate the `anon` public key.
- Create tables: `news`, `tags`, `news_tags`, `likes`, `comments`, `views`, `pictures`. (The seeder expects these names.)
- Enable Row Level Security as needed and expose the tables to the `anon` role.

## Environment Variables
Create `.env.local` in the project root:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```
Restart the dev server after editing environment variables.

## Run the App
```
npm install
npm run dev
```
Open `http://localhost:5173`.

## Features
- CRUD authoring via `Admin` page (upload pictures, assign tags).
- Realtime likes/dislikes and comments on news detail view.
- Infinite scroll feed with card previews on `News`.
- Tag-filtered listing on `Tag` routes.
- Aggregated engagement dashboard on `/stats`.

## Seed Data & Test Infinite Scroll
```
node seedNews.js
```
- Inserts 1,000 fake news items with random tags and placeholder images.
- Visit `/news`, scroll to verify infinite loading triggers additional batches.

## Production Build
```
npm run build
npm run preview
```
