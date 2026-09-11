# scripts/

## Operational scripts (the ones that matter)

| Script | Purpose |
|--------|---------|
| `demo.sh` / `demo-sync.sh` / `demo-service.sh` | Demo environment (`npm run demo`) — Cloudflare tunnel + `remi_demo` DB |
| `check-feedback.ts` | List pending feedback (`npx tsx scripts/check-feedback.ts`) |
| `update-feedback.ts` | Mark feedback completed (`npx tsx scripts/update-feedback.ts <id>…`) |
| `check-backlog.ts` / `update-backlog.ts` | Feature backlog tracking |
| `search-console.ts` | Google Search Console insights (queries/pages/sitemaps) |
| `e2e-mandy-fulltest.ts` / `e2e-sv-fulltest.ts` | End-to-end journey scripts (RKC + SV) |
| `seed-*.ts` | Reference-data seeds (plans, class defs, judge roles, breeds) |
| `generate-icons.ts` | PWA icon generation |

Everything else here is a committed one-off (data fixes, probes, backfills) kept
for history. **New one-off scripts should not be committed** — they go to
`archive/` once used.

## archive/

Untracked one-off scripts and generated artifacts (probes, previews, data
fixes, screenshots) swept out of the top level during the 2026-06-12 cleanup.
Nothing in `archive/` is referenced by the app, package.json, or docs. Delete
the folder whenever you like; it exists only so nothing vanished without a
trace during the sweep.
