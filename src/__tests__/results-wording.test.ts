import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';

// "Forward" is old RKC catalogue jargon (= dogs present and shown) that even
// experienced show people don't use — Mandy asked for plain English on every
// surface that shows a per-class count (2026-08-10): "1 presented / 2 entered".

const COUNT_SURFACES = [
  'src/app/(shows)/shows/[id]/results/page.tsx',
  'src/app/(secretary)/secretary/shows/[id]/results/page.tsx',
  'src/app/(steward)/steward/shows/[id]/classes/[classId]/page.tsx',
  'src/app/api/results-approval/[token]/route.ts',
];

describe('per-class count wording', () => {
  it('never renders the "N forward" jargon', () => {
    // `{dogsForward} forward` in JSX and `${dogsForward} forward` in template
    // HTML both put a closing brace before the word — plain English uses like
    // "look forward to welcoming you" don't.
    const matches = scanFiles(['src/app'], ['.tsx', '.ts'], /\} forward\b/);
    const details = matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');
    expect(matches, `"forward" jargon found:\n${details}`).toEqual([]);
  });

  it.each(COUNT_SURFACES)('%s says "presented"', (file) => {
    const source = fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf-8');
    expect(source).toMatch(/presented/);
  });

  it.each([
    COUNT_SURFACES[0],
    COUNT_SURFACES[1],
    COUNT_SURFACES[3],
  ])('%s pairs presented with the entered count', (file) => {
    const source = fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf-8');
    expect(source).toMatch(/presented \/ \{?\$?\{?[a-zA-Z.]*(entriesCount|confirmed\.length)\}? entered/);
  });
});
