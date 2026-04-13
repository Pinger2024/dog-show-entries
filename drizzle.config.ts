import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL!;
// Localhost (test) Postgres doesn't speak SSL; managed Postgres (Render) requires it.
const useSsl = !/localhost|127\.0\.0\.1/.test(url);

export default defineConfig({
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url,
    ssl: useSsl,
  },
});
