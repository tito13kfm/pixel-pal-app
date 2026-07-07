# SP2 Phase D Slice 2: HeaderControls Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the fixed title/controls header block (`App.tsx:3187-3313`,
guides button, title, CRT toggle, theme selector, CVD selector) into a new
typed component, `src/components/panels/HeaderControls.tsx`, with zero
behavior change.

**Architecture:** Mechanical JSX extraction, not a rewrite. The block's JSX is
moved verbatim into a new file wrapped in a typed, props-only React
component (same convention as `InputPanel.tsx` and the 7 other Tier C
panels). App.tsx keeps all the state/hooks the block used (they come from the
existing `useDisplaySettings()` and `useTour()` Tier B hooks, shared with
other parts of App.tsx); it only stops rendering the JSX inline and instead
renders `<HeaderControls ...7 props.../>`.

**Tech Stack:** React 19, TypeScript, Tailwind v3 (className strings, no
plugin), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-07-07-sp2-phase-d-slice-2-header-controls-design.md`

## Global Constraints

- `App.tsx` keeps `// @ts-nocheck`. Do not remove it. New file
  (`HeaderControls.tsx`) is fully typed, no `@ts-nocheck`.
- Built-in `Read` and `Edit` tools are hard-blocked on `src/**/*.ts(x)` by a
  project hook (Serena enforcement). Use Serena (`get_symbols_overview`,
  `find_symbol`, `replace_content`, `insert_before_symbol`,
  `insert_after_symbol`) for all `src/` code edits. `Grep`/`Glob` are allowed
  for locating text, and are also the only way to view exact source text in
  `App.tsx` given the Read block (see Task 1 Step 1 for the exact technique).
- No em or en dashes anywhere you write prose: commit messages, doc edits,
  code comments. Use commas, periods, colons, or parentheses instead. A
  pre-commit hook rejects commits containing them.
- Shell: PowerShell preferred on this Windows host. Plain `git`/`npm`
  commands shown below work in either PowerShell or the Bash tool.
- A pre-commit hook refuses commits directly on `master`. Branch
  `sp2-phase-d-slice-2-header-controls` already exists and is checked out
  (created when the design spec was committed); work continues on it, no new
  branch needed.
- Do not touch the CVD SVG `<defs>` block (`App.tsx:3315-3346`) or the CRT
  scanline background overlay (`App.tsx:3165-3180`), and do not touch
  `InputPanel`'s call site (`App.tsx:3356` onward). Those are siblings of
  this block, out of scope per the spec.
- `docs/ARCHITECTURE.md` File Map must be updated in the same change that
  moves JSX out of `App.tsx` (project convention, see the other 8 panel
  entries already there).
- Verification is DOM-invariance, not new-logic TDD: no unit tests are
  written for this component (it's a small presentational shell moving
  existing markup, see spec's Verification section for why). The gates are
  `npm run build`, `npm run test:e2e`, `npm run deadcode`, and a manual
  eyeball. Local `vitest`/build green does not substitute for CI e2e green
  before merge.
- `__APP_VERSION__` and `__BUILD_DATE__` are Vite `define` globals
  (`vite.config.ts:14-15`). They have no ambient type declaration anywhere
  today; `App.tsx` never hit this because it's `@ts-nocheck`. The new fully
  typed `HeaderControls.tsx` WILL hit a `Cannot find name` error on them
  unless an ambient declaration is added. Task 1 Step 4 adds it to
  `src/vite-env.d.ts`, the project's existing home for ambient global types.

---

### Task 1: Create `HeaderControls.tsx`

**Files:**
- Create: `src/components/panels/HeaderControls.tsx`
- Modify: `src/vite-env.d.ts` (ambient declarations for `__APP_VERSION__`,
  `__BUILD_DATE__`, needed because the new file is fully typed)

**Interfaces:**
- Consumes: `useTheme()` from `../../contexts` (already exists, destructures
  `t`). `IS_WEB` from `../../lib/env` (already exists). `DesktopAppLink` from
  `../DesktopAppLink` (already exists).
- Produces: `export function HeaderControls(props: HeaderControlsProps)`,
  consumed by Task 2's edit to `App.tsx`. Prop list below is exact and final,
  both tasks must match it verbatim.

- [ ] **Step 1: Retrieve the exact source block from `App.tsx`**

`Read` is blocked on `src/**.tsx`. Use this exact command, which pages through
every line in range 3187 to 3313 (inclusive, 127 lines) using a
match-everything pattern, and redirect the persisted-output file (NOT a
`src/*.tsx` path, so `Read` works on it) back through `Read` to get the
untruncated text:

```
Grep(pattern=".?", path="src/App.tsx", output_mode="content", -n=true, offset=3186, head_limit=127)
```

Then `Read` the tool result's persisted-output file path (the tool result
tells you the path; it lives under the session's `tool-results` directory,
not under `src/`). This gives you the verbatim, untruncated text of
`App.tsx:3187-3313`. Do not alter a single character of this block when you
paste it into the new file in Step 3, it is a straight copy.

- [ ] **Step 2: Confirm nothing outside 3187-3313 leaked in**

The retrieved block must start with:
```
<div className="text-center mb-6 relative">
```
and end with its matching closing `</div>` at line 3313. The next line
(3315) is a comment starting `{/* SVG filter definitions for colorblind
simulation` and must NOT be included. The previous lines (3182-3186, the
`max-w-5xl` wrapper, `BaseColorDock`, `V2EngineNotice`) must NOT be included
either. If the range is off, re-run Step 1 with an adjusted `offset`/
`head_limit` until it matches exactly.

- [ ] **Step 3: Write the new file**

Create `src/components/panels/HeaderControls.tsx` with this structure. The
`{/* PASTE_HERE */}` marker is the ONLY placeholder in this plan, and it
exists only because the JSX body is 127 lines of markup fetched in Step 1,
not because the surrounding code is incomplete, everything else in this file
is final, real code:

```tsx
import { Monitor, MonitorOff, Moon, Contrast, Sun, Eye } from 'lucide-react';
import { useTheme } from '../../contexts';
import { IS_WEB } from '../../lib/env';
import { DesktopAppLink } from '../DesktopAppLink';

interface HeaderControlsProps {
  setLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  theme: string;
  setTheme: (theme: string) => void;
  crtEnabled: boolean;
  setCrtEnabled: (enabled: boolean) => void;
  cvdMode: string;
  setCvdMode: (mode: string) => void;
}

export function HeaderControls(props: HeaderControlsProps) {
  const {
    setLauncherOpen, theme, setTheme, crtEnabled, setCrtEnabled, cvdMode, setCvdMode,
  } = props;
  const { t } = useTheme();

  return (
    {/* PASTE_HERE: the exact, unmodified JSX retrieved in Step 1
        (App.tsx:3187-3313). It already references every identifier
        destructured above by the same name, no renaming needed. */}
  );
}
```

- [ ] **Step 4: Add ambient declarations for the two Vite globals**

Use Serena's `find_symbol` on `src/vite-env.d.ts` to locate the
`ImportMetaEnv` interface (top of file), then `insert_before_symbol` to add,
directly above it:

```ts
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
```

This is required because `HeaderControls.tsx` (unlike `App.tsx`) has no
`@ts-nocheck` and references both globals directly (they come from the pasted
block in Step 3). Without this, Step 5's build fails with `Cannot find name
'__APP_VERSION__'`.

- [ ] **Step 5: Run the build to typecheck the new file**

```bash
npm run build
```

Expected: PASS. If it fails, the errors will point at `HeaderControls.tsx`
(the file isn't imported anywhere yet, so App.tsx's own pre-existing
`@ts-nocheck`-suppressed issues are irrelevant here). A `Cannot find name
__APP_VERSION__` or `__BUILD_DATE__` error means Step 4 was skipped or the
declaration file wasn't picked up, check `tsconfig.json`'s `include` covers
`src/vite-env.d.ts` (it already does for every other file in `src/`, no
change needed there).

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/HeaderControls.tsx src/vite-env.d.ts
git commit -m "refactor: create HeaderControls.tsx (SP2 phase d slice 2, not yet wired)"
```

---

### Task 2: Wire `HeaderControls` into `App.tsx`, remove the old inline JSX

**Files:**
- Modify: `src/App.tsx:3187-3313` (delete), plus one import line near the
  other panel imports, plus one new `<HeaderControls .../>` call site
- Modify: `docs/ARCHITECTURE.md` (File Map, panels/ list)

**Interfaces:**
- Consumes: `HeaderControls` from `./components/panels/HeaderControls`
  (Task 1), and the exact 7-prop shape defined there.

- [ ] **Step 1: Add the import**

Use Serena to find where the other panel imports live in `App.tsx` (they'll
be grouped together near the top, e.g. `import { InputPanel } from
'./components/panels/InputPanel';`). Use `find_referencing_symbols` or
`Grep` for `from './components/panels/'` to locate the exact line, then
`insert_after_symbol` (or `replace_content` targeting that import block) to
add:

```tsx
import { HeaderControls } from './components/panels/HeaderControls';
```

- [ ] **Step 2: Replace the inline JSX with the component call**

Use Serena's `replace_content` to replace the exact text span from
`App.tsx:3187` (`<div className="text-center mb-6 relative">`) through
`App.tsx:3313` (its matching closing `</div>`) with:

```tsx
        <HeaderControls
          setLauncherOpen={setLauncherOpen}
          theme={theme} setTheme={setTheme}
          crtEnabled={crtEnabled} setCrtEnabled={setCrtEnabled}
          cvdMode={cvdMode} setCvdMode={setCvdMode}
        />
```

Every value on the right of each `=` is an existing local variable already
in scope in `App.tsx` (from the `useDisplaySettings()` and `useTour()` hook
destructures near the top of the component), none of these are new
declarations, this step only changes what renders them.

- [ ] **Step 3: Confirm no leftover references**

Grep `App.tsx` for `Open guides` (the launcher button's title text) and
`PIXEL.PAL` (the `<h1>` text): neither should match in `App.tsx` anymore
(they now live only in `HeaderControls.tsx`), EXCEPT any unrelated
occurrences elsewhere in the file that are not part of this block (check any
match's surrounding context before concluding it's a problem). Then grep
`App.tsx` for `setLauncherOpen`, `crtEnabled`, `setCrtEnabled`, `cvdMode`,
`setCvdMode` to confirm each still has exactly one declaration site (the
`useTour()`/`useDisplaySettings()` hook destructure) and is used only as a
prop value in the new call site or elsewhere it was already legitimately
used (`crtEnabled` also gates the CRT scanline background at
`App.tsx:3165`, and `launcherOpen`/`setLauncherOpen` are also used by the
Launcher modal render further down, both of those other usages must remain
untouched). This is the dangling-ref check `@ts-nocheck` files need since
`tsc` won't catch it (the slice 1 lesson: an orphaned `ramps` alias survived
`tsc` and was only caught by grep).

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Update ARCHITECTURE.md File Map**

Use Serena/`Grep` to find the `panels/` block in `docs/ARCHITECTURE.md`
(currently lists `InputPanel.tsx` and the other 7 panels). Add a new entry in
the same style, for example:

```
      HeaderControls.tsx  props-only (7 props: launcher/theme/CRT/CVD state
                        and setters); reads ThemeContext for t; renders the
                        title, CRT toggle, theme selector, CVD selector
```

- [ ] **Step 6: Run the unit suite**

```bash
npm test
```

Expected: PASS (no existing unit test targets this JSX directly, this just
confirms nothing else broke).

- [ ] **Step 7: Run e2e (desktop)**

```bash
npm run test:e2e
```

Expected: PASS. If any selector targeting the theme buttons, CVD buttons, or
CRT toggle fails to resolve, the markup did not survive the copy verbatim, go
back to Task 1 Step 1 and re-diff against the original text.

- [ ] **Step 8: Deadcode check**

```bash
npm run deadcode
```

Expected: no new orphaned exports reported for symbols this task touched.

- [ ] **Step 9: Manual eyeball**

```bash
npm run tauri:dev
```

Exercise: open the guides launcher (`?` button), toggle CRT on/off and
confirm the scanline overlay still responds, switch theme (dark/neutral/
light) and confirm the whole app re-themes, switch CVD mode
(none/protan/deutan/tritan) and confirm the page tints accordingly. Confirm
no visual or behavioral difference from before this change.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx docs/ARCHITECTURE.md
git commit -m "refactor: wire HeaderControls into App.tsx JSX trunk (SP2 phase d slice 2)"
```

---

## Self-Review Notes

**Spec coverage:** Scope (extract 3187-3313, exclude CVD defs/CRT overlay/
InputPanel call site) covered by Task 2 Step 2's exact replacement span.
Flat-props-plus-ThemeContext design covered by Task 1 Step 3. Non-prop
module imports (`IS_WEB`, icons, `DesktopAppLink`) covered by Task 1 Step 3's
import block. Verification (build, e2e, deadcode, ARCHITECTURE.md sync, no
unit tests) covered by Task 2 Steps 4, 6-8, 5. DOM-invariance (manual
eyeball) covered by Task 2 Step 9.

**Placeholder scan:** One placeholder remains by design and is called out
explicitly, the pasted JSX body in Task 1 Step 3, because it is 127 lines
fetched live from the current file rather than retyped into this plan
(retyping risks transcription drift that only the source file itself
avoids). Every other line in both tasks is complete, real code or a real
command with a real expected result.

**Type consistency:** The 7-prop interface in Task 1 Step 3 and the 7-prop
call site in Task 2 Step 2 use identical names throughout, cross-checked
prop by prop while writing this plan. The `__APP_VERSION__`/`__BUILD_DATE__`
ambient-declaration gap (not present in the spec, discovered while writing
this plan because the spec did not need to consider typechecking
implications) is handled entirely within Task 1 (Steps 4-5), so Task 2 has
no dependency on it beyond the build passing.
