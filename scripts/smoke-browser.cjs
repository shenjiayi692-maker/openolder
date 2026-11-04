// E2E for the Premiere pages in headless Chromium: single project, batch, Production (.zip and folder), bad file.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os');
const { zipSync, unzipSync } = require(path.resolve(__dirname, '../node_modules/fflate'));
const dist = path.resolve(__dirname, '../dist');
const PORT = +(process.env.PORT || 8810);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p); if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT);
const FX = path.resolve(__dirname, '../test/fixtures');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oo-'));
const ver = (buf) => +/<Project ObjectID="1"[^>]*\bVersion="(\d+)"/.exec(zlib.gunzipSync(buf).toString())[1];
const boundsOk = (buf) => { const x = zlib.gunzipSync(buf).toString(); const d = x.match(/<VideoComponentParam[ \t\r\n][^>]*\bVersion="\d+"[^>]*>[\s\S]*?<\/VideoComponentParam>/g) || []; return d.length > 0 && d.every((s) => s.includes('<LowerBound>') && s.includes('<UpperBound>')); };

// fixtures on disk
const p26 = path.join(FX, 'fixture_ppro26.prproj');
const p26b = path.join(tmp, 'second edit.prproj'); fs.copyFileSync(p26, p26b);
const prodDir = path.join(tmp, 'MyProd'); fs.mkdirSync(path.join(prodDir, 'sub'), { recursive: true });
fs.copyFileSync(path.join(FX, 'fixture_prproduction.prodset'), path.join(prodDir, 'MyProd.prodset'));
fs.copyFileSync(p26, path.join(prodDir, 'Edit A.prproj')); fs.copyFileSync(p26, path.join(prodDir, 'sub', 'Edit B.prproj'));
fs.writeFileSync(path.join(prodDir, 'notes.txt'), 'hi');
const prodZip = path.join(tmp, 'MyProd.zip');
fs.writeFileSync(prodZip, Buffer.from(zipSync({
  'MyProd/MyProd.prodset': new Uint8Array(fs.readFileSync(path.join(prodDir, 'MyProd.prodset'))),
  'MyProd/Edit A.prproj': new Uint8Array(fs.readFileSync(p26)),
  'MyProd/sub/Edit B.prproj': new Uint8Array(fs.readFileSync(p26)),
  'MyProd/notes.txt': new TextEncoder().encode('hi'),
})));

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const b = await chromium.launch(proxy ? { proxy } : {});
  let fail = 0;
  const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label} ${extra}`); if (!cond) fail++; };
  async function run(pagePath, setFiles, pick, useFolder) {
    const ctx = await b.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
    const p = await ctx.newPage(); p.on('pageerror', (e) => { fail++; console.log('pageerror', e.message); });
    await p.goto(BASE + pagePath);
    await p.setInputFiles(useFolder ? '#folder' : '#file', setFiles);
    await p.waitForSelector('#result:not([hidden])', { timeout: 60000 });
    if (pick) await p.selectOption('#target', { label: pick });
    const sel = await p.$eval('#target', (s) => s.options[s.selectedIndex].textContent);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#convert')]);
    const out = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(out);
    if (process.env.SHOT && pagePath === '/') await p.screenshot({ path: process.env.SHOT });
    const st = await p.textContent('#status');
    await ctx.close();
    return { out, name: dl.suggestedFilename(), sel, st };
  }

  // 1. single project on the 2026->2025 page (default target 2025)
  let r = await run('/premiere-2026-to-2025/', p26);
  check('single 2026->2025', r.sel === 'Premiere Pro 2025' && ver(fs.readFileSync(r.out)) === 43 && boundsOk(fs.readFileSync(r.out)), r.name);
  // 2. 2026->2024 page default
  r = await run('/premiere-2026-to-2024/', p26);
  check('page default 2024', r.sel === 'Premiere Pro 2024' && ver(fs.readFileSync(r.out)) === 42, r.name);
  // 3. batch of two -> zip
  r = await run('/', [p26, p26b], 'Premiere Pro 2025');
  const z = unzipSync(new Uint8Array(fs.readFileSync(r.out)));
  check('batch zip', /\.zip$/.test(r.name) && Object.keys(z).length === 2 && Object.values(z).every((u) => ver(Buffer.from(u)) === 43), Object.keys(z).join(', '));
  // 4. Production as .zip
  r = await run('/premiere-production-downgrade/', prodZip, 'Premiere Pro 2025');
  const pz = unzipSync(new Uint8Array(fs.readFileSync(r.out)));
  const keys = Object.keys(pz).sort();
  const prodset = pz['MyProd_downgraded/MyProd_downgraded.prodset'];
  const prodsetTxt = prodset ? new TextDecoder('utf-16le').decode(prodset) : '';
  check('production zip', keys.includes('MyProd_downgraded/sub/Edit B.prproj') && prodsetTxt.includes('"mProjectVersion":43') && ver(Buffer.from(pz['MyProd_downgraded/Edit A.prproj'])) === 43, keys.join(', '));
  // 5. Production as a folder
  try {
    r = await run('/premiere-production-downgrade/', prodDir, 'Premiere Pro 2025', true);
    const fz = unzipSync(new Uint8Array(fs.readFileSync(r.out)));
    check('production folder', Object.keys(fz).includes('MyProd_downgraded/MyProd_downgraded.prodset'), Object.keys(fz).length + ' files');
  } catch (e) { check('production folder', false, e.message.split('\n')[0]); }
  // 6. bad file
  const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(BASE + '/');
  const bad = path.join(tmp, 'not_a_project.prproj'); fs.writeFileSync(bad, 'hello');
  await p.setInputFiles('#file', bad); await p.waitForTimeout(2000);
  const st = await p.textContent('#status'); const cell = await p.textContent('#items').catch(() => '');
  check('bad file message', /could not be read|does not look like/i.test(st + cell), (st + ' ' + cell).trim().slice(0, 120));
  // 7. all pages load
  for (const s of ['/', '/premiere-2026-to-2023/', '/project-saved-in-newer-version/', '/open-premiere-project-in-older-version/', '/licenses/', '/ableton-12-to-11/']) {
    const res = await p.goto(BASE + s); check('page ' + s, res.status() === 200);
  }
  await b.close(); server.close(); console.log('failures:', fail); process.exit(fail ? 1 : 0);
})();
