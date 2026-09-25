import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { AwardSelect } from '../app/(steward)/steward/shows/[id]/page';
import { AwardRow } from '../app/(secretary)/secretary/shows/[id]/results/page';
import { SelectItem } from '@/components/ui/select';

/**
 * Mandy could neither see nor publish a recorded Best Puppy holder who fell
 * out of the candidate list (class-order edit, re-judge, etc.) — the <Select>
 * showed an empty box because `value={existingDogId}` had no matching
 * `SelectItem`, and she deleted the award believing it was unset. Both award
 * dropdowns (steward AwardSelect, secretary AwardRow) must always render a
 * visible option for the recorded holder, even when candidates don't include
 * them any more.
 *
 * AwardSelect/AwardRow are plain (hook-free) presentational components, so —
 * same pattern as catalogue-banner-full-width.test.tsx — we call them
 * directly and walk the returned React element tree; no DOM/jsdom needed.
 */

function findSelectItem(node: ReactNode, value: string): ReactElement<any> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSelectItem(child, value);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<any>;
  if (el.type === SelectItem && el.props.value === value) return el;
  return findSelectItem(el.props.children, value);
}

function allText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join(' ');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

describe('AwardSelect (steward page) — recorded holder outside candidates', () => {
  it('renders a visible, selected option for a recorded dog that fell out of the candidate list', () => {
    const tree = AwardSelect({
      label: 'Best Puppy in Show',
      type: 'best_puppy_in_show',
      existingDogId: 'dog-fell-out',
      existingDogName: 'Fairycross Atlanta Von Nisyros',
      isPublished: false,
      candidates: [{ dogId: 'dog-a', dogName: 'Rex', catalogueNumber: '3', exhibitorName: 'X' }],
      onRecord: () => {},
      onRemove: () => {},
      onPublish: () => {},
      onUnpublish: () => {},
    } as any);

    const item = findSelectItem(tree, 'dog-fell-out');
    expect(item, 'a SelectItem for the recorded-but-missing holder should exist').not.toBeNull();
    expect(allText(item!.props.children)).toContain('Fairycross Atlanta Von Nisyros');
    expect(allText(item!.props.children)).toContain('(recorded)');
  });

  it('does not duplicate the holder when they are already among the candidates', () => {
    const tree = AwardSelect({
      label: 'Best Dog',
      type: 'best_dog',
      existingDogId: 'dog-a',
      existingDogName: 'Rex',
      isPublished: false,
      candidates: [{ dogId: 'dog-a', dogName: 'Rex', catalogueNumber: '3', exhibitorName: 'X' }],
      onRecord: () => {},
      onRemove: () => {},
      onPublish: () => {},
      onUnpublish: () => {},
    } as any);

    // Only one SelectItem for dog-a, and it must NOT carry the "(recorded)" suffix.
    let count = 0;
    function countMatches(node: ReactNode) {
      if (Array.isArray(node)) return node.forEach(countMatches);
      if (!isValidElement(node)) return;
      const el = node as ReactElement<any>;
      if (el.type === SelectItem && el.props.value === 'dog-a') count++;
      countMatches(el.props.children);
    }
    countMatches(tree);
    expect(count).toBe(1);
    const item = findSelectItem(tree, 'dog-a');
    expect(allText(item!.props.children)).not.toContain('(recorded)');
  });
});

describe('AwardRow (secretary results page) — recorded holder outside candidates', () => {
  it('renders a visible, selected option for a recorded dog that fell out of the candidate list', () => {
    const tree = AwardRow({
      label: 'Best Puppy in Show',
      type: 'best_puppy_in_show',
      existing: {
        id: 'ach-1',
        dogId: 'dog-fell-out',
        dog: { id: 'dog-fell-out', registeredName: 'Fairycross Atlanta Von Nisyros' },
      },
      candidates: [{ dogId: 'dog-a', registeredName: 'Rex', catalogueNumber: '3' }],
      isPending: false,
      onSelect: () => {},
    } as any);

    const item = findSelectItem(tree, 'dog-fell-out');
    expect(item, 'a SelectItem for the recorded-but-missing holder should exist').not.toBeNull();
    expect(allText(item!.props.children)).toContain('Fairycross Atlanta Von Nisyros');
    expect(allText(item!.props.children)).toContain('(recorded)');
  });
});
