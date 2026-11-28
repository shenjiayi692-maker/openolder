// Premiere Pro project (.prproj) downgrader.
//
// JavaScript port of the conversion logic in prem-down
// (https://github.com/lucuma13/prem-down, MIT License, Copyright (c) 2026 Luis Gómez Gutiérrez).
//
// A downgrade is two things:
//   1. stamp the target release's version into <Project ObjectID="1" Version="...">;
//   2. for Premiere 2026 sources going to 2025 or older, re-insert the
//      VideoComponentParam LowerBound/UpperBound fields that 2026's sparser
//      serialisation drops but older releases require (without them the
//      project is reported as damaged).
// The result is verified (version reads back, a second reconstruction pass is
// a no-op) before it is returned, so a bad conversion is refused rather than
// silently produced.
//
// Works in the browser and in Node. gzip via fflate.

import { gunzipSync, gzipSync, strFromU8, strToU8, Gunzip, Gzip } from 'fflate';

// Release -> XML <Project> Version (prem-down releases.go).
export const RELEASES = [
  [22, 'CS4'], [23, 'CS5'], [24, 'CS5.5'], [25, 'CS6'], [26, 'CC'],
  [27, '2014'], [28, '2014.1'], [29, '2015'], [30, '2015.1'], [32, '2017'],
  [33, '2018'], [34, '2018.1'], [35, '2019'], [36, '2019.1'], [37, '2020'],
  [38, '2020.1'], [39, '2021'], [40, '2022'], [41, '2023'], [42, '2024'],
  [43, '2025'], [45, '2026'],
  // 27.0 (Nov 2026, renamed "Premiere"): version 46, same sparse format as 2026. Not yet in prem-down;
  // verified in real Premiere (27 -> 2026) on 2026-11-22.
  [46, '27'],
].map(([version, name]) => ({ version, name }));

// Last release that both writes and requires the dense serialisation.
export const LAST_DENSE = 43;

export const newestKnownVersion = () => RELEASES[RELEASES.length - 1].version;
export const releaseName = (v) => RELEASES.find((r) => r.version === v)?.name ?? null;
export function previousRelease(v) {
  let best = null;
  for (const r of RELEASES) if (r.version < v) best = r;
  return best;
}

export class DowngradeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const PROJECT_VERSION_RE = /(<Project ObjectID="1"[^>]*\bVersion=")(\d+)(")/g;

export function getProjectVersion(xml) {
  const m = /(<Project ObjectID="1"[^>]*\bVersion=")(\d+)(")/.exec(xml);
  if (!m) throw new DowngradeError('no-version', 'Could not find the project version in this file.');
  return parseInt(m[2], 10);
}

export function setProjectVersion(xml, version) {
  const n = (xml.match(PROJECT_VERSION_RE) || []).length;
  if (n !== 1) throw new DowngradeError('version-count', `Expected exactly one <Project ObjectID="1"> tag, found ${n}.`);
  return xml.replace(PROJECT_VERSION_RE, (_, a, _v, c) => `${a}${version}${c}`);
}

export const needsFieldReinsertion = (src, target) => src > LAST_DENSE && target <= LAST_DENSE;

// ---------------------------------------------------------------------------
// Field reconstruction (prem-down reconstruct.go)
// ---------------------------------------------------------------------------
const RECONSTRUCT_FIELDS = [{ tag: 'VideoComponentParam', fields: ['LowerBound', 'UpperBound'] }];
const FIELDS_BY_TAG = Object.fromEntries(RECONSTRUCT_FIELDS.map((c) => [c.tag, c.fields]));
const DEFAULTS = { 'VideoComponentParam/LowerBound': 'false', 'VideoComponentParam/UpperBound': 'true' };
// Lumetri colour-selector param: its real UpperBound is the "unbounded" marker.
const CLASS_OVERRIDES = { '0fde4e9f-f895-4ba3-b0fe-9a6feafda583/UpperBound': '18446744073709551615' };
const CLASSID_RE = /\bClassID="([^"]+)"/;

// Formatting-preserving mini-DOM: untouched nodes re-render byte-identically.
const TAG_RE = /<[^>]+>/g;
const TAG_NAME_RE = /^<([\w.\-]+)/;

export function parseXML(s) {
  const roots = [];
  const stack = [];
  const append = (item) => (stack.length ? stack[stack.length - 1].content.push(item) : roots.push(item));
  let pos = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(s)) !== null) {
    if (m.index > pos) append(s.slice(pos, m.index));
    const tok = m[0];
    pos = m.index + tok.length;
    if (tok.startsWith('<?') || tok.startsWith('<!')) { append(tok); continue; }
    if (tok.startsWith('</')) {
      if (!stack.length) throw new DowngradeError('xml', `Unbalanced XML near ${tok}`);
      const top = stack[stack.length - 1];
      const name = tok.slice(2, -1).trim();
      if (name !== top.tag) throw new DowngradeError('xml', `Mismatched XML: ${tok} closes <${top.tag}>`);
      stack.pop();
      top.closeTag = tok;
      continue;
    }
    const nm = TAG_NAME_RE.exec(tok);
    if (!nm) { append(tok); continue; }
    const e = { tag: nm[1], openTag: tok, selfClosing: tok.endsWith('/>'), content: [], closeTag: '' };
    append(e);
    if (!e.selfClosing) stack.push(e);
  }
  if (pos < s.length) append(s.slice(pos));
  if (stack.length) throw new DowngradeError('xml', `Unbalanced XML: <${stack[stack.length - 1].tag}> never closed`);
  return roots;
}

export function render(node) {
  if (typeof node === 'string') return node;
  if (node.selfClosing) return node.openTag;
  let out = node.openTag;
  for (const c of node.content) out += render(c);
  return out + node.closeTag;
}

const children = (e) => e.content.filter((c) => typeof c !== 'string');
const leaf = (tag, value) => ({ tag, openTag: `<${tag}>`, selfClosing: false, content: [value], closeTag: `</${tag}>` });

function rebuild(e, stats) {
  let inserted = 0;
  for (const c of children(e)) inserted += rebuild(c, stats);
  if (e.selfClosing) return inserted;
  const fields = FIELDS_BY_TAG[e.tag];
  if (!fields) return inserted;

  const present = new Set(children(e).map((c) => c.tag));
  const classID = CLASSID_RE.exec(e.openTag)?.[1] ?? '';

  let sep = '\n';
  let bestLen = 0;
  for (const c of e.content) {
    if (typeof c === 'string' && c.trim() === '' && c.includes('\n') && c.length > bestLen) { sep = c; bestLen = c.length; }
  }

  const missing = [];
  for (const field of fields) {
    if (present.has(field)) continue;
    let value = DEFAULTS[`${e.tag}/${field}`];
    const override = CLASS_OVERRIDES[`${classID}/${field}`];
    if (override !== undefined) value = override;
    if (value === undefined) continue;
    missing.push(leaf(field, value));
    const k = `${e.tag}/${field}`;
    stats[k] = (stats[k] || 0) + 1;
  }
  if (!missing.length) return inserted;

  let content = e.content;
  let trailing = '';
  const last = content[content.length - 1];
  if (typeof last === 'string' && last.trim() === '') { trailing = last; content = content.slice(0, -1); }
  content = content.slice();
  for (const l of missing) {
    content.push(sep, l);
    inserted += sep.length + render(l).length;
  }
  if (trailing) content.push(trailing);
  e.content = content;
  return inserted;
}

export function reconstruct(xml) {
  const stats = {};
  for (const c of RECONSTRUCT_FIELDS) {
    const re = new RegExp(`<${c.tag}[ \\t\\r\\n][^>]*\\bVersion="\\d+"[^>]*>[\\s\\S]*?</${c.tag}>`, 'g');
    xml = xml.replace(re, (m) => {
      const roots = parseXML(m);
      let regionInserted = 0;
      let out = '';
      for (const r of roots) {
        if (typeof r === 'string') out += r;
        else { regionInserted += rebuild(r, stats); out += render(r); }
      }
      // Render-fidelity guard.
      if (regionInserted === 0 ? out !== m : out.length !== m.length + regionInserted) {
        throw new DowngradeError('fidelity', `Render fidelity check failed for <${c.tag}>.`);
      }
      return out;
    });
  }
  return { xml, stats };
}

function verify(xml, wantVersion, reinserted) {
  if (getProjectVersion(xml) !== wantVersion) throw new DowngradeError('verify', 'Output version does not match the target.');
  const again = reconstruct(xml);
  if (!reinserted) return;
  const still = Object.entries(again.stats).filter(([, n]) => n > 0);
  if (still.length) throw new DowngradeError('verify', `Required fields still missing after downgrade: ${still.map(([k]) => k).join(', ')}`);
  if (again.xml !== xml) throw new DowngradeError('verify', 'A second reconstruction pass changed the output.');
}

export function decodeProject(bytes) {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  let raw = bytes;
  if (isGzip) {
    try { raw = gunzipSync(bytes); } catch (_) { throw new DowngradeError('gzip', 'This file is damaged and could not be decompressed.'); }
  }
  return strFromU8(raw);
}

/** Inspect a project without converting it. */
// Large projects: a 40 MB .prproj inflates to ~600 MB of XML, more than a JavaScript string can hold
// (~512 MB) and more than a browser tab can comfortably copy. Reading the version only needs the
// first few kilobytes, and a version-only change (e.g. 27 -> 2026, 2025 -> 2024) can be streamed.
const CHUNK = 1 << 20;
const HEAD_BYTES = 1 << 16;
const isGz = (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
const utf8 = (u8) => new TextDecoder('utf-8').decode(u8);
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
function indexOfBytes(hay, pat, from) {
  outer: for (let i = from; i <= hay.length - pat.length; i++) {
    for (let j = 0; j < pat.length; j++) if (hay[i + j] !== pat[j]) continue outer;
    return i;
  }
  return -1;
}
function countBytes(hay, pat, from) { let n = 0; for (let i = indexOfBytes(hay, pat, from); i >= 0; i = indexOfBytes(hay, pat, i + 1)) n++; return n; }
const PROJECT_TAG = strToU8('<Project ObjectID="1"');

/** First ~64 KB of the project XML, without inflating the whole file. */
export function projectHead(bytes, max = HEAD_BYTES) {
  if (!isGz(bytes)) return utf8(bytes.subarray(0, max));
  let head = new Uint8Array(0);
  let enough = false;
  const g = new Gunzip((chunk) => { if (!enough) { head = concat(head, chunk); if (head.length >= max) enough = true; } });
  try {
    // never mark the last chunk final here: we only need the head, and a damaged tail should not hide it
    for (let i = 0; i < bytes.length && !enough; i += CHUNK) g.push(bytes.subarray(i, i + CHUNK), false);
    if (!enough) g.push(new Uint8Array(0), true); // read the whole (small) file: a truncated or broken stream raises its error
  } catch (_) {
    throw new DowngradeError('gzip', 'This file is damaged and could not be decompressed.');
  }
  if (!head.length) throw new DowngradeError('gzip', 'This file is damaged and could not be decompressed.');
  return utf8(head.subarray(0, max));
}

/** Change only the project version, streaming: never holds the whole XML in memory. */
function regateStream(bytes, target) {
  const out = [];
  const z = new Gzip({ level: 6 }, (c) => out.push(c));
  let head = new Uint8Array(0);
  let patched = false;
  let count = 0;
  let carry = new Uint8Array(0);
  const handle = (chunk, final) => {
    if (!patched) {
      head = concat(head, chunk);
      const s = indexOfBytes(head, PROJECT_TAG, 0);
      const gt = s >= 0 ? head.indexOf(0x3e, s) : -1;
      if (gt < 0) {
        if (final || head.length > HEAD_BYTES) throw new DowngradeError('no-version', 'Could not find the project version in this file.');
        return;
      }
      const tag = utf8(head.subarray(s, gt + 1));
      const m = /\bVersion="(\d+)"/.exec(tag);
      if (!m || tag.length !== gt + 1 - s) throw new DowngradeError('no-version', 'Could not find the project version in this file.');
      const digits = String(target);
      if (digits.length !== m[1].length) throw new DowngradeError('version-width', 'Unexpected version number width.');
      const at = s + m.index + m[0].indexOf('"') + 1;
      for (let i = 0; i < digits.length; i++) head[at + i] = digits.charCodeAt(i);
      patched = true;
      count = 1 + countBytes(head, PROJECT_TAG, gt + 1);
      carry = head.subarray(Math.max(0, head.length - (PROJECT_TAG.length - 1)));
      z.push(head, final);
      head = null;
      return;
    }
    const joined = concat(carry, chunk);
    count += countBytes(joined, PROJECT_TAG, 0);
    carry = joined.subarray(Math.max(0, joined.length - (PROJECT_TAG.length - 1)));
    z.push(chunk, final);
  };
  if (isGz(bytes)) {
    const g = new Gunzip((c, final) => handle(c, final));
    try {
      for (let i = 0; i < bytes.length; i += CHUNK) g.push(bytes.subarray(i, i + CHUNK), i + CHUNK >= bytes.length);
    } catch (e) {
      if (e instanceof DowngradeError) throw e;
      throw new DowngradeError('gzip', 'This file is damaged and could not be decompressed.');
    }
  } else handle(bytes, true);
  if (!patched) throw new DowngradeError('no-version', 'Could not find the project version in this file.');
  if (count !== 1) throw new DowngradeError('version-count', `Expected exactly one <Project ObjectID="1"> tag, found ${count}.`);
  let n = 0; for (const c of out) n += c.length;
  const res = new Uint8Array(n); let o = 0; for (const c of out) { res.set(c, o); o += c.length; }
  if (getProjectVersion(projectHead(res)) !== target) throw new DowngradeError('verify', 'Output version does not match the target.');
  return res;
}

const tooLarge = (e) => e instanceof RangeError || /allocation|out of memory|Invalid string length|Invalid array length|encoded data was not valid/i.test(e?.message || '');
// Uncompressed size from the gzip trailer (mod 4 GiB); a whole project above this cannot become one string.
const MAX_XML_BYTES = 480e6;
const inflatedSize = (b) => (isGz(b) && b.length >= 18 ? (b[b.length - 4] | (b[b.length - 3] << 8) | (b[b.length - 2] << 16) | (b[b.length - 1] << 24)) >>> 0 : b.length);

export function inspect(bytes) {
  const xml = projectHead(bytes);
  if (!xml.includes('<PremiereData')) throw new DowngradeError('not-premiere', 'This does not look like a Premiere Pro project (.prproj).');
  const version = getProjectVersion(xml);
  return {
    version,
    release: releaseName(version),
    unrecognised: version > newestKnownVersion(),
    targets: RELEASES.filter((r) => r.version < version).reverse(),
  };
}

/**
 * Downgrade a project.
 * @param {Uint8Array} bytes - .prproj file contents (gzipped or plain XML)
 * @param {number} [targetVersion] - XML project version to write; default: one release below the source
 * @returns {{bytes: Uint8Array, sourceVersion:number, targetVersion:number, inserted:Object, unrecognised:boolean}}
 */
export function downgrade(bytes, targetVersion) {
  const head = projectHead(bytes);
  if (!head.includes('<PremiereData')) throw new DowngradeError('not-premiere', 'This does not look like a Premiere Pro project (.prproj).');
  const sourceVersion = getProjectVersion(head);
  const unrecognised = sourceVersion > newestKnownVersion();
  let target = targetVersion;
  if (!target) {
    const prev = previousRelease(sourceVersion);
    if (!prev) throw new DowngradeError('no-older', 'There is no older Premiere release to convert this project to.');
    target = prev.version;
  } else if (target >= sourceVersion) {
    throw new DowngradeError('not-older', `This project is already from Premiere ${releaseName(sourceVersion) ?? sourceVersion}. Pick an older version.`);
  }
  const reinsert = needsFieldReinsertion(sourceVersion, target);
  if (!reinsert) return { bytes: regateStream(bytes, target), sourceVersion, targetVersion: target, inserted: {}, unrecognised };
  const tooBig = () => new DowngradeError('too-large', `This project (${Math.round(bytes.length / 1e6)} MB) is too large to convert to Premiere ${releaseName(target) ?? target} in the browser: going below 2026 means rebuilding the whole project in memory. Premiere 27 to 2026 works at any size. For older versions, try a computer with more memory, or export the sequences as Final Cut Pro XML from the newer Premiere.`);
  const size = inflatedSize(bytes);
  if (size > MAX_XML_BYTES || (isGz(bytes) && size < bytes.length)) throw tooBig(); // size < compressed: the 4 GiB counter wrapped
  try {
    let xml = decodeProject(bytes);
    let inserted = {};
    ({ xml, stats: inserted } = reconstruct(xml));
    xml = setProjectVersion(xml, target);
    verify(xml, target, reinsert);
    return { bytes: gzipSync(strToU8(xml), { level: 9 }), sourceVersion, targetVersion: target, inserted, unrecognised };
  } catch (e) {
    if (!tooLarge(e)) throw e;
    throw tooBig();
  }
}

// ---------------------------------------------------------------------------
// Productions (prem-down production.go)
// A Production is a folder with exactly one .prodset (JSON) plus any number of
// .prproj files. Every project is downgraded, everything else copied as-is, and
// the .prodset is renamed to match the new folder name.
// ---------------------------------------------------------------------------
export const FIRST_PRODUCTION_VERSION = 38; // Premiere 2020.1, April 2020
const FIRST_UTF8_PRODSET_VERSION = 45;      // 2026 writes UTF-8, 2025 and older UTF-16LE
const PRODSET_VERSION_RE = /("mProjectVersion"\s*:\s*)(\d+)/g;
const PRODSET_MINCOMPAT_RE = /("mMinCompatibleProjectVersion"\s*:\s*)(\d+)/g;

function decodeProdset(raw) {
  let b = raw;
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  let utf16 = false;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { b = b.subarray(2); utf16 = true; }
  else if (b.length >= 2 && b[0] === 0x7b && b[1] === 0) utf16 = true;
  if (!utf16) return strFromU8(b);
  if (b.length % 2) throw new DowngradeError('prodset', 'The Production settings file is damaged (UTF-16 ends mid-character).');
  return new TextDecoder('utf-16le').decode(b);
}

function encodeProdset(js, version) {
  if (version >= FIRST_UTF8_PRODSET_VERSION) return strToU8(js);
  const out = new Uint8Array(js.length * 2); // no BOM, like Adobe
  for (let i = 0; i < js.length; i++) { const c = js.charCodeAt(i); out[2 * i] = c & 0xff; out[2 * i + 1] = c >> 8; }
  return out;
}

function parseProdset(js) {
  let v;
  try { v = JSON.parse(js); } catch (_) { throw new DowngradeError('prodset', 'This does not look like a Production settings file (.prodset).'); }
  if (typeof v.mProjectVersion !== 'number') throw new DowngradeError('prodset', 'The Production settings file has no project version.');
  return { project: v.mProjectVersion, minCompatible: typeof v.mMinCompatibleProjectVersion === 'number' ? v.mMinCompatibleProjectVersion : null };
}

function setProdsetKey(js, re, name, value) {
  const n = (js.match(re) || []).length;
  if (n !== 1) throw new DowngradeError('prodset', `Expected exactly one "${name}" key, found ${n}.`);
  return js.replace(re, (_, a) => `${a}${value}`);
}

export function prodsetVersion(bytes) { return parseProdset(decodeProdset(bytes)).project; }

export function downgradeProdset(bytes, target) {
  let js = decodeProdset(bytes);
  const v = parseProdset(js);
  if (target >= v.project) throw new DowngradeError('not-older', 'This Production is not newer than the version you picked.');
  if (target < FIRST_PRODUCTION_VERSION) throw new DowngradeError('production-too-old', 'Productions only exist since Premiere Pro 2020 (April 2020). Pick 2020.1 or newer.');
  js = setProdsetKey(js, PRODSET_VERSION_RE, 'mProjectVersion', target);
  if (v.minCompatible !== null && v.minCompatible > target) js = setProdsetKey(js, PRODSET_MINCOMPAT_RE, 'mMinCompatibleProjectVersion', target);
  const out = encodeProdset(js, target);
  const check = parseProdset(decodeProdset(out));
  if (check.project !== target || (check.minCompatible !== null && check.minCompatible > target)) {
    throw new DowngradeError('verify', 'Production settings check failed.');
  }
  return out;
}

/**
 * Downgrade a Production folder.
 * @param {{path:string, bytes:Uint8Array}[]} files - paths relative to the Production folder's parent ("MyProd/MyProd.prodset", ...)
 * @param {number} [target] - default: one release below the Production's version
 * @returns {{files:{path:string, bytes:Uint8Array}[], folder:string, targetVersion:number, projects:number, copied:number, errors:{path:string, error:string}[]}}
 */
export function downgradeProduction(files, target) {
  const prodsets = files.filter((f) => /\.prodset$/i.test(f.path));
  if (prodsets.length !== 1) {
    throw new DowngradeError('not-production', prodsets.length
      ? `Found ${prodsets.length} .prodset files; a Production has exactly one.`
      : 'This folder is not a Premiere Production (no .prodset file).');
  }
  const ps = prodsets[0];
  const parts = ps.path.split('/');
  const folder = parts.length > 1 ? parts[0] : ps.path.replace(/\.prodset$/i, '');
  const source = prodsetVersion(ps.bytes);
  if (!target) {
    const prev = previousRelease(source);
    if (!prev) throw new DowngradeError('no-older', 'There is no older Premiere release to convert this Production to.');
    target = prev.version;
  }
  if (target < FIRST_PRODUCTION_VERSION) throw new DowngradeError('production-too-old', 'Productions only exist since Premiere Pro 2020 (April 2020).');
  const newFolder = `${folder}_downgraded`;
  const out = [];
  const errors = [];
  let projects = 0;
  let copied = 0;
  const rebase = (p) => (p.startsWith(folder + '/') ? newFolder + p.slice(folder.length) : `${newFolder}/${p}`);
  for (const f of files) {
    try {
      if (f === ps) {
        out.push({ path: `${newFolder}/${newFolder}.prodset`, bytes: downgradeProdset(f.bytes, target) });
        projects++;
      } else if (/\.prproj$/i.test(f.path)) {
        try {
          out.push({ path: rebase(f.path), bytes: downgrade(f.bytes, target).bytes });
          projects++;
        } catch (e) {
          if (e.code !== 'not-older') throw e;
          out.push({ path: rebase(f.path), bytes: f.bytes });
          copied++;
        }
      } else {
        out.push({ path: rebase(f.path), bytes: f.bytes });
        copied++;
      }
    } catch (e) {
      errors.push({ path: f.path, error: e.message });
    }
  }
  return { files: out, folder: newFolder, targetVersion: target, sourceVersion: source, projects, copied, errors };
}
