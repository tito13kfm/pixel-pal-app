// Scoped ESLint config for the SP2 react-hooks dep-array gate ONLY.
// Deliberately does NOT extend js/tseslint recommended — we do not want the legacy
// lint backlog here, only exhaustive-deps + rules-of-hooks as a blocking gate.
// Run via `npm run lint:hooks`. New violations are errors; the 18 pre-existing
// sites are grandfathered with inline `// eslint-disable-next-line` comments tagged
// `TODO(sp2-d)`, deleted in phase d as the @ts-nocheck backlog is cleared.
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
])
