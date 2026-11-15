/**
 * The secretary's "Lives overseas" box. ONE component (LivesOverseasField in
 * src/components/judges/judge-offer-terms-view.tsx) on every screen that sets
 * it: the add-judge wizard, the checklist's Add Judge form, Edit judge details
 * and the Send Offer dialog. Its words come from src/lib/judge-offer-terms.ts.
 *
 * Built for a secretary on a phone: the whole row is the tap target (44px or
 * more), its text is 16px, and it wraps rather than scrolling sideways.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { LivesOverseasField } from '@/components/judges/judge-offer-terms-view';
import { LIVES_OVERSEAS_LABEL, LIVES_OVERSEAS_HINT, showCarriesJudgeOfferTerms } from '@/lib/judge-offer-terms';

const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
const JUDGE_SECTION = 'app/(secretary)/secretary/shows/[id]/_components/judge-section.tsx';
const WIZARD = 'components/judges/add-judge-wizard.tsx';
const CHECKLIST_ADD = 'app/(secretary)/secretary/shows/[id]/_components/checklist-actions/judge-offers-action.tsx';

describe('the words', () => {
  it('label and hint, in plain words', () => {
    expect(LIVES_OVERSEAS_LABEL).toBe('Lives overseas');
    expect(LIVES_OVERSEAS_HINT).toBe("A judge who lives overseas gets the RKC's two paragraphs only, not the Society's terms.");
  });
});

describe('LivesOverseasField', () => {
  const render = (checked: boolean, disabled = false) =>
    renderToStaticMarkup(
      <LivesOverseasField id="lo-test" checked={checked} disabled={disabled} onCheckedChange={() => {}} />,
    );

  it('shows the label and the hint, the hint tied to the box for screen readers', () => {
    const out = render(false);
    expect(out).toContain('Lives overseas');
    expect(out).toContain('A judge who lives overseas gets the RKC&#x27;s two paragraphs only, not the Society&#x27;s terms.');
    expect(out).toMatch(/<button[^>]*id="lo-test"[^>]*aria-describedby="lo-test-hint"|<button[^>]*aria-describedby="lo-test-hint"[^>]*id="lo-test"/);
    expect(out).toContain('id="lo-test-hint"');
    expect(out).toMatch(/<label[^>]*for="lo-test"/);
  });

  it('the whole row is a tap target of 44px or more, with 16px text on a phone, and wraps', () => {
    const out = render(false);
    const label = out.match(/<label[^>]*class="([^"]+)"/)![1]!.split(/\s+/);
    expect(label).toContain('min-h-11');
    expect(label).toContain('text-base');
    expect(label).toContain('w-full');
    const hint = out.match(/<span[^>]*id="lo-test-hint"[^>]*class="([^"]+)"|<span[^>]*class="([^"]+)"[^>]*id="lo-test-hint"/)!;
    const hintCls = (hint[1] ?? hint[2])!.split(/\s+/);
    expect(hintCls).toContain('text-base');
    expect(hintCls).not.toContain('text-xs');
    expect(hintCls).not.toContain('text-sm');
    // No fixed widths or no-wrap that could push a 375px screen sideways.
    expect(out).not.toMatch(/whitespace-nowrap|\bw-\[\d|min-w-\[\d/);
  });

  it('reflects the stored value', () => {
    expect(render(true)).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="true"/);
    expect(render(false)).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="false"/);
  });

  it('can be disabled while saving', () => {
    expect(render(false, true)).toMatch(/<button[^>]*disabled=""/);
  });
});

describe('where the box is shown: only where it changes anything', () => {
  it('RKC championship, open, premier open and limited shows carry terms; regional, companion and primary do not', () => {
    for (const t of ['championship', 'open', 'premier_open', 'limited']) {
      expect(showCarriesJudgeOfferTerms(t, 'rkc')).toBe(true);
    }
    expect(showCarriesJudgeOfferTerms('championship', 'wusv')).toBe(false);
    expect(showCarriesJudgeOfferTerms('companion', 'rkc')).toBe(false);
    expect(showCarriesJudgeOfferTerms('primary', 'rkc')).toBe(false);
  });
});

describe('every screen that sets it uses the one component', () => {
  it('judge-section.tsx: the Send Offer dialog and Edit judge details', () => {
    const src = read(JUDGE_SECTION);
    expect((src.match(/<LivesOverseasField/g) ?? []).length).toBe(2);
  });

  it('the add-judge wizard: on the Confirm step, which every path (Remi, RKC, manual) reaches', () => {
    const src = read(WIZARD);
    expect((src.match(/<LivesOverseasField/g) ?? []).length).toBe(1);
    const confirm = src.indexOf("step === 'confirm' && selectedJudge");
    expect(confirm).toBeGreaterThan(-1);
    expect(src.indexOf('<LivesOverseasField')).toBeGreaterThan(confirm);
  });

  it('the checklist\'s Add Judge form', () => {
    expect((read(CHECKLIST_ADD).match(/<LivesOverseasField/g) ?? []).length).toBe(1);
  });

  it('each screen hides the box where the show carries no terms (asks the owner, not its own test)', () => {
    for (const f of [JUDGE_SECTION, WIZARD, CHECKLIST_ADD]) {
      expect(read(f)).toContain('showCarriesJudgeOfferTerms(');
    }
  });
});

describe('the Send Offer dialog', () => {
  const src = read(JUDGE_SECTION);

  it('its terms preview follows the box at once', () => {
    expect(src).toContain('judgeLivesOverseas: offerLivesOverseas');
  });

  it('saves through updateJudge, with its own mutation (not the Edit dialog\'s)', () => {
    expect(src).toMatch(/const livesOverseasMutation = trpc\.secretary\.updateJudge\.useMutation\(/);
    expect(src).toMatch(/livesOverseasMutation\.mutate\(\s*\{\s*judgeId: [^,]+,\s*livesOverseas: /);
  });

  it('cannot send while the box is still saving (the server reads the saved flag)', () => {
    const send = src.indexOf('sendOfferMutation.mutate({');
    const disabled = src.slice(send, src.indexOf('Send Offer\n', send));
    expect(disabled).toContain('livesOverseasMutation.isPending');
  });

  it('starts from the judge\'s stored flag and puts it back if the save fails', () => {
    expect(src).toMatch(/setOfferLivesOverseas\(judge\.livesOverseas\)/);
    expect(src).toMatch(/onError: \(\) => setOfferLivesOverseas\(previous\)/);
  });
});

describe('Edit judge details', () => {
  it('loads the stored flag and saves it', () => {
    const src = read(JUDGE_SECTION);
    expect(src).toContain('livesOverseas: judge.livesOverseas,');
    expect(src).toContain('livesOverseas: editJudgeForm.livesOverseas,');
  });
});

describe('the add-judge wizard', () => {
  const src = read(WIZARD);
  it('a judge picked from Remi starts from their stored flag', () => {
    expect(src).toContain('livesOverseas: judge.livesOverseas,');
  });
  it('sends the flag only as the secretary left it (undefined = untouched, so a stored "yes" is never cleared)', () => {
    expect(src).toContain('livesOverseas: selectedJudge.livesOverseas,');
    expect(src).not.toMatch(/livesOverseas: selectedJudge\.livesOverseas \?\?/);
  });
});

describe('the checklist\'s Add Judge form', () => {
  it('sends the flag to addJudge', () => {
    const src = read(CHECKLIST_ADD);
    const call = src.slice(src.indexOf('addJudgeMutation.mutate({'));
    expect(call.slice(0, 300)).toContain('livesOverseas: addLivesOverseas');
  });
});
