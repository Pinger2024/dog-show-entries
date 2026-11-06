import { describe, it, expect } from 'vitest';
import { classResultsPublishState } from '@/lib/class-results-publish-state';

describe('classResultsPublishState', () => {
  it('0 results: neither published nor dirty', () => {
    expect(classResultsPublishState({ total: 0, published: 0 })).toEqual({
      isPublished: false,
      hasUnpublishedChanges: false,
    });
  });

  it('some results, none published: neither published nor dirty', () => {
    expect(classResultsPublishState({ total: 4, published: 0 })).toEqual({
      isPublished: false,
      hasUnpublishedChanges: false,
    });
  });

  it('some published, some not: dirty (unpublished changes), not fully published', () => {
    expect(classResultsPublishState({ total: 4, published: 2 })).toEqual({
      isPublished: false,
      hasUnpublishedChanges: true,
    });
  });

  it('all published: fully published, not dirty', () => {
    expect(classResultsPublishState({ total: 4, published: 4 })).toEqual({
      isPublished: true,
      hasUnpublishedChanges: false,
    });
  });
});
