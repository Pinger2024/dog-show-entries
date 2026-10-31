import { describe, it, expect } from 'vitest';
import { dogRegistrationClashMessage, type DogRegistrationClash } from '../dog-registration-clash';

// Direct unit coverage of the wording function — the integration tests
// (dog-duplicate-registration, dog-recreate, dog-registration-clash-cross-account)
// exercise it end-to-end through each router, but nothing pinned every
// kind/audience combination directly. That gap is exactly how the
// 'own-deleted' + 'secretary' pairing shipped telling the secretary to
// "contact the show secretary" — circular, since they ARE the secretary
// (findDogRegistrationClash judges "own" against the exhibitor being
// registered for, not the caller).
describe('dogRegistrationClashMessage', () => {
  const dog = { id: 'd1', registeredName: 'Ardara Storm' };

  const cases: Array<{
    clash: DogRegistrationClash;
    audience: 'owner' | 'secretary';
    mustInclude: RegExp;
    mustNotInclude: RegExp;
  }> = [
    {
      clash: { kind: 'own-live', dog },
      audience: 'owner',
      mustInclude: /already on "Ardara Storm"/,
      mustNotInclude: /different account|another exhibitor/i,
    },
    {
      clash: { kind: 'own-deleted', dog },
      audience: 'owner',
      mustInclude: /contact the show secretary/i,
      mustNotInclude: /different account|another exhibitor/i,
    },
    {
      clash: { kind: 'own-deleted', dog },
      audience: 'secretary',
      mustInclude: /ask them to restore|contact remi support/i,
      // The bug this test guards: telling the secretary to contact "the
      // show secretary" when they already are one.
      mustNotInclude: /contact the show secretary/i,
    },
    {
      clash: { kind: 'other-account-live', dog },
      audience: 'owner',
      mustInclude: /different account/i,
      mustNotInclude: /Ardara Storm/,
    },
    {
      clash: { kind: 'other-account-live', dog },
      audience: 'secretary',
      mustInclude: /Ardara Storm.*different exhibitor|another exhibitor/i,
      mustNotInclude: /^$/,
    },
    {
      clash: { kind: 'other-account-deleted', dog },
      audience: 'owner',
      mustInclude: /removed/i,
      mustNotInclude: /Ardara Storm/,
    },
    {
      clash: { kind: 'other-account-deleted', dog },
      audience: 'secretary',
      mustInclude: /Ardara Storm.*another exhibitor's account/i,
      mustNotInclude: /^$/,
    },
  ];

  for (const { clash, audience, mustInclude, mustNotInclude } of cases) {
    it(`${clash.kind} / ${audience}`, () => {
      const message = dogRegistrationClashMessage(clash, audience);
      expect(message).toMatch(mustInclude);
      expect(message).not.toMatch(mustNotInclude);
    });
  }

  it('"none" is the empty string (never surfaced — call sites gate on kind !== "none" first)', () => {
    expect(dogRegistrationClashMessage({ kind: 'none' }, 'owner')).toBe('');
    expect(dogRegistrationClashMessage({ kind: 'none' }, 'secretary')).toBe('');
  });

  it('never includes an email address for either audience, for any clash kind', () => {
    const kinds: DogRegistrationClash[] = [
      { kind: 'own-live', dog },
      { kind: 'own-deleted', dog },
      { kind: 'other-account-live', dog },
      { kind: 'other-account-deleted', dog },
    ];
    for (const clash of kinds) {
      for (const audience of ['owner', 'secretary'] as const) {
        expect(dogRegistrationClashMessage(clash, audience)).not.toMatch(/@/);
      }
    }
  });
});
