/**
 * The North Eastern GSD Club Championship Show, 11 Oct 2026 — every class and
 * the placings the steward recorded on the day (placement, catalogue number),
 * read from the public results page on 30 Oct 2026. The companion fixture
 * `judge-critiques-numbered-layout-ne-2026.txt` is the judge's own Word
 * document for that show, so a test can match the one against the other
 * exactly as prod does.
 */
export type NePlacedClass = { className: string; sex: 'dog' | 'bitch' | null; placed: [number, string][] };

export const NE_CHAMP_2026_PLACINGS: NePlacedClass[] = [
  { className: 'JHA Handling (6-11)', sex: null, placed: [[1, '82'], [2, '83'], [3, '86']] },
  { className: 'JHA Handling (12-16)', sex: null, placed: [[1, '85'], [2, '84']] },
  { className: 'Minor Puppy', sex: 'dog', placed: [[1, '5'], [2, '7']] },
  { className: 'Puppy', sex: 'dog', placed: [[1, '8'], [2, '9'], [3, '10']] },
  { className: 'Junior', sex: 'dog', placed: [[1, '11'], [2, '12']] },
  { className: 'Special Long Coat Junior', sex: 'dog', placed: [[1, '13']] },
  { className: 'Yearling', sex: 'dog', placed: [[1, '17'], [2, '16'], [3, '14'], [4, '15']] },
  { className: 'Post Graduate', sex: 'dog', placed: [[1, '21'], [2, '19']] },
  { className: 'Limit', sex: 'dog', placed: [[1, '23'], [2, '22'], [3, '24']] },
  { className: 'Special Long Coat Open', sex: 'dog', placed: [[1, '25'], [2, '26'], [3, '27']] },
  { className: 'Open', sex: 'dog', placed: [[1, '28'], [2, '30']] },
  { className: 'Minor Puppy', sex: 'bitch', placed: [[1, '33'], [2, '32']] },
  { className: 'Puppy', sex: 'bitch', placed: [[1, '35'], [2, '37'], [3, '36']] },
  { className: 'Junior', sex: 'bitch', placed: [[1, '41'], [2, '42']] },
  { className: 'Special Long Coat Junior', sex: 'bitch', placed: [[1, '44']] },
  { className: 'Yearling', sex: 'bitch', placed: [[1, '48'], [2, '50'], [3, '47']] },
  { className: 'Post Graduate', sex: 'bitch', placed: [[1, '57'], [2, '55'], [3, '53'], [4, '54'], [5, '56']] },
  { className: 'Limit', sex: 'bitch', placed: [[1, '62'], [2, '61'], [3, '67'], [4, '65'], [5, '63'], [6, '64']] },
  { className: 'Special Long Coat Open', sex: 'bitch', placed: [[1, '73'], [2, '68'], [3, '71'], [4, '72'], [5, '69']] },
  { className: 'Open', sex: 'bitch', placed: [[1, '75'], [2, '79'], [3, '74'], [4, '77'], [5, '80']] },
  { className: 'Veteran', sex: null, placed: [[1, '1'], [2, '3'], [3, '2'], [4, '4']] },
];

/** A stable show_classes id for a class in the fixture: "yearling-dog", "veteran-mixed". */
export function neClassId(className: string, sex: 'dog' | 'bitch' | null): string {
  return `${className.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sex ?? 'mixed'}`;
}

/** A stable entry_classes id for a placed dog: "ec-14". */
export function neEntryClassId(catalogueNumber: string): string {
  return `ec-${catalogueNumber}`;
}
