// OpenOlder UI: Ableton Live set inspector and Live 12 -> 11 converter (beta).
(function () {
  const $ = (s) => document.querySelector(s);
  const drop = $('#drop'), input = $('#file'), status = $('#status'), panel = $('#result'), btn = $('#convert');
  const worker = new Worker('/worker-als.js', { type: 'module' });
  let reqId = 0; const pending = new Map(); let current = null;
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error)); };
  const call = (type, payload) => new Promise((resolve, reject) => { const id = ++reqId; pending.set(id, { resolve, reject }); worker.postMessage({ id, type, payload }); });
  // Anonymous usage count (see functions/api/e.js): event name and a short category only.
  const track = (e, d) => { try { navigator.sendBeacon('/api/e', JSON.stringify({ e, d: d || '', p: location.pathname })); } catch (_) { /* ignore */ } };
  const setStatus = (m, k) => { status.textContent = m; status.className = 'status ' + (k || ''); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function download(name, bytes) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function renderReport(r, name) {
    const t = r.tracks;
    const rows = [
      ['File', esc(name)],
      ['Saved with', esc(r.creator || `Live (version ${r.minor})`)],
      ['Tempo', r.tempo ? `${r.tempo} BPM` : '–'],
      ['Tracks', `${t.midi} MIDI · ${t.audio} audio · ${t.returns} return · ${t.groups} group`],
      ['Plug-ins', r.plugins.length ? r.plugins.map(esc).join(', ') : 'None'],
      ['Samples referenced', String(r.sampleCount)],
    ];
    let html = `<table class="spec"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
    const lost = [...r.live12Only.map((d) => `${d.label} (${d.count}×), a Live 12 device`)];
    if (r.midiTakes) lost.push(`${r.midiTakes} MIDI take lane(s)`);
    if (r.canDowngrade) {
      html += lost.length
        ? `<p class="warnbox"><strong>Will be removed in Live 11:</strong> ${lost.map(esc).join('; ')}. Freeze and flatten those tracks in Live 12 first if you want to keep their sound.</p>`
        : '<p class="muted">No Live 12-only devices found.</p>';
    }
    $('#report').innerHTML = html;
    btn.hidden = !r.canDowngrade;
  }
  async function handle(file) {
    if (!file) return;
    if (!/\.als$/i.test(file.name)) return track('als_fail', 'not_als'), setStatus('Please choose an Ableton Live set (.als).', 'error');
    panel.hidden = true; setStatus(`Reading ${file.name}…`, 'busy');
    try {
      const r = await call('inspect', { file }); current = file; renderReport(r, file.name); panel.hidden = false;
      track('als_ok', `live${r.major ?? 'unknown'}`);
      setStatus(r.canDowngrade ? '' : `This set is from Live ${r.major ?? '?'}. Only Live 12 sets can be converted to Live 11; the report above still applies.`, r.canDowngrade ? '' : 'ok');
    } catch (err) { track('als_fail', 'error'); setStatus(err.message, 'error'); }
  }
  async function convert() {
    if (!current) return; btn.disabled = true; setStatus('Converting…', 'busy');
    try {
      const r = await call('downgrade', { file: current });
      download(current.name.replace(/\.als$/i, '') + '_Live11.als', r.bytes);
      track('als_convert_ok', 'live11');
      setStatus('Done. Open the downloaded set in Live 11 and check it before you rely on it. Keep the original.', 'ok');
    } catch (err) { track('als_convert_fail', 'error'); setStatus(err.message, 'error'); } finally { btn.disabled = false; }
  }
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => handle(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
  btn.addEventListener('click', convert);
})();
