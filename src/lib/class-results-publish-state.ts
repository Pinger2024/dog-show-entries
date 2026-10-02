/**
 * "Is this class's results fully published, or does it have unpublished
 * changes?" — derived from a count of results and how many of them carry a
 * non-null `publishedAt`.
 *
 * ONE owner (CLAUDE.md, "One owner per rule"): `getClassSummaries` and
 * `getClassEntries` in src/server/trpc/routers/steward.ts hand-typed this
 * identically:
 *
 *   isPublished = total > 0 && published === total
 *   hasUnpublishedChanges = published > 0 && published < total
 *
 * i.e. fully published when every current result is live, "dirty" when some
 * results are live but new/changed results have been added since the
 * steward last published, and neither when nothing has been published yet.
 */
export interface ClassResultsPublishState {
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}

export function classResultsPublishState(counts: {
  total: number;
  published: number;
}): ClassResultsPublishState {
  const { total, published } = counts;
  return {
    isPublished: total > 0 && published === total,
    hasUnpublishedChanges: published > 0 && published < total,
  };
}
