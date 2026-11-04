// OpenOlder UI: Premiere Pro project downgrader.
(function () {
  const $ = (s) => document.querySelector(s);
  const drop = $('#drop');
  const input = $('#file');
  const status = $('#status');
  const panel = $('#result');
  const info = $('#fileinfo');
  const targetEl = $('#target');
  const btn = $('#convert');

  const worker = new Worker('/worker.js', { type: 'module' });
  let reqId = 0;
  const pending = new Map();
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
  };
  const call = (type, payload) => new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });

  let current = null;

  function setStatus(msg, kind) { status.textContent = msg; status.className = 'status ' + (kind || ''); }

  function download(name, bytes) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  async function handle(file) {
    if (!file) return;
    if (!/\.prproj$/i.test(file.name)) {
      setStatus('Please choose a Premiere Pro project file (.prproj).', 'error');
      return;
    }
    panel.hidden = true;
    setStatus(`Reading ${file.name}…`, 'busy');
    try {
      const r = await call('inspect', { file });
      current = { file, info: r };
      const from = r.release ? `Premiere Pro ${r.release}` : `an unknown Premiere version (project version ${r.version})`;
      info.textContent = `${file.name} was saved with ${from}.`;
      targetEl.innerHTML = '';
      if (!r.targets.length) {
        setStatus('This project is already from the oldest version we know about.', 'error');
        return;
      }
      r.targets.forEach((t, i) => {
        const o = document.createElement('option');
        o.value = t.version;
        o.textContent = `Premiere Pro ${t.name}`;
        if (i === 0) o.selected = true;
        targetEl.appendChild(o);
      });
      panel.hidden = false;
      setStatus(r.unrecognised ? 'This file is from a Premiere version newer than we have tested. Conversion will be attempted anyway.' : '', r.unrecognised ? 'error' : '');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function convert() {
    if (!current) return;
    btn.disabled = true;
    setStatus('Converting…', 'busy');
    try {
      const target = parseInt(targetEl.value, 10);
      const r = await call('downgrade', { file: current.file, target });
      const base = current.file.name.replace(/\.prproj$/i, '');
      download(`${base}_Premiere${r.targetName || r.targetVersion}.prproj`, r.bytes);
      let msg = `Done. Open the downloaded file in Premiere Pro ${r.targetName}. Features that only exist in Premiere ${r.sourceName} (for example new masks or new text tools) will not appear.`;
      setStatus(msg, 'ok');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => handle(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
  btn.addEventListener('click', convert);
})();
