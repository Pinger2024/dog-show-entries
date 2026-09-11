#!/bin/bash
# demo-worker-service.sh — launchd-managed document render worker for the DEMO
# environment (label co.remishowmanager.demo-worker). Renders catalogue PDFs
# claimed from remi_demo's document_render_jobs table in a SEPARATE OS process,
# so a heavy render can never take down the demo web app — the whole point of
# the 2026-08-26 off-web-render work (see project_catalogue_pdf_oom_outage).
#
# Pairs with demo-service.sh (the web app). Same conventions: launchd runs this
# in the foreground and restarts it after any exit (KeepAlive=true — laptop
# sleep SIGTERMs to a clean exit, which must still relaunch).

# The demo serves ONE checkout at a time (see demo-service.sh's changelog); the
# worker MUST run the same code the web app serves, or snapshot/render versions
# drift. Fail loudly if the checkout is missing — a silent cd-fallback once made
# the demo serve a stale build from the wrong tree (2026-07-31).
CHECKOUT="/Users/michaeljames/Projects/dog-show-entries"
cd "$CHECKOUT" || { echo "demo-worker: checkout $CHECKOUT missing — refusing to start" >&2; exit 1; }

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/michaeljames"

# Foreground — launchd monitors this. .env.demo first so remi_demo wins over
# the prod DATABASE_URL in .env.
exec npx dotenv -e .env.demo -e .env -- npx tsx scripts/run-render-worker.ts
