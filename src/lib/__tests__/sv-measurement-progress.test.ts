import { describe, it, expect } from 'vitest';
import { svMeasurementGapsNote, svMeasurementProgress } from '@/lib/sv-measurement';

describe('height and depth progress — the page count and the documents reminder', () => {
  const rows = [
    { svHeightCm: '61.5', svDepthCm: '25.5' },
    { svHeightCm: '62', svDepthCm: '' }, // half done is not measured
    { svHeightCm: '', svDepthCm: '' },
  ];

  it('counts a dog as measured only with BOTH a height and a depth', () => {
    expect(svMeasurementProgress(rows)).toEqual({ measured: 1, total: 3 });
  });

  it('says how many are missing and where to add them — nothing once all are done', () => {
    expect(svMeasurementGapsNote({ measured: 1, total: 3 })).toBe(
      '2 of 3 dogs have no height and depth yet. Add them under Results → Height and depth before you send this to the League.',
    );
    expect(svMeasurementGapsNote({ measured: 0, total: 1 })).toMatch(/^1 of 1 dog has /);
    expect(svMeasurementGapsNote({ measured: 3, total: 3 })).toBeUndefined();
    expect(svMeasurementGapsNote({ measured: 0, total: 0 })).toBeUndefined();
  });
});
