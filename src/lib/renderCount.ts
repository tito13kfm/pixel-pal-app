// Test-only render instrumentation for SP2 perf work. A memo'd panel calls
// recordRender('PanelName') as its first body statement. The counter only ticks
// after a test calls enableRenderCounts(); in production `enabled` stays false so
// recordRender is a single boolean check with no allocation, zero runtime cost,
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
