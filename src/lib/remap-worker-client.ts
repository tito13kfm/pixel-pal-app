import type { RemapImage, RemapOptions } from './image-remap';

// Thin request/response client over a single lazily-created remap worker
// (src/workers/remap.worker.ts). One worker for the app's lifetime is
// plenty: remap requests are infrequent (manual refresh / download / SBS
// palette changes) and the worker processes them one at a time, which is
// still strictly better than the main-thread freeze this replaces (see
// issue #110).
//
// Requests are matched to responses by an incrementing id rather than
// relying on message order, so a caller can safely fire a new request
// before an older one resolves (e.g. the side-by-side panel re-running a
// remap on every palette edit) without the two mixing up results.

interface PendingRequest {
  resolve: (image: RemapImage) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/remap.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: number; result?: RemapImage; error?: string }>) => {
    const { id, result, error } = e.data;
    const req = pending.get(id);
    if (!req) return;
    pending.delete(id);
    if (error) {
      req.reject(new Error(error));
    } else if (result) {
      req.resolve(result);
    }
  };
  worker.onerror = (e) => {
    // Worker-level failure (e.g. a script load/parse error). Reject every
    // in-flight request so callers don't hang forever.
    const err = new Error(e.message || 'Remap worker error');
    for (const req of pending.values()) req.reject(err);
    pending.clear();
  };
  return worker;
}

export function requestRemap(
  image: RemapImage,
  paletteColors: string[],
  options?: RemapOptions,
): Promise<RemapImage> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, image, paletteColors, options });
  });
}
