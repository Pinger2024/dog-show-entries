import { describe, it, expect } from 'vitest';
import { what3wordsAddress, what3wordsUrl } from '@/lib/what3words';
import { scanFiles } from './helpers/static-scan';

/**
 * One owner for how a venue's what3words is written and linked
 * (lib/what3words.ts). Secretaries type it with and without the leading "///" —
 * both are on file — so every place that prints it must go through here.
 */
describe('what3words', () => {
  it('writes it with the three slashes, however it was typed', () => {
    expect(what3wordsAddress('///toasters.acclaim.prompt')).toBe('///toasters.acclaim.prompt');
    expect(what3wordsAddress('misty.workshops.blush')).toBe('///misty.workshops.blush');
    expect(what3wordsAddress('  //Misty.Workshops.Blush ')).toBe('///misty.workshops.blush');
    expect(what3wordsAddress('')).toBeNull();
    expect(what3wordsAddress(null)).toBeNull();
  });

  it('links to the what3words map', () => {
    expect(what3wordsUrl('///toasters.acclaim.prompt')).toBe('https://what3words.com/toasters.acclaim.prompt');
    expect(what3wordsUrl(undefined)).toBeNull();
  });

  it('no file outside lib/what3words.ts formats or links a what3words itself', () => {
    const hits = scanFiles(['src'], ['.ts', '.tsx'], /what3words\??\.replace\(|what3words\.com\/\$\{|['"`]what3words: \/\/\//)
      .filter((m) => m.file !== 'src/lib/what3words.ts' && !m.file.includes('__tests__'));
    expect(hits, hits.map((m) => `${m.file}:${m.line} ${m.content}`).join('\n')).toEqual([]);
  });
});
