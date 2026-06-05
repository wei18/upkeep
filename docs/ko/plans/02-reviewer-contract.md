# Plan 2 — Reviewer 계약 + rubric 합성（docs_staleness vertical slice）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reviewer 계층의 데이터 계약을 수립합니다. findings 타입 + 런타임 validator, rubric 3단계 합성（내장 ⊕ repo 규범 ⊕ audit.yml）, `docs_staleness` 내장 rubric과 공용 reviewer prompt 템플릿을 구현하고, "findings 샘플 녹화"를 통해 계약 테스트를 수행합니다. 전부 CI-safe, 제로 API입니다.

**Architecture:** Plan 1의 TS/ESM/vitest를 그대로 사용합니다. 새로 추가되는 것은 모두 **결정론적 TS + 텍스트 에셋**입니다: `findings.ts`（validator）, `rubric.ts`（합성）, `reviewers/*.md`（rubric 및 prompt 에셋）. 실제로 `claude-code-action`을 호출하여 LLM을 구동하는 부분은 Plan 4 e2e에 해당하며, 본 plan에서는 API를 호출하지 않습니다. 계약은 녹화된 샘플로 검증합니다.

**Tech Stack:** TypeScript, Node 20, vitest（기존 사용）. 새로운 런타임 의존성 없음.

대응 spec: `../design.md` §2/§2.1（reviewer + rubric 합성 + 다국어）, §3（SSOT 원칙）, §4（findings schema）.

### 범위 경계（본 plan에서 하지 않는 것）
- `claude-code-action` 트리거 / API 호출 없음（→ Plan 4 e2e）
- `docs_staleness` 1인의 rubric 에셋만 작성; 나머지 6인의 내장 rubric → Plan 4
- `audit.yml`의 `reviewers.<name>.paths`（glob 덮어쓰기）→ Plan 4（본 plan의 target 선택은 category 도메인 대응만 사용）
- synthesis 구현 → Plan 3

---

## File Structure

```
src/
  types.ts        # [변경] Finding / ReviewerOutput / Confidence / FindingCategory 추가
  findings.ts     # [신규] validateReviewerOutput(): runtime 검증 reviewer 출력 계약
  rubric.ts       # [신규] composeRubric(): 3단계 합성 + category에 따른 target 파일 선택
reviewers/
  docs_staleness.md   # [신규] docs_staleness 내장 기본 rubric（텍스트 에셋）
  _reviewer-prompt.md # [신규] 공용 reviewer prompt 템플릿（reviewer step 하나의 동작 기술）
test/
  findings.test.ts        # [신규]
  rubric.test.ts          # [신규]
  reviewer-assets.test.ts # [신규] 에셋 존재 여부 및 핵심 내용 검증
  contract/
    docs_staleness.sample.json  # [신규] 녹화된 유효 findings 샘플（계약 앵커）
  contract.test.ts        # [신규] 녹화 샘플 검증 통과 + 여러 불량 샘플 거부
```

`types.ts`는 "계약만 저장"; 검증 로직은 `findings.ts`, 합성 로직은 `rubric.ts`에 둡니다.

---

### Task 0: 계약 타입 `src/types.ts`（추가）

**Files:**
- Modify: `src/types.ts`（파일 끝, `MAX_FILE_KB` 앞이나 뒤에 추가; 기존 타입은 변경하지 않음）

- [ ] **Step 1: 타입 추가**

`src/types.ts` 말미（`export const MAX_FILE_KB = 100;` 이후）에 다음을 추가합니다:

```ts

export type Confidence = 'low' | 'medium' | 'high';

export type FindingCategory =
  | 'staleness'
  | 'duplicate'
  | 'orphan'
  | 'convention'
  | 'inconsistency'
  | 'i18n_sync'
  | 'other';

export type SsotDirection = 'stale_a' | 'stale_b' | 'uncertain' | 'n/a';

export interface Finding {
  file: string;            // 주체 파일（교차 파일 문제는 주 파일에 기재）
  related: string[];       // 연관 파일（빈 배열 허용）
  reviewer: ReviewerName;
  category: FindingCategory;
  problem: string;
  evidence: string;
  suggestion: string;
  severity: Severity;
  confidence: Confidence;
  ssot_direction: SsotDirection;
}

export interface ReviewerOutput {
  reviewer: ReviewerName;
  status: 'ok' | 'failed';  // failed 시 findings는 반드시 빈 배열
  findings: Finding[];
}
```

- [ ] **Step 2: 컴파일 검증**

Run: `npx tsc --noEmit`
Expected: 오류 없음, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Finding/ReviewerOutput contract types"
```

---

### Task 1: 검증기 `src/findings.ts`

**Files:**
- Create: `src/findings.ts`, `test/findings.test.ts`

직접 작성한 validator를 사용합니다（schema가 작으므로 ajv 도입 불필요 — YAGNI）. `{ valid, errors[] }`를 반환하며, 각 필드의 타입과 열거형 값 범위를 순서대로 검사합니다. `status:"failed"`이면 반드시 `findings:[]`이어야 합니다.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// test/findings.test.ts
import { describe, it, expect } from 'vitest';
import { validateReviewerOutput } from '../src/findings.js';

const goodFinding = {
  file: 'README.md',
  related: [],
  reviewer: 'docs_staleness',
  category: 'staleness',
  problem: 'README 安裝步驟與 package.json scripts 不符',
  evidence: 'README 寫 npm start；package.json 無 start script',
  suggestion: 'README 較舊，建議更新安裝段落',
  severity: 'medium',
  confidence: 'high',
  ssot_direction: 'stale_a',
};
const goodOutput = { reviewer: 'docs_staleness', status: 'ok', findings: [goodFinding] };

describe('validateReviewerOutput', () => {
  it('accepts a well-formed output', () => {
    const r = validateReviewerOutput(goodOutput);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects non-object root', () => {
    expect(validateReviewerOutput(null).valid).toBe(false);
    expect(validateReviewerOutput('x').valid).toBe(false);
  });

  it('rejects unknown reviewer name', () => {
    const r = validateReviewerOutput({ ...goodOutput, reviewer: 'nope' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('reviewer'))).toBe(true);
  });

  it('rejects bad status', () => {
    expect(validateReviewerOutput({ ...goodOutput, status: 'done' }).valid).toBe(false);
  });

  it('rejects findings that is not an array', () => {
    expect(validateReviewerOutput({ ...goodOutput, findings: {} }).valid).toBe(false);
  });

  it('rejects invalid enum values in a finding', () => {
    const bad = { ...goodOutput, findings: [{ ...goodFinding, severity: 'urgent' }] };
    const r = validateReviewerOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('severity'))).toBe(true);
  });

  it('rejects missing required string fields', () => {
    const { problem, ...noProblem } = goodFinding;
    const r = validateReviewerOutput({ ...goodOutput, findings: [noProblem] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('problem'))).toBe(true);
  });

  it('rejects failed status carrying findings', () => {
    const r = validateReviewerOutput({ reviewer: 'i18n', status: 'failed', findings: [goodFinding] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('failed'))).toBe(true);
  });

  it('accepts failed status with empty findings', () => {
    expect(validateReviewerOutput({ reviewer: 'i18n', status: 'failed', findings: [] }).valid).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run test/findings.test.ts`
Expected: FAIL（`findings.js` 미구현）.

- [ ] **Step 3: 구현 작성**

```ts
// src/findings.ts
import type { ReviewerName } from './types.js';

const REVIEWERS = new Set<string>([
  'docs_staleness', 'code_hygiene', 'spec_flow',
  'visual_icon', 'duplicate_orphan', 'convention', 'i18n',
]);
const LEVELS = new Set(['low', 'medium', 'high']);
const CATEGORIES = new Set([
  'staleness', 'duplicate', 'orphan', 'convention', 'inconsistency', 'i18n_sync', 'other',
]);
const SSOT = new Set(['stale_a', 'stale_b', 'uncertain', 'n/a']);

export function validateReviewerOutput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['root must be an object'] };
  }
  const o = input as Record<string, unknown>;
  if (!REVIEWERS.has(o.reviewer as string)) errors.push(`reviewer invalid: ${String(o.reviewer)}`);
  if (o.status !== 'ok' && o.status !== 'failed') errors.push('status must be "ok" or "failed"');

  if (!Array.isArray(o.findings)) {
    errors.push('findings must be an array');
    return { valid: false, errors };
  }

  const reqStr = (v: unknown) => typeof v === 'string' && v.length > 0;
  o.findings.forEach((raw, i) => {
    const at = `findings[${i}]`;
    const f = raw as Record<string, unknown>;
    if (typeof f !== 'object' || f === null) { errors.push(`${at} must be an object`); return; }
    if (!reqStr(f.file)) errors.push(`${at}.file required (non-empty string)`);
    if (!Array.isArray(f.related)) errors.push(`${at}.related must be an array`);
    if (!REVIEWERS.has(f.reviewer as string)) errors.push(`${at}.reviewer invalid`);
    if (!CATEGORIES.has(f.category as string)) errors.push(`${at}.category invalid`);
    if (!reqStr(f.problem)) errors.push(`${at}.problem required`);
    if (typeof f.evidence !== 'string') errors.push(`${at}.evidence required`);
    if (typeof f.suggestion !== 'string') errors.push(`${at}.suggestion required`);
    if (!LEVELS.has(f.severity as string)) errors.push(`${at}.severity invalid`);
    if (!LEVELS.has(f.confidence as string)) errors.push(`${at}.confidence invalid`);
    if (!SSOT.has(f.ssot_direction as string)) errors.push(`${at}.ssot_direction invalid`);
  });

  if (o.status === 'failed' && o.findings.length > 0) {
    errors.push('failed status must carry empty findings');
  }
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run test/findings.test.ts`
Expected: PASS（9 tests）.

- [ ] **Step 5: Commit**

```bash
git add src/findings.ts test/findings.test.ts
git commit -m "feat: runtime validator for reviewer output contract"
```

---

### Task 2: rubric 합성 `src/rubric.ts`

**Files:**
- Create: `src/rubric.ts`, `test/rubric.test.ts`

`composeRubric(reviewer, inventory, actionRoot)`은 `RubricBundle`을 반환합니다. 내용: 내장 rubric 경로（`<actionRoot>/reviewers/<reviewer>.md`）, repo 규범 출처（`inventory.conventions`에서 취득）, audit.yml 명시적 rubric 덮어쓰기, category 도메인에 따라 선택된 target 파일들.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// test/rubric.test.ts
import { describe, it, expect } from 'vitest';
import { composeRubric } from '../src/rubric.js';
import { defaultConfig } from '../src/config.js';
import type { Inventory, FileEntry } from '../src/types.js';

function file(path: string, category: FileEntry['category']): FileEntry {
  return {
    path, category, modality: 'text', sizeBytes: 1, hash: 'x',
    oversizedText: false, lastCommitISO: null, referencedBy: [],
  };
}

function inv(files: FileEntry[], over: Partial<Inventory> = {}): Inventory {
  return {
    repoRoot: '/r', generatedAtISO: 't', config: defaultConfig(),
    conventions: [{ path: 'CLAUDE.md', kind: 'claude_md' }],
    files, ...over,
  };
}

describe('composeRubric', () => {
  it('selects target files by the reviewer category domain', () => {
    const i = inv([file('README.md', 'doc'), file('src/a.ts', 'code'), file('docs/g.md', 'doc')]);
    const b = composeRubric('docs_staleness', i, '/action');
    expect(b.targetFiles.sort()).toEqual(['README.md', 'docs/g.md']);
  });

  it('points builtinRubric at the action reviewers dir', () => {
    const b = composeRubric('docs_staleness', inv([]), '/action');
    expect(b.builtinRubric).toBe('/action/reviewers/docs_staleness.md');
  });

  it('carries repo convention sources', () => {
    const b = composeRubric('convention', inv([file('x.ts', 'code')]), '/action');
    expect(b.conventionSources).toEqual(['CLAUDE.md']);
  });

  it('passes through audit.yml explicit rubric override', () => {
    const cfg = defaultConfig();
    cfg.reviewers.docs_staleness.rubric = '.claude/audit/docs.md';
    const b = composeRubric('docs_staleness', inv([], { config: cfg }), '/action');
    expect(b.explicitRubric).toBe('.claude/audit/docs.md');
  });

  it('explicitRubric is null when not configured', () => {
    expect(composeRubric('docs_staleness', inv([]), '/action').explicitRubric).toBeNull();
  });

  it('whole-repo reviewers see all categories', () => {
    const i = inv([file('a.ts', 'code'), file('b.png', 'visual'), file('c.md', 'doc')]);
    expect(composeRubric('duplicate_orphan', i, '/action').targetFiles.length).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run test/rubric.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현 작성**

```ts
// src/rubric.ts
import { join } from 'node:path';
import type { Inventory, ReviewerName, Category } from './types.js';

const ALL: Category[] = ['code', 'doc', 'spec', 'visual', 'flow', 'icon', 'config', 'other'];

// 각 reviewer가 담당하는 file 카테고리（target 선택용）
const DOMAINS: Record<ReviewerName, Category[]> = {
  docs_staleness: ['doc'],
  code_hygiene: ['code'],
  spec_flow: ['spec', 'flow'],
  visual_icon: ['visual', 'icon'],
  duplicate_orphan: ALL,
  convention: ALL,
  i18n: ['doc'], // v1: 다국어 doc; code 계층 지역화 문자열은 Plan 4에서 처리
};

export interface RubricBundle {
  reviewer: ReviewerName;
  builtinRubric: string;         // action 내장 rubric 파일의 절대 경로
  conventionSources: string[];   // repo 규범 출처（상대 경로）
  explicitRubric: string | null; // audit.yml reviewers.<name>.rubric 또는 null
  targetFiles: string[];         // 이 reviewer가 검토할 파일（상대 경로）
}

export function composeRubric(
  reviewer: ReviewerName,
  inventory: Inventory,
  actionRoot: string,
): RubricBundle {
  const cats = new Set<Category>(DOMAINS[reviewer]);
  const cfg = inventory.config.reviewers[reviewer];
  return {
    reviewer,
    builtinRubric: join(actionRoot, 'reviewers', `${reviewer}.md`),
    conventionSources: inventory.conventions.map((c) => c.path),
    explicitRubric: cfg?.rubric ?? null,
    targetFiles: inventory.files.filter((f) => cats.has(f.category)).map((f) => f.path),
  };
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run test/rubric.test.ts`
Expected: PASS（6 tests）.

- [ ] **Step 5: Commit**

```bash
git add src/rubric.ts test/rubric.test.ts
git commit -m "feat: compose per-reviewer rubric bundle (builtin + conventions + override + targets)"
```

---

### Task 3: reviewer 에셋（rubric + prompt 템플릿）

**Files:**
- Create: `reviewers/docs_staleness.md`, `reviewers/_reviewer-prompt.md`, `test/reviewer-assets.test.ts`

텍스트 에셋 두 개입니다. `docs_staleness.md`는 해당 reviewer의 내장 판단 기준이고, `_reviewer-prompt.md`는 모든 reviewer step에서 공용하는 동작 템플릿입니다（내용: inventory + target 파일 + rubric 읽기, SSOT 원칙 준수, `findings/<reviewer>.json` 계약 출력）. 테스트는 핵심 내용의 존재 여부만 단언합니다（텍스트 에셋을 한 글자씩 검증하지 않음）.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// test/reviewer-assets.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeRubric } from '../src/rubric.js';
import { defaultConfig } from '../src/config.js';

// ESM-safe repo root (project is "type": "module"; do not rely on __dirname)
const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('reviewer assets', () => {
  it('docs_staleness builtin rubric file exists at the composed path', () => {
    const inv = {
      repoRoot: '/r', generatedAtISO: 't', config: defaultConfig(),
      conventions: [], files: [],
    };
    const b = composeRubric('docs_staleness', inv, ROOT.replace(/\/$/, ''));
    expect(existsSync(b.builtinRubric)).toBe(true);
  });

  it('docs_staleness rubric covers staleness + multilingual sync', () => {
    const text = readFileSync(join(ROOT, 'reviewers/docs_staleness.md'), 'utf8');
    expect(text.toLowerCase()).toContain('stale');
    expect(text).toMatch(/multi|多語|README\.<locale>|zh-TW/);
  });

  it('shared reviewer prompt template states the contract and SSOT rule', () => {
    const text = readFileSync(join(ROOT, 'reviewers/_reviewer-prompt.md'), 'utf8');
    expect(text).toContain('findings/');          // 출력 경로
    expect(text).toMatch(/ssot_direction|SSOT/);  // SSOT 원칙
    expect(text).toMatch(/severity/);             // 계약 필드
    expect(text).toMatch(/confidence/);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run test/reviewer-assets.test.ts`
Expected: FAIL（에셋 파일 미존재）.

- [ ] **Step 3: `reviewers/docs_staleness.md` 생성**

```markdown
# docs_staleness — 내장 rubric

당신은 문서 노후화 탐지 reviewer입니다. 할당된 문서 파일（README, docs, 주석, **다국어 README/doc 변형**）에서 다음을 찾아내세요.

## 무엇을 찾는가
- **내용 노후화**: 문서의 설명이 실제 코드/설정/최근 commit과 불일치하는 경우（예: README의 설치 명령이 package.json scripts와 다름）.
- **코드와의 드리프트**: 문서에 언급된 API, 파일명, 플래그, 경로가 더 이상 존재하지 않거나 이름이 바뀐 경우.
- **만료된 링크**: 삭제된 파일이나 유효하지 않은 앵커를 가리키는 링크.
- **다국어 동기화（multilingual doc-set）**: `README.md`（base=en）와 각 `README.<locale>.md`（zh-TW/zh-CN/ja/ko）를 비교합니다. 어떤 번역본이 base에서 새로 추가된 섹션에 뒤처지거나 누락/노후화되었는지 보고하세요.

## SSOT 원칙（중요）
문서가 업데이트되어야 하는 쪽이라고 단정하지 마세요. "불일치"만 보고하세요: A는 X라고 하고, B는 Y라고 하며, 둘이 일치하지 않는다는 것을. 증거를 첨부하세요（git 마지막 수정 시간, 참조 관계, 구체적인 불일치 내용）.
- 증거가 강한 경우（예: base가 지난주에 대폭 변경되고 특정 번역본이 반년째 업데이트 없음）→ 제안에 방향을 명시할 수 있습니다（"해당 번역본이 더 오래됐으므로 업데이트 권장"）. 단, 여전히 사람의 확인이 필요한 것으로 봅니다.
- 증거가 약한 경우 → `ssot_direction: "uncertain"`, "방향 결정 필요"로 표시합니다.

## 하지 말 것
- 파일을 수정하지 마세요（보고만 합니다）.
- 실질적인 근거 없는 "스타일 선호도"에 대해 finding을 열지 마세요.
```

- [ ] **Step 4: `reviewers/_reviewer-prompt.md` 생성**

```markdown
# 공용 reviewer prompt 템플릿

당신은 upkeep의 전문 reviewer입니다. 이름: `{{REVIEWER}}`.

## 입력으로 받는 것
- `inventory.json`: 전체 repo의 파일 목록과 metadata（modality/category/hash/lastCommitISO/referencedBy/oversizedText）.
- 당신의 target 파일 목록（이 파일들만 검토합니다）.
- 당신의 내장 rubric（무엇을 찾고 어떻게 판단하는지 정의）.
- repo 자체 규범 출처（CLAUDE.md, .claude/skills, .claude/workflows 등）; 충돌 시 **repo 규범이 내장 기본값보다 우선합니다**.
- （있는 경우）audit.yml에 지정된 덮어쓰기 rubric, 우선순위가 가장 높습니다.

## 해야 할 것
1. 당신의 target 파일 범위 내에서만 작업하세요. 필요 시 inventory의 metadata를 증거로 활용하세요（예: lastCommitISO로 드리프트 방향 비교）.
2. rubric 내의 **SSOT 원칙**을 준수하세요: 진실의 출처를 단정하지 말고, 불일치만 보고하며, 증거를 첨부하고, 불확실한 경우 `ssot_direction: "uncertain"`으로 표시합니다.
3. **어떤 파일도 수정하지 마세요** — findings만 출력합니다.

## 출력（계약을 엄격히 준수）
결과를 `findings/{{REVIEWER}}.json`에 작성하세요. 형식:

```json
{
  "reviewer": "{{REVIEWER}}",
  "status": "ok",
  "findings": [
    {
      "file": "상대 경로",
      "related": [],
      "reviewer": "{{REVIEWER}}",
      "category": "staleness | duplicate | orphan | convention | inconsistency | i18n_sync | other",
      "problem": "문제 설명",
      "evidence": "뒷받침 증거",
      "suggestion": "수정 제안",
      "severity": "low | medium | high",
      "confidence": "low | medium | high",
      "ssot_direction": "stale_a | stale_b | uncertain | n/a"
    }
  ]
}
```

문제가 없으면 `findings: []`, `status: "ok"`. 완료할 수 없는 경우 `status: "failed"`, `findings: []`.
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `npx vitest run test/reviewer-assets.test.ts`
Expected: PASS（3 tests）.

- [ ] **Step 6: Commit**

```bash
git add reviewers/docs_staleness.md reviewers/_reviewer-prompt.md test/reviewer-assets.test.ts
git commit -m "feat: docs_staleness builtin rubric + shared reviewer prompt template"
```

---

### Task 4: 녹화 샘플 계약 테스트

**Files:**
- Create: `test/contract/docs_staleness.sample.json`, `test/contract.test.ts`

"docs_staleness가 실제로 출력할 법한" findings 샘플 하나를 계약 앵커로 녹화합니다. LLM 출력 형식（수동으로 작성된 시뮬레이션）이 validator를 통과함을 증명하고, 의도적으로 깨진 변형 몇 개가 거부되는지 확인합니다. CI-safe, 제로 API.

- [ ] **Step 1: 녹화 샘플 `test/contract/docs_staleness.sample.json` 생성**

```json
{
  "reviewer": "docs_staleness",
  "status": "ok",
  "findings": [
    {
      "file": "README.md",
      "related": ["package.json"],
      "reviewer": "docs_staleness",
      "category": "staleness",
      "problem": "README 的 Getting Started 用 `npm start`，但 package.json 沒有 start script。",
      "evidence": "package.json scripts 僅有 build/test/discovery；README 最後 commit 2025-11，package.json 2026-05 改過。",
      "suggestion": "README 較舊，建議把 `npm start` 改為實際可用的指令。",
      "severity": "medium",
      "confidence": "high",
      "ssot_direction": "stale_a"
    },
    {
      "file": "README.zh-TW.md",
      "related": ["README.md"],
      "reviewer": "docs_staleness",
      "category": "i18n_sync",
      "problem": "zh-TW 版缺少 base(en) 於近期新增的 Configuration 章節。",
      "evidence": "README.md 含 ## Configuration；README.zh-TW.md 無對應章節，且 base 該段 2026-05 才加入。",
      "suggestion": "補譯 Configuration 章節到 zh-TW 版。",
      "severity": "low",
      "confidence": "medium",
      "ssot_direction": "stale_b"
    }
  ]
}
```

- [ ] **Step 2: 테스트 작성（먼저 실패）**

```ts
// test/contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReviewerOutput } from '../src/findings.js';

const HERE = fileURLToPath(new URL('.', import.meta.url)); // .../test/
const sample = JSON.parse(
  readFileSync(join(HERE, 'contract/docs_staleness.sample.json'), 'utf8'),
);

describe('recorded findings contract', () => {
  it('recorded docs_staleness sample passes the validator', () => {
    const r = validateReviewerOutput(sample);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a finding missing ssot_direction is rejected', () => {
    const broken = structuredClone(sample);
    delete broken.findings[0].ssot_direction;
    expect(validateReviewerOutput(broken).valid).toBe(false);
  });

  it('an out-of-domain enum value is rejected', () => {
    const broken = structuredClone(sample);
    broken.findings[1].category = 'totally_made_up';
    expect(validateReviewerOutput(broken).valid).toBe(false);
  });
});
```

> 이 테스트는 Task 1의 `findings.ts`가 이미 존재한다는 전제 하에, 샘플 파일/테스트 파일이 아직 생성되지 않아서만 실패합니다. 생성 후 즉시 통과합니다.

- [ ] **Step 3: 테스트 실행하여 통과 확인**

Run: `npx vitest run test/contract.test.ts`
Expected: PASS（3 tests）.

- [ ] **Step 4: 전체 스위트 + 타입 검사**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add test/contract/docs_staleness.sample.json test/contract.test.ts
git commit -m "test: recorded findings contract anchor for docs_staleness"
```

---

## 완료 정의（Plan 2）

- `npx vitest run` 전체 통과（findings/rubric/reviewer-assets/contract + Plan 1 기존 테스트）
- `validateReviewerOutput`이 유효한 입력을 올바르게 수락하고, 각종 기형 출력을 거부함（failed-with-findings, 알 수 없는 열거형, 필수 필드 누락 포함）
- `composeRubric`이 모든 reviewer에 대해 올바른 `RubricBundle` 생성（내장 경로, 규범 출처, 덮어쓰기, 도메인 기반 target 선택）
- `reviewers/docs_staleness.md`와 `_reviewer-prompt.md`가 존재하고 핵심 내용 포함（다국어 동기화, SSOT, 계약 필드 포함）
- 제로 API, 제로 네트워크

## 다음 단계로의 연결

`ReviewerOutput`/`Finding`은 Plan 3 consolidate의 입력이자 `synthesis.json`（§4.1）의 소재입니다. Plan 3에서는 결정론적 consolidate（`findings/*.json` 병합, 키 중복 제거, severity×confidence 정렬）와 HTML/issue 보고서 조립을 수행합니다. Plan 4에서 비로소 `composeRubric` + `_reviewer-prompt.md`를 `claude-code-action` matrix step에 연결하여 `wei18/Sudoku`를 대상으로 실제 e2e를 실행합니다.
