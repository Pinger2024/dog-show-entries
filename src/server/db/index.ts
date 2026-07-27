import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

const client = connectionString
  ? postgres(connectionString, {
      // Cap pool size so tests against localhost don't exhaust Postgres's
      // max_connections (default 100). Production Render Postgres is fine
      // with the default 10 either way.
      max: process.env.DATABASE_POOL_MAX
        ? Number(process.env.DATABASE_POOL_MAX)
        : 10,
      idle_timeout: 20, // release idle connections after 20s
    })
  : (null as never);

export const db = connectionString
  ? drizzle(client, { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);

export type Database = typeof db;

// Exposed so test teardown can close the pool explicitly (see
// src/__tests__/helpers/setup.ts). Vitest's default per-file module
// isolation re-runs this module for every test file, each creating a fresh
// postgres.js connection pool; without an explicit close those pools only
// get reaped after `idle_timeout`, so dozens of files' pools can be alive
// at once and exhaust Postgres's max_connections mid-run.
export const dbClient = client;
