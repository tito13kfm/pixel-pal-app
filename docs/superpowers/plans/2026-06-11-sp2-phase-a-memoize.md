# SP2 Phase a (memoize History + Playground) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline,
> batch with checkpoints) or superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memo the two already-stable panels (`HistoryPanel`, `PlaygroundPanel`) so an
unrelated state change stops re-rendering them, and land two durable pieces of
infrastructure — a render-count test harness and a blocking `react-hooks` lint gate —
that every later SP2 phase reuses. **Zero `useCallback`, zero behavior change.**

**Architecture:** A no-op-in-prod `recordRender(name)` counter lets a test mount the
real `<App>`, fire a real interaction, and assert which panels re-rendered. Each target
panel calls `recordRender` as its first body line and is wrapped in `React.memo`. A
scoped ESLint config (`eslint.hooks.config.js`) runs only the `react-hooks` rules at
`error`; the 19 pre-existing `exhaustive-deps` warnings are grandfathered inline so CI
can gate at `--max-warnings 0` with no drifting baseline number.

**Tech Stack:** React 19, TypeScript 6 (`@ts-nocheck` in App.tsx — unchanged), Vitest +
@testing-library/react (jsdom), ESLint flat config + eslint-plugin-react-hooks v7.

**Spec:** `docs/superpowers/specs/2026-06-11-sp2-phase-a-memoize-design.md`

---

## READ FIRST — execution rules (the HOW)

These are repo guardrails. Violating them wastes a session.

1. **Recommended gear:** Sonnet 4.6 + medium. This plan is fully specified and mechanical
   — the hard thinking is done. (User drives `/model`.)
2. **Branch:** `sp2-phase-a-memoize` **already exists** and holds the 4 spec commits. Do
   ALL work on it. Do NOT branch off master. Do NOT commit on master (a pre-commit hook
   blocks it).
3. **Editing `src/**/*.ts(x)` — use Serena, not built-in Edit.** A PreToolUse hook
   **hard-blocks** the built-in Edit tool on `src/**/*.ts(x)`. Use Serena
   `replace_content` (regex, for a few lines) / `replace_symbol_body`. The built-in
   **Read is also blocked** on those files — use Serena `find_symbol` / `get_symbols_overview`,
   or `sed -n` via Bash for raw line ranges.
   - **New** `src/` files (e.g. `src/lib/renderCount.ts`): create with the **Write** tool
     (the hook blocks Edit, not Write). Test files under `tests/` are not `src/` — Edit/Write
     both fine.
   - Non-`src` files (`vitest.config.ts`, `package.json`, `eslint.hooks.config.js`,
     `.github/workflows/ci.yml`, `docs/`): built-in Edit/Write are fine.
4. **`@ts-nocheck` stays** in App.tsx and color.ts. This phase removes no code, so there are
   no dangling-ref risks, but never strip the directive.
5. **Gates before PR:** `npm run build` (tsc + vite) · `npm test` · `npm run lint:hooks`
   (new) · `npm run deadcode`. e2e runs in CI. All green before merge.
6. **Receipts:** terse. After each task, report status + commit SHA + the one gate result
   that matters. No prose.
7. **Advisor** at the two gates only (before committing to the approach — already done at
   plan time — and before declaring the PR done). Do not call reactively.

---

## File map

| File | New? | Edit tool | Responsibility |
|---|---|---|---|
| `src/lib/renderCount.ts` | new | Write | Test-only render counter; no-op in prod |
| `vitest.config.ts` | edit | Edit | `define` the `__APP_VERSION__`/`__BUILD_DATE__` globals |
| `eslint.hooks.config.js` | new | Write | Scoped flat config: only `react-hooks` rules, `error` |
| `package.json` | edit | Edit | `lint:hooks` script |
| `.github/workflows/ci.yml` | edit | Edit | Blocking `lint:hooks` CI step |
| `src/App.tsx` | edit | **Serena** | 14 inline `eslint-disable` grandfather comments |
| `src/components/AdjacencyMatrix.tsx`, `CrossRampDither.tsx`, `DitherBlend.tsx` | edit | **Serena** | 1 grandfather comment each |
| `src/hooks/useHistory.ts` | edit | **Serena** | 1 grandfather comment |
| `src/components/panels/HistoryPanel.tsx` | edit | **Serena** | instrument + `React.memo` |
| `src/components/panels/PlaygroundPanel.tsx` | edit | **Serena** | instrument + `React.memo` |
| `tests/unit/render-isolation.spec.tsx` | new | Write | render-count tests (the proof) |
| `docs/ARCHITECTURE.md` | edit | Edit | note the two memo boundaries |

---

## Task 1: Render-count harness

**Files:**
- Create: `src/lib/renderCount.ts`
- Test: `tests/unit/render-count-harness.spec.ts`

- [ ] **Step 1: Create the counter module (Write)**

`src/lib/renderCount.ts`:

```ts
// Test-only render instrumentation for SP2 perf work. A memo'd panel calls
// recordRender('PanelName') as its first body statement. The counter only ticks
// after a test calls enableRenderCounts(); in production `enabled` stays false so
// recordRender is a single boolean check with no allocation — zero runtime cost,
// no visual or behavior change.
const counts = new Map<string, number>();
let enabled = false;

export function enableRenderCounts(): void {
  enabled = true;
  counts.clear();
}

export function disableRenderCounts(): void {
  enabled = false;
  counts.clear();
}

export function resetRenderCounts(): void {
  counts.clear();
}

export function getRenderCount(name: string): number {
  return counts.get(name) ?? 0;
}

export function recordRender(name: string): void {
  if (enabled) counts.set(name, (counts.get(name) ?? 0) + 1);
}
```

- [ ] **Step 2: Write the harness unit test (Write)**

`tests/unit/render-count-harness.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enableRenderCounts, disableRenderCounts, resetRenderCounts,
  getRenderCount, recordRender,
} from '../../src/lib/renderCount';

describe('renderCount harness', () => {
  beforeEach(() => disableRenderCounts());

  it('is a no-op until enabled', () => {
    recordRender('X');
    expect(getRenderCount('X')).toBe(0);
  });

  it('counts after enable and resets on reset', () => {
    enableRenderCounts();
    recordRender('X');
    recordRender('X');
    expect(getRenderCount('X')).toBe(2);
    resetRenderCounts();
    expect(getRenderCount('X')).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/unit/render-count-harness.spec.ts`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/renderCount.ts tests/unit/render-count-harness.spec.ts
git commit -m "feat(perf): add test-only render-count harness"
```

---

## Task 2: vitest define globals + App-mount smoke

App.tsx references the Vite `define` globals `__APP_VERSION__` / `__BUILD_DATE__`, which
are absent under vitest. Stub them so the real `<App>` mounts (spike-confirmed it does).

**Files:**
- Modify: `vitest.config.ts`
- Test: `tests/unit/app-mount-smoke.spec.tsx`

- [ ] **Step 1: Add `define` to vitest config (Edit)**

In `vitest.config.ts`, change:

```ts
export default defineConfig({
  test: {
```

to:

```ts
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_DATE__: JSON.stringify('test'),
  },
  test: {
```

- [ ] **Step 2: Write the smoke test (Write)**

`tests/unit/app-mount-smoke.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from '../../src/App';

// Guards the render-count harness foundation: the real App must mount in jsdom.
describe('App mounts in jsdom', () => {
  it('renders without throwing', () => {
    const { container } = render(<App />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the smoke test**

Run: `npx vitest run tests/unit/app-mount-smoke.spec.tsx`
Expected: 1 passed. (jsdom logs `Not implemented: HTMLCanvasElement.prototype.getContext`
— that is expected noise, not a failure.)

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/unit/app-mount-smoke.spec.tsx
git commit -m "test: stub Vite define globals so App mounts under vitest"
```

---

## Task 3: Scoped `react-hooks` lint gate + grandfather the backlog + CI

Goal: a blocking gate that fails CI on any *new* `react-hooks` violation, without being
blocked by the 19 pre-existing ones. Set the rules to `error`, grandfather the 19 sites
inline, gate at `--max-warnings 0`.

**Files:**
- Create: `eslint.hooks.config.js`
- Modify: `package.json`, `.github/workflows/ci.yml`
- Modify (Serena): the 5 files holding the 19 warnings

- [ ] **Step 1: Create the scoped config (Write)**

`eslint.hooks.config.js`:

```js
// Scoped ESLint config for the SP2 react-hooks dep-array gate ONLY.
// Deliberately does NOT extend js/tseslint recommended — we do not want the legacy
// lint backlog here, only exhaustive-deps + rules-of-hooks as a blocking gate.
// Run via `npm run lint:hooks`. New violations are errors; the 19 pre-existing
// sites are grandfathered with inline `// eslint-disable-next-line` comments tagged
// `TODO(sp2-d)`, deleted in phase d as the @ts-nocheck backlog is cleared.
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
])
```

- [ ] **Step 2: Add the `lint:hooks` script (Edit `package.json`)**

Change:

```json
    "deadcode": "ts-prune",
```

to:

```json
    "deadcode": "ts-prune",
    "lint:hooks": "eslint --config eslint.hooks.config.js \"src/**/*.{ts,tsx}\" --max-warnings 0",
```

- [ ] **Step 3: See the backlog (it must fail first)**

Run: `npm run lint:hooks`
Expected: FAIL — 19 `react-hooks/exhaustive-deps` errors: 14 in `src/App.tsx`, 1 each in
`src/components/AdjacencyMatrix.tsx`, `src/components/CrossRampDither.tsx`,
`src/components/DitherBlend.tsx`, `src/hooks/useHistory.ts`. **Note the exact line of each
error from the output — do not guess line numbers.**

- [ ] **Step 4: Grandfather each site (Serena `replace_content`, per file)**

For **each** flagged line, insert the comment on the line immediately above it. The flagged
line is a `useEffect`/`useMemo`/`useCallback` dependency-array call — anchor on its opening,
e.g. for a hit reported on a `useMemo(() => {` line, replace that exact line with:

```
  // eslint-disable-next-line react-hooks/exhaustive-deps  // TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  <the original line, unchanged>
```

Process files in this order, re-running `npm run lint:hooks` after each file to get fresh
line numbers (inserting a comment shifts every line below it):
1. `src/hooks/useHistory.ts` (1) — **typed file**: first try the real fix (add the missing
   dep the linter names) **only if** the dep is obviously safe (a stable ref/setter). If
   adding it could re-run an effect with side effects, grandfather instead.
2. `src/components/AdjacencyMatrix.tsx` (1), `CrossRampDither.tsx` (1), `DitherBlend.tsx` (1)
   — same judgment; default to grandfather.
3. `src/App.tsx` (14) — grandfather all (do not attempt fixes inside `@ts-nocheck`).

Use Serena `replace_content` (the built-in Edit is blocked on these `src` files). Re-run the
lint after each insertion or small batch to keep line numbers accurate.

- [ ] **Step 5: Gate is green**

Run: `npm run lint:hooks`
Expected: PASS (0 problems).

- [ ] **Step 6: Wire CI (Edit `.github/workflows/ci.yml`)**

Insert a new step immediately **after** the `Vitest unit tests` step (so `npm ci` has already
run). Find:

```yaml
      - name: Vitest unit tests
        run: npm test
```

Add directly after it:

```yaml
      - name: Lint - react hooks dep arrays
        if: matrix.platform == 'ubuntu-latest'
        run: npm run lint:hooks
```

- [ ] **Step 7: Commit**

```bash
git add eslint.hooks.config.js package.json .github/workflows/ci.yml src/App.tsx \
  src/components/AdjacencyMatrix.tsx src/components/CrossRampDither.tsx \
  src/components/DitherBlend.tsx src/hooks/useHistory.ts
git commit -m "build(lint): blocking react-hooks dep-array gate; grandfather legacy backlog"
```

---

## Task 4: Memo HistoryPanel (TDD)

`HistoryPanel` has zero props and consumes `usePalette()`. Without memo it re-renders on
*every* App re-render; with memo it re-renders only when `usePalette()` changes.

**Files:**
- Modify (Serena): `src/components/panels/HistoryPanel.tsx`
- Test: `tests/unit/render-isolation.spec.tsx` (created here, extended in Task 5)

- [ ] **Step 1: Instrument the panel (Serena, NO memo yet)**

In `src/components/panels/HistoryPanel.tsx`:

(a) After the existing import line `import { usePalette } from '../../contexts';`, add:

```ts
import { recordRender } from '../../lib/renderCount';
```

(b) Insert `recordRender('HistoryPanel');` as the first statement of the component body —
replace:

```tsx
export function HistoryPanel() {
  const { historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge } = usePalette();
```

with:

```tsx
export function HistoryPanel() {
  recordRender('HistoryPanel');
  const { historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge } = usePalette();
```

- [ ] **Step 2: Write the failing test (Write `tests/unit/render-isolation.spec.tsx`)**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import App from '../../src/App';
import {
  enableRenderCounts, disableRenderCounts, resetRenderCounts, getRenderCount,
} from '../../src/lib/renderCount';

// NOTE: do NOT wrap <App> in StrictMode here — StrictMode double-renders and would
// double the counts. RTL's render() does not add StrictMode, which is what we want.
describe('phase-a memo: panel render isolation', () => {
  beforeEach(() => disableRenderCounts());

  it('HistoryPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // History uses `{open && children}`, so expand it to mount the panel.
    fireEvent.click(screen.getByTitle('Expand the History panel (undo/redo)'));
    resetRenderCounts();
    // Orthogonal interaction: Tips toggle. `tipsOpen` is passed to no panel.
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('HistoryPanel')).toBe(0);
  });
});
```

- [ ] **Step 3: Run — expect RED**

Run: `npx vitest run tests/unit/render-isolation.spec.tsx`
Expected: FAIL — `getRenderCount('HistoryPanel')` is ≥ 1 (the un-memo'd panel re-renders
when App re-renders on the Tips toggle).

> If the title `Expand Tips` is not found, Tips defaults open — use `Collapse Tips`
> instead (check `tipsOpen`'s initial value in App.tsx). Same for the History title.

- [ ] **Step 4: Wrap in `React.memo` (Serena)**

In `src/components/panels/HistoryPanel.tsx`:

(a) Add `memo` to the React import. There is currently no `react` import line; add one at the
top of the file:

```ts
import { memo } from 'react';
```

(b) Rename the function declaration — replace `export function HistoryPanel() {` with
`function HistoryPanelImpl() {`.

(c) Append the memo'd named export at the end of the file:

```ts
export const HistoryPanel = memo(HistoryPanelImpl);
```

- [ ] **Step 5: Run — expect GREEN**

Run: `npx vitest run tests/unit/render-isolation.spec.tsx`
Expected: PASS (count 0).

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/HistoryPanel.tsx tests/unit/render-isolation.spec.tsx
git commit -m "perf(HistoryPanel): React.memo — skip re-render on orthogonal updates"
```

---

## Task 5: Memo PlaygroundPanel (TDD)

`PlaygroundPanel`'s props are all already referentially stable (setters, primitives,
`useMemo`'d ramp arrays; `isDark` is a fresh-but-primitive boolean — memo compares by
value). It is `keepMounted`, so it is mounted even when collapsed.

**Files:**
- Modify (Serena): `src/components/panels/PlaygroundPanel.tsx`
- Test: extend `tests/unit/render-isolation.spec.tsx`

- [ ] **Step 1: Instrument the panel (Serena, NO memo yet)**

In `src/components/panels/PlaygroundPanel.tsx`:

(a) After `import { useTheme } from '../../contexts';`, add:

```ts
import { recordRender } from '../../lib/renderCount';
```

(b) Insert `recordRender('PlaygroundPanel');` as the first body statement — replace:

```tsx
}: PlaygroundPanelProps) {
  const { t, sectionHeadColor } = useTheme();
```

with:

```tsx
}: PlaygroundPanelProps) {
  recordRender('PlaygroundPanel');
  const { t, sectionHeadColor } = useTheme();
```

- [ ] **Step 2: Add the failing test (Edit `tests/unit/render-isolation.spec.tsx`)**

Add this `it` block inside the existing `describe`:

```tsx
  it('PlaygroundPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // PlaygroundPanel is keepMounted, so it is already mounted — no expand needed.
    resetRenderCounts();
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('PlaygroundPanel')).toBe(0);
  });

  it('PlaygroundPanel renders at least once on mount (memo is not over-aggressive)', () => {
    enableRenderCounts();
    render(<App />);
    expect(getRenderCount('PlaygroundPanel')).toBeGreaterThan(0);
  });
```

> Stronger positive (optional): if you confirm the selector for the in-panel "Palette style"
> buttons (they call `setVizStyle`), assert the count increments after clicking a different
> style. The mount assertion above is the robust guaranteed check.

- [ ] **Step 3: Run — expect RED on the orthogonal-toggle test**

Run: `npx vitest run tests/unit/render-isolation.spec.tsx`
Expected: the orthogonal-toggle test FAILS (count ≥ 1); the mount test passes.

- [ ] **Step 4: Wrap in `React.memo` (Serena)**

In `src/components/panels/PlaygroundPanel.tsx`:

(a) Add a react import at the top of the file:

```ts
import { memo } from 'react';
```

(b) Replace `export function PlaygroundPanel({` with `function PlaygroundPanelImpl({`.

(c) Append at the end of the file:

```ts
export const PlaygroundPanel = memo(PlaygroundPanelImpl);
```

- [ ] **Step 5: Run — expect GREEN (all of render-isolation)**

Run: `npx vitest run tests/unit/render-isolation.spec.tsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/PlaygroundPanel.tsx tests/unit/render-isolation.spec.tsx
git commit -m "perf(PlaygroundPanel): React.memo — skip re-render on orthogonal updates"
```

---

## Task 6: Full gate + docs + PR

- [ ] **Step 1: Run every gate**

```bash
npm run build
npm test
npm run lint:hooks
npm run deadcode
```

Expected: build clean; all unit tests pass (incl. the 3 new spec files); `lint:hooks` 0
problems. For `deadcode` (ts-prune): `recordRender` must NOT appear (panels import it — if it
does, a panel import is missing). The four test-only exports
(`enableRenderCounts`/`disableRenderCounts`/`resetRenderCounts`/`getRenderCount`) WILL appear
as unused because ts-prune does not scan `tests/` — that is expected. Add them to the
`ignore`/skip list in `.ts-prunerc.json` (built-in Edit; not a `src` file) so the report
stays clean, or annotate them `// ts-prune-ignore-next` in `renderCount.ts` (Serena edit).

- [ ] **Step 2: Update ARCHITECTURE.md (Edit)**

In `docs/ARCHITECTURE.md`, in the relevant subsystem section (Export & visualization / the
panel/component listing), add a short note: HistoryPanel and PlaygroundPanel are now
`React.memo`-wrapped (SP2 phase a); the `src/lib/renderCount.ts` harness + `npm run lint:hooks`
gate exist for the SP2 perf work; the other panels are deferred to phase b/c. Keep it factual
and short.

- [ ] **Step 3: Commit docs**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs(architecture): note phase-a memo boundaries + render harness"
```

- [ ] **Step 4: Advisor (done gate)**

Call `advisor()` to review the branch diff before the PR. Address blocking feedback.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin sp2-phase-a-memoize
gh pr create --base master --title "perf(SP2 a): memo History+Playground + render harness + hooks-lint gate" \
  --body "SP2 phase a (clean subset). Memoizes the two already-stable panels (zero useCallback), adds the render-count test harness and a blocking react-hooks lint gate. Spec: docs/superpowers/specs/2026-06-11-sp2-phase-a-memoize-design.md"
```

- [ ] **Step 6: Watch CI, merge, clean up**

After CI is green and review approves: merge, then per the repo git-workflow (`git fetch --prune`;
delete the remote branch only if it survived auto-cleanup; `git branch -d` local).

---

## Self-review notes (plan author)

- **Spec coverage:** harness (T1–T2), lint gate + grandfather + CI (T3), memo History (T4),
  memo Playground (T5), gates + docs + PR (T6). All spec "in scope" items covered. No
  `useCallback` anywhere — matches clean-subset scope.
- **No placeholders:** every code block is complete and runnable. The only intentional
  executor-discovered values are the 19 lint line numbers (must be read from live lint output,
  not hardcoded — they shift as comments are inserted) and the optional stronger Playground
  selector.
- **Type/name consistency:** counter API (`enableRenderCounts`/`disableRenderCounts`/
  `resetRenderCounts`/`getRenderCount`/`recordRender`) identical across module, harness test,
  and both panel tests. Memo pattern (`XImpl` + `export const X = memo(XImpl)`) identical for
  both panels and preserves the existing named exports, so no consumer import changes.
- **Risk watch:** the Tips/History title strings (`Expand Tips`, `Expand the History panel
  (undo/redo)`) depend on default open/closed state — Step 3 of Tasks 4/5 notes the fallback.
