/**
 * Mandy, 28 Oct 2026 (GSD Club of Scotland draft): the banner said "Venue
 * not confirmed" with a link to the show page — which IS the setup wizard,
 * which had no venue control. Every required blocker must now say which
 * wizard step fixes it and link there; the RKC licence number must not hold
 * a show up (her ruling the same day); and no link may repeat the show URL
 * the banner already prefixes (the sundry-items one did).
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';
import { wizardStepPath } from '@/lib/show-setup-steps';

describe('entries-open blockers point at a wizard step', () => {
  it('a bare RKC draft: venue + secretary go to the details step; the licence is recommended', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      showType: 'open',
      status: 'draft',
      venueId: null,
      kcLicenceNo: null,
    });
    const res = await createTestCaller(user).secretary.getPhaseBlockers({ showId: show.id });
    const byKey = Object.fromEntries(res.openEntriesBlockers.map((b) => [b.key, b]));

    expect(byKey.no_venue).toMatchObject({
      severity: 'required',
      step: 'details',
      actionPath: wizardStepPath('details'),
    });
    expect(byKey.no_secretary_details).toMatchObject({ severity: 'required', step: 'details' });
    expect(byKey.no_secretary_details.detail).toMatch(/Name, Email, Phone, Postal address/);
    expect(byKey.no_rkc_licence, 'licence blocker should still be listed').toBeTruthy();
    expect(byKey.no_rkc_licence.severity).toBe('recommended');

    for (const b of res.openEntriesBlockers) {
      if (b.severity === 'required') {
        expect(b.step, `${b.key} names no wizard step`).toBeTruthy();
        expect(b.actionPath, `${b.key} has no link`).not.toBe('');
      }
      expect(
        b.actionPath.startsWith('/secretary/'),
        `${b.key} actionPath is absolute (${b.actionPath}) and would be prefixed twice`,
      ).toBe(false);
    }
  });

  it('a regional (SV/WUSV) draft never lists the RKC licence at all', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      showType: 'championship',
      showRuleset: 'wusv',
      status: 'draft',
      venueId: null,
      kcLicenceNo: null,
    });
    const res = await createTestCaller(user).secretary.getPhaseBlockers({ showId: show.id });
    expect(res.openEntriesBlockers.map((b) => b.key)).not.toContain('no_rkc_licence');
  });
});
