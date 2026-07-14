import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no real Worker implementation, so remap-worker-client.ts's
// `new Worker(...)` is backed by this fake for the purposes of this spec.
// The pure remap math itself is covered by tests/unit/image-remap.spec.ts;
// this file only covers the request/response plumbing (id matching,
// out-of-order resolution, and error propagation).
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  postMessage = vi.fn();
  constructor(public url: URL, public opts?: unknown) {
    FakeWorker.instances.push(this);
  }
  emitMessage(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  emitError(message: string) {
    this.onerror?.({ message });
  }
}

beforeEach(() => {
  FakeWorker.instances.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.resetModules();
});

const image = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4]) };

describe('requestRemap', () => {
  it('resolves with the result matching this request\'s id', async () => {
    const { requestRemap } = await import('../../src/lib/remap-worker-client');
    const promise = requestRemap(image, ['#ffffff']);
    const worker = FakeWorker.instances[0];
    const sentId = worker.postMessage.mock.calls[0][0].id;
    const result = { width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) };
    worker.emitMessage({ id: sentId, result });
    expect(await promise).toEqual(result);
  });

  it('reuses a single worker across multiple requests', async () => {
    const { requestRemap } = await import('../../src/lib/remap-worker-client');
    const p1 = requestRemap(image, ['#ffffff']);
    const p2 = requestRemap(image, ['#000000']);
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    const [id1] = worker.postMessage.mock.calls.map((c) => c[0].id);
    const [, id2] = worker.postMessage.mock.calls.map((c) => c[0].id);
    expect(id1).not.toBe(id2);
    worker.emitMessage({ id: id2, result: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) } });
    worker.emitMessage({ id: id1, result: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(Array.from(r1.data)).toEqual([255, 255, 255, 255]);
    expect(Array.from(r2.data)).toEqual([0, 0, 0, 255]);
  });

  it('rejects when the worker reports a per-request error', async () => {
    const { requestRemap } = await import('../../src/lib/remap-worker-client');
    const promise = requestRemap(image, ['#ffffff']);
    const worker = FakeWorker.instances[0];
    const sentId = worker.postMessage.mock.calls[0][0].id;
    worker.emitMessage({ id: sentId, error: 'boom' });
    await expect(promise).rejects.toThrow('boom');
  });

  it('rejects all in-flight requests on a worker-level error', async () => {
    const { requestRemap } = await import('../../src/lib/remap-worker-client');
    const p1 = requestRemap(image, ['#ffffff']);
    const p2 = requestRemap(image, ['#000000']);
    const worker = FakeWorker.instances[0];
    worker.emitError('worker crashed');
    await expect(p1).rejects.toThrow('worker crashed');
    await expect(p2).rejects.toThrow('worker crashed');
  });

  it('ignores a message whose id has already been resolved (no stale double-settle)', async () => {
    const { requestRemap } = await import('../../src/lib/remap-worker-client');
    const promise = requestRemap(image, ['#ffffff']);
    const worker = FakeWorker.instances[0];
    const sentId = worker.postMessage.mock.calls[0][0].id;
    const result = { width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) };
    worker.emitMessage({ id: sentId, result });
    await expect(promise).resolves.toEqual(result);
    // A duplicate/late message for the same id must not throw or hang.
    expect(() => worker.emitMessage({ id: sentId, result })).not.toThrow();
  });
});
