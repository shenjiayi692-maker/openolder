// Builds the static site into dist/. Preview builds are noindex unless NOINDEX=0.
// SITE_URL sets canonical links and the sitemap (default https://openolder.pages.dev).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const src = path.join(root, 'src');
const NOINDEX = process.env.NOINDEX !== '0';
const SITE = (process.env.SITE_URL || 'https://openolder.pages.dev').replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const url = (slug) => `${SITE}/${slug ? slug + '/' : ''}`;
// title/description are already HTML-escaped
const og = (title, desc, href) => `<meta property="og:title" content="${title}">${desc ? `<meta property="og:description" content="${desc}">` : ''}<meta property="og:type" content="website"><meta property="og:url" content="${href}"><meta property="og:site_name" content="OpenOlder">`;
// Search results cut titles at about 60 characters: drop the brand suffix when it would not fit anyway.
const fitTitle = (t) => (t.length > 60 ? t.replace(/ \| OpenOlder$/, '') : t);
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
// Date the content last really changed (per page: "updated" in pages.json). Not the build date:
// a sitemap whose lastmod changes on every deploy gets ignored by search engines.
const CONTENT_UPDATED = '2026-11-13';
const ROBOTS = NOINDEX ? '<meta name="robots" content="noindex, nofollow">' : '';

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true, filter: (p) => !/(template\.html|pages\.json|[\\/]i18n)$/.test(p) });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/fflate/esm/browser.js'), path.join(dist, 'vendor/fflate.js'));
for (const f of ['lib/prproj.js', 'lib/als.js']) {
  const p = path.join(dist, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace("from 'fflate'", "from '../vendor/fflate.js'"));
}

// Premiere pages from the template
const pages = JSON.parse(fs.readFileSync(path.join(src, 'pages.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
// Template UI text (English default). Translations: src/i18n/<lang>.json "ui"; "app" overrides src/app.js messages.
const EN_UI = {
  navLicenses: 'Licenses', pillOlder: 'older Premiere', dropAria: 'Choose a .prproj file', choose: 'Choose projects',
  dropHint: 'or drop .prproj files, a Production folder or a .zip here ·', pickFolder: 'choose a folder',
  dropMeta: 'Your originals are not changed. New copies are downloaded.', thFile: 'File', thSaved: 'Saved with', openIn: 'Open in',
  batchHint: 'Checking many projects? Drop them all at once to see which Premiere version saved each one, without converting anything.', csv: 'Download this list as CSV',
  convert: 'Convert & download', trust1: 'Files stay on your device', trust2: 'No sign-up', trust3: 'Free', howTo: 'How to use it',
  comparison: 'Comparison', whyH2: 'Why 2026 projects need more than a version change',
  whyP: 'The old trick was to unzip the .prproj, lower the version number and zip it again. Premiere Pro 2026 saves projects in a more compact form that leaves out fields older versions require, so that trick now gives a "project is damaged" error. This tool adds those fields back and then sets the version.',
  faq: 'FAQ', otherPages: 'Other pages', about: 'About', oss: 'Open-source licenses',
  legal: 'OpenOlder is an independent tool, not affiliated with or endorsed by Adobe. Adobe and Premiere Pro are trademarks of Adobe. Conversion logic based on prem-down by Luis Gómez Gutiérrez (MIT).',
  language: 'Language',
};
const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Translated pages (pilot): each language translates a few slugs; those slugs get hreflang alternates in every language.
const LANGS = fs.readdirSync(path.join(src, 'i18n')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(src, 'i18n', f), 'utf8')));
const locSlug = (l, slug) => (l ? (slug ? `${l.path}/${slug}` : l.path) : slug);
const langsFor = (slug) => LANGS.filter((l) => l.pages[slug]);
const alternates = (slug) => {
  const ls = langsFor(slug);
  if (!ls.length) return [];
  return [['en', url(slug)], ...ls.map((l) => [l.hreflang, url(locSlug(l, slug))]), ['x-default', url(slug)]];
};

function render(p, l) {
  const ui = { ...EN_UI, ...(l ? l.ui : {}) };
  const slug = locSlug(l, p.slug);
  const home = l ? `/${l.path}/` : '/';
  const faq = p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  const steps = p.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  const related = (l
    ? [...Object.entries(l.pages).filter(([s]) => s !== p.slug).map(([s, o]) => [`/${locSlug(l, s)}/`, o.h1.replace(/"/g, '')]), ['/', ui.moreEnglish], ['/ableton-12-to-11/', 'Ableton Live 12 → 11']]
    : [...pages.filter((o) => o.slug !== p.slug).map((o) => [o.slug ? `/${o.slug}/` : '/', o.h1.replace(/"/g, '')]), ['/ableton-12-to-11/', 'Ableton Live 12 to 11']])
    .map(([href, t]) => `<a href="${href}">${esc(t)}</a>`).join('');
  let compare = '';
  if (p.compare) {
    const [head, ...rows] = p.compare;
    compare = `<section><h2>${escText(ui.comparison)}</h2><div class="table-wrap"><table class="spec compare"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  const body = (p.body || []).map((s) => `<section><h2>${esc(s.h2)}</h2>${(s.p || []).map((t) => `<p>${rich(t)}</p>`).join('')}${s.list ? `<ul>${s.list.map((t) => `<li>${rich(t)}</li>`).join('')}</ul>` : ''}</section>`).join('\n  ');
  const jsonld = JSON.stringify([
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'OpenOlder Premiere Pro Project Downgrader', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', url: url(slug), description: p.description, ...(l ? { inLanguage: l.lang } : {}), offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': `${SITE}/#org` } },
    ...(p.slug || l ? [] : [
      { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE}/#org`, name: 'OpenOlder', url: `${SITE}/`, logo: `${SITE}/favicon.svg`, email: 'hello@openolder.com' },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'OpenOlder', url: `${SITE}/`, publisher: { '@id': `${SITE}/#org` } },
    ]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: p.h1, step: p.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) },
  ]).replace(/</g, '\\u003c');
  const alts = alternates(p.slug);
  const altLinks = alts.map(([h, u]) => `<link rel="alternate" hreflang="${h}" href="${u}">`).join('');
  const cur = l ? l.hreflang : 'en';
  const langs = alts.length ? `<nav class="langs" aria-label="${esc(ui.language)}">${[['en', 'English', `/${p.slug ? p.slug + '/' : ''}`], ...langsFor(p.slug).map((o) => [o.hreflang, o.name, `/${locSlug(o, p.slug)}/`])]
    .map(([h, n, href]) => (h === cur ? `<span aria-current="page" lang="${h}">${esc(n)}</span>` : `<a href="${href}" hreflang="${h}" lang="${h}">${esc(n)}</a>`)).join('')}</nav>` : '';
  return tpl
    .replace('<!--ROBOTS-->', ROBOTS + og(esc(fitTitle(p.title)), esc(p.description), url(slug)))
    .replace('{{lang}}', l ? l.lang : 'en')
    .replace('{{alternates}}', altLinks)
    .replace('{{langs}}', langs)
    .replaceAll('{{home}}', home)
    .replace(/\{\{t\.(\w+)\}\}/g, (_, k) => (k === 'dropAria' ? esc(ui[k]) : escText(ui[k])))
    .replaceAll('{{title}}', esc(fitTitle(p.title)))
    .replace('{{body}}', body)
    .replaceAll('{{description}}', esc(p.description))
    .replace('{{canonical}}', url(slug))
    .replace('{{jsonld}}', jsonld)
    .replace('{{h1}}', esc(p.h1))
    .replace('{{subtitle}}', esc(p.subtitle))
    .replace('{{lead}}', esc(p.lead))
    .replace('{{steps}}', steps)
    .replace('{{compare}}', compare)
    .replace('{{faq}}', faq)
    .replace('{{related}}', related)
    .replace('{{config}}', JSON.stringify({ defaultTarget: p.defaultTarget }))
    .replace('{{i18nscript}}', l ? `<script>window.OPENOLDER_I18N = ${JSON.stringify(l.app).replace(/</g, '\\u003c')};</script>` : '');
}

const translated = [];
for (const p of pages) {
  fs.mkdirSync(path.join(dist, p.slug), { recursive: true });
  fs.writeFileSync(path.join(dist, p.slug, 'index.html'), render(p, null));
  for (const l of langsFor(p.slug)) {
    const s = locSlug(l, p.slug);
    // translated fields over the English page (keeps defaultTarget etc.)
    fs.mkdirSync(path.join(dist, s), { recursive: true });
    fs.writeFileSync(path.join(dist, s, 'index.html'), render({ ...p, ...l.pages[p.slug] }, l));
    translated.push({ slug: s, en: p.slug, updated: l.pages[p.slug].updated });
  }
}

// hand-written pages: add robots, canonical and share-preview tags
const STATIC = ['licenses', 'ableton-12-to-11', 'about', 'changelog'];
for (const slug of STATIC) {
  const p = path.join(dist, slug, 'index.html');
  let html = fs.readFileSync(p, 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'OpenOlder';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const head = `${ROBOTS}<link rel="canonical" href="${url(slug)}">${og(title, desc, url(slug))}`;
  fs.writeFileSync(p, html.replace('<!--ROBOTS-->', head));
}

const slugs = [...pages.map((p) => p.slug), 'ableton-12-to-11', 'about', 'changelog'];
const updated = Object.fromEntries([...pages.map((p) => [p.slug, p.updated]), ...translated.map((t) => [t.slug, t.updated])]);
const xalt = (slug) => alternates(slug).map(([h, u]) => `<xhtml:link rel="alternate" hreflang="${h}" href="${u}"/>`).join('');
const smEntries = [...slugs.map((s) => [s, s]), ...translated.map((t) => [t.slug, t.en])];
fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${smEntries.map(([s, en]) => `  <url><loc>${url(s)}</loc><lastmod>${updated[s] || CONTENT_UPDATED}</lastmod>${pages.some((p) => p.slug === en) ? xalt(en) : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(dist, 'robots.txt'), NOINDEX ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist, 'llms.txt'), `# OpenOlder\n\n> Free browser tools that let older software open newer project files. Files are processed in the browser and never uploaded.\n\n## Premiere Pro\n${pages.map((p) => `- [${p.h1.replace(/"/g, '')}](${url(p.slug)}): ${p.description}`).join('\n')}\n\n## Ableton Live\n- [Ableton Live 12 to 11 (beta)](${url('ableton-12-to-11')}): inspect a Live set and convert a Live 12 set for Live 11.\n\n## About\n- [About OpenOlder](${url('about')}): who makes it, how it works, contact\n`);
fs.writeFileSync(path.join(dist, '404.html'), fs.readFileSync(path.join(dist, 'index.html'), 'utf8'));
console.log(`Built ${pages.length + translated.length + STATIC.length} pages into dist/ for ${SITE}${NOINDEX ? ' (noindex preview)' : ''}`);
