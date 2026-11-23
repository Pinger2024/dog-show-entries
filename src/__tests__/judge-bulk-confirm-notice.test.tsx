/**
 * Before "Confirm All Accepted", the secretary is told when any accepted judge
 * has declared appointments already agreed, so she reads the answers first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlreadyAgreedConfirmNotice } from '@/components/judges/judge-offer-terms-view';

const yes = { stage: 'offer_accepted', alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Show A, 1 May' };
const no = { stage: 'offer_accepted', alreadyAgreedElsewhere: false, alreadyAgreedDetails: null };
const notAsked = { stage: 'offer_accepted', alreadyAgreedElsewhere: null, alreadyAgreedDetails: null };
const confirmedYes = { ...yes, stage: 'confirmed' };

describe('AlreadyAgreedConfirmNotice', () => {
  it('one accepted judge answered Yes → singular line', () => {
    const out = renderToStaticMarkup(<AlreadyAgreedConfirmNotice judges={[yes, no, notAsked]} />);
    expect(out).toContain('1 judge has told you about appointments they have already agreed. Read their answer before you confirm.');
    expect(out).toContain('bg-se-honey-soft');
  });

  it('two → plural line', () => {
    const out = renderToStaticMarkup(<AlreadyAgreedConfirmNotice judges={[yes, { ...yes }, no]} />);
    expect(out).toContain('2 judges have told you about appointments they have already agreed. Read their answers before you confirm.');
  });

  it('nothing when no accepted judge answered Yes (an already confirmed Yes does not count)', () => {
    expect(renderToStaticMarkup(<AlreadyAgreedConfirmNotice judges={[no, notAsked, confirmedYes]} />)).toBe('');
  });

  it('sits directly above the Confirm All Accepted button', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/(secretary)/secretary/shows/[id]/_components/checklist-actions/judge-offers-action.tsx'),
      'utf8',
    );
    const notice = src.indexOf('<AlreadyAgreedConfirmNotice');
    const button = src.indexOf('Confirm All Accepted (');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(button);
    // Nothing else is rendered between the notice and that button's block.
    const between = src.slice(notice, button);
    expect((between.match(/<Button/g) ?? []).length).toBe(1);
  });
});
