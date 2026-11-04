// E2E: open the demo in headless Chromium, convert the 2026 fixture to 2025 and 2024, verify output.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const dist = path.resolve(__dirname, '../dist');
const PORT = +(process.env.PORT || 8810);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p); if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT);
const fixture = path.resolve(__dirname, '../test/fixtures/fixture_ppro26.prproj');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const b = await chromium.launch(proxy ? { proxy } : {});
  let fail = 0;
  for (const target of ['2025', '2024']) {
    const ctx = await b.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true });
    const p = await ctx.newPage(); p.on('pageerror', (e) => { fail++; console.log('pageerror', e.message); });
    await p.goto(BASE + '/');
    await p.setInputFiles('#file', fixture);
    await p.waitForSelector('#result:not([hidden])', { timeout: 30000 });
    console.log('info:', await p.textContent('#fileinfo'));
    await p.selectOption('#target', { label: `Premiere Pro ${target}` });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#convert')]);
    const out = path.join(require('os').tmpdir(), `oo_${target}.prproj`); await dl.saveAs(out);
    const xml = zlib.gunzipSync(fs.readFileSync(out)).toString('utf8');
    const v = /<Project ObjectID="1"[^>]*\bVersion="(\d+)"/.exec(xml)[1];
    const defs = xml.match(/<VideoComponentParam[ \t\r\n][^>]*\bVersion="\d+"[^>]*>[\s\S]*?<\/VideoComponentParam>/g) || [];
    const ok = defs.length > 0 && defs.every((d) => d.includes('<LowerBound>') && d.includes('<UpperBound>'));
    const want = { 2025: '43', 2024: '42' }[target];
    console.log(`${target}: file=${dl.suggestedFilename()} version=${v} bounds_ok=${ok} params=${defs.length} status="${(await p.textContent('#status')).slice(0, 80)}"`);
    if (v !== want || !ok) fail++;
    await ctx.close();
  }
  // wrong file type
  const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(BASE + '/');
  const txt = path.join(require('os').tmpdir(), 'not_a_project.prproj'); fs.writeFileSync(txt, 'hello');
  await p.setInputFiles('#file', txt); await p.waitForTimeout(1500);
  const st = await p.textContent('#status'); console.log('bad file:', st); if (!/does not look like/i.test(st)) fail++;
  await b.close(); server.close(); console.log('failures:', fail); process.exit(fail ? 1 : 0);
})();
