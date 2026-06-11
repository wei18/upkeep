# Upkeep v2 Plugin Repositioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition Upkeep as a Claude Code plugin (skill-first README, marketplace install, npx skills support) and ship it as v2, with zero changes to the GHA workflow interface.

**Architecture:** Purely additive. Two new manifest files make the existing `skills/upkeep-audit/` directory installable as a plugin (single-skill layout, SKILL.md at plugin root). The README (en + 4 locales) is restructured to lead with the skill install; the CI section moves down and points at `@v2`. The pipeline, workflow, scripts, and SKILL.md behavior are untouched. v1 tag freezes at the cut point.

**Tech Stack:** JSON manifests (Claude Code plugin spec), Markdown. No TS changes, no tests affected.

**Spec:** `docs/superpowers/specs/2026-06-11-v2-plugin-repositioning-design.md`

---

### Task 1: Plugin manifests

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `skills/upkeep-audit/.claude-plugin/plugin.json`

- [ ] **Step 1: Create marketplace manifest**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "upkeep",
  "owner": {
    "name": "Wei18"
  },
  "description": "Upkeep — an AI audit crew for your repo. Catches docs/spec/asset drift with evidence; output-only.",
  "plugins": [
    {
      "name": "upkeep",
      "source": "./skills/upkeep-audit",
      "description": "Run the Upkeep repo audit from Claude Code: drift findings by severity plus a self-contained HTML report. Never edits your files.",
      "version": "2.0.0",
      "author": {
        "name": "Wei18"
      }
    }
  ]
}
```

- [ ] **Step 2: Create plugin manifest**

Create `skills/upkeep-audit/.claude-plugin/plugin.json`:

```json
{
  "name": "upkeep",
  "description": "Run the Upkeep repo audit locally against any repository path — output-only drift report with evidence and severity.",
  "version": "2.0.0",
  "author": {
    "name": "Wei18"
  },
  "homepage": "https://github.com/wei18/upkeep",
  "repository": "https://github.com/wei18/upkeep"
}
```

Note: `skills/upkeep-audit/SKILL.md` sits at the plugin root (single-skill layout). The skill keeps its frontmatter name `upkeep-audit`, so the installed invocation is `/upkeep:upkeep-audit`. Do not move or edit SKILL.md.

- [ ] **Step 3: Validate**

Run: `claude plugin validate .`
Expected: validation passes for the marketplace and the `upkeep` plugin entry; no schema errors. (If the CLI reports the marketplace and plugin as valid under slightly different wording, that is fine — any reported error is a failure.)

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json skills/upkeep-audit/.claude-plugin/plugin.json
git commit -m "feat(plugin): add marketplace + plugin manifests for Claude Code install"
```

---

### Task 2: English README restructure

**Files:**
- Modify: `README.md` (sections: intro blurb, new Install, What it does tweaks, Run locally → Run as a plain script, Usage → Automate it in CI)

Target section order:
`Banner → title/lang switcher → positioning line → blockquote (no API bill) → Install → What it does → How it compares → Run as a plain script → Automate it in CI → Reviewers → Configuration → Docs`

- [ ] **Step 1: Replace the intro (lines after the language switcher through the blockquote)**

Replace the current one-line description ("A reusable GitHub Actions workflow that …") and keep-adjust the blockquote, so the top reads:

```markdown
**An AI audit crew for your repo, installed as a skill.** Upkeep dispatches focused AI reviewers in parallel to catch drift — stale docs, specs that no longer match the code, orphaned assets, broken conventions — and reports it with evidence before it compounds.

> 💳 **No separate API bill.** Upkeep runs on your existing **Claude Pro/Max subscription** — your logged-in `claude` CLI locally, or OAuth via `claude setup-token` in CI. No Anthropic API key, no per-token billing. And it's **output-only**: it reports drift with evidence and severity, but never edits or deletes your files.
```

- [ ] **Step 2: Insert the Install section (immediately after the blockquote, before "What it does")**

```markdown
## Install

**Claude Code** — install as a plugin:

```
/plugin marketplace add wei18/upkeep
/plugin install upkeep@upkeep
```

**Other agents** (Cursor, Copilot, and any of the 70+ agents supported by [skills](https://github.com/vercel-labs/skills)):

```bash
npx skills add wei18/upkeep --skill upkeep-audit
```

Then ask in any session:

> Run an upkeep audit on /path/to/repo

On first use the skill clones the Upkeep engine into `~/.cache/upkeep` and installs dependencies automatically. You get findings grouped by severity in chat, plus a self-contained HTML report.
```

- [ ] **Step 3: Adjust "What it does"**

Two edits, rest of the bullets stay verbatim:
- First bullet: drop the GHA-specific parenthetical. New text: `- Scans a repository and dispatches a team of **focused AI reviewers** in parallel.`
- Last bullet: make the issue CI-conditional. New text: `- Produces a self-contained **HTML report** — and, when run in CI, a **persistent GitHub tracking issue** (upserted, never duplicated).`

- [ ] **Step 4: Convert "Run locally" into "Run as a plain script"**

Replace the `## Run locally` section. Delete its "Via Claude Code skill" paragraph (now covered by Install). Keep the script block, flags table, requirements and output lines verbatim, retitled and reframed:

```markdown
## Run as a plain script

No agent at all? The same pipeline runs as a standalone script:

```bash
git clone --depth 1 https://github.com/wei18/upkeep ~/.cache/upkeep
cd ~/.cache/upkeep && npm ci
./scripts/local-audit.sh /path/to/repo --out ~/upkeep-report.html
```

| Flag | Default | CI equivalent |
|---|---|---|
| `--model` | `claude-opus-4-8` | `model` |
| `--rubric-lang` | `en` | `rubric_lang` |
| `--max-turns` | `30` | `max_turns` |
| `--out` | `./upkeep-report.html` | report artifact |

**Requirements:** a logged-in `claude` CLI (Pro/Max; no `setup-token` and no GitHub access needed), Node 20+, git.

**Output:** the same self-contained HTML report (`upkeep-report.html` by default) plus a terminal summary. Local runs never create GitHub issues.

Prefer a manual skill install? Copy [`skills/upkeep-audit/`](skills/upkeep-audit/) into `~/.claude/skills/`.
```

- [ ] **Step 5: Retitle "Usage" → "Automate it in CI" and move it after "Run as a plain script"**

Keep the YAML, Requirements, and Outputs content verbatim except: the `uses:` line becomes `uses: wei18/upkeep/.github/workflows/audit.yml@v2`. New section opening and closing migration note:

```markdown
## Automate it in CI

The same audit crew, on a schedule. Create `.github/workflows/audit.yml` in your repo:
```

(…existing YAML + Requirements + Outputs verbatim, with `@v2`…)

```markdown
> Already on `@v1`? It keeps working but is frozen — switch the tag to `@v2`. The interface is identical.
```

- [ ] **Step 6: Verify structure**

Run: `grep -n '^## ' README.md`
Expected order: `Install`, `What it does`, `How it compares`, `Run as a plain script`, `Automate it in CI`, `Reviewers`, `Configuration`, `Docs`.

Also: `grep -c '@v1' README.md` → only the migration note's mention (1); `grep -n 'reusable GitHub Actions workflow' README.md` → no hits in the intro (the phrase may survive inside "Automate it in CI" prose if any, but the opening line must not lead with it).

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(readme): reposition as skill-first plugin install, CI demoted to automation section"
```

---

### Task 3: Locale README sync (zh-TW, zh-CN, ja, ko)

**Files:**
- Modify: `docs/zh-TW/README.md`, `docs/zh-CN/README.md`, `docs/ja/README.md`, `docs/ko/README.md`

Mirror Task 2 exactly: same section order, same content moves, same `@v2` + migration note. Translate the new prose per locale; for all retained sections reuse the file's existing translated text verbatim (do not retranslate).

Locale conventions (from `docs/<locale>` established usage — follow the file's own register when in doubt):
- zh-TW: audit = 稽核, reviewer = 審查員. New headings: `## 安裝`, `## 以純腳本執行`, `## 在 CI 自動化`.
- zh-CN: audit = 审计/审查 per file's existing usage, reviewer = 审查器. New headings: `## 安装`, `## 以纯脚本运行`, `## 在 CI 中自动化`.
- ja: formal register (です/ます調) consistent with existing file. New headings: `## インストール`, `## スクリプトで実行`, `## CI で自動化`.
- ko: mind particle attachment — no space between an English/code token and its particle (e.g. `plugin이`, `skill을`). New headings: `## 설치`, `## 스크립트로 실행`, `## CI에서 자동화`.

Keep code blocks, flag tables, YAML, and install commands byte-identical to the English README (commands are never translated).

- [ ] **Step 1: Rewrite `docs/zh-TW/README.md` per the above**
- [ ] **Step 2: Rewrite `docs/zh-CN/README.md` per the above**
- [ ] **Step 3: Rewrite `docs/ja/README.md` per the above**
- [ ] **Step 4: Rewrite `docs/ko/README.md` per the above**
- [ ] **Step 5: Verify structural parity**

Run: `for f in README.md docs/zh-TW/README.md docs/zh-CN/README.md docs/ja/README.md docs/ko/README.md; do echo "== $f"; grep -c '^## ' $f; grep -n 'upkeep@upkeep\|--skill upkeep-audit\|@v2' $f | wc -l; done`
Expected: every file has the same `## ` section count (8) and contains the plugin install line, the npx skills line, and `@v2`.

- [ ] **Step 6: Commit**

```bash
git add docs/zh-TW/README.md docs/zh-CN/README.md docs/ja/README.md docs/ko/README.md
git commit -m "docs(readme): sync skill-first restructure across locales"
```

---

### Task 4: Design docs — record plugin distribution

**Files:**
- Modify: `docs/en/design.md` (§1 "Local Execution (skill / script)" + §6 structure tree)
- Modify: `docs/zh-TW/design.md`, `docs/zh-CN/design.md`, `docs/ja/design.md`, `docs/ko/design.md` (same two spots, translated per the Task 3 locale conventions)

- [ ] **Step 1: Update `docs/en/design.md` §1 Local Execution**

Append to the end of the "Local Execution (skill / script)" paragraph:

```markdown
The skill is distributed three ways, all pointing at the same directory: as a Claude Code plugin (`.claude-plugin/marketplace.json` at the repo root lists `skills/upkeep-audit/` as a single-skill plugin named `upkeep`, installed via `/plugin install upkeep@upkeep`), via `npx skills add wei18/upkeep --skill upkeep-audit` (vercel-labs/skills flat layout), or by manual copy into `~/.claude/skills/`. Distribution is packaging only — the CI workflow remains a direct pipeline entry and does not route through the skill.
```

- [ ] **Step 2: Update `docs/en/design.md` §6 structure tree**

Add two lines to the expected-structure tree (after the `.github/` block and inside the skill line respectively):

```
├── .claude-plugin/marketplace.json  # plugin marketplace catalog (plugin name: upkeep, source: ./skills/upkeep-audit)
├── skills/upkeep-audit/             # Claude Code skill: thin local-run wrapper (clones to ~/.cache/upkeep)
│   └── .claude-plugin/plugin.json   # plugin manifest (single-skill layout; SKILL.md at plugin root)
```

- [ ] **Step 3: Apply the same two edits to the 4 locale design docs**

Translate the new prose; keep paths, JSON filenames, and commands byte-identical. Reuse each file's existing terminology for "skill", "plugin", "pipeline".

- [ ] **Step 4: Verify**

Run: `grep -l 'marketplace.json' docs/en/design.md docs/zh-TW/design.md docs/zh-CN/design.md docs/ja/design.md docs/ko/design.md | wc -l`
Expected: `5`

- [ ] **Step 5: Commit**

```bash
git add docs/en/design.md docs/zh-TW/design.md docs/zh-CN/design.md docs/ja/design.md docs/ko/design.md
git commit -m "docs(design): document plugin distribution across locales"
```

---

### Task 5: Ship v2

**Files:** none (git/GitHub operations)

- [ ] **Step 1: Push main**

```bash
git push origin main
```

- [ ] **Step 2: Tag v2 and release**

`v1` is NOT moved — it freezes at its current commit permanently. Only create v2:

```bash
git tag -a v2 -m "Upkeep v2 — now a Claude Code plugin"
git push origin v2
gh release create v2 --title "Upkeep v2 — now a Claude Code plugin" --notes "Upkeep is now installable as a Claude Code plugin (\`/plugin marketplace add wei18/upkeep\` + \`/plugin install upkeep@upkeep\`) or via \`npx skills add wei18/upkeep --skill upkeep-audit\`. The GHA reusable workflow is unchanged — \`@v1\` callers keep working but \`v1\` is now frozen; switch to \`@v2\` (identical interface). From now on fixes move the \`v2\` tag only."
```

- [ ] **Step 3: Post-publish verification**

Run: `npx skills add wei18/upkeep --list`
Expected: `upkeep-audit` appears in the discovered skill list.

In a Claude Code session: `/plugin marketplace add wei18/upkeep` then `/plugin install upkeep@upkeep`; confirm `/upkeep:upkeep-audit` is listed in `/help`. (Interactive — record the result manually.)

- [ ] **Step 4: Update tag-pattern note**

The maintainer memory "after pushing fixes to main, force-move v1" is superseded: from v2 onward, force-move **v2 only**; v1 stays frozen.

---

## Self-Review Notes

- Spec coverage: §1 manifests → Task 1; §2 README en+locales → Tasks 2–3; design docs acceptance item → Task 4; §3 release/v1 freeze → Task 5; npx skills acceptance → Task 5 Step 3. Out-of-scope items (§4 awesome lists, community marketplace) intentionally absent.
- Naming consistency: marketplace `upkeep`, plugin `upkeep`, skill `upkeep-audit`, invocation `/upkeep:upkeep-audit` — consistent across Tasks 1, 2, 4, 5.
- No TS/test changes anywhere; `npm test` not required but harmless.
