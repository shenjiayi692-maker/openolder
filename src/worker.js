// Runs the conversion off the main thread. Files never leave the browser.
import { inspect, downgrade, releaseName } from './lib/prproj.js';

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    const bytes = new Uint8Array(await payload.file.arrayBuffer());
    if (type === 'inspect') {
      self.postMessage({ id, ok: true, result: inspect(bytes) });
    } else if (type === 'downgrade') {
      const r = downgrade(bytes, payload.target);
      self.postMessage({
        id, ok: true,
        result: { ...r, sourceName: releaseName(r.sourceVersion), targetName: releaseName(r.targetVersion) },
      }, [r.bytes.buffer]);
    }
  } catch (err) {
    const msg = err?.message && err.message !== '[object Object]'
      ? err.message
      : 'Something went wrong while reading this file. It may be damaged.';
    self.postMessage({ id, ok: false, error: msg, code: err?.code || null });
  }
};
