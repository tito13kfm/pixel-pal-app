# Code Sweep Pattern Checklist

Regex patterns for `search_files` across a source tree. Each is a starting point:
always open context with `read_file` to confirm a real finding (avoid false positives).
Adapt the language-specific alternations to the repo's stack.

## 1. No error boundary / crash recovery
- JS/TS/React: `ErrorBoundary|componentDidCatch|getDerivedStateFromError`
- Rust: `panic::catch_unwind|\.unwrap\(\)\s*;//\s*TODO|expect\("unreachable`
- Go: `recover\(\)|panic\(`
- Python: `@app\.errorhandler|sys\.excepthook`

## 2. Type-checking disabled on critical files
`//\s*@ts-nocheck|//\s*@ts-ignore|//\s*nocheck|/\*\s*@ts-nocheck`
Flag if the file is large or central (e.g. main component, core math).

## 3. Main-thread blocking work
- Pixel/loop: `getImageData|ImageData|\.data\b`
- Synchronous loop wrapped to "let UI paint": `setTimeout\(\s*\(\)\s*=>\s*\{[^}]*for\s*\(`
- No offload: `new\s+Worker|Worker\(` (absence is the signal when #1 patterns present)
- Heavy sync encode: `toBlob|toDataURL` inside a synchronous loop

## 4. Unhandled storage writes
`localStorage\.setItem|sessionStorage\.setItem|\.setItem\(`
Check there is a `try\s*\{` guarding it (search the surrounding ~10 lines).

## 5. Stale-closure setState
Inside `setState\(\s*\w+\s*=>\s*\{`, look for a `while\s*\([^)]*<\s*\w+\.length\)`
where the `\w+` is a *closure* state variable, not the updater's `prev`/`state` param.
Classic: `while (padded.length < baseColors.length)` inside `setAiColorNames(prev => ...)`.

## 6. Duplicate / parallel models
- Two conversion modules: `hexToRgb|rgbToHex|hexToHsl` plus `hexToOklch|oklchToHex` in same repo.
- Inline copy of a `lib/` helper: `function slugify|function isTauri` defined in a component
  while also exported from `lib/`.
- Copy-pasted logic: same block in two files (grep the block).

## 7. Missing CI gates
Check CI config (`.github/workflows/*`, `.gitlab-ci.yml`) and root scripts for:
- Dead-code: `ts-prune|knip|deadcode`
- Full type-check: `tsc --noEmit` (and confirm it isn't skipped via nocheck)
- Lint: `eslint|ruff|clippy`
If absent, that's a finding.

## 8. Judgment calls (no single regex)
- Monolith files (>1500 lines doing many jobs).
- Hardcoded secrets / tokens / keys.
- Missing input validation on user/uploaded data.
- No tests for critical paths (generation, export, persistence).
- Console.log left in production paths.