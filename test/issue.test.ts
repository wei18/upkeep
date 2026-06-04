// test/issue.test.ts
import { describe, it, expect } from 'vitest';
import { findMarkedIssue } from '../src/issue.js';
import { ISSUE_MARKER } from '../src/report-issue.js';

describe('findMarkedIssue', () => {
  const marked = { number: 7, body: `intro\n${ISSUE_MARKER}\nbody` };
  it('returns the number of the issue containing the marker', () => {
    expect(findMarkedIssue([{ number: 1, body: 'x' }, marked], ISSUE_MARKER)).toBe(7);
  });
  it('returns null when no issue carries the marker', () => {
    expect(findMarkedIssue([{ number: 1, body: 'x' }], ISSUE_MARKER)).toBeNull();
  });
  it('returns the first match when several carry the marker', () => {
    expect(findMarkedIssue([{ number: 3, body: ISSUE_MARKER }, { number: 5, body: ISSUE_MARKER }], ISSUE_MARKER)).toBe(3);
  });
  it('tolerates missing/null body', () => {
    expect(findMarkedIssue([{ number: 1 } as unknown as { number: number; body: string }], ISSUE_MARKER)).toBeNull();
  });
});
