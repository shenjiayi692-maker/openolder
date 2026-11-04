// Ableton set inspection and Live 12 -> 11 conversion, off the main thread. Files never leave the browser.
import { inspect, downgradeTo11 } from './lib/als.js';
self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    const bytes = new Uint8Array(await payload.file.arrayBuffer());
    if (type === 'inspect') self.postMessage({ id, ok: true, result: inspect(bytes) });
    else if (type === 'downgrade') {
      const r = downgradeTo11(bytes);
      self.postMessage({ id, ok: true, result: r }, [r.bytes.buffer]);
    }
  } catch (err) {
    const msg = err?.message && err.message !== '[object Object]' ? err.message : 'Something went wrong while reading this set. It may be damaged.';
    self.postMessage({ id, ok: false, error: msg, code: err?.code || null });
  }
};
