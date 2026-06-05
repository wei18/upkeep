# Plan 2 — Reviewer 契约 + rubric 合成（docs_staleness vertical slice）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 reviewer 层的数据契约：findings 类型 + runtime 验证器、rubric 三层合成（内置 ⊕ repo 规范 ⊕ audit.yml）、`docs_staleness` 内置 rubric 与共用 reviewer prompt 模板，并以「录制 findings 样本」做契约测试——全部 CI-safe、零 API。

**Architecture:** 沿用 Plan 1 的 TS/ESM/vitest。新增的都是**确定性 TS + 文字资产**：`findings.ts`（validator）、`rubric.ts`（合成）、`reviewers/*.md`（rubric 与 prompt 资产）。真正调用 `claude-code-action` 跑 LLM 的部分属 Plan 4 e2e，本 plan 不触发 API——契约用录制样本验证。

**Tech Stack:** TypeScript, Node 20, vitest（沿用）。无新增 runtime 依赖。

对应 spec：`../design.md` §2/§2.1（reviewer + rubric 合成 + 多语）、§3（SSOT 原则）、§4（findings schema）。

### 范围边界（本 plan 不做）
- 不触发 `claude-code-action` / 不调用 API（→ Plan 4 e2e）
- 只做 `docs_staleness` 一位的 rubric 资产；其余 6 位的内置 rubric → Plan 4
- `audit.yml` 的 `reviewers.<name>.paths`（glob 覆盖）→ Plan 4（本 plan target 选择只用 category 领域对应）
- synthesis 实现 → Plan 3

---

## File Structure

```
src/
  types.ts        # [改] 追加 Finding / ReviewerOutput / Confidence / FindingCategory
  findings.ts     # [新] validateReviewerOutput()：runtime 验证 reviewer 输出合约
  rubric.ts       # [新] composeRubric()：三层合成 + 依 category 选 target 文件
reviewers/
  docs_staleness.md   # [新] docs_staleness 内置默认 rubric（文字资产）
  _reviewer-prompt.md # [新] 共用 reviewer prompt 模板（描述一个 reviewer step 的行为）
test/
  findings.test.ts        # [新]
  rubric.test.ts          # [新]
  reviewer-assets.test.ts # [新] 资产存在性与关键内容
  contract/
    docs_staleness.sample.json  # [新] 录制的合法 findings 样本（契约锚点）
  contract.test.ts        # [新] 录制样本过验证 + 多个坏样本被拒
```

`types.ts` 维持「只放契约」；验证逻辑在 `findings.ts`，合成逻辑在 `rubric.ts`。

---

### Task 0: 契约类型 `src/types.ts`（追加）

**Files:**
- Modify: `src/types.ts`（在文件末尾、`MAX_FILE_KB` 之前或之后追加；不更动既有类型）

- [ ] **Step 1: 追加类型**

在 `src/types.ts` 末尾（`export const MAX_FILE_KB = 100;` 之后）追加：

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
  file: string;            // 主体文件（跨文件问题放主文件）
  related: string[];       // 关联文件（可空数组）
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
  status: 'ok' | 'failed';  // failed 时 findings 必为空
  findings: Finding[];
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误，exit 0。

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Finding/ReviewerOutput contract types"
```

---

### Task 1: 验证器 `src/findings.ts`

**Files:**
- Create: `src/findings.ts`, `test/findings.test.ts`

手写 validator（schema 小，不引入 ajv — YAGNI）。返回 `{ valid, errors[] }`，逐字段检查类型与枚举值域；`status:"failed"` 必须 `findings:[]`。

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/findings.test.ts`
Expected: FAIL（`findings.js` 未实现）。

- [ ] **Step 3: 写实现**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/findings.test.ts`
Expected: PASS（9 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/findings.ts test/findings.test.ts
git commit -m "feat: runtime validator for reviewer output contract"
```

---

### Task 2: rubric 合成 `src/rubric.ts`

**Files:**
- Create: `src/rubric.ts`, `test/rubric.test.ts`

`composeRubric(reviewer, inventory, actionRoot)` 返回 `RubricBundle`：内置 rubric 路径（`<actionRoot>/reviewers/<reviewer>.md`）、repo 规范来源（取自 `inventory.conventions`）、audit.yml 显式 rubric 覆盖、依 category 领域选出的 target 文件。

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/rubric.test.ts`
Expected: FAIL。

- [ ] **Step 3: 写实现**

```ts
// src/rubric.ts
import { join } from 'node:path';
import type { Inventory, ReviewerName, Category } from './types.js';

const ALL: Category[] = ['code', 'doc', 'spec', 'visual', 'flow', 'icon', 'config', 'other'];

// 每个 reviewer 负责的 file 类别（target 选择用）
const DOMAINS: Record<ReviewerName, Category[]> = {
  docs_staleness: ['doc'],
  code_hygiene: ['code'],
  spec_flow: ['spec', 'flow'],
  visual_icon: ['visual', 'icon'],
  duplicate_orphan: ALL,
  convention: ALL,
  i18n: ['doc'], // v1：多语 doc；code 层本地化字符串待 Plan 4
};

export interface RubricBundle {
  reviewer: ReviewerName;
  builtinRubric: string;         // action 内置 rubric 文件绝对路径
  conventionSources: string[];   // repo 规范来源（相对路径）
  explicitRubric: string | null; // audit.yml reviewers.<name>.rubric 或 null
  targetFiles: string[];         // 此 reviewer 要看的文件（相对路径）
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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/rubric.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/rubric.ts test/rubric.test.ts
git commit -m "feat: compose per-reviewer rubric bundle (builtin + conventions + override + targets)"
```

---

### Task 3: reviewer 资产（rubric + prompt 模板）

**Files:**
- Create: `reviewers/docs_staleness.md`, `reviewers/_reviewer-prompt.md`, `test/reviewer-assets.test.ts`

两个文字资产：`docs_staleness.md` 是该 reviewer 的内置判断依据；`_reviewer-prompt.md` 是所有 reviewer step 共用的行为模板（描述：读 inventory + target 文件 + rubric，遵守 SSOT 原则，输出 `findings/<reviewer>.json` 契约）。测试只断言关键内容存在（文字资产不逐字测）。

- [ ] **Step 1: 写失败测试**

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
    expect(text).toContain('findings/');          // 输出路径
    expect(text).toMatch(/ssot_direction|SSOT/);  // SSOT 原则
    expect(text).toMatch(/severity/);             // 契约字段
    expect(text).toMatch(/confidence/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/reviewer-assets.test.ts`
Expected: FAIL（资产文件不存在）。

- [ ] **Step 3: 建立 `reviewers/docs_staleness.md`**

```markdown
# docs_staleness — 内置 rubric

你是文档陈旧检测 reviewer。对指派给你的文档文件（README、docs、注释、**多语 README/doc 变体**），找出：

## 抓什么
- **内容陈旧**：文档描述与真实代码/配置/近期 commit 不符（例：README 安装命令对不上 package.json scripts）。
- **与 code 漂移**：文档提及的 API、文件名、标志、路径已不存在或已改名。
- **过期链接**：指向已删除文件或失效锚点的链接。
- **多语同步（multilingual doc-set）**：以 `README.md`（base=en）对照各 `README.<locale>.md`（zh-TW/zh-CN/ja/ko）。报告哪个翻译落后/缺漏 base 新增的章节/过时。

## SSOT 原则（重要）
不要预设文档就是该被更新的一方。只报「分歧」：A 说 X、B 说 Y、两者不一致。附证据（git 最后修改时间、被引用关系、具体不符之处）。
- 证据强（如 base 上周大改、某翻译半年没动）→ 建议里可明确说明方向（「该翻译较旧，建议更新」），但仍视为需人工确认。
- 证据弱 → `ssot_direction: "uncertain"`，标「方向待裁决」。

## 不要做
- 不要改文件（只报告）。
- 不要对没有实质佐证的「风格偏好」开 finding。
```

- [ ] **Step 4: 建立 `reviewers/_reviewer-prompt.md`**

```markdown
# 共用 reviewer prompt 模板

你是 upkeep 的一位专业 reviewer，名称：`{{REVIEWER}}`。

## 你拿到的输入
- `inventory.json`：整个 repo 的文件列表与 metadata（modality/category/hash/lastCommitISO/referencedBy/oversizedText）。
- 你的 target 文件列表（只审这些）。
- 你的内置 rubric（定义你抓什么、怎么判断）。
- repo 自身规范来源（CLAUDE.md、.claude/skills、.claude/workflows 等）；冲突时 **repo 规范优先于内置默认**。
- （若有）audit.yml 指定的覆盖 rubric，优先级最高。

## 你要做的
1. 只在你的 target 文件范围内工作；需要时用 inventory 的 metadata 当证据（例：lastCommitISO 比对漂移方向）。
2. 遵守你 rubric 内的 **SSOT 原则**：不预设真实来源、只报分歧、附证据、不确定就标 `ssot_direction: "uncertain"`。
3. **不修改任何文件**——只产出 findings。

## 输出（严格遵守契约）
把结果写到 `findings/{{REVIEWER}}.json`，格式：

```json
{
  "reviewer": "{{REVIEWER}}",
  "status": "ok",
  "findings": [
    {
      "file": "相对路径",
      "related": [],
      "reviewer": "{{REVIEWER}}",
      "category": "staleness | duplicate | orphan | convention | inconsistency | i18n_sync | other",
      "problem": "问题描述",
      "evidence": "支撑证据",
      "suggestion": "建议修法",
      "severity": "low | medium | high",
      "confidence": "low | medium | high",
      "ssot_direction": "stale_a | stale_b | uncertain | n/a"
    }
  ]
}
```

没有问题时 `findings: []`、`status: "ok"`。你无法完成时 `status: "failed"`、`findings: []`。
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run test/reviewer-assets.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 6: Commit**

```bash
git add reviewers/docs_staleness.md reviewers/_reviewer-prompt.md test/reviewer-assets.test.ts
git commit -m "feat: docs_staleness builtin rubric + shared reviewer prompt template"
```

---

### Task 4: 录制样本契约测试

**Files:**
- Create: `test/contract/docs_staleness.sample.json`, `test/contract.test.ts`

录制一份「像是 docs_staleness 真的会产出」的 findings 样本当契约锚点：证明 LLM 输出格式（手写模拟）能通过 validator，且几个刻意破坏的变体会被拒。CI-safe、零 API。

- [ ] **Step 1: 建立录制样本 `test/contract/docs_staleness.sample.json`**

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

- [ ] **Step 2: 写测试（先失败）**

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

> 此测试在 Task 1 的 `findings.ts` 已存在的前提下，仅因样本文件/测试文件尚未建立而失败；建立后即通过。

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run test/contract.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 4: 全套件 + 类型检查**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全 PASS、无类型错误。

- [ ] **Step 5: Commit**

```bash
git add test/contract/docs_staleness.sample.json test/contract.test.ts
git commit -m "test: recorded findings contract anchor for docs_staleness"
```

---

## 完成定义（Plan 2）

- `npx vitest run` 全绿（findings/rubric/reviewer-assets/contract + Plan 1 既有）
- `validateReviewerOutput` 正确接受合法、拒绝各类畸形输出（含 failed-with-findings、未知枚举、缺必填）
- `composeRubric` 对任一 reviewer 产出正确 `RubricBundle`（内置路径、规范来源、覆盖、依领域选 target）
- `reviewers/docs_staleness.md` 与 `_reviewer-prompt.md` 存在且含关键内容（含多语同步、SSOT、契约字段）
- 零 API、零网络

## 衔接下一步

`ReviewerOutput`/`Finding` 是 Plan 3 consolidate 的输入、`synthesis.json`（§4.1）的素材。Plan 3 将做确定性 consolidate（合并 `findings/*.json`、key 去重、severity×confidence 排序）与 HTML/issue 报告组装。Plan 4 才把 `composeRubric` + `_reviewer-prompt.md` 接到 `claude-code-action` matrix step，对 `wei18/Sudoku` 跑真实 e2e。
