# SP2 Phase D Slice 2: HeaderControls Extraction Design

> Part of the AI rebuild initiative (SP2 phase d, trunk JSX extraction). Slice 1
> (InputPanel) landed via PR #105. This is slice 2 of 6.

## Goal

Extract the fixed title/controls header block from `App.tsx` into a typed,
props-only component, `src/components/panels/HeaderControls.tsx`, following the
same convention established by slice 1's `InputPanel.tsx`.

## Scope

**In scope:** the JSX currently at `App.tsx` lines 3187 through 3313 (verify by
grep before implementation, not by line number, per the phase c lesson on line
anchors going stale). This is the `<div className="text-center mb-6 relative">`
wrapper containing:

- guides launcher button (top left, opens the Launcher modal)
- title, subtitle, version line, and (web build only) desktop app link
- top right control cluster: CRT toggle button, theme selector (dark/neutral/light)
- top left control cluster: invisible width-matching spacer, CVD selector
  (none/protan/deutan/tritan)

**Out of scope, deliberately left in App.tsx:**

- the CVD SVG `<defs>` block (siblings of this block, feeds the CVD filter
  applied to the rest of the page, not part of the header visually)
- the CRT scanline background overlay (renders conditionally above this block,
  a page-level effect, not part of the header controls)
- the Launcher modal itself (renders elsewhere in App.tsx; this block only
  holds the button that opens it)

## Component Interface

Flat props, matching the Tier C and slice 1 convention (no grouped/nested prop
objects):

```ts
interface HeaderControlsProps {
  setLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  crtEnabled: boolean;
  setCrtEnabled: (enabled: boolean) => void;
  cvdMode: CvdMode;
  setCvdMode: (mode: CvdMode) => void;
}
```

Exact prop types (`Theme`, `CvdMode` or their equivalents) are pinned during
implementation to whatever `useDisplaySettings()` already exports; this spec
does not redefine those types.

Theme tokens (`t`, `themedAccent`, etc.) come from `useTheme()` context inside
the new component, not as a prop, matching `InputPanel.tsx`.

## Non Props (module level imports inside the new file)

- `IS_WEB` (build flag)
- `__APP_VERSION__`, `__BUILD_DATE__` (build time constants)
- Icon components: `Monitor`, `MonitorOff`, `Moon`, `Contrast`, `Sun`, `Eye`
- `DesktopAppLink` component

These are already imported at module scope elsewhere in the codebase and get
their own import lines in `HeaderControls.tsx`, not threaded through props.

## Wiring

`App.tsx` replaces the extracted block with:

```tsx
<HeaderControls
  setLauncherOpen={setLauncherOpen}
  theme={theme}
  setTheme={setTheme}
  crtEnabled={crtEnabled}
  setCrtEnabled={setCrtEnabled}
  cvdMode={cvdMode}
  setCvdMode={setCvdMode}
/>
```

`theme`, `setTheme`, `cvdMode`, `setCvdMode`, `crtEnabled`, `setCrtEnabled` all
already exist in `App.tsx` via the Tier B `useDisplaySettings()` hook.
`setLauncherOpen` already exists via the Tier B `useTour()` hook. No new state,
no new hooks.

## Verification

No behavior change, so no new tests are required. Verification gates:

- `npm run build` (tsc + vite build) green
- `npm test` (vitest unit suite) green
- `npm run test:e2e` (desktop Playwright) green
- web e2e (`npm run build:web` + web Playwright config) green
- `npm run deadcode` clean (no orphaned exports)
- grep for any local variable in `App.tsx` that loses its only consumer once
  the block moves (the slice 1 lesson: an orphaned `ramps` alias survived
  `tsc` because of `@ts-nocheck` and was only caught by grep)

## Docs

Update `docs/ARCHITECTURE.md`'s File Map panels list to add the new
`HeaderControls.tsx` entry, consistent with the other 8 existing panel
entries.
