import { describe, it, expect } from 'vitest';
import { computeSnapshotHash, type CatalogueSnapshot } from '@/server/services/catalogue-snapshot';

/**
 * computeSnapshotHash — the dedupe key requestCatalogueJob() matches new
 * enqueues against (catalogue-jobs.ts). Since the 2026-08-27 refactor
 * (catalogue-snapshot.ts's file header) the snapshot carries advert/sponsor
 * image URLS rather than bytes, so this hash is now over those URLs, not
 * pixel data — these tests are the "still a sound fingerprint" proof: a
 * changed URL must change the hash (every upload mints a fresh
 * randomUUID() storage key, so a re-upload always gets a new URL), and an
 * unrelated field (meta.capturedAt) must NOT, or two enqueues of an
 * unchanged show a minute apart would never dedupe onto the same job.
 *
 * No DB, no network — a hand-built minimal-but-valid snapshot is enough to
 * exercise the pure hashing function.
 */
function baseSnapshot(overrides: Partial<CatalogueSnapshot> = {}): CatalogueSnapshot {
  return {
    version: 1,
    showId: 'show-1',
    showInfoBase: {
      name: 'Test Championship Show',
      showType: 'championship',
      date: '2026-09-01',
      venue: 'Test Showground',
      venueAddress: '1 Test Lane',
      organisation: 'Test Kennel Club',
      kcLicenceNo: 'TEST-123',
      classDefinitions: [],
    },
    showSponsors: [],
    entries: [],
    achievements: [],
    paidOrderIds: [],
    transferLabelByShowClassId: {},
    orgColors: null,
    meta: {
      showStatus: 'entries_closed',
      catalogueNumbersLockedAt: null,
      entryCloseDate: null,
      capturedAt: '2026-08-27T00:00:00.000Z',
      rendererGitSha: 'test-sha',
      expectedNumbers: [],
      entryNames: [],
    },
    ...overrides,
  };
}

const advert = (imageUrl: string) => ({
  id: 'ad-1',
  advertiserName: 'Test Advertiser',
  position: 'last_page' as const,
  imageUrl,
  sortOrder: 0,
});

describe('computeSnapshotHash', () => {
  it('changes when an advert imageUrl changes', () => {
    const a = baseSnapshot({
      showInfoBase: { ...baseSnapshot().showInfoBase, adverts: [advert('https://r2.test/uploads/a-old-uuid.png')] },
    });
    const b = baseSnapshot({
      showInfoBase: { ...baseSnapshot().showInfoBase, adverts: [advert('https://r2.test/uploads/a-new-uuid.png')] },
    });
    expect(computeSnapshotHash(a)).not.toBe(computeSnapshotHash(b));
  });

  it('changes when a sponsor logoUrl changes', () => {
    const sponsor = (logoUrl: string | null) => ({
      name: 'Test Sponsor',
      tier: 'show',
      logoUrl,
      website: null,
      customTitle: null,
    });
    const a = baseSnapshot({ showSponsors: [sponsor('https://r2.test/uploads/logo-old.png')] });
    const b = baseSnapshot({ showSponsors: [sponsor('https://r2.test/uploads/logo-new.png')] });
    expect(computeSnapshotHash(a)).not.toBe(computeSnapshotHash(b));
  });

  it('is stable when only meta.capturedAt changes', () => {
    const a = baseSnapshot({ meta: { ...baseSnapshot().meta, capturedAt: '2026-08-27T00:00:00.000Z' } });
    const b = baseSnapshot({ meta: { ...baseSnapshot().meta, capturedAt: '2026-08-27T00:05:00.000Z' } });
    expect(computeSnapshotHash(a)).toBe(computeSnapshotHash(b));
  });

  it('is stable when only meta.rendererGitSha changes (a deploy must not invalidate every stored catalogue)', () => {
    const a = baseSnapshot({ meta: { ...baseSnapshot().meta, rendererGitSha: 'deploy-aaaa' } });
    const b = baseSnapshot({ meta: { ...baseSnapshot().meta, rendererGitSha: 'deploy-bbbb' } });
    expect(computeSnapshotHash(a)).toBe(computeSnapshotHash(b));
  });

  it('is stable across two calls on the identical snapshot (deterministic)', () => {
    const snap = baseSnapshot({
      showInfoBase: { ...baseSnapshot().showInfoBase, adverts: [advert('https://r2.test/uploads/a.png')] },
    });
    expect(computeSnapshotHash(snap)).toBe(computeSnapshotHash(snap));
  });
});
