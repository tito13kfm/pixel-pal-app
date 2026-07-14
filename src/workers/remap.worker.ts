// Dedicated worker for remapImageToPalette. Keeps the O(pixels * paletteSize)
// dithering loop off the main thread (see issue #110): App.tsx and
// remap-worker-client.ts only ever exchange plain, structured-clone-able
// data with this file, never DOM objects.
//
// `self` is re-declared as `Worker` (the main-thread-side interface) rather
// than pulling in the "webworker" lib, which would conflict with the "DOM"
// lib already used by the rest of the app in the same tsconfig program.
// Worker's postMessage/onmessage signatures are shape-compatible with what a
// worker script needs.
declare const self: Worker;

import { remapImageToPalette } from '../lib/image-remap';
import type { RemapImage, RemapOptions } from '../lib/image-remap';

interface RemapRequestMessage {
  id: number;
  image: RemapImage;
  paletteColors: string[];
  options?: RemapOptions;
}

type RemapResponseMessage =
  | { id: number; result: RemapImage }
  | { id: number; error: string };

self.onmessage = (e: MessageEvent<RemapRequestMessage>) => {
  const { id, image, paletteColors, options } = e.data;
  try {
    const result = remapImageToPalette(image, paletteColors, options);
    const response: RemapResponseMessage = { id, result };
    self.postMessage(response, [result.data.buffer as ArrayBuffer]);
  } catch (err) {
    const response: RemapResponseMessage = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
