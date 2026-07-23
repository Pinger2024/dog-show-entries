import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeShow,
  makeSecretaryWithOrg,
} from '../helpers/factories';

/**
 * Bug (Mandy, 2026-07-21): platform admins are supposed to see and monitor
 * every club's shows from the secretary dashboard without impersonating —
 * but secretary.getDashboard scoped shows strictly to the caller's active
 * memberships, so a brand-new club's show was invisible to her until she
 * impersonated its secretary. See secretary.ts getDashboard + getScheduleData.
 */

describe('secretary.getDashboard — admin sees every club\'s shows', () => {
  it('an admin with zero memberships sees shows from multiple orgs', async () => {
    const admin = await makeUser({ role: 'admin' });

    const { org: orgA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id, name: 'Club A Show', status: 'entries_open' });
    const showB = await makeShow({ organisationId: orgB.id, name: 'Club B Show', status: 'published' });

    const dashboard = await createTestCaller(admin).secretary.getDashboard();

    const allShowIds = [...dashboard.activeShows, ...dashboard.pastShows].map((s) => s.id);
    expect(allShowIds).toEqual(expect.arrayContaining([showA.id, showB.id]));

    // The org list is derived from the shows themselves (admin has no
    // memberships) and should include both clubs, labelled correctly.
    const orgIds = dashboard.organisations.map((o) => o.id);
    expect(orgIds).toEqual(expect.arrayContaining([orgA.id, orgB.id]));
    const showARow = dashboard.activeShows.find((s) => s.id === showA.id);
    expect(showARow?.organisation?.name).toBe(orgA.name);
  });

  it('a plain secretary still sees ONLY their own org\'s shows (no widening)', async () => {
    const { user: secretaryA, org: orgA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id, status: 'entries_open' });
    const showB = await makeShow({ organisationId: orgB.id, status: 'entries_open' });

    const dashboard = await createTestCaller(secretaryA).secretary.getDashboard();

    const allShowIds = [...dashboard.activeShows, ...dashboard.pastShows].map((s) => s.id);
    expect(allShowIds).toContain(showA.id);
    expect(allShowIds).not.toContain(showB.id);
    expect(dashboard.organisations.map((o) => o.id)).toEqual([orgA.id]);
  });

  it('an admin with no membership can read a foreign show\'s schedule data', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'published' });

    await expect(
      createTestCaller(admin).secretary.getScheduleData({ showId: show.id })
    ).resolves.not.toThrow();
  });

  it('a foreign secretary is still FORBIDDEN from a show\'s schedule data', async () => {
    const { user: foreignSecretary } = await makeSecretaryWithOrg();
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'published' });

    await expect(
      createTestCaller(foreignSecretary).secretary.getScheduleData({ showId: show.id })
    ).rejects.toThrow(/do not have access/);
  });

  it('an admin with no membership can list entries for a foreign show', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });

    await expect(
      createTestCaller(admin).entries.getForShow({ showId: show.id, limit: 50, cursor: 0 })
    ).resolves.not.toThrow();
  });

  // Mandy hit this live 2026-07-21: admin blocked from adding a catalogue
  // advert (Mary Curran memorial) on a show whose org she wasn't a member
  // of — the adverts procedures were among ~10 call sites that forgot to
  // thread callerIsAdmin into verifyShowAccess. The flag is now REQUIRED
  // at the type level; these pin the behaviour both ways.
  it('an admin with no membership can manage a foreign show\'s catalogue adverts', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    const caller = createTestCaller(admin);

    await expect(
      caller.secretary.upsertCatalogueAdvert({
        showId: show.id,
        advertiserName: 'In memory of Mary Curran',
        adType: 'full_page',
        document: 'catalogue',
        position: 'inside_front',
        sortOrder: 0,
        isPaid: false,
      })
    ).resolves.not.toThrow();

    const adverts = await caller.secretary.getCatalogueAdverts({ showId: show.id });
    expect(adverts.map((a) => a.advertiserName)).toContain('In memory of Mary Curran');
  });

  it('a foreign secretary is still FORBIDDEN from a show\'s catalogue adverts', async () => {
    const { user: foreignSecretary } = await makeSecretaryWithOrg();
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });

    await expect(
      createTestCaller(foreignSecretary).secretary.upsertCatalogueAdvert({
        showId: show.id,
        advertiserName: 'Should not work',
        adType: 'full_page',
        document: 'catalogue',
        position: 'last_page',
        sortOrder: 0,
        isPaid: false,
      })
    ).rejects.toThrow(/do not have access/);
  });
});
