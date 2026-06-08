# App.tsx Tier C — Foundation + Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Tier C foundation (component-test harness + 4 context providers + a deduplicated `SectionCard` wrapper) and prove the panel-extraction recipe on the smallest leaf panel (History).

**Architecture:** Hybrid wiring from the spec (`docs/superpowers/specs/2026-06-08-app-tsx-tier-c-component-extraction-design.md`). App.tsx keeps all hook calls + the generate pipeline; it wraps its JSX in four context providers (split by update cadence) that re-publish existing hook values via memoized `value` objects. Extracted panels consume context instead of receiving drilled props. No hook relocation in this plan — providers only re-publish, so the gen pipeline is untouched and every step is behavior-identical.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 2 (jsdom, globals), `@testing-library/react` (added in Task 1). App.tsx carries `// @ts-nocheck`.

**Scope note:** This plan covers the foundation + the pilot panel only (Tasks 1–5). The remaining seven panels (Export, Saved, Playground, VizCompare, Harmony, Ramps, TopControls, UpdateNotification) are each a separate follow-on plan/PR, generated at the start of its own chunk-session per the `token-control-execution` memory (front-load that panel's grep investigation, pre-bake anchored edits, one PR). The recipe Task 5 establishes is reused verbatim. Their per-panel specifications are tabled at the end of this document.

---

## File Structure

**Created:**
- `tests/setup/testing-library.ts` — jest-dom matcher registration (vitest setupFile)
- `src/contexts/ThemeContext.tsx` — theme tokens `t` + theme-helper closures + display settings
- `src/contexts/LayoutContext.tsx` — section order/open flags + drag chrome (`makeSectionDragHandlers`, `dropLine`, `sectionGrip`, `sectionOrder`)
- `src/contexts/PaletteContext.tsx` — committed document state + `useHistory` values
- `src/contexts/EditorContext.tsx` — live editor state (`editingIndex`, `editorHsv`, `pinEditor`)
- `src/contexts/index.ts` — barrel: re-exports the four `useX()` hooks + `<AppProviders>`
- `src/components/SectionCard.tsx` — the one deduplicated reorderable-section wrapper
- `src/components/panels/HistoryPanel.tsx` — pilot panel
- `tests/unit/SectionCard.spec.tsx`, `tests/unit/HistoryPanel.spec.tsx`, `tests/unit/testing-library-smoke.spec.tsx`

**Modified:**
- `package.json` — add two dev deps + widen `test:unit` is already broad; widen vitest include glob
- `vitest.config.ts` — include `.spec.tsx`, register `setupFiles`
- `src/App.tsx` — wrap JSX in `<AppProviders>`; replace 7 inline section wrappers with `<SectionCard>`; replace inline History JSX with `<HistoryPanel />`

---

## Task 1: Component-test harness (closes #74)

**Files:**
- Modify: `package.json`, `vitest.config.ts`
- Create: `tests/setup/testing-library.ts`, `tests/unit/testing-library-smoke.spec.tsx`

- [ ] **Step 1: Install the two missing dev deps**

Run:
```bash
npm install -D @testing-library/react@^16 @testing-library/jest-dom@^6
```
Expected: both added to `devDependencies`; `jsdom` (^25) and `vitest` (^2.1.9) already present.

- [ ] **Step 2: Create the jest-dom setup file**

Create `tests/setup/testing-library.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Widen the vitest include glob and register the setup file**

Edit `vitest.config.ts` so `test` reads:
```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup/testing-library.ts'],
    include: ['tests/unit/**/*.spec.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
```
(Only `setupFiles` is new and `.spec.ts` → `.spec.{ts,tsx}`.)

- [ ] **Step 4: Write the smoke test**

Create `tests/unit/testing-library-smoke.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

test('renders a component and queries it', () => {
  render(<Hello name="pixel" />);
  expect(screen.getByText('Hello pixel')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run tests/unit/testing-library-smoke.spec.tsx`
Expected: 1 passed. (`toBeInTheDocument` proves jest-dom matchers are registered; `.tsx` collection proves the glob widened.)

- [ ] **Step 6: Confirm the existing suite still collects**

Run: `npm run test:unit`
Expected: all prior specs still pass; total count = previous total + 1.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup/testing-library.ts tests/unit/testing-library-smoke.spec.tsx
git commit -m "test(harness): add @testing-library/react component-test harness (#74)"
```

---

## Task 2: Context provider scaffold

The providers re-publish values App.tsx already computes. App.tsx continues to call every hook and own the generate pipeline; it passes the hook values into provider `value` props. Each `value` is `useMemo`'d so cold panels don't re-render on unrelated updates.

**Files:**
- Create: `src/contexts/ThemeContext.tsx`, `LayoutContext.tsx`, `PaletteContext.tsx`, `EditorContext.tsx`, `index.ts`
- Modify: `src/App.tsx` (wrap the top-level returned element in `<AppProviders>`; pass current values)

- [ ] **Step 1: Create `ThemeContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';

// `t` is the active theme-token object; the helpers are closures over it that
// App.tsx already defines (themedAccent/themedAccentBorder/accentGlow/
// accentTextGlow/sectionHeadColor). Typed loosely (App.tsx is @ts-nocheck and
// these are untyped color-math closures); the contract is "whatever App passes".
export interface ThemeValue {
  t: any;
  themedAccent: (hex: string) => string;
  themedAccentBorder: (hex: string) => string;
  accentGlow: (hex: string, amt: number) => string;
  accentTextGlow: (hex: string) => string;
  sectionHeadColor: (hex: string) => string;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ value, children }: { value: ThemeValue; children: ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used within AppProviders');
  return v;
}
```

- [ ] **Step 2: Create `LayoutContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface LayoutValue {
  sectionOrder: string[];
  makeSectionDragHandlers: (key: string) => Record<string, (e: any) => void>;
  dropLine: (key: string) => string | null;
  sectionGrip: (key: string) => ReactNode;
  // panel-open flags + setters are added here as panels need them
  historyOpen: boolean;
  setHistoryOpen: (f: (o: boolean) => boolean) => void;
}

const LayoutContext = createContext<LayoutValue | null>(null);

export function LayoutProvider({ value, children }: { value: LayoutValue; children: ReactNode }) {
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutValue {
  const v = useContext(LayoutContext);
  if (!v) throw new Error('useLayout must be used within AppProviders');
  return v;
}
```

- [ ] **Step 3: Create `PaletteContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';

// Committed document state + history. Grows as panels are extracted; the pilot
// only needs the history slice, so that is all that is typed non-optionally now.
export interface PaletteValue {
  historyEntries: { label: string; timestamp: number }[];
  historyIndex: number;
  jumpToHistoryIndex: (idx: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  formatHistoryAge: (timestamp: number) => string;
}

const PaletteContext = createContext<PaletteValue | null>(null);

export function PaletteProvider({ value, children }: { value: PaletteValue; children: ReactNode }) {
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette(): PaletteValue {
  const v = useContext(PaletteContext);
  if (!v) throw new Error('usePalette must be used within AppProviders');
  return v;
}
```

- [ ] **Step 4: Create `EditorContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';

// Live editor state — ticks on every HSV slider drag. Deliberately separate from
// PaletteContext so committed-state consumers (Export/Saved/TopControls) do NOT
// re-render per drag frame.
export interface EditorValue {
  editingIndex: number | null;
  editorHsv: { h: number; s: number; v: number } | null;
  pinEditor: boolean;
}

const EditorContext = createContext<EditorValue | null>(null);

export function EditorProvider({ value, children }: { value: EditorValue; children: ReactNode }) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorValue {
  const v = useContext(EditorContext);
  if (!v) throw new Error('useEditor must be used within AppProviders');
  return v;
}
```

- [ ] **Step 5: Create the barrel `src/contexts/index.ts`**

```ts
export { ThemeProvider, useTheme, type ThemeValue } from './ThemeContext';
export { LayoutProvider, useLayout, type LayoutValue } from './LayoutContext';
export { PaletteProvider, usePalette, type PaletteValue } from './PaletteContext';
export { EditorProvider, useEditor, type EditorValue } from './EditorContext';
```

- [ ] **Step 6: Wrap App.tsx's returned tree in the providers**

In `src/App.tsx`, add to the existing import block near the other `src/` imports:
```tsx
import { ThemeProvider, LayoutProvider, PaletteProvider, EditorProvider } from './contexts';
```
Find the outermost element of the main `return (` at the component's top-level render (the `return (` at the JSX root, currently ~line 4431). Wrap it. Immediately before that `return`, add memoized values:
```tsx
  const themeValue = useMemo(() => ({
    t, themedAccent, themedAccentBorder, accentGlow, accentTextGlow, sectionHeadColor,
  }), [t]);
  const layoutValue = useMemo(() => ({
    sectionOrder, makeSectionDragHandlers, dropLine, sectionGrip, historyOpen, setHistoryOpen,
  }), [sectionOrder, dragOver, draggingKey, historyOpen]);
  const paletteValue = useMemo(() => ({
    historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge,
  }), [historyEntries, historyIndex, canUndo, canRedo]);
  const editorValue = useMemo(() => ({ editingIndex, editorHsv, pinEditor }), [editingIndex, editorHsv, pinEditor]);
```
Then wrap (provider order: Theme outermost, Editor innermost):
```tsx
  return (
    <ThemeProvider value={themeValue}>
    <LayoutProvider value={layoutValue}>
    <PaletteProvider value={paletteValue}>
    <EditorProvider value={editorValue}>
      {/* ...existing root element unchanged... */}
    </EditorProvider>
    </PaletteProvider>
    </LayoutProvider>
    </ThemeProvider>
  );
```
(If `useMemo` isn't already imported from `react`, add it to the existing React import.)

> Note: closures like `makeSectionDragHandlers`/`dropLine`/`sectionGrip` are re-created each render; listing `dragOver`/`draggingKey` in `layoutValue`'s deps keeps the published value correct when a drag is in progress. This is acceptable for the layout slice (changes only during drag), and the hot path (`editorValue`) stays minimal.

- [ ] **Step 7: Type-gate (widened) + grep gate + build**

Type-gate (run from repo root):
```bash
sed -i '1{/@ts-nocheck/d}' src/App.tsx
npx tsc --noEmit 2>&1 | grep -E "App\.tsx.*error TS(2304|2322|2741|2739)" | sort > /tmp/tier-c-t2.txt
sed -i '1i // @ts-nocheck' src/App.tsx
git diff --stat src/App.tsx   # MUST show only the intended edits, not a churned line 1
cat /tmp/tier-c-t2.txt
```
Expected: no NEW `TS2304/2322/2741/2739` on App.tsx beyond the known baseline (`__APP_VERSION__`/`__BUILD_DATE__`). Restore was via `sed`, never `git checkout` (see skill-obs #11). Confirm `git diff` shows the `@ts-nocheck` line is back and unchanged.

Build:
```bash
npm run build && npm run test:unit
```
Expected: build clean, all unit tests pass. App renders identically (providers re-publish existing values; nothing consumes them yet).

- [ ] **Step 8: Commit**

```bash
git add src/contexts src/App.tsx
git commit -m "feat(tier-c): add Theme/Layout/Palette/Editor context providers"
```

---

## Task 3: SectionCard component (consumes Layout + Theme context)

`SectionCard` owns the reorderable-section chrome that is currently copy-pasted 7× (App.tsx lines ~4934, 5395, 5594, 5902, 6115, 6303, 6369). It reads the drag chrome from `useLayout()` and theme helpers from `useTheme()`, so panels never drill them. Per-section variation comes in as props.

**Files:**
- Create: `src/components/SectionCard.tsx`, `tests/unit/SectionCard.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/SectionCard.spec.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionCard } from '../../src/components/SectionCard';
import { LayoutProvider, ThemeProvider } from '../../src/contexts';

const layout = {
  sectionOrder: ['ramps', 'history', 'export'],
  makeSectionDragHandlers: () => ({}),
  dropLine: () => null,
  sectionGrip: (k: string) => <span data-testid={`grip-${k}`} />,
  historyOpen: true,
  setHistoryOpen: () => {},
};
const theme = {
  t: { cardBgViz: '#111', glowStrong: 0.6 },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};
function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider value={theme as any}>
      <LayoutProvider value={layout as any}>{ui}</LayoutProvider>
    </ThemeProvider>,
  );
}

test('renders title, grip, and children when open', () => {
  wrap(
    <SectionCard sectionKey="history" accent="#a855f7" bg="#111" glow={0.25} open onToggle={() => {}} title="History" icon={<i data-testid="icon" />}>
      <p>panel body</p>
    </SectionCard>,
  );
  expect(screen.getByText('History')).toBeInTheDocument();
  expect(screen.getByTestId('grip-history')).toBeInTheDocument();
  expect(screen.getByText('panel body')).toBeInTheDocument();
});

test('hides children when closed and fires onToggle on header click', () => {
  const onToggle = vi.fn();
  wrap(
    <SectionCard sectionKey="history" accent="#a855f7" bg="#111" glow={0.25} open={false} onToggle={onToggle} title="History" icon={<i />}>
      <p>panel body</p>
    </SectionCard>,
  );
  expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /History/ }));
  expect(onToggle).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/SectionCard.spec.tsx`
Expected: FAIL — `Cannot find module '../../src/components/SectionCard'`.

- [ ] **Step 3: Implement `SectionCard.tsx`**

```tsx
import { type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useLayout, useTheme } from '../contexts';

export interface SectionCardProps {
  sectionKey: string;
  accent: string;       // accent hex for border/glow/heading
  bg: string;           // background token (e.g. t.cardBgViz) — varies per section
  glow: number;         // accentGlow strength for this card
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  icon: ReactNode;
  headerAside?: ReactNode;   // e.g. the "(3 of 12)" history count badge
  dataTourId?: string;
  marginClass?: string;      // default mb-6; export uses mb-3
  children: ReactNode;
}

export function SectionCard({
  sectionKey, accent, bg, glow, open, onToggle,
  title, icon, headerAside, dataTourId, marginClass = 'mb-6', children,
}: SectionCardProps) {
  const { makeSectionDragHandlers, dropLine, sectionGrip, sectionOrder } = useLayout();
  const { t, themedAccentBorder, accentGlow, sectionHeadColor, accentTextGlow } = useTheme();
  return (
    <div
      className={`rounded-lg ${marginClass} border-2 backdrop-blur-sm overflow-hidden`}
      data-tour-id={dataTourId}
      {...makeSectionDragHandlers(sectionKey)}
      style={{
        order: sectionOrder.indexOf(sectionKey),
        background: bg,
        borderColor: themedAccentBorder(accent),
        boxShadow: [accentGlow(accent, glow), dropLine(sectionKey)].filter(Boolean).join(', '),
      }}
    >
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
      >
        <h2
          className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest"
          style={{ color: sectionHeadColor(accent), textShadow: accentTextGlow(accent) }}
        >
          {icon}{title}{headerAside}
        </h2>
        <div className="flex items-center gap-2">
          {sectionGrip(sectionKey)}
          <span style={{ color: accent }}>{open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
        </div>
      </button>
      {open && children}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/SectionCard.spec.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/SectionCard.tsx tests/unit/SectionCard.spec.tsx
git commit -m "feat(tier-c): add SectionCard wrapper component"
```

---

## Task 4: Migrate the 7 inline section wrappers to SectionCard

One section at a time. The body of each section (everything inside the old wrapper after the header `<button>`) becomes `SectionCard`'s `children`; the chrome is deleted. The header content (icon, title, count badge) moves to the `icon`/`title`/`headerAside` props.

**Files:**
- Modify: `src/App.tsx` (import SectionCard; replace 7 wrappers)

- [ ] **Step 1: Import SectionCard**

Add near the other component imports in App.tsx:
```tsx
import { SectionCard } from './components/SectionCard';
```

- [ ] **Step 2: Migrate the `history` section first** (smallest, lowest risk)

Replace the wrapper opening at the `{...makeSectionDragHandlers('history')}` div + its header `<button>` (App.tsx ~6303–6315) and the closing `</div>` (~6366) so the section reads:
```tsx
        <SectionCard
          sectionKey="history" accent="#a855f7" bg={t.cardBgViz} glow={0.25}
          open={historyOpen} onToggle={() => setHistoryOpen(o => !o)}
          icon={<History size={22} />} title="History"
          headerAside={
            <span className="text-xs font-normal opacity-70 normal-case tracking-normal">
              ({historyIndex + 1} of {historyEntries.length})
            </span>
          }
        >
          <div className="p-4 pt-0">
            {/* ...the entire existing inner body, unchanged, that was under `historyOpen && (` ... */}
          </div>
        </SectionCard>
```
Delete the now-removed `historyOpen && (` guard (SectionCard handles open/closed) and its matching `)`.

- [ ] **Step 3: Verify history section parity**

Run: `npm run build && npm run test:unit`
Expected: build clean, tests pass. Then `npm run dev`, open the History card, confirm: header, count badge, grip drag-reorders, chevron toggles, entries render newest-first, click jumps. (Visual parity check per `verify-prefer-show-live`.)

- [ ] **Step 4: Commit the history migration**

```bash
git add src/App.tsx
git commit -m "refactor(tier-c): render History section via SectionCard"
```

- [ ] **Step 5: Repeat Steps 2–4 for the remaining six sections**

Migrate `export` (mb-3 → `marginClass="mb-3"`, `dataTourId="export-panel"`), then `saved`, `viz`, `playground`, `harmony`, `ramps`. Each is its own commit. Per-section prop values (read from the current inline `style`):

| key | accent | bg | glow | extras |
|-----|--------|----|------|--------|
| ramps | `#00ffff` | `t.cardBgCyan` | 0.4 | `dataTourId="ramp-area"` |
| harmony | `#ff00ff` | `t.cardBgPink` | 0.4 | — |
| playground | `#00ff88` | `t.cardBgGreen` | 0.3 | — |
| viz | `styleAccent` (existing var) | `t.cardBgViz` | 0.4 | — |
| saved | `#ffff00` | `t.cardBgYellow` | 0.25 | — |
| history | `#a855f7` | `t.cardBgViz` | 0.25 | done in Step 2 |
| export | `#00ffff` | `t.cardBgViz` | 0.3 | `marginClass="mb-3"`, `dataTourId="export-panel"`, `data-tour-id="export-header"` on header — keep by passing through |

> `viz` and `export` headers have extra `data-tour-id` attributes on the inner `<button>`. If a section's header needs a tour id on the button itself, add an optional `headerTourId` prop to SectionCard in this task and thread it onto the `<button>`. Grep `data-tour-id` in the migrated region afterward to confirm none were dropped.

- [ ] **Step 6: Full type-gate + grep gate after all 7 migrated**

Run the widened type-gate from Task 2 Step 7 (sed-strip `@ts-nocheck`, `tsc --noEmit`, grep `TS2304|2322|2741|2739`, sed-restore, confirm `git diff` clean). Then:
```bash
grep -n "makeSectionDragHandlers('" src/App.tsx
```
Expected: zero remaining inline `makeSectionDragHandlers('...')` call sites in the JSX (all now inside SectionCard). `npm run build && npm run test:unit && npm run test:e2e` green.

---

## Task 5: HistoryPanel pilot extraction

Now that the History section renders through SectionCard, extract its **body** into a `HistoryPanel` component that reads `usePalette()` + `useLayout()`. This proves the full panel recipe: component file + context reads + strict props + test + call-site swap.

**Files:**
- Create: `src/components/panels/HistoryPanel.tsx`, `tests/unit/HistoryPanel.spec.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/HistoryPanel.spec.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryPanel } from '../../src/components/panels/HistoryPanel';
import { PaletteProvider } from '../../src/contexts';

const base = {
  historyEntries: [
    { label: 'Initial', timestamp: 1000 },
    { label: 'Edit ramp', timestamp: 2000 },
    { label: 'Harmonize', timestamp: 3000 },
  ],
  historyIndex: 1,
  jumpToHistoryIndex: () => {},
  canUndo: true,
  canRedo: true,
  formatHistoryAge: () => '1m ago',
};
const wrap = (value: any) => render(<PaletteProvider value={value}><HistoryPanel /></PaletteProvider>);

test('renders entries newest-first and marks the current one disabled', () => {
  wrap(base);
  const buttons = screen.getAllByRole('button');
  // newest (Harmonize) first
  expect(buttons[0]).toHaveTextContent(/Harmonize/i);
  // current index 1 (Edit ramp) is disabled
  const current = screen.getByRole('button', { name: /Edit ramp/i });
  expect(current).toBeDisabled();
});

test('clicking a non-current entry calls jumpToHistoryIndex with its real index', () => {
  const jump = vi.fn();
  wrap({ ...base, jumpToHistoryIndex: jump });
  fireEvent.click(screen.getByRole('button', { name: /Harmonize/i }));
  expect(jump).toHaveBeenCalledWith(2); // Harmonize is index 2, not reversed index 0
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/HistoryPanel.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HistoryPanel.tsx`**

Move the body JSX from App.tsx (the `<div className="p-4 pt-0">…</div>` block, App.tsx ~6317–6364) into the component verbatim, swapping the free variables for `usePalette()` reads:
```tsx
import { usePalette } from '../../contexts';

export function HistoryPanel() {
  const { historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge } = usePalette();
  return (
    <div className="p-4 pt-0">
      <p className="text-[11px] text-purple-100/70 italic mb-3">
        ▸ Click any entry to jump there. Cmd/Ctrl+Z and Cmd/Ctrl+Y also work. Session-only: closing the tab clears history.
      </p>
      <div className="max-h-80 overflow-y-auto rounded border-2 border-purple-500/30 bg-black/20">
        {historyEntries.slice().reverse().map((entry, revIdx) => {
          const idx = historyEntries.length - 1 - revIdx;
          const isCurrent = idx === historyIndex;
          const isFuture = idx > historyIndex;
          return (
            <button
              key={`${idx}-${entry.timestamp}`}
              onClick={() => jumpToHistoryIndex(idx)}
              disabled={isCurrent}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 border-b border-purple-500/20 last:border-b-0 transition-colors ${
                isCurrent ? 'bg-purple-500/30 cursor-default' : isFuture ? 'opacity-50 hover:bg-purple-500/10' : 'hover:bg-purple-500/10'
              }`}
              title={isCurrent ? 'Current state' : (isFuture ? 'Redo to this state' : 'Undo to this state')}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-yellow-300' : isFuture ? 'bg-purple-400/40' : 'bg-cyan-400/60'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider truncate ${isCurrent ? 'text-yellow-100' : 'text-purple-100'}`}>
                  {entry.label}
                </span>
              </div>
              <span className="text-[10px] text-purple-200/60 italic flex-shrink-0">
                {formatHistoryAge(entry.timestamp)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 text-[10px] text-purple-100/60 italic">
        <span>{canUndo ? 'Cmd/Ctrl+Z to undo' : 'Nothing to undo'}</span>
        <span>{canRedo ? 'Cmd/Ctrl+Y to redo' : 'Nothing to redo'}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/HistoryPanel.spec.tsx`
Expected: 2 passed.

- [ ] **Step 5: Swap the call site in App.tsx**

Add import:
```tsx
import { HistoryPanel } from './components/panels/HistoryPanel';
```
Replace the inlined body inside the History `<SectionCard>` with `<HistoryPanel />`.

- [ ] **Step 6: Type-gate + grep + build + e2e**

Run the widened type-gate (Task 2 Step 7 procedure). Then:
```bash
grep -n "historyEntries\|jumpToHistoryIndex\|formatHistoryAge" src/App.tsx
```
Expected: these now appear ONLY in `paletteValue` memo + the HistoryPanel import — NOT in the JSX body. Then `npm run build && npm run test:unit && npm run test:e2e` green (the `history-undo-redo.spec.ts` e2e is the behavioral guard). Live-check the History card once more.

- [ ] **Step 7: Commit**

```bash
git add src/components/panels/HistoryPanel.tsx tests/unit/HistoryPanel.spec.tsx src/App.tsx
git commit -m "refactor(tier-c): extract HistoryPanel (pilot)"
```

- [ ] **Step 8: Update the campaign memory**

Update `app-tsx-decomposition` memory: Tier C foundation (harness #74 + 4 providers + SectionCard) + pilot (HistoryPanel) DONE; record the proven recipe (SectionCard child + context reads + strict props + RTL test + widened type-gate). This lets the next chunk-session resume cold.

---

## Remaining panels — follow-on plan specifications

Each is its own chunk-session (fresh context) → its own plan → its own PR, reusing the Task 5 recipe. Generate that panel's plan at session start: grep the section's JSX for free variables, decide co-locate vs context vs prop per the spec, pre-bake the anchored edit, then execute. Recommended order (least → most coupled):

| Order | Panel | Section | Co-locate hook(s) | Context reads | Stays as App props (gen-pipeline coupling) | Key gotcha |
|-------|-------|---------|-------------------|---------------|--------------------------------------------|------------|
| 1 (done) | HistoryPanel | `history` | — | Palette, Layout | — | reversed-index mapping |
| 2 | ExportPanel | `export` | — | Theme, (export settings) | export handlers (download/copy/WCAG/HW-lock) call into gen state | `lastSavedPath` desktop-only branch |
| 3 | SavedPalettesPanel | `saved` | `useSavedPalettes` | Theme, Palette | load-palette feeds gen pipeline → keep load handler as prop | thumbnail mosaic render; ≤100 cap |
| 4 | PlaygroundPanel | `playground` | `useSpriteImport` | Theme | — | canvas refs; verify sprite import still wired |
| 5 | VizComparePanel | `viz` | `useSideBySide`, `useImageRemap` | Theme, Palette | `useImageExtract` output feeds generate → extract stays prop | sub-section collapse state (`vizSubOpen`/`toggleVizSub` → add to LayoutContext); `styleAccent` |
| 6 | HarmonyPanel | `harmony` | — | Theme, Palette | harmony derive mutates ramps → keep derive handlers as props | complementary single-color branch (no add button) |
| 7 | RampsPanel | `ramps` | — | Theme, Palette, **Editor** | ramp CRUD + gen handlers stay props | first **EditorContext** consumer — verify only active card re-renders on HSV drag (perf split payoff) |
| 8 | TopControls | (above grid) | — | Theme | generate/AI/extract pipeline all stay props | largest + most coupled → do LAST; ~500 lines |
| 9 | UpdateNotification | (fixed) | `useUpdater` | Theme | — | fixed-position, outside CVD wrapper; anytime after Task 2 |

When each panel's hooks co-locate, remove them from App.tsx's hook calls and from the provider memo deps as appropriate. Add new context fields (e.g. `vizSubOpen`, editor setters) to the relevant provider when the consuming panel needs them — extend the interface, don't widen to `any`.

---

## Self-Review

- **Spec coverage:** Harness (#74) → Task 1. Four-context split by cadence → Task 2 (Editor split called out). SectionCard dedupe as PR #1-equivalent → Tasks 3–4. Risk-ordered panels, History pilot → Task 5 + table. Co-location vs context vs props → table. Widened type-gate (TS2322/2741/2739) → every type-gate step. Strict prop interfaces → SectionCardProps + HistoryPanel reads typed context. All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; the "remaining panels" section is an explicit plan-boundary (separate per-chunk plans), not a deferred task — each row carries concrete hook names, context reads, and gotchas.
- **Type consistency:** `useTheme/useLayout/usePalette/useEditor` + `SectionCardProps` field names match across tasks; `historyEntries/historyIndex/jumpToHistoryIndex/canUndo/canRedo/formatHistoryAge` identical in PaletteValue, App memo, HistoryPanel, and both tests.
