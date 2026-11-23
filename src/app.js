// OpenOlder UI: Premiere Pro project / Production downgrader.
(function () {
  const CFG = Object.assign({ defaultTarget: null }, window.OPENOLDER_CONFIG || {});
  // UI messages; translated pages set window.OPENOLDER_I18N (built from src/i18n/<lang>.json "app").
  const MSG = Object.assign({
    readingOne: 'Reading {name}…', readingMany: 'Reading {n} files…', production: 'Production', prodCounts: '{projects} projects, {other} other files',
    version: 'version {v}', noOlderProduction: 'There is no older Premiere version this Production can be converted to.',
    notProjects: 'None of these files could be read as Premiere Pro projects.', alreadyOldest: 'These projects are already from the oldest Premiere version we know.',
    converting: 'Converting…', doneProject: 'Done. Open the downloaded project in Premiere Pro {version}. Features that only exist in newer versions will not appear.',
    doneFiles: 'Done. Open the downloaded files in Premiere Pro {version}. Features that only exist in newer versions will not appear.',
    partial: ' {n} file(s) could not be converted: {names}.', errors: {},
    untested: 'This project was saved by a Premiere release newer than Premiere 27. Converting it has not been tested yet, so the result may not open. Keep the original. If it fails, email hello@openolder.com: support for the new release is being added.',
  }, window.OPENOLDER_I18N || {});
  const t = (k, v) => MSG[k].replace(/\{(\w+)\}/g, (_, n) => v[n]);
  const tErr = (m) => MSG.errors[m] || m;
  const $ = (s) => document.querySelector(s);
  const drop = $('#drop'), input = $('#file'), folderInput = $('#folder'), status = $('#status');
  const panel = $('#result'), list = $('#items'), targetEl = $('#target'), btn = $('#convert');
  const RELEASES = [[38, '2020.1'], [39, '2021'], [40, '2022'], [41, '2023'], [42, '2024'], [43, '2025'], [45, '2026'], [46, '27']];
  const RELEASES_ALL = [[22, 'CS4'], [23, 'CS5'], [24, 'CS5.5'], [25, 'CS6'], [26, 'CC'], [27, '2014'], [28, '2014.1'], [29, '2015'], [30, '2015.1'], [32, '2017'], [33, '2018'], [34, '2018.1'], [35, '2019'], [36, '2019.1'], [37, '2020'], ...RELEASES];

  const worker = new Worker('/worker.js', { type: 'module' });
  let reqId = 0; const pending = new Map(); let analysis = null;
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error)); };
  const call = (type, payload) => new Promise((resolve, reject) => { const id = ++reqId; pending.set(id, { resolve, reject }); worker.postMessage({ id, type, payload }); });
  const setStatus = (m, k) => { status.textContent = m; status.className = 'status ' + (k || ''); };
  // Anonymous usage count (see functions/api/e.js): event name and a short category only.
  const track = (e, d) => { try { navigator.sendBeacon('/api/e', JSON.stringify({ e, d: d || '', p: location.pathname })); } catch (_) { /* ignore */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const relName = (v) => (RELEASES_ALL.find(([n]) => n === v) || [, t('version', { v })])[1];

  function download(name, bytes) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // Read dropped folders recursively (Chrome, Edge, Firefox, Safari).
  async function entriesToItems(entries) {
    const out = [];
    const readAll = (reader) => new Promise((res, rej) => { const acc = []; const step = () => reader.readEntries((b) => { if (!b.length) return res(acc); acc.push(...b); step(); }, rej); step(); });
    async function walk(entry, prefix) {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ path: prefix + entry.name, file });
      } else if (entry.isDirectory) {
        for (const child of await readAll(entry.createReader())) await walk(child, prefix + entry.name + '/');
      }
    }
    for (const e of entries) if (e) await walk(e, '');
    return out;
  }

  function fillTargets(sourceVersion, minVersion) {
    targetEl.innerHTML = '';
    const opts = RELEASES_ALL.filter(([v]) => v < sourceVersion && v >= (minVersion || 0)).reverse();
    opts.forEach(([v, n], i) => {
      const o = document.createElement('option'); o.value = v; o.textContent = `Premiere Pro ${n}`;
      if ((CFG.defaultTarget && v === CFG.defaultTarget) || (!CFG.defaultTarget && i === 0)) o.selected = true;
      targetEl.appendChild(o);
    });
    if (CFG.defaultTarget && ![...targetEl.options].some((o) => o.selected && +o.value === CFG.defaultTarget) && targetEl.options.length) targetEl.options[0].selected = true;
    return opts.length;
  }

  // For diagnosing failed reads without knowing the file: its extension, what its first bytes say it is, and a size range.
  async function describe(it) {
    const f = it && it.file;
    if (!f) return 'none:none:none';
    const m = /\.([a-z0-9]{1,8})$/i.exec(f.name || ''); const ext = m ? m[1].toLowerCase() : 'none';
    let sig = 'unread';
    try {
      const b = new Uint8Array(await f.slice(0, 8).arrayBuffer());
      const s = (x) => x.every((v, i) => b[i] === v);
      sig = !b.length ? 'empty' : s([0x1f, 0x8b]) ? 'gzip' : s([0x50, 0x4b]) ? 'zip' : s([0x37, 0x7a, 0xbc, 0xaf]) ? '7z'
        : (s([0x3c]) || s([0xef, 0xbb, 0xbf, 0x3c]) || s([0xff, 0xfe]) || s([0x7b])) ? 'xml' : s([0x25, 0x50, 0x44, 0x46]) ? 'pdf' : 'other';
    } catch (_) { /* keep 'unread' */ }
    const mb = f.size / 1e6;
    const size = mb < 1 ? 'lt1mb' : mb < 10 ? '1-10mb' : mb < 50 ? '10-50mb' : 'gt50mb';
    return `${ext}:${sig}:${size}`;
  }
  const failedItem = (items, analysis) => {
    const bad = analysis && analysis.items ? analysis.items.find((x) => x.error) : null;
    return (bad && items.find((x) => x.path === bad.path)) || items[0];
  };

  async function handle(items) {
    if (!items.length) return;
    panel.hidden = true; setStatus(items.length === 1 ? t('readingOne', { name: items[0].path }) : t('readingMany', { n: items.length }), 'busy');
    try {
      analysis = await call('analyse', { items });
      if (analysis.mode === 'production') {
        list.innerHTML = `<tr><td class="lname">${esc(analysis.name)} <span class="muted">(${esc(MSG.production)})</span></td><td>Premiere Pro ${esc(relName(analysis.version))}</td><td class="num">${esc(t('prodCounts', { projects: analysis.projects, other: analysis.other }))}</td></tr>`;
        if (!fillTargets(analysis.version, analysis.firstProduction)) return track('analyze_fail', 'no_older'), setStatus(MSG.noOlderProduction, 'error');
      } else {
        list.innerHTML = analysis.items.map((it) => `<tr><td class="lname">${esc(it.path.split('/').pop())}</td><td>${it.error ? `<span class="err">${esc(tErr(it.error))}</span>` : 'Premiere Pro ' + esc(it.release || relName(it.version))}</td><td></td></tr>`).join('');
        const ok = analysis.items.filter((it) => !it.error);
        if (!ok.length) { track('analyze_fail', `not_project:${await describe(failedItem(items, analysis))}`); return setStatus(MSG.notProjects, 'error'); }
        if (!fillTargets(Math.min(...ok.map((it) => it.version)))) return track('analyze_fail', 'no_older'), setStatus(MSG.alreadyOldest, 'error');
      }
      const mode = analysis.mode === 'production' ? 'production' : items.length > 1 ? 'batch' : 'single';
      const from = analysis.mode === 'production' ? analysis.version : Math.min(...analysis.items.filter((it) => !it.error).map((it) => it.version));
      track('analyze_ok', `${mode}:${relName(from)}`);
      panel.hidden = false;
      $('#batch').hidden = analysis.mode === 'production';
      // A release newer than the newest one we know (e.g. Premiere 27): may have changed the format again.
      const newest = 46; // newest release verified in real Premiere (27, verified 2026-11-22)
      const maxSeen = analysis.mode === 'production' ? analysis.version : Math.max(...analysis.items.filter((it) => !it.error).map((it) => it.version));
      setStatus(maxSeen > newest ? MSG.untested : '', maxSeen > newest ? 'error' : '');
    } catch (err) { track('analyze_fail', `error:${await describe(items[0])}`); setStatus(tErr(err.message), 'error'); }
  }

  async function convert() {
    if (!analysis) return;
    btn.disabled = true; setStatus(MSG.converting, 'busy');
    try {
      const target = parseInt(targetEl.value, 10);
      const r = await call('convert', { target });
      download(r.name, r.bytes);
      let msg = t(/\.zip$/.test(r.name) ? 'doneFiles' : 'doneProject', { version: relName(target) });
      if (r.errors?.length) msg += t('partial', { n: r.errors.length, names: r.errors.map((e) => e.path.split('/').pop()).join(', ') });
      const mode = analysis.mode === 'production' ? 'production' : /\.zip$/.test(r.name) ? 'batch' : 'single';
      track('convert_ok', `${mode}:${relName(target)}`);
      if (r.errors?.length) track('convert_fail', 'partial');
      setStatus(msg, r.errors?.length ? 'error' : 'ok');
    } catch (err) { track('convert_fail', 'error'); setStatus(tErr(err.message), 'error'); } finally { btn.disabled = false; }
  }

  drop.addEventListener('click', (e) => { if (e.target.id !== 'pick-folder') input.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  $('#pick-folder').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); folderInput.click(); });
  input.addEventListener('change', () => handle([...input.files].map((f) => ({ path: f.name, file: f }))));
  folderInput.addEventListener('change', () => handle([...folderInput.files].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async (e) => {
    const its = e.dataTransfer.items;
    if (its && its.length && its[0].webkitGetAsEntry) handle(await entriesToItems([...its].map((i) => i.webkitGetAsEntry())));
    else handle([...e.dataTransfer.files].map((f) => ({ path: f.name, file: f })));
  });
  btn.addEventListener('click', convert);
  // Version list as CSV (file, saved with, status). Opens in Excel; a BOM keeps accents readable.
  $('#csv').addEventListener('click', () => {
    if (!analysis || analysis.mode === 'production') return;
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['file', 'saved_with', 'project_version', 'status']].concat(analysis.items.map((it) => [
      it.path, it.error ? 'unknown' : `Premiere ${it.release || relName(it.version)}`, it.error ? '' : it.version, it.error ? tErr(it.error) : 'ok',
    ]));
    download('premiere_project_versions.csv', new TextEncoder().encode('\ufeff' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'));
    track('versions_csv', `n${Math.min(analysis.items.length, 50)}`);
  });
})();
