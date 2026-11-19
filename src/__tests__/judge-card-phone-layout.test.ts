/**
 * The judge card on the People page ("Current Assignments", judge-section.tsx)
 * must stack on a phone: details full width, the action buttons in their own
 * row underneath. Side by side at 375px the buttons squeezed the details to
 * about 100px — the breed wrapped a word per line, "Send Confirmation" sat on
 * the judge's name, and the judge's answer wrapped one character per line.
 * From `sm` up the card keeps the side-by-side layout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src/app/(secretary)/secretary/shows/[id]/_components');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('judge card on a phone', () => {
  const src = read('judge-section.tsx');

  it('the card row is flex-col below sm and side by side from sm', () => {
    const m = src.match(/data-judge-card-row[^>]*className="([^"]+)"|className="([^"]+)"[^>]*data-judge-card-row/);
    expect(m).not.toBeNull();
    const cls = (m![1] ?? m![2])!.split(/\s+/);
    expect(cls).toContain('flex-col');
    expect(cls).toContain('sm:flex-row');
    expect(cls).toContain('sm:justify-between');
  });

  it('the action buttons wrap in their own row on a phone, at least 44px tall', () => {
    const m = src.match(/data-judge-card-actions[^>]*className="([^"]+)"|className="([^"]+)"[^>]*data-judge-card-actions/);
    expect(m).not.toBeNull();
    const cls = (m![1] ?? m![2])!.split(/\s+/);
    expect(cls).toContain('flex-wrap');
    expect(cls).toContain('max-sm:[&>button]:min-h-11');
    expect(cls).toContain('sm:shrink-0');
    expect(cls).not.toContain('shrink-0');
  });
});

describe('the judge\'s answer always gets the full width of its card', () => {
  it('judge-offers-action.tsx places it outside the row that holds the buttons', () => {
    const src = read('checklist-actions/judge-offers-action.tsx');
    const answer = src.indexOf('<AlreadyAgreedAnswer');
    const buttons = src.indexOf('<div className="flex gap-1 shrink-0">');
    expect(answer).toBeGreaterThan(buttons);
  });
});
