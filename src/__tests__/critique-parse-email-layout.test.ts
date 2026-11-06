/**
 * Mandy, 30 Sept 2026: Hugh De Zutter sent his South Western critiques as an
 * email, she pasted them in, and "it has merged them all into one or 2 dogs"
 * — 22,000 characters became 3 boxes, none matched to a dog.
 *
 * The reader only knew one layout ("1st, OWNERS – DOG NAME" then "(SIRE x
 * DAM)"). Hugh writes the other common one:
 *   Puppy Bitch. 7 entered, 5 absent.          ← heading with the entry count
 *   Talbot's, Mayasan Italia, bn 22.8.25, by …  ← single winner: no "1st"
 *   2nd Stevens', Kleenhugel Kasey, bn. 11.8.25, by Sire ex Dam.
 *   1st. Elliott's, Ellroost Iconic, bn. …      ← "1st." with a full stop
 *   Special Long Coat Open. 8 entered …         ← no sex: the bitch half
 *   Vetran Bitch. 5 entered, 2 absent.          ← "Vetran"
 *
 * Fixture = his text exactly as stored on live (Windows line endings kept).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCritiqueDocument, type ClassListEntry } from '@/lib/critique-parse';

const TEXT = readFileSync(join(__dirname, 'fixtures', 'judge-critiques-email-layout-sw-2026.txt'), 'utf8');

// South Western 55th Anniversary Championship Show 2026 — its breed classes.
const CLASSES = [
  'Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Special Long Coat Yearling',
  'Post Graduate', 'Limit', 'Open', 'Special Long Coat Open', 'Veteran',
];
const classList: ClassListEntry[] = CLASSES.flatMap((className) => [
  { showClassId: `${className} Dog`, className, sex: 'dog' as const },
  { showClassId: `${className} Bitch`, className, sex: 'bitch' as const },
]);

// Placings per class, as Hugh wrote them (a class with one dog present names
// no placing — that dog won it).
const EXPECTED: Record<string, number[]> = {
  'Minor Puppy Dog': [1], 'Puppy Dog': [1], 'Junior Dog': [1, 2], 'Yearling Dog': [1],
  'Special Long Coat Yearling Dog': [1, 2, 3], 'Post Graduate Dog': [1], 'Limit Dog': [1, 2, 3, 4],
  'Open Dog': [1, 2, 3], 'Special Long Coat Open Dog': [1, 2], 'Veteran Dog': [1],
  'Minor Puppy Bitch': [1], 'Puppy Bitch': [1, 2], 'Junior Bitch': [1, 2, 3, 4],
  'Yearling Bitch': [1, 2, 3, 4, 5], 'Post Graduate Bitch': [1, 2, 3], 'Limit Bitch': [1, 2],
  'Open Bitch': [1, 2, 3, 4, 5, 6], 'Special Long Coat Open Bitch': [1, 2, 3, 4, 5], 'Veteran Bitch': [1, 2, 3],
};

describe("a judge's critiques in the email layout — every dog in its own box", () => {
  const { blocks } = parseCritiqueDocument(TEXT, classList);
  const critiques = blocks.filter((b) => b.kind === 'critique');
  const find = (classId: string, position: number) =>
    critiques.find((c) => c.matchedShowClassId === classId && c.position === position);

  it("finds all 50 of Hugh's dogs, each in the right class and placing", () => {
    const got: Record<string, number[]> = {};
    for (const c of critiques) {
      if (!c.matchedShowClassId) continue;
      (got[c.matchedShowClassId] ??= []).push(c.position!);
    }
    expect(got).toEqual(EXPECTED);
    expect(critiques.length).toBe(50);
  });

  it('never runs one class into the next (the box Mandy saw)', () => {
    const kasey = find('Puppy Bitch', 2)!;
    expect(kasey.dogRaw).toMatch(/Kleenhugel Kasey/);
    expect(kasey.critiqueText).toMatch(/^Beautifully pigmented/);
    expect(kasey.critiqueText).not.toMatch(/Junior Bitch|Elliott/);
  });

  it('reads "1st." / "2nd" placings: owner, dog and breeding apart', () => {
    const iconic = find('Junior Bitch', 1)!;
    expect(iconic.ownersRaw).toMatch(/Elliott/);
    expect(iconic.dogRaw).toBe('Ellroost Iconic');
    expect(iconic.pedigreeRaw).toMatch(/Tornado Du Val D'Anzin ex Ch Drayvore Vera at Ellroost/);
    expect(iconic.critiqueText).toMatch(/^Large, strong and richly pigmented female/);
  });

  it('a class with a single dog and no "1st" — that dog is the winner', () => {
    const reynaldo = find('Minor Puppy Dog', 1)!;
    expect(reynaldo.dogRaw).toMatch(/Solophina Reynaldo/);
    expect(reynaldo.critiqueText).toMatch(/^Tallish, medium strength/);
  });

  it('an owner with no comma before the dog ("Hensley\'s Willow at Zuberg")', () => {
    const willow = find('Veteran Bitch', 3)!;
    expect(willow.ownersRaw).toMatch(/Hensley/);
    expect(willow.dogRaw).toBe('Willow at Zuberg');
  });

  it('a heading with no sex belongs to the half it sits in; "Vetran" is Veteran', () => {
    expect(find('Special Long Coat Open Bitch', 1)?.dogRaw).toMatch(/Fluffy Cox von Shotaan/);
    expect(find('Veteran Dog', 1)?.dogRaw).toMatch(/Clynalwin's Nukon/);
  });

  it("the Challenge Certificate lines are not part of the Veteran's critique", () => {
    expect(find('Veteran Dog', 1)!.critiqueText).not.toMatch(/Challenge Certificate/);
  });
});
