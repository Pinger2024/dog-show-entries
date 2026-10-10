import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testDb, cleanDb } from '../helpers/db';
import { makeShow, makeSecretaryWithOrg } from '../helpers/factories';
import * as schema from '@/server/db/schema';
import {
  kickRenderWorker,
  setRenderWorkerKickFetch,
  resetRenderWorkerKickFetch,
  resetRenderWorkerKickDebounce,
} from '@/server/services/render-worker-kick';

const ORIGINAL_ENV = { ...process.env };

function setConfigured() {
  process.env.RENDER_API_KEY = 'test-api-key';
  process.env.RENDER_RENDER_CRON_ID = 'crn-x';
}

function clearConfig() {
  delete process.env.RENDER_API_KEY;
  delete process.env.RENDER_RENDER_CRON_ID;
}

async function insertRunningJob() {
  const { org } = await makeSecretaryWithOrg();
  const show = await makeShow({ organisationId: org.id });
  await testDb.insert(schema.documentRenderJobs).values({
    showId: show.id,
    documentType: 'catalogue',
    format: 'by-class',
    status: 'running',
    snapshot: {},
    snapshotHash: 'hash-running',
  });
}

beforeEach(async () => {
  await cleanDb();
  resetRenderWorkerKickDebounce();
  resetRenderWorkerKickFetch();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetRenderWorkerKickFetch();
});

describe('kickRenderWorker', () => {
  it('is a no-op when RENDER_API_KEY / RENDER_RENDER_CRON_ID are unconfigured', async () => {
    clearConfig();
    const fetchMock = vi.fn();
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const result = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(result).toEqual({ kicked: false, skipped: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when a document_render_jobs row is currently running', async () => {
    setConfigured();
    await insertRunningJob();
    const fetchMock = vi.fn();
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const result = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(result).toEqual({ kicked: false, skipped: 'worker-active' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the exact cron-run URL with the bearer header on the happy path', async () => {
    setConfigured();
    const fetchMock: ReturnType<typeof vi.fn<typeof fetch>> = vi.fn(
      async () => new Response(JSON.stringify({ id: 'run-123', status: 'pending' }), { status: 200 }),
    );
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const result = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(result).toEqual({ kicked: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.render.com/v1/cron-jobs/crn-x/runs');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-api-key' },
    });
  });

  it('debounces a second kick within 60 seconds', async () => {
    setConfigured();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'run-1' }), { status: 200 }));
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const first = await kickRenderWorker(testDb, 'catalogue:by-class');
    const second = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(first).toEqual({ kicked: true });
    expect(second).toEqual({ kicked: false, skipped: 'debounced' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports request-failed (never throws) when fetch rejects', async () => {
    setConfigured();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const result = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(result).toEqual({ kicked: false, skipped: 'request-failed' });
  });

  it('reports request-failed (never throws) on a non-2xx response', async () => {
    setConfigured();
    const fetchMock = vi.fn(async () => new Response('server error', { status: 500 }));
    setRenderWorkerKickFetch(fetchMock as unknown as typeof fetch);

    const result = await kickRenderWorker(testDb, 'catalogue:by-class');

    expect(result).toEqual({ kicked: false, skipped: 'request-failed' });
  });
});
