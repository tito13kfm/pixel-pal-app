# Review Lenses

Two focused checklists to run during `/code-review` or a manual diff review, in
addition to the usual correctness/reuse passes. Both are especially relevant in
this repo because `App.tsx` and `color.ts` carry `// @ts-nocheck`, so the type
checker will not flag the problems these lenses catch.

Adapted from the `silent-failure-hunter` and `type-design-analyzer` agent specs
in the [ECC](https://github.com/affaan-m/ECC) project (MIT). We did not adopt the
framework; these are just the two checklists worth keeping.

## Silent-failure lens

Hunt for errors that disappear instead of surfacing:

- Empty/ignored catch blocks (`catch {}`), or errors turned into `null` / `[]`
  with no log or context.
- Dangerous fallbacks that mask real failure: `.catch(() => [])`, default values
  that hide a thrown error, "graceful" paths that make downstream bugs harder to
  trace.
- Lost error context: generic rethrows, dropped stack traces, missing `await` on
  a promise so its rejection vanishes.
- Network / file / storage / IPC calls with no error handling or timeout. In this
  app that includes AI provider calls (`lib/ai.ts`), the Tauri plugin-store /
  localStorage `window.storage` shim, and native dialog/save paths.

For each finding: location, severity, what breaks, suggested fix.

## Type-design lens

Ask whether the types make illegal states hard or impossible to represent:

- **Encapsulation**: are internal details hidden, or can an invariant be broken
  from outside?
- **Invariant expression**: do the types encode the rule, or is it only enforced
  by a runtime check that a caller can skip? (e.g. shade-count bounds, ramp index
  ranges, hardware-lock palettes.)
- **Usefulness**: does the invariant prevent a bug that actually happens here?
- **Enforcement**: is it enforced by the type system, or is there an easy escape
  hatch (`as any`, a widened union, an optional field that should be required)?

For each type reviewed: name + location, a note on each of the four dimensions,
and a concrete improvement.
