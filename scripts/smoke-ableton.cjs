// E2E for the Ableton page: inspect + convert a synthetic Live 12 set in headless Chromium.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os');
const dist = path.resolve(__dirname, '../dist');
const PORT = +(process.env.PORT || 8812);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p); if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT);
const src = fs.readFileSync(path.resolve(__dirname, '../test/als.test.mjs'), 'utf8');
const xml = src.slice(src.indexOf('<?xml'), src.indexOf('</Ableton>') + 10).replace(/\\t/g, '\t');
const setFile = path.join(os.tmpdir(), 'synthetic_live12.als'); fs.writeFileSync(setFile, zlib.gzipSync(xml));
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const b = await chromium.launch(proxy ? { proxy } : {});
  const ctx = await b.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage(); let fail = 0; p.on('pageerror', (e) => { fail++; console.log('pageerror', e.message); });
  await p.goto(BASE + '/ableton-12-to-11/');
  await p.setInputFiles('#file', setFile);
  await p.waitForSelector('#result:not([hidden])', { timeout: 30000 });
  const report = await p.textContent('#report'); console.log('report:', report.replace(/\s+/g, ' ').slice(0, 300));
  if (!/128 BPM/.test(report) || !/Serum/.test(report) || !/Roar/.test(report)) fail++;
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#convert')]);
  const out = path.join(os.tmpdir(), 'oo_live11.als'); await dl.saveAs(out);
  const x = zlib.gunzipSync(fs.readFileSync(out)).toString();
  const ok = x.includes('MinorVersion="11.0_11300"') && x.includes('<MasterTrack>') && !x.includes('<Roar');
  console.log('download:', dl.suggestedFilename(), 'converted ok:', ok); if (!ok) fail++;
  await b.close(); server.close(); console.log('failures:', fail); process.exit(fail ? 1 : 0);
})();
