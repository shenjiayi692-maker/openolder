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
  }, window.OPENOLDER_I18N || {});
  const t = (k, v) => MSG[k].replace(/\{(\w+)\}/g, (_, n) => v[n]);
  const tErr = (m) => MSG.errors[m] || m;
  const $ = (s) => document.querySelector(s);
  const drop = $('#drop'), input = $('#file'), folderInput = $('#folder'), status = $('#status');
  const panel = $('#result'), list = $('#items'), targetEl = $('#target'), btn = $('#convert');
  const RELEASES = [[38, '2020.1'], [39, '2021'], [40, '2022'], [41, '2023'], [42, '2024'], [43, '2025'], [45, '2026']];
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
        if (!ok.length) return track('analyze_fail', 'not_project'), setStatus(MSG.notProjects, 'error');
        if (!fillTargets(Math.min(...ok.map((it) => it.version)))) return track('analyze_fail', 'no_older'), setStatus(MSG.alreadyOldest, 'error');
      }
      const mode = analysis.mode === 'production' ? 'production' : items.length > 1 ? 'batch' : 'single';
      const from = analysis.mode === 'production' ? analysis.version : Math.min(...analysis.items.filter((it) => !it.error).map((it) => it.version));
      track('analyze_ok', `${mode}:${relName(from)}`);
      panel.hidden = false; setStatus('');
    } catch (err) { track('analyze_fail', 'error'); setStatus(tErr(err.message), 'error'); }
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
})();
