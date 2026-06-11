# Normalize `src/` Line Endings to LF (strip BOM) — Implementation Plan

> **For agentic workers (Sonnet+medium is the intended executor):** Execute this
> plan top to bottom. Every step has an explicit command and a verification gate.
> Do NOT improvise around a blocked tool — read the **Guardrails** section first;
> it tells you which tools to use and why. Steps use checkbox (`- [ ]`) syntax.
> If any verification gate fails, STOP and report — do not "fix forward" by
> guessing.

## Goal

Make every source file under `src/` use **LF line endings and no UTF-8 BOM**, so
regex/anchor-based edit tools (Serena `replace_content`, `sed`) and Linux CI all
see consistent bytes. This removes the encoding trap that made large-block edits
to `App.tsx` fragile (anchor matches failing on CRLF + BOM, forcing Python
line-range patching). Lock it in via `.gitattributes` so it can't regress.

## Scope (verified 2026-06-10 on master `4edb942`)

- **78 tracked files:** `src/**/*.ts` (49), `src/**/*.tsx` (27), `src/**/*.css` (2).
- Current state: **all 78 are uniformly CRLF.** Two carry a UTF-8 BOM:
  `src/App.tsx` and `src/types/electron-api.d.ts`.
- **Out of scope:** `tests/`, `playwright*.config.ts`, root configs, docs. (They
  are also CRLF, but the user scoped this to `src/`. A follow-up can extend it.)
- This is **NOT a release.** Do not bump any version file. Do not tag.

## Guardrails (read before editing)

- **Branch first.** Never commit on `master`. A local pre-commit hook hard-blocks
  master commits. Create the branch in Step 1 before touching anything.
- **The Serena PreToolUse hook hard-blocks the built-in `Edit` and `Read` tools on
  `src/**/*.ts(x)`.** This plan does NOT use `Edit`/`Read` on src files. The byte
  conversion is done with **PowerShell .NET file I/O** (`[System.IO.File]`), which
  is a Bash/PowerShell file write, NOT the `Edit` tool — it is allowed and is the
  correct tool for a whole-file EOL/BOM rewrite. Serena `replace_content` cannot do
  a whole-file EOL swap; do not attempt it. For verification, `git`, `Grep`, and
  byte inspection are allowed.
- **`App.tsx` and `color.ts` carry `// @ts-nocheck`.** This change touches only
  line-ending bytes + the leading BOM. It must NOT alter any visible character,
  token, or the `@ts-nocheck` pragma text itself. Verify the diff is EOL/BOM-only
  (Step 5).
- **Evidence before claims.** Do not report a step "done" until its verification
  command has been run and its output confirms success. Local `npm test` green is
  NOT CI green — the PR's CI run is the real cross-platform gate (Step 8).

---

## Task 1: Branch off master

- [ ] **Step 1.1** Confirm clean-ish tree and branch from master:
```powershell
git fetch origin
git switch master
git pull --ff-only
git switch -c chore/normalize-src-eol-lf
```
Expected: now on `chore/normalize-src-eol-lf`, based on latest master.
(Untracked `src/App.tsx.bak*` / `.stripped` may exist from prior work — ignore
them; they are not tracked and Step 7 will not stage them. Optionally
`Remove-Item src/App.tsx.bak,src/App.tsx.bak2,src/App.tsx.stripped -ErrorAction SilentlyContinue`.)

---

## Task 2: Add the EOL guards (`.gitattributes` + `.editorconfig`)

- [ ] **Step 2.1** Append to `.gitattributes` (create if absent; KEEP the existing
`*.snap` and `.githooks/**` rules):
```
# Source files: pin LF so regex/anchor edit tools (Serena replace_content, sed)
# and Linux CI see byte-identical endings. Same LF-for-tool-compat rationale as
# the *.snap and .githooks rules above. eol=lf overrides core.autocrlf=true, so
# even the Windows working tree gets LF on checkout.
/src/**/*.ts   text eol=lf
/src/**/*.tsx  text eol=lf
/src/**/*.css  text eol=lf
/src/*.ts      text eol=lf
/src/*.tsx     text eol=lf
/src/*.css     text eol=lf
```

- [ ] **Step 2.2** Create `.editorconfig` at repo root (prevents editors from
re-saving CRLF in src):
```ini
root = true

[src/**]
end_of_line = lf
charset = utf-8
insert_final_newline = true
```
(These two files are NOT under `src/`, so the built-in `Edit`/`Write` tools are
allowed here.)

---

## Task 3: Convert the bytes (CRLF→LF, strip BOM)

- [ ] **Step 3.1** Run this PowerShell. It strips a leading UTF-8 BOM, converts
CRLF and stray lone-CR to LF, and rewrites each file as UTF-8 **without** BOM:
```powershell
$files = git ls-files src/ | Where-Object { $_ -match '\.(ts|tsx|css)$' }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$changed = 0
foreach ($f in $files) {
  $full  = Join-Path (Get-Location) $f
  $bytes = [System.IO.File]::ReadAllBytes($full)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $bytes = $bytes[3..($bytes.Length - 1)]   # drop BOM
  }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $text = $text -replace "`r`n", "`n"          # CRLF -> LF
  $text = $text -replace "`r", "`n"            # lone CR -> LF (defensive)
  [System.IO.File]::WriteAllText($full, $text, $utf8NoBom)
  $changed++
}
Write-Host "Rewrote $changed files"
```
Expected: `Rewrote 78 files`.

---

## Task 4: Verify the conversion (before staging)

- [ ] **Step 4.1** Zero CR bytes remain in any src file:
```bash
git ls-files src/ | grep -E '\.(ts|tsx|css)$' | xargs grep -lU $'\r'
```
Expected: **no output** (no file still contains a CR).

- [ ] **Step 4.2** BOM gone from the two known files:
```bash
head -c3 src/App.tsx | xxd
head -c3 src/types/electron-api.d.ts | xxd
```
Expected: first 3 bytes are NOT `efbbbf` (should be `2f2f20` = `// ` for App.tsx).

- [ ] **Step 4.3** Confirm the change is EOL/BOM-only, not content. Pick a file and
diff ignoring whitespace/EOL — it must show ZERO content changes:
```bash
git diff --ignore-cr-at-eol -- src/App.tsx | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | head
```
Expected: **no output** (the only difference is line endings + the stripped BOM,
which `--ignore-cr-at-eol` and the no-content-change confirm).

---

## Task 5: Stage with renormalize + sanity-check diffstat

- [ ] **Step 5.1**
```powershell
git add --renormalize .
git status --short
git diff --cached --stat | Select-Object -Last 5
```
Expected: `.gitattributes`, `.editorconfig`, and ~78 `src/` files staged. The
diffstat will look huge (every line "changed") — that is expected for an EOL
normalization and is fine.

---

## Task 6: Build + test gate (local)

- [ ] **Step 6.1** Type + build:
```powershell
npm run build
```
Expected: `tsc --noEmit` passes and `vite build` succeeds (no new errors —
this change cannot introduce type errors, only EOL/BOM differ).

- [ ] **Step 6.2** Unit tests, with attention to export formats:
```powershell
npm test
```
Expected: all green. **Watch item:** export-format tests (gpl/pal/ase/txt/png-strip).
If one fails on `\r\n` vs `\n` in emitted output, that's the template-literal risk
from the plan's pitfalls — STOP and report; do NOT weaken the assertion. The fix
(if it happens) is to make that formatter use an explicit `\r\n` escape, as a
separate, flagged change.

---

## Task 7: Commit + record blame-ignore

- [ ] **Step 7.1** Commit the normalization (no AI attribution in the message):
```powershell
git commit -m @'
chore: normalize src/ line endings to LF and strip BOM

Pin src/**/*.{ts,tsx,css} to eol=lf via .gitattributes + .editorconfig so
regex/anchor edit tools (Serena replace_content, sed) and Linux CI see
consistent bytes. EOL/BOM-only change; no source content modified.
'@
```

- [ ] **Step 7.2** Capture the SHA and register it so `git blame` skips this
mass-reformat commit:
```powershell
$sha = git rev-parse HEAD
Set-Content -Path .git-blame-ignore-revs -Value "# Line-ending normalization (src/ -> LF); not a logical change`n$sha" -Encoding utf8 -NoNewline
git config blame.ignoreRevsFile .git-blame-ignore-revs
git add .git-blame-ignore-revs
git commit -m "chore: ignore src EOL-normalization commit in git blame"
```

- [ ] **Step 7.3** (Optional, repo hygiene) Add a `## [Unreleased]` → `### Changed`
note in `CHANGELOG.md`: "Normalized `src/` line endings to LF (no behavior change)."
Commit separately. This is NOT a release — do not bump versions.

---

## Task 8: Push + PR (CI is the real gate)

- [ ] **Step 8.1**
```powershell
git push -u origin chore/normalize-src-eol-lf
gh pr create --fill --base master
```

- [ ] **Step 8.2** Wait for CI. The cross-platform build (ubuntu/windows/macos) +
any e2e are the real verification — local green is not enough. Do NOT merge until
all checks pass. Report the PR number and CI status.

---

## Rollback

If anything looks wrong before merge: `git switch master` then delete the branch
(`git branch -D chore/normalize-src-eol-lf`). Nothing is touched on master until
the PR merges. The `.bak`/`.stripped` untracked files are unrelated and untouched.

## Known pitfalls (already accounted for above)

- **Blame pollution** → handled by `.git-blame-ignore-revs` (Step 7.2).
- **Open-branch conflicts** → only `feat/tier-c-ramps-panel` (shelved/draft) is
  open; it will EOL-conflict with a normalized master. It is being re-done, so
  ignore; if ever rebased, use `git rebase -Xrenormalize`.
- **Template-literal export output** → the only behavior-capable risk; gated by
  Step 6.2 export tests + Step 8 CI.
