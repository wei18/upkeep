// src/issue.ts
export interface IssueRef {
  number: number;
  body: string;
}

// 回傳第一個 body 含 marker 的 issue number；無則 null。
export function findMarkedIssue(issues: IssueRef[], marker: string): number | null {
  const hit = issues.find((i) => typeof i.body === 'string' && i.body.includes(marker));
  return hit ? hit.number : null;
}
