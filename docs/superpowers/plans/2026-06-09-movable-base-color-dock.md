# Movable Base-Color Dock (#80) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-on, freely draggable, collapsible floating dock that lists every base color as a swatch with a delete badge, so a stray base (e.g. an image-pick mis-click) can be removed from anywhere on the page.

**Architecture:** A self-contained `BaseColorDock` component rendered once at the App root as a fixed overlay. Pure position/persistence logic lives in `src/lib/base-dock.ts` (unit-tested with plain vitest). A thin `useBaseDock` hook owns the dock's UI state (position + collapsed), persists it under `ui:*` localStorage keys, handles pointer-drag, and re-clamps on resize. Deletion calls the existing `removeRamp(i)` (atomic per-ramp-state cleanup + automatic undo via `useHistory`). A new `scrollToRamp(i)` gives the swatch-body click a jump target. The dock is hidden while compare mode is active.

**Tech Stack:** React 19 + TS, Vite, Tailwind v3, vitest + @testing-library/react (already configured: `vitest.config.ts` runs jsdom with `setupFiles: ['tests/setup/testing-library.ts']`). Edits to `src/App.tsx` MUST use Serena tools (the built-in Edit tool is hard-blocked on `src/**/*.tsx` by a PreToolUse hook); `App.tsx` carries `@ts-nocheck`, so `tsc` will not catch dangling refs there — grep is the gate.

**Spec:** `docs/superpowers/specs/2026-06-09-issue-80-movable-base-color-dock-design.md`

**Branch:** `feat/base-color-dock-80` (already created and checked out; the spec commits live here).

---

## File Structure

- **Create `src/lib/base-dock.ts`** — pure, framework-free: types, `DEFAULT_DOCK_POS`, `resolveAnchor`, `clampToViewport`, `nearestCornerOffset` (dev calibration), `parsePoint`. One responsibility: position math + persistence shape. Fully unit-testable.
- **Create `src/hooks/useBaseDock.ts`** — thin React wrapper: position/collapsed state, `ui:*` persistence, pointer-drag handlers, resize re-clamp, dev-only calibration log. No palette logic.
- **Create `src/components/BaseColorDock.tsx`** — presentational dock (grab-bar, collapse toggle, swatch rail, collapsed pill). Props only: `baseColors`, `onDelete`, `onJump`.
- **Create `tests/unit/base-dock.spec.ts`** — pure-helper tests.
- **Create `tests/unit/BaseColorDock.spec.tsx`** — component tests (jsdom + testing-library).
- **Modify `src/App.tsx`** — import the dock; add `highlightedRamp` state + `scrollToRamp`; add `data-ramp-index` + transient highlight to each ramp card; render `<BaseColorDock>` gated on `!compareMode`.

`tests/unit/**/*.spec.ts(x)` is already un-ignored in `.gitignore` (lines 39-41), so new test files are tracked normally — no `git add -f` needed.

---

## Task 1: Pure position/persistence helpers

**Files:**
- Create: `src/lib/base-dock.ts`
- Test: `tests/unit/base-dock.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/base-dock.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOCK_POS,
  resolveAnchor,
  clampToViewport,
  nearestCornerOffset,
  parsePoint,
} from '../../src/lib/base-dock';

const VP = { w: 1000, h: 800 };
const SIZE = { w: 50, h: 200 };

describe('clampToViewport', () => {
  it('keeps an in-bounds point unchanged', () => {
    expect(clampToViewport({ x: 100, y: 100 }, VP, SIZE)).toEqual({ x: 100, y: 100 });
  });
  it('pulls an off-right/off-bottom point back inside', () => {
    expect(clampToViewport({ x: 9999, y: 9999 }, VP, SIZE)).toEqual({ x: 950, y: 600 });
  });
  it('clamps negative coords to zero', () => {
    expect(clampToViewport({ x: -40, y: -10 }, VP, SIZE)).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveAnchor', () => {
  it('resolves top-right with offsets', () => {
    const p = resolveAnchor({ anchor: 'top-right', dx: 24, dy: 80 }, VP, SIZE);
    expect(p).toEqual({ x: 1000 - 50 - 24, y: 80 }); // { x: 926, y: 80 }
  });
  it('resolves bottom-left with offsets', () => {
    const p = resolveAnchor({ anchor: 'bottom-left', dx: 16, dy: 16 }, VP, SIZE);
    expect(p).toEqual({ x: 16, y: 800 - 200 - 16 }); // { x: 16, y: 584 }
  });
});

describe('nearestCornerOffset (calibration)', () => {
  it('reports the nearest corner as anchor + offset', () => {
    // point near top-right: x close to right edge, y small
    const d = nearestCornerOffset({ x: 926, y: 80 }, VP, SIZE);
    expect(d.anchor).toBe('top-right');
    expect(d.dx).toBe(24);
    expect(d.dy).toBe(80);
  });
  it('reports bottom-left for a point near that corner', () => {
    const d = nearestCornerOffset({ x: 16, y: 584 }, VP, SIZE);
    expect(d.anchor).toBe('bottom-left');
    expect(d.dx).toBe(16);
    expect(d.dy).toBe(16);
  });
});

describe('parsePoint', () => {
  it('parses a valid stored point', () => {
    expect(parsePoint('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });
  it('returns null for junk or missing data', () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint('not json')).toBeNull();
    expect(parsePoint('{"x":"a"}')).toBeNull();
  });
});

describe('DEFAULT_DOCK_POS', () => {
  it('is a valid anchor default', () => {
    expect(['top-left','top-right','bottom-left','bottom-right']).toContain(DEFAULT_DOCK_POS.anchor);
    expect(typeof DEFAULT_DOCK_POS.dx).toBe('number');
    expect(typeof DEFAULT_DOCK_POS.dy).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- base-dock`
Expected: FAIL — `Cannot find module '../../src/lib/base-dock'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/base-dock.ts`:

```ts
// Pure position + persistence helpers for the base-color dock (#80).
// Framework-free so they are unit-testable without the React harness.

export type DockAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface DockDefault { anchor: DockAnchor; dx: number; dy: number; }
export interface Point { x: number; y: number; }
export interface Size { w: number; h: number; }
export interface Viewport { w: number; h: number; }

// Placeholder default; replaced with a dev-calibrated value in Task 6.
export const DEFAULT_DOCK_POS: DockDefault = { anchor: 'top-right', dx: 24, dy: 80 };

export function clampToViewport(p: Point, vp: Viewport, size: Size): Point {
  const maxX = Math.max(0, vp.w - size.w);
  const maxY = Math.max(0, vp.h - size.h);
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  };
}

export function resolveAnchor(d: DockDefault, vp: Viewport, size: Size): Point {
  const x = d.anchor.includes('right') ? vp.w - size.w - d.dx : d.dx;
  const y = d.anchor.includes('bottom') ? vp.h - size.h - d.dy : d.dy;
  return clampToViewport({ x, y }, vp, size);
}

// Given a pixel position, report the nearest corner as an anchor + offset.
// Used by the dev-only calibration readout so a dragged position can be
// hardcoded as DEFAULT_DOCK_POS.
export function nearestCornerOffset(p: Point, vp: Viewport, size: Size): DockDefault {
  const fromLeft = p.x;
  const fromRight = vp.w - size.w - p.x;
  const fromTop = p.y;
  const fromBottom = vp.h - size.h - p.y;
  const horiz = fromRight < fromLeft ? 'right' : 'left';
  const vert = fromBottom < fromTop ? 'bottom' : 'top';
  const anchor = `${vert}-${horiz}` as DockAnchor;
  const dx = Math.max(0, Math.round(horiz === 'right' ? fromRight : fromLeft));
  const dy = Math.max(0, Math.round(vert === 'bottom' ? fromBottom : fromTop));
  return { anchor, dx, dy };
}

export function parsePoint(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.x === 'number' && typeof v.y === 'number') return { x: v.x, y: v.y };
  } catch { /* ignore malformed */ }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- base-dock`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/base-dock.ts tests/unit/base-dock.spec.ts
git commit -m "feat(base-dock): pure position/persistence helpers (#80)"
```

---

## Task 2: `useBaseDock` hook

**Files:**
- Create: `src/hooks/useBaseDock.ts`

No standalone test — this hook is thin glue over Task 1's helpers (which are tested) and is exercised through the component test in Task 3. Drag/pointer behavior is verified manually in Task 5 (jsdom has no layout or real pointer capture).

- [ ] **Step 1: Write the implementation**

Create `src/hooks/useBaseDock.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  DEFAULT_DOCK_POS,
  resolveAnchor,
  clampToViewport,
  nearestCornerOffset,
  parsePoint,
  type Point,
} from '../lib/base-dock';

const POS_KEY = 'ui:baseDockPos';
const COLLAPSED_KEY = 'ui:baseDockCollapsed';
const FALLBACK_SIZE = { w: 50, h: 200 };

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

// Read the live dock size from its DOM node, falling back to an estimate
// (jsdom and the first render before layout return zeros).
function sizeOf(ref: React.RefObject<HTMLElement>) {
  const r = ref.current?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
  return FALLBACK_SIZE;
}

export function useBaseDock(ref: React.RefObject<HTMLElement>) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const [pos, setPos] = useState<Point>(() => {
    const saved = parsePoint(localStorage.getItem(POS_KEY));
    return saved ?? resolveAnchor(DEFAULT_DOCK_POS, viewport(), FALLBACK_SIZE);
  });

  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(pos)); }, [pos]);
  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  // Re-clamp into the viewport on resize so the dock can never be stranded.
  useEffect(() => {
    const onResize = () => setPos(p => clampToViewport(p, viewport(), sizeOf(ref)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ref]);

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = clampToViewport(
      { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
      viewport(),
      sizeOf(ref),
    );
    setPos(next);
  }, [ref]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    if (import.meta.env.DEV) {
      const candidate = nearestCornerOffset(pos, viewport(), sizeOf(ref));
      // eslint-disable-next-line no-console
      console.log('[base-dock] DEFAULT_DOCK_POS candidate:', JSON.stringify(candidate));
    }
  }, [pos, ref]);

  return { pos, collapsed, setCollapsed, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `useBaseDock.ts` / `base-dock.ts` (these files are typed, not `@ts-nocheck`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBaseDock.ts
git commit -m "feat(base-dock): useBaseDock hook with drag, persistence, dev calibration (#80)"
```

---

## Task 3: `BaseColorDock` component

**Files:**
- Create: `src/components/BaseColorDock.tsx`
- Test: `tests/unit/BaseColorDock.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/BaseColorDock.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseColorDock } from '../../src/components/BaseColorDock';

beforeEach(() => localStorage.clear());

describe('BaseColorDock', () => {
  it('renders one swatch per base color', () => {
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff', '#00ff00']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.getByTestId('swatch-0')).toBeInTheDocument();
    expect(screen.getByTestId('swatch-2')).toBeInTheDocument();
    expect(screen.queryByTestId('swatch-3')).toBeNull();
  });

  it('hides the delete badge when only one base remains', () => {
    render(<BaseColorDock baseColors={['#ff00ff']} onDelete={() => {}} onJump={() => {}} />);
    expect(screen.queryByTestId('delete-0')).toBeNull();
  });

  it('delete badge calls onDelete with the index', () => {
    const onDelete = vi.fn();
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={onDelete} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('delete-1'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('swatch body calls onJump with the index', () => {
    const onJump = vi.fn();
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={onJump} />);
    fireEvent.click(screen.getByTestId('jump-0'));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('collapse toggle switches to the pill and back', () => {
    render(<BaseColorDock baseColors={['#ff00ff', '#00ffff']} onDelete={() => {}} onJump={() => {}} />);
    fireEvent.click(screen.getByTestId('base-dock-collapse'));
    expect(screen.getByTestId('base-dock-expand')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('base-dock-expand'));
    expect(screen.getByTestId('base-dock-grip')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BaseColorDock`
Expected: FAIL — `Cannot find module '../../src/components/BaseColorDock'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/BaseColorDock.tsx`. Styling uses inline neon styles approximating the pixel.pal look from the mockup (magenta border, dark panel). Theme-token integration is a later polish; functional + on-brand-enough is the v1 bar.

```tsx
import { useRef } from 'react';
import { useBaseDock } from '../hooks/useBaseDock';

interface Props {
  baseColors: string[];
  onDelete: (index: number) => void;
  onJump: (index: number) => void;
}

const NEON = '#ff2ec4';
const PANEL = 'linear-gradient(180deg,#240a33,#16091f)';

export function BaseColorDock({ baseColors, onDelete, onJump }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { pos, collapsed, setCollapsed, dragHandlers } = useBaseDock(ref);

  const shell: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 30,
    background: PANEL, border: `1px solid ${NEON}`, borderRadius: 9,
    boxShadow: '0 0 18px rgba(255,46,196,0.33)', userSelect: 'none',
  };
  const handle: React.CSSProperties = { touchAction: 'none', cursor: 'grab' };

  if (collapsed) {
    return (
      <div ref={ref} data-testid="base-dock" style={{ ...shell, padding: 6, borderRadius: 20 }}>
        <button
          data-testid="base-dock-expand"
          {...dragHandlers}
          onClick={() => setCollapsed(false)}
          aria-label="Expand base color dock"
          style={{ ...handle, display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 0, color: '#22e0ff', fontSize: 11 }}
        >
          {baseColors.slice(0, 4).map((c, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
          ))}
          <span>{baseColors.length} bases</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} data-testid="base-dock" style={{ ...shell, width: 46, paddingBottom: 8 }}>
      <div style={{ position: 'relative' }}>
        <div
          data-testid="base-dock-grip"
          {...dragHandlers}
          title="Drag to move"
          style={{ ...handle, display: 'flex', justifyContent: 'center', gap: 3, padding: '5px 0', background: '#3a0f4d', borderBottom: `1px solid ${NEON}`, borderRadius: '9px 9px 0 0' }}
        >
          <span style={dot} /><span style={dot} /><span style={dot} />
        </div>
        <button
          data-testid="base-dock-collapse"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse base color dock"
          style={{ position: 'absolute', top: 2, right: 3, background: 'transparent', border: 0, color: '#22e0ff', fontSize: 10, cursor: 'pointer' }}
        >▢</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '9px 0 2px', alignItems: 'center' }}>
        {baseColors.map((hex, i) => (
          <div key={i} data-testid={`swatch-${i}`} title={hex.toUpperCase()} style={{ position: 'relative' }}>
            <button
              data-testid={`jump-${i}`}
              onClick={() => onJump(i)}
              aria-label={`Go to ramp ${i + 1} (${hex.toUpperCase()})`}
              style={{ width: 22, height: 22, borderRadius: 4, background: hex, border: '1px solid rgba(0,0,0,0.5)', cursor: 'pointer', padding: 0 }}
            />
            {baseColors.length > 1 && (
              <button
                data-testid={`delete-${i}`}
                onClick={() => onDelete(i)}
                aria-label={`Remove base color ${i + 1}`}
                style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: NEON, color: '#0a0612', fontSize: 10, lineHeight: '12px', border: '1px solid #fff', cursor: 'pointer', padding: 0, fontWeight: 700 }}
              >×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const dot: React.CSSProperties = { width: 3, height: 3, borderRadius: '50%', background: '#22e0ff' };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- BaseColorDock`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/BaseColorDock.tsx tests/unit/BaseColorDock.spec.tsx
git commit -m "feat(base-dock): BaseColorDock component + tests (#80)"
```

---

## Task 4: Wire the dock into `App.tsx`

**Files:**
- Modify: `src/App.tsx` (use Serena tools — built-in Edit is hard-blocked here)

All four edits below are addressed by grep anchors because line numbers in this 6,700-line file drift. Use `mcp__serena__replace_content` (regex) or `insert_after_symbol` as noted.

- [ ] **Step 1: Add the import**

Find the existing component import line `import { SectionCard } from './components/SectionCard';` and insert after it:

```tsx
import { BaseColorDock } from './components/BaseColorDock';
```

(Serena: `insert_after_symbol` on the `SectionCard` import, or `replace_content` matching that exact import line and appending the new line.)

- [ ] **Step 2: Add `highlightedRamp` state + `scrollToRamp`**

`removeRamp` is defined as `const removeRamp = (index) => { ... };`. Insert this block immediately AFTER the end of `removeRamp` (Serena `replace_content`: match the unique `const removeRamp = (index) => {` symbol's closing or use `insert_after_symbol` on `removeRamp` if Serena resolves it; otherwise anchor on the `duplicateRamp` comment that follows it):

```tsx
  // Base-color dock (#80): transient highlight + smooth-scroll to a ramp when
  // the user clicks a swatch body in the dock.
  const [highlightedRamp, setHighlightedRamp] = useState(null);
  const scrollToRamp = (index) => {
    const el = document.querySelector(`[data-ramp-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedRamp(index);
    window.setTimeout(() => setHighlightedRamp(prev => (prev === index ? null : prev)), 1200);
  };
```

- [ ] **Step 3: Tag each ramp card with `data-ramp-index` + highlight ring**

Find the ramp-card map in the Color Ramps section: `{baseColors.map((_, i) => {` (around line 5028). The callback returns a card element. On that returned outer element add `data-ramp-index={i}` and a conditional ring style. Locate the outer wrapper element's opening tag inside this map and add the attribute + a style merge. Concretely, the outer element currently looks like `<div key={i} ...>` (or similar wrapper). Use Serena `replace_content` to add to that opening tag:

```tsx
            data-ramp-index={i}
```

and merge a highlight ring into its style when active. If the element uses a `style={{ ... }}` object, add:

```tsx
            ...(highlightedRamp === i ? { boxShadow: '0 0 0 3px #ff2ec4, 0 0 18px rgba(255,46,196,0.6)' } : {}),
```

If it uses `className`, instead append a conditional class string `${highlightedRamp === i ? 'ring-4 ring-pink-500' : ''}`. Read the actual wrapper first (Serena `find_symbol` / surrounding `replace_content` preview) and apply whichever matches.

- [ ] **Step 4: Render the dock (gated on `!compareMode`)**

The outermost render returns `<div className="min-h-screen p-6 relative overflow-hidden" ...>` (around line 4450), with the content in `<div className="max-w-5xl mx-auto relative z-10">` and fixed overlays (e.g. the updater toast) near the end. Insert the dock as a fixed overlay INSIDE the outer `min-h-screen` div, after the `max-w-5xl` content block closes (sibling to the existing fixed overlays):

```tsx
        {!compareMode && (
          <BaseColorDock baseColors={baseColors} onDelete={removeRamp} onJump={scrollToRamp} />
        )}
```

`baseColors`, `removeRamp`, and `compareMode` are all already in scope in this component.

- [ ] **Step 5: Type-check + dangling-ref grep gate**

`App.tsx` is `@ts-nocheck`, so `tsc` will not validate its internals — grep is the gate.

Run:
```bash
npx tsc --noEmit
```
Expected: clean (the new typed files compile; `App.tsx` internals are not type-checked).

Run the grep gate (PowerShell):
```powershell
Select-String -Path src/App.tsx -Pattern 'BaseColorDock|scrollToRamp|highlightedRamp|data-ramp-index'
```
Expected: `BaseColorDock` appears exactly twice (import + render); `scrollToRamp` twice (definition + prop); `highlightedRamp` three times (useState + ring condition + the setTimeout updater); `data-ramp-index` once (the ramp card) plus once in `scrollToRamp`'s querySelector. No symbol left dangling.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(base-dock): render dock at App root, add scrollToRamp + ramp highlight (#80)"
```

---

## Task 5: Verify the whole feature

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS, including `base-dock` (Task 1) and `BaseColorDock` (Task 3). No regressions.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `tsc --noEmit` clean + `vite build` succeeds (desktop assets).

- [ ] **Step 3: Manual smoke (desktop dev)**

Run: `npm run tauri:dev`
Verify by hand:
1. Dock appears (expanded) at the default top-right spot with one swatch per base color.
2. Drag the grab-bar — dock moves; drop near an edge stays on-screen; reload — position persists.
3. Collapse → pill with dots + count; reload — stays collapsed; expand again.
4. Click a swatch's `×` → that base is removed, ramps update; Ctrl+Z restores it (existing undo).
5. With one base left, the `×` is gone (can't delete the last base).
6. Click a swatch body → page scrolls to that ramp and it flashes a highlight ring.
7. Enter compare mode → dock disappears; exit → it returns.
8. Shrink the window small → dock re-clamps inside the viewport.

- [ ] **Step 4: Commit (only if smoke surfaced fixes)**

```bash
git add -A
git commit -m "fix(base-dock): smoke-test corrections (#80)"
```

---

## Task 6: Calibrate the shipped default position

**Files:**
- Modify: `src/lib/base-dock.ts` (`DEFAULT_DOCK_POS` value only)

- [ ] **Step 1: Capture the preferred position in the dev build**

With `npm run tauri:dev` running, drag the dock to the spot it should live for new users. On each drag release, the dev-only readout logs to the console:

```
[base-dock] DEFAULT_DOCK_POS candidate: {"anchor":"top-right","dx":24,"dy":72}
```

Read that line. (This block is gated on `import.meta.env.DEV` and is dead-code-eliminated from production builds.)

- [ ] **Step 2: Hand the value to the planner and hardcode it**

Update `DEFAULT_DOCK_POS` in `src/lib/base-dock.ts` to the captured `{ anchor, dx, dy }`.

- [ ] **Step 3: Verify the new-user default actually renders**

The dragged position is now saved in `ui:baseDockPos`, which MASKS the default. To see what a new user sees, clear it first (browser/devtools console or PowerShell-launched dev build):

```js
localStorage.removeItem('ui:baseDockPos'); location.reload();
```

Expected: the dock loads at the newly hardcoded default spot.

- [ ] **Step 4: Re-run tests + commit**

Run: `npm test -- base-dock`
Expected: PASS (the `DEFAULT_DOCK_POS` shape test still holds).

```bash
git add src/lib/base-dock.ts
git commit -m "feat(base-dock): set calibrated default dock position (#80)"
```

---

## Task 7: Docs, changelog, release prep

**Files:**
- Modify: `CHANGELOG.md`
- Possibly: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Changelog entry**

Add to `## [Unreleased]` in `CHANGELOG.md` under `### Added`:

```markdown
- Movable, collapsible base-color dock: delete a base color from anywhere on the
  page; jump to a ramp by clicking its swatch; position remembered across reloads (#80).
```

- [ ] **Step 2: Architecture note (if warranted)**

Per the doc-sync directive, if the dock touches a documented subsystem invariant, add a short note to the relevant `docs/ARCHITECTURE.md` section (the dock is a new App-root overlay that calls `removeRamp`). A 2-3 sentence note is enough; skip if no documented invariant changes.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/ARCHITECTURE.md
git commit -m "docs(base-dock): changelog + architecture note (#80)"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/base-color-dock-80
gh pr create --fill --base master
```

- [ ] **Step 5: Version bump — DO NOT pick silently**

This is a user-facing feature → MINOR per the project's SemVer policy (e.g. `v0.21.0`). Per CLAUDE.md, state "proposing vX.Y.Z because ..." and WAIT for the user's OK before `npm version` + tag. Move `## [Unreleased]` notes into `## [x.y.z] - YYYY-MM-DD` and add the `compare/` footer link at release time. Four version files move in lockstep (see the `release-flow` memory). Do not bump until the user approves the release.

---

## Self-Review (completed by planner)

- **Spec coverage:** dock component (T3), drag (T2), collapse (T2/T3), persistence (T2, helpers T1), viewport clamp (T1/T2), delete via `removeRamp` + floor (T3/T4), `scrollToRamp` + highlight (T4), compare-mode hide (T4), z-order below modals/tour (T3, `zIndex:30`), `touch-action:none` (T3), default + dev calibration (T1/T2/T6), calibration localStorage mask (T6 step 3), tests (T1/T3). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows full code; the only deliberately deferred value is `DEFAULT_DOCK_POS`, which is a real placeholder constant resolved by the T6 calibration loop (by design, not a gap).
- **Type consistency:** `DockDefault {anchor,dx,dy}`, `Point {x,y}`, `resolveAnchor`/`clampToViewport`/`nearestCornerOffset`/`parsePoint` signatures are identical across T1 (definition), T2 (consumption), and T6. The hook returns `{ pos, collapsed, setCollapsed, dragHandlers }`, matching what `BaseColorDock` destructures in T3.
