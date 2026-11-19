import { defineConfig, configDefaults } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

// Load .env.test BEFORE app modules import process.env.DATABASE_URL etc.
const env = loadEnv('test', process.cwd(), '');
for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/helpers/setup.ts'],
    // Integration tests share a DB — run files serially to keep them isolated
    // via per-test transactions without locking each other out.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
    // Exclude leftover git worktrees under .claude/ (e.g. from agent runs) so
    // their stale copies of test files aren't double-collected and run against
    // the main repo's source.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
