// Builds the static site into dist/. Preview builds are noindex unless NOINDEX=0.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const NOINDEX = process.env.NOINDEX !== '0';
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'src'), dist, { recursive: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/fflate/esm/browser.js'), path.join(dist, 'vendor/fflate.js'));
const lib = path.join(dist, 'lib/prproj.js');
fs.writeFileSync(lib, fs.readFileSync(lib, 'utf8').replace("from 'fflate'", "from '../vendor/fflate.js'"));
for (const f of ['index.html', 'licenses/index.html']) {
  const p = path.join(dist, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<!--ROBOTS-->', NOINDEX ? '<meta name="robots" content="noindex, nofollow">' : ''));
}
fs.writeFileSync(path.join(dist, 'robots.txt'), NOINDEX ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n');
console.log(`Built dist/${NOINDEX ? ' (noindex preview)' : ''}`);
