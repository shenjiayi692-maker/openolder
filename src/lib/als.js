// Ableton Live set (.als) tools: inspect a set, and convert a Live 12 set to Live 11.
//
// The Live 12 -> Live 11 conversion rules are a JavaScript port of the down direction of
// live_set (https://github.com/mslinn/live_set), lib/live_set/tx/live_11_and_12.rb and
// lib/live_set/tx/live_version_converter.rb, Copyright (c) 2026 Michael Slinn, used under the
// Live Set Tools Noncommercial License 1.0 (see /licenses/ and LICENSES/live_set.md).
//
// Significant modifications (as required by that license):
//   - Ported from Ruby/Nokogiri to JavaScript with a small formatting-preserving XML tree,
//     so the conversion runs in the browser.
//   - Only the Live 12 -> 11 ("down") direction is implemented.
//   - The source version is detected by MinorVersion prefix "12." instead of one exact string.
//   - Added an inspection report (tempo, tracks, plugins, Live 12-only content).
//
// This file (and anything derived from live_set) may be used for noncommercial purposes only.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';

export class AlsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------------------------------------------------------------------
// Minimal XML tree that keeps Live's formatting. Elements whose attributes are
// not modified are written back byte-for-byte.
// ---------------------------------------------------------------------------
const TAG_RE = /<[^>]+>/g;
const ATTR_RE = /([\w:.\-]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(openTag) {
  const attrs = [];
  const body = openTag.replace(/^<[\w.\-:]+/, '');
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(body)) !== null) attrs.push([m[1], m[2]]);
  return attrs;
}

class El {
  constructor(name, openTag, selfClosing) {
    this.name = name; this.openTag = openTag; this.selfClosing = selfClosing;
    this.children = []; this.parent = null; this._attrs = null; this.dirty = false;
  }
  get attrs() { if (!this._attrs) this._attrs = parseAttrs(this.openTag); return this._attrs; }
  get(k) { const a = this.attrs.find(([n]) => n === k); return a ? a[1] : undefined; }
  has(k) { return this.attrs.some(([n]) => n === k); }
  set(k, v) {
    const a = this.attrs.find(([n]) => n === k);
    if (a) a[1] = v; else this.attrs.push([k, v]);
    this.dirty = true;
  }
  delAttr(k) {
    const i = this.attrs.findIndex(([n]) => n === k);
    if (i >= 0) { this.attrs.splice(i, 1); this.dirty = true; }
  }
  rename(n) { this.name = n; this.dirty = true; }
  elements() { return this.children.filter((c) => c instanceof El); }
  child(n) { return this.children.find((c) => c instanceof El && c.name === n); }
  remove() {
    if (!this.parent) return;
    const sib = this.parent.children;
    const i = sib.indexOf(this);
    if (i < 0) return;
    // drop the indentation text in front of the element as well
    const prev = sib[i - 1];
    if (typeof prev === 'string' && prev.trim() === '' && i > 0) sib.splice(i - 1, 2); else sib.splice(i, 1);
    this.parent = null;
  }
  clear() { this.children = []; if (this.selfClosing) return; }
  indent() {
    const t = this.children.find((c) => typeof c === 'string' && c.includes('\n'));
    return t && t.trim() === '' ? t : '\n';
  }
  wsBefore(ref) {
    const i = this.children.indexOf(ref);
    const prev = this.children[i - 1];
    return typeof prev === 'string' && prev.trim() === '' ? prev : null;
  }
  insertBefore(newEl, ref) {
    const ws = this.wsBefore(ref);
    const i = this.children.indexOf(ref);
    newEl.parent = this;
    if (ws) this.children.splice(i, 0, newEl, ws); else this.children.splice(i, 0, newEl);
  }
  insertAfter(newEl, ref) {
    const sib = this.children;
    const i = sib.indexOf(ref);
    newEl.parent = this;
    const prev = sib[i - 1];
    const ws = typeof prev === 'string' && prev.trim() === '' ? prev : '';
    sib.splice(i + 1, 0, ...(ws ? [ws, newEl] : [newEl]));
  }
  append(newEl) {
    newEl.parent = this;
    if (this.selfClosing) { this.selfClosing = false; this.dirty = true; }
    const sib = this.children;
    const last = sib[sib.length - 1];
    if (typeof last === 'string' && last.trim() === '') {
      const inner = this.indent();
      sib.splice(sib.length - 1, 0, inner, newEl);
    } else sib.push(newEl);
  }
  render() {
    let open;
    if (!this.dirty) open = this.openTag;
    else {
      const a = this.attrs.map(([k, v]) => ` ${k}="${v}"`).join('');
      open = `<${this.name}${a}${this.selfClosing ? ' />' : '>'}`;
    }
    if (this.selfClosing) return open;
    let s = open;
    for (const c of this.children) s += typeof c === 'string' ? c : c.render();
    return s + `</${this.name}>`;
  }
}

export function parse(xml) {
  const root = new El('#document', '', false);
  let cur = root;
  let pos = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(xml)) !== null) {
    if (m.index > pos) cur.children.push(xml.slice(pos, m.index));
    const tok = m[0];
    pos = m.index + tok.length;
    if (tok.startsWith('<?') || tok.startsWith('<!')) { cur.children.push(tok); continue; }
    if (tok.startsWith('</')) {
      const name = tok.slice(2, -1).trim();
      if (cur === root || cur.name !== name) throw new AlsError('xml', 'This set looks damaged (unbalanced XML).');
      cur = cur.parent;
      continue;
    }
    const nm = /^<([\w.\-:]+)/.exec(tok);
    if (!nm) { cur.children.push(tok); continue; }
    const el = new El(nm[1], tok, tok.endsWith('/>'));
    el.parent = cur;
    cur.children.push(el);
    if (!el.selfClosing) cur = el;
  }
  if (pos < xml.length) cur.children.push(xml.slice(pos));
  if (cur !== root) throw new AlsError('xml', 'This set looks damaged (unclosed XML).');
  return root;
}

export const serialize = (doc) => doc.children.map((c) => (typeof c === 'string' ? c : c.render())).join('');

function* walk(el) {
  for (const c of el.children) if (c instanceof El) { yield c; yield* walk(c); }
}
const all = (doc, name) => [...walk(doc)].filter((e) => e.name === name);
// "A/B/C": elements named C whose parent is B whose parent is A.
function byPath(doc, path) {
  const parts = path.split('/');
  const last = parts.pop();
  return all(doc, last).filter((e) => {
    let p = e.parent;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!p || p.name !== parts[i]) return false;
      p = p.parent;
    }
    return true;
  });
}
const mk = (name, attrs = {}) => {
  const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  return new El(name, `<${name}${a} />`, true);
};

// ---------------------------------------------------------------------------
// Live 12 -> Live 11 rules (live_set, Live11And12, down direction)
// ---------------------------------------------------------------------------
const LIVE11 = {
  Creator: 'Ableton Live 11.3.21', MajorVersion: '5', MinorVersion: '11.0_11300',
  Revision: '5ac24cad7c51ea0671d49e6b4885371f15b57c1e', SchemaChangeCount: '3',
};
const REMOVE = `ArrangementClipsListWrapper AudioInputsListWrapper AudioOutputsListWrapper
AutomationEnvelopesListWrapper BreakoutIsExpanded ComplexProEnvelopeModulationTarget
ComplexProFormantsModulationTarget ControllerLayoutCustomization ControllerLayoutRemoteable
DefaultGrooveId InstrumentMeld IsTuned IsUndoable IsWaveformVerticalZoomActive
KeepRecordMonitoringLatency LocalFiltersJson MidiInputsListWrapper MidiOutputsListWrapper
MpePitchBendUsesTuning MpeTuningEnabled MxDIntParameter NoteAlgorithms NoteProbabilityGroups
ProbabilityGroupIdGenerator Roar SamplesToAutoWarp SelectedBreakpointValue
SelectedDocumentViewInMainWindow ShouldSceneTempoAndTimeSignatureBeVisible SourceHint
TakeLanesListWrapper TransientEnvelopeModulationTarget TuningSystems
ViewStateMainWindowClipDetailOpen ViewStateMainWindowDeviceDetailOpen
ViewStateMainWindowHiddenOtherDocViewTypeClipDetailOpen
ViewStateMainWindowHiddenOtherDocViewTypeDeviceDetailOpen ViewStateSecondWindowClipDetailOpen
ViewStateSecondWindowDeviceDetailOpen WaveformVerticalZoomFactor`.split(/\s+/);
const REMOVE_UNDER = ['AudioClip/IsInKey', 'AudioClip/ScaleInformation', 'CrossFadeState/MidiControllerRange',
  'GroovePool/GroovesListWrapper', 'LiveSet/NoteSpellingPreference', 'LiveSet/ViewStateArrangerMixerVolumeSectionHeight',
  'MidiClip/AccidentalSpellingPreference', 'TimeSignature/MidiControllerRange'];
const RENAME = {
  AutoColorPickerForReturnAndMainTracks: 'AutoColorPickerForReturnAndMasterTracks',
  IsSongTempoLeader: 'IsSongTempoMaster', MainTrack: 'MasterTrack',
  ReWireDeviceMidiTargetId: 'ReWireSlaveMidiTargetId', ViewStateSessionTrackWidth: 'ViewStateSesstionTrackWidth',
};
const RENAME_UNDER = {
  'ContentLanes/MidiEditorLaneModel': 'ExpressionLane', 'ExpressionLanes/MidiEditorLaneModel': 'ExpressionLane',
  'LiveSet/ViewStateSessionMixerVolumeSectionHeight': 'ViewStateSessionMixerHeight',
  'PatchSlot/Value/MxPatchRef': 'MxDPatchRef', 'ScaleInformation/Root': 'RootNote',
};
const EMPTY = ['AudioSequencer/ClipSlotList', 'MidiTrack/TakeLanes/TakeLanes', 'Mixer/Sends', 'SendsPre', 'TimeAndValueTransforms'];
const REMOVE_ATTR = ['SelectedGeneratorName', 'SelectedToolPanel', 'SelectedTransformationName'];
const DEFAULT_ATTR = {
  MidiNoteEvent: [['VelocityDeviation', '0'], ['Probability', '1'], ['IsEnabled', 'true']],
  PerNoteEvent: [['CurveControl1X', '0.5'], ['CurveControl1Y', '0.5'], ['CurveControl2X', '0.5'], ['CurveControl2Y', '0.5']],
};
const SCALE_INDEXES = { 0: 'Major' };

// Live 12-only things a musician will notice are lost.
export const LIVE12_ONLY_DEVICES = { Roar: 'Roar', InstrumentMeld: 'Meld' };

function convertDown(doc) {
  const root = all(doc, 'Ableton')[0];
  // version strings
  for (const [k] of [...root.attrs]) if (!(k in LIVE11)) root.delAttr(k);
  for (const [k, v] of Object.entries(LIVE11)) root.set(k, v);
  // remove elements / attributes
  for (const n of REMOVE) all(doc, n).forEach((e) => e.remove());
  for (const p of REMOVE_UNDER) byPath(doc, p).forEach((e) => e.remove());
  for (const a of REMOVE_ATTR) for (const e of walk(doc)) if (e.has(a)) e.delAttr(a);
  // renames (collected first so nothing is renamed twice)
  const both = { ...RENAME, ...Object.fromEntries(Object.entries(RENAME).map(([a, b]) => [b, a])) };
  const toRename = [...walk(doc)].filter((e) => e.name in both).map((e) => [e, both[e.name]]);
  toRename.forEach(([e, n]) => e.rename(n));
  const under = Object.entries(RENAME_UNDER).flatMap(([p, n]) => byPath(doc, p).map((e) => [e, n]));
  under.forEach(([e, n]) => e.rename(n));
  // empty
  for (const p of EMPTY) byPath(doc, p).forEach((e) => { e.children = []; });
  // default attributes
  for (const [n, attrs] of Object.entries(DEFAULT_ATTR)) {
    for (const e of all(doc, n)) for (const [k, v] of attrs) if (!e.has(k)) e.set(k, v);
  }
  // special transformations
  for (const e of all(doc, 'Oversampling')) {
    if (e.parent?.name !== 'Saturator') continue;
    const map = { true: '1', false: '0' };
    const v = e.get('Value');
    if (v in map) e.set('Value', map[v]);
  }
  for (const e of all(doc, 'Target')) if (e.get('Value') === 'AudioOut/Main') e.set('Value', 'AudioOut/Master');
  for (const scroll of byPath(doc, 'LiveSet/SessionScrollPos')) {
    const ws = scroll.parent.wsBefore(scroll) || '\n';
    const values = new El('SongMasterValues', '<SongMasterValues>', false);
    const pos = mk('SessionScrollerPos', { X: scroll.get('X') ?? '0', Y: scroll.get('Y') ?? '0' });
    pos.parent = values;
    values.children = [ws + '\t', pos, ws];
    scroll.parent.insertAfter(values, scroll);
    scroll.remove();
  }
  for (const freeze of all(doc, 'PostProcessFreezeClips')) {
    const track = freeze.parent;
    track.insertBefore(mk('VelocityDetail', { Value: '0' }), freeze);
    track.insertBefore(mk('NeedArrangerRefreeze', { Value: 'true' }), freeze);
  }
  for (const slot of all(doc, 'ClipSlot')) {
    const hasStop = slot.child('HasStop');
    if (hasStop && !slot.child('NeedRefreeze')) slot.insertAfter(mk('NeedRefreeze', { Value: 'true' }), hasStop);
  }
  for (const set of all(doc, 'LiveSet')) {
    if (set.child('ChooserBar')) continue;
    const ann = set.child('Annotation');
    const chooser = mk('ChooserBar', { Value: '0' });
    if (ann) set.insertBefore(chooser, ann); else set.append(chooser);
  }
  for (const clip of all(doc, 'MidiClip')) {
    const anchor = clip.child('NoteSpellingPreference') || clip.child('ExpressionGrid');
    if (!anchor) continue;
    for (const n of ['ScaleInformation', 'IsInKey']) {
      const el = clip.child(n);
      if (!el) continue;
      el.remove();
      clip.insertBefore(el, anchor);
    }
  }
  for (const tl of byPath(doc, 'MidiTrack/TakeLanes/TakeLanes')) tl.children = [];
  for (const lane of all(doc, 'TakeLane')) { lane.child('LomId')?.remove(); lane.delAttr('Id'); }
  for (const vd of all(doc, 'ViewData')) if (vd.parent?.child('SourceContext')) vd.remove();
  for (const dev of [...all(doc, 'MxDeviceMidiEffect'), ...all(doc, 'MxDeviceAudioEffect')]) {
    const list = dev.child('IdRefList');
    if (list) { list.children = []; list.append(new El('IdRefList', '<IdRefList />', true)); }
    const sc = dev.child('SourceContext');
    if (sc) for (const v of sc.elements().filter((e) => e.name === 'Value')) v.children = [];
  }
  for (const name of byPath(doc, 'ScaleInformation/Name')) {
    const v = name.get('Value');
    if (v in SCALE_INDEXES) name.set('Value', SCALE_INDEXES[v]);
  }
}

// ---------------------------------------------------------------------------
export function decode(bytes) {
  const gz = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  let raw = bytes;
  if (gz) {
    try { raw = gunzipSync(bytes); } catch (_) { throw new AlsError('gzip', 'This file is damaged and could not be decompressed.'); }
  }
  return strFromU8(raw);
}

function rootInfo(doc) {
  const root = all(doc, 'Ableton')[0];
  if (!root) throw new AlsError('not-als', 'This does not look like an Ableton Live set (.als).');
  const minor = root.get('MinorVersion') || '';
  const creator = root.get('Creator') || '';
  const major = parseInt(minor.split('.')[0], 10);
  return { root, minor, creator, major: Number.isFinite(major) ? major : null };
}

export function inspect(bytes) {
  const doc = parse(decode(bytes));
  const { creator, major, minor } = rootInfo(doc);
  const tempo = (() => {
    const t = byPath(doc, 'Tempo/Manual')[0];
    const v = t ? parseFloat(t.get('Value')) : NaN;
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  })();
  const count = (n) => all(doc, n).length;
  const tracks = { midi: count('MidiTrack'), audio: count('AudioTrack'), returns: count('ReturnTrack'), groups: count('GroupTrack') };
  const plugins = new Set();
  for (const e of all(doc, 'PlugName')) if (e.get('Value')) plugins.add(e.get('Value'));
  for (const info of all(doc, 'Vst3PluginInfo')) { const n = info.child('Name')?.get('Value'); if (n) plugins.add(n); }
  for (const info of all(doc, 'AuPluginInfo')) { const n = info.child('Name')?.get('Value'); if (n) plugins.add(n); }
  const live12Only = [];
  for (const [tag, label] of Object.entries(LIVE12_ONLY_DEVICES)) { const n = count(tag); if (n) live12Only.push({ label, count: n }); }
  const midiTakes = byPath(doc, 'MidiTrack/TakeLanes/TakeLanes').reduce((s, e) => s + e.elements().length, 0);
  const samples = new Set(all(doc, 'SampleRef').map((s) => s.child('FileRef')?.child('Path')?.get('Value') || s.child('FileRef')?.child('RelativePath')?.get('Value')).filter(Boolean));
  return { creator, minor, major, tempo, tracks, plugins: [...plugins].sort(), live12Only, midiTakes, sampleCount: samples.size, canDowngrade: major === 12 };
}

/** Convert a Live 12 set to Live 11. Returns gzipped .als bytes. */
export function downgradeTo11(bytes) {
  const doc = parse(decode(bytes));
  const { major } = rootInfo(doc);
  if (major !== 12) {
    throw new AlsError('not-12', major && major < 12
      ? `This set is already from Live ${major}. Live 12 sets only.`
      : 'Only Live 12 sets can be converted to Live 11 at the moment.');
  }
  const report = inspect(bytes);
  convertDown(doc);
  const out = serialize(doc);
  // sanity: re-parse and check the version
  const check = rootInfo(parse(out));
  if (!check.minor.startsWith('11.')) throw new AlsError('verify', 'Conversion check failed.');
  return { bytes: gzipSync(strToU8(out), { level: 6 }), report };
}
