---
name: code-sweep-issues
description: >-
  Do a general code-quality sweep of a repository and file the findings as
  GitHub issues with detailed problem analysis and proposed fix plans. Use when
  the user asks to "sweep the code", "find code-quality issues", "file tech-debt
  issues", "audit this repo for problems", or wants a reusable code-review-to-GitHub
  workflow. Handles error boundaries, @ts-nocheck, main-thread work, unhandled
  storage, stale-closure state, duplicate models, and missing CI gates.
---

# Code Sweep → GitHub Issues

Run a **general code-quality sweep** of the current repository and **file the findings as
GitHub issues**, each with a detailed Problem / Proposed Fix / Verification / Files / Severity
structure. Designed to be reusable across many repos.

## When to use
- "sweep the code for issues", "find tech-debt", "file code-quality issues on GitHub"
- "audit this repo", "review for shortcomings", after a large port/refactor

## Step 1: Orient
1. Read `README.md`, `CLAUDE.md` (or `AGENTS.md` / `.clinerules/`), `package.json`
   (or `Cargo.toml` / `pyproject.toml`), and build config (`tsconfig*.json`, CI yaml)
   to learn the stack, entry points, and any documented known-issues.
2. List the top-level `src/` (or equivalent) tree to see structure.

## Step 2: Pattern sweep
Run `search_files` (regex) across the source tree for each pattern in
[docs/code-sweep-patterns.md](docs/code-sweep-patterns.md). For every hit, open the
surrounding context with `read_file` to confirm it is a real shortcoming, not a false positive.

Core checks (extend as needed):
- **No error boundary**: `ErrorBoundary|componentDidCatch|errorBoundary`
- **Type-checking disabled on critical files**: `//\s*@ts-nocheck|ts-nocheck` (flag if on large/central files)
- **Main-thread blocking work**: `getImageData|for\s*\(.*\.data|new\s+Worker` + `setTimeout(()=>{...for` wrappers
- **Unhandled storage writes**: `localStorage\.setItem|setItem\(` with no `try/catch` nearby
- **Stale-closure setState**: inside `setState(prev => {`, a `while (... < closureVar.length)` referencing a closure var instead of `prev`
- **Duplicate / parallel models**: two conversion or state modules doing the same job, or inline copies of a `lib/` helper
- **Missing CI gates**: no dead-code (`ts-prune`/`knip`), lint, or full type-check in CI/scripts

Also use judgment: monolith files, hardcoded secrets, missing input validation, no tests for critical paths.

## Step 3: Draft issues
For each confirmed finding, write
`.code-sweep/drafts/issue-NN-title-slug.md` with this structure:

```markdown
# <Concise, specific title>

## Problem
<what's wrong, grounded in specific file:line references and code excerpts>

## Proposed Fix
<concrete plan: which file, what change, any new module/test>

## Verification
<how to confirm the fix: unit test, manual repro, CI check>

## Files
- `path/to/file.ts` (line range)

## Severity
<High|Medium|Low>: <one-line rationale>
```

Title each issue concisely and specifically (not "bug in x"). The `## Severity` line drives
label mapping in the filing step.

## Step 4: File (only after the user reviews the drafts)
Run the bundled helper (resolves the repo from `git remote`, creates a `tech-debt` label if
missing, maps severity→label, verifies each create):

```powershell
pwsh -Command "& 'scripts/file-sweep-issues.ps1' -Repo <owner/name> -ExtraLabel tech-debt"
# dry run (no GitHub writes), run this first:
pwsh -Command "& 'scripts/file-sweep-issues.ps1' -WhatIf"
```

The helper lives at [scripts/file-sweep-issues.ps1](scripts/file-sweep-issues.ps1). It reads
every `*.md` in `.code-sweep/drafts/`, uses the first `# H1` as the issue title, and maps:
`High`→`bug`, `Medium`→`priority`, `Low`→`enhancement`, plus the `ExtraLabel`.

## Guardrails
- Never invent findings you can't cite with a file:line.
- Do NOT modify application code: this skill only reads + files issues/drafts.
- If `gh` is not authenticated, stop after drafting and tell the user to run `gh auth login`.
- Prefer a `-WhatIf` / draft review pass before filing.

## Files in this skill
- `scripts/file-sweep-issues.ps1`: batch-files drafts as GitHub issues (Windows PowerShell)
- `docs/code-sweep-patterns.md`: the extendable regex pattern checklist