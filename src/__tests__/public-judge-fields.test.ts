import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableColumns } from 'drizzle-orm';
import { judges, judgeAssignments } from '@/server/db/schema';
import {
  PUBLIC_JUDGE_FIELDS,
  PRIVATE_JUDGE_FIELDS,
  PUBLIC_JUDGE_ASSIGNMENT_FIELDS,
  PRIVATE_JUDGE_ASSIGNMENT_FIELDS,
  redactJudgeAssignmentForPublic,
} from '@/server/trpc/public-judge-fields';

/**
 * Guard for the 2026-09-22 judge approval-token leak (see
 * src/server/trpc/public-judge-fields.ts and public-data-privacy.test.ts).
 * A new judge or judge-assignment column must be classified before it can
 * reach a public payload.
 */
describe('judge fields — every column has a public/private decision', () => {
  it('judges: every column is classified exactly once', () => {
    const cols = Object.keys(getTableColumns(judges)).sort();
    const classified = [...PUBLIC_JUDGE_FIELDS, ...PRIVATE_JUDGE_FIELDS].sort();
    expect(classified).toEqual(cols);
  });

  it('judge_assignments: every column is classified exactly once', () => {
    const cols = Object.keys(getTableColumns(judgeAssignments)).sort();
    const classified = [...PUBLIC_JUDGE_ASSIGNMENT_FIELDS, ...PRIVATE_JUDGE_ASSIGNMENT_FIELDS].sort();
    expect(classified).toEqual(cols);
  });

  it('redaction nulls the token and contact details and keeps the name', () => {
    const out = redactJudgeAssignmentForPublic({
      id: 'a',
      approvalToken: 'secret-token',
      approvalStatus: 'pending',
      judge: { id: 'j', name: 'Peter', contactEmail: 'p@example.com', contactPhone: '0770' },
    });
    expect(out.approvalToken).toBeNull();
    expect(out.approvalStatus).toBeNull();
    expect(out.judge).toEqual({ id: 'j', name: 'Peter', contactEmail: null, contactPhone: null });
  });

  it('shows.getById redacts judge assignments for non-members', () => {
    const src = readFileSync(join(__dirname, '../server/trpc/routers/shows.ts'), 'utf8');
    expect(src).toMatch(/judgeAssignments\.map\(redactJudgeAssignmentForPublic\)/);
  });
});
