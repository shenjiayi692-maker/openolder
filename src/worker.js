// Premiere conversion worker. Files never leave the browser.
import { inspect, downgrade, downgradeProduction, prodsetVersion, releaseName, FIRST_PRODUCTION_VERSION } from './lib/prproj.js';
import { unzipSync, zipSync } from './vendor/fflate.js';

const isProj = (p) => /\.prproj$/i.test(p);
const isProdset = (p) => /\.prodset$/i.test(p);

// Expand dropped items into {path, bytes}; zip archives are unpacked.
async function load(items) {
  const files = [];
  for (const it of items) {
    const bytes = new Uint8Array(await it.file.arrayBuffer());
    if (/\.zip$/i.test(it.path)) {
      let entries;
      try { entries = unzipSync(bytes); } catch (_) { throw new Error(`${it.path} could not be unzipped.`); }
      for (const [p, b] of Object.entries(entries)) {
        if (p.endsWith('/') || p.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(p)) continue;
        files.push({ path: p, bytes: b });
      }
    } else files.push({ path: it.path, bytes });
  }
  return files;
}

function analyse(files) {
  const prodset = files.filter((f) => isProdset(f.path));
  if (prodset.length === 1) {
    const v = prodsetVersion(prodset[0].bytes);
    return { mode: 'production', name: prodset[0].path.split('/')[0], version: v, projects: files.filter((f) => isProj(f.path)).length, other: files.filter((f) => !isProj(f.path) && !isProdset(f.path)).length };
  }
  if (prodset.length > 1) throw new Error('These files contain more than one .prodset. Convert one Production at a time.');
  const projects = files.filter((f) => isProj(f.path));
  if (!projects.length) throw new Error('No Premiere Pro project (.prproj) found.');
  return { mode: 'projects', items: projects.map((f) => { try { const i = inspect(f.bytes); return { path: f.path, version: i.version, release: i.release }; } catch (e) { return { path: f.path, error: e.message }; } }) };
}

let cache = null;

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'analyse') {
      cache = await load(payload.items);
      self.postMessage({ id, ok: true, result: { ...analyse(cache), firstProduction: FIRST_PRODUCTION_VERSION } });
    } else if (type === 'convert') {
      const target = payload.target;
      const a = analyse(cache);
      if (a.mode === 'production') {
        const r = downgradeProduction(cache, target);
        const zip = zipSync(Object.fromEntries(r.files.map((f) => [f.path, [f.bytes, { level: 0 }]])));
        self.postMessage({ id, ok: true, result: { name: `${r.folder}_Premiere${releaseName(r.targetVersion)}.zip`, bytes: zip, errors: r.errors, projects: r.projects, copied: r.copied } }, [zip.buffer]);
        return;
      }
      const out = []; const errors = [];
      for (const f of cache.filter((x) => isProj(x.path))) {
        try {
          const r = downgrade(f.bytes, target);
          const base = f.path.split('/').pop().replace(/\.prproj$/i, '');
          out.push({ name: `${base}_Premiere${releaseName(r.targetVersion)}.prproj`, bytes: r.bytes });
        } catch (err) { errors.push({ path: f.path, error: err.message }); }
      }
      if (!out.length) throw new Error(errors[0]?.error || 'Nothing could be converted.');
      if (out.length === 1) {
        self.postMessage({ id, ok: true, result: { name: out[0].name, bytes: out[0].bytes, errors } }, [out[0].bytes.buffer]);
      } else {
        const zip = zipSync(Object.fromEntries(out.map((f) => [f.name, [f.bytes, { level: 0 }]])));
        self.postMessage({ id, ok: true, result: { name: `Premiere${releaseName(target)}_projects.zip`, bytes: zip, errors } }, [zip.buffer]);
      }
    }
  } catch (err) {
    const msg = err?.message && err.message !== '[object Object]' ? err.message : 'Something went wrong while reading these files.';
    self.postMessage({ id, ok: false, error: msg });
  }
};
