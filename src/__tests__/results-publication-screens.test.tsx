/**
 * Mandy, 16 Nov 2026: "I don't know why it shows on remi dashboard they
 * haven't but you can see them in public domain". Stewards publish each class
 * live on the day (results.published_at); the show-wide Publish Results
 * (shows.results_published_at) is really "finalise" — lock, publish the rest,
 * email exhibitors. The secretary's screens read only the show-wide flag, so a
 * show with every class live said "Results not yet published".
 *
 * Every secretary screen now takes the state from ONE owner,
 * lib/results-publication.ts ('none' | 'live' | 'final'). These render the
 * screens that are cheap to render (tRPC mocked; no DB) and pin the rest.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';
import { RESULTS_LIVE_NOTE, RESULTS_PUBLICATION_LABEL } from '@/lib/results-publication';

const state = vi.hoisted(() => ({ queryData: {} as Record<string, unknown> }));

// A stand-in for the tRPC client: `trpc.a.b.useQuery()` returns whatever the
// test put under 'a.b'; mutations and utils are inert.
vi.mock('@/lib/trpc', () => {
  const make = (route: string[]): unknown =>
    new Proxy(function () {}, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'useQuery') return () => ({ data: state.queryData[route.join('.')], isLoading: false });
        if (prop === 'useMutation') return () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false });
        if (prop === 'useUtils') return () => make([]);
        return make([...route, prop]);
      },
      apply() {
        return undefined;
      },
    });
  return { trpc: make([]) };
});

import { LifecycleBanner } from '@/app/(secretary)/secretary/shows/[id]/_components/lifecycle-banner';
import { PhaseActionPanel } from '@/app/(secretary)/secretary/shows/[id]/_components/phase-action-panel';
import { ResultsPublishAction } from '@/app/(secretary)/secretary/shows/[id]/_components/checklist-actions/results-publish-action';
import { ShowIdProvider } from '@/app/(secretary)/secretary/shows/[id]/_lib/show-context';

const SHOW_ID = '00000000-0000-4000-8000-000000000001';

/** A finished show, as shows.getById returns it. */
function finishedShow(opts: { resultsPublishedAt: string | null; hasPublishedResults: boolean }) {
  return {
    id: SHOW_ID,
    slug: 'winter-spectacular-2026',
    name: 'Winter Spectacular 2026',
    status: 'completed',
    startDate: '2026-11-15',
    endDate: '2026-11-15',
    entryCloseDate: null,
    scheduleData: null,
    ...opts,
  };
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('a show with classes live but Publish Results not pressed', () => {
  const live = finishedShow({ resultsPublishedAt: null, hasPublishedResults: true });

  it('the show overview banner says the results are showing live', () => {
    const html = text(renderToStaticMarkup(<LifecycleBanner show={live as never} entryStats={undefined} />));
    expect(html).toContain(RESULTS_PUBLICATION_LABEL.live);
    expect(html).toContain(RESULTS_LIVE_NOTE);
    expect(html).not.toContain(RESULTS_PUBLICATION_LABEL.none);
  });

  it('the post-show action panel says so too, and still asks for Publish Results', () => {
    state.queryData = { 'shows.getById': live };
    const html = text(
      renderToStaticMarkup(
        <ShowIdProvider showId={SHOW_ID}>
          <PhaseActionPanel />
        </ShowIdProvider>,
      ),
    );
    expect(html).toContain(RESULTS_PUBLICATION_LABEL.live);
    expect(html).toContain(RESULTS_LIVE_NOTE);
    expect(html).toContain('Publish Results');
    // Publishing is still to do — "live" is not "final".
    expect(html).toContain('0 of 2 tasks complete');
  });

  it('the checklist\'s Publish Results action says so too', () => {
    state.queryData = {
      'secretary.getResultsPublicationStatus': {
        published: false,
        publication: 'live',
        publishedAt: null,
        locked: false,
        showStatus: 'completed',
        approvals: { total: 0, approved: 0, pending: 0, declined: 0, notSent: 0 },
        judges: [],
      },
    };
    const html = text(renderToStaticMarkup(<ResultsPublishAction showId={SHOW_ID} itemId="results_published" />));
    expect(html).toContain(RESULTS_PUBLICATION_LABEL.live);
    expect(html).toContain(RESULTS_LIVE_NOTE);
    expect(html).not.toContain(RESULTS_PUBLICATION_LABEL.none);
  });
});

describe('the other two states read as before', () => {
  it('nothing live yet: "Results not yet published"', () => {
    const none = finishedShow({ resultsPublishedAt: null, hasPublishedResults: false });
    const html = text(renderToStaticMarkup(<LifecycleBanner show={none as never} entryStats={undefined} />));
    expect(html).toContain(RESULTS_PUBLICATION_LABEL.none);
    expect(html).not.toContain(RESULTS_LIVE_NOTE);
  });

  it('Publish Results pressed: "Results published"', () => {
    const final = finishedShow({ resultsPublishedAt: '2026-11-15T18:00:00.000Z', hasPublishedResults: true });
    const html = text(renderToStaticMarkup(<LifecycleBanner show={final as never} entryStats={undefined} />));
    expect(html).toContain(RESULTS_PUBLICATION_LABEL.final);
    expect(html).not.toContain(RESULTS_LIVE_NOTE);
  });
});

describe('one owner for "are the results published"', () => {
  it('no secretary screen reads shows.resultsPublishedAt itself', () => {
    const hits = scanFiles(['src/app/(secretary)'], ['.ts', '.tsx'], /resultsPublishedAt/);
    expect(hits.map((h) => `${h.file}:${h.line}  ${h.content}`)).toEqual([]);
  });

  it('the secretary results page shows the owner\'s words for each state', () => {
    const page = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(secretary)/secretary/shows/[id]/results/page.tsx'), 'utf8');
    expect(page).toContain('RESULTS_PUBLICATION_LABEL[publication]');
    expect(page).toContain('RESULTS_LIVE_NOTE');
  });
});
