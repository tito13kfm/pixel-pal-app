// Gates on new ts-prune orphans without requiring an immediate cleanup of
// pre-existing ones. ts-prune only supports file-path ignore regex, not a
// per-symbol allowlist, so pre-existing orphans are grandfathered via
// .ts-prune-baseline.txt (one "path:line - name" entry per line, same
// format ts-prune prints). Lines ts-prune tags "(used in module)" are
// exported-but-used-locally and always excluded, per CLAUDE.md.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baselinePath = path.join(root, '.ts-prune-baseline.txt');

const raw = execSync('npx ts-prune', { cwd: root, encoding: 'utf8' });

// Normalizes path separators/leads so entries compare equal regardless of
// which OS produced them: Windows ts-prune emits "\src\...", Linux may emit
// "src/..." or "./src/...". Applied to both orphans and the baseline file so
// pasting a Windows-captured line into the baseline still matches on CI.
function normalize(line) {
  return line.trim().replace(/\\/g, '/').replace(/^[./]+/, '');
}

const orphans = raw
  .split('\n')
  .map(normalize)
  .filter(l => l.length > 0)
  .filter(l => !l.includes('(used in module)'))
  .filter(l => l.includes(' - '));

const baseline = new Set(
  readFileSync(baselinePath, 'utf8')
    .split('\n')
    .map(normalize)
    .filter(l => l.length > 0 && !l.startsWith('#')),
);

const newOrphans = orphans.filter(l => !baseline.has(l));
const resolved = [...baseline].filter(l => !orphans.includes(l));

if (resolved.length > 0) {
  console.log('Resolved (no longer orphaned, remove from .ts-prune-baseline.txt):');
  resolved.forEach(l => console.log(`  ${l}`));
}

if (newOrphans.length > 0) {
  console.error('New orphaned exports found (not in .ts-prune-baseline.txt):');
  newOrphans.forEach(l => console.error(`  ${l}`));
  console.error('\nEither remove the dead export or, if it is a known false positive, add the exact ts-prune line to .ts-prune-baseline.txt.');
  process.exit(1);
}

console.log(`No new dead-code exports (${baseline.size} pre-existing grandfathered, 0 new).`);
