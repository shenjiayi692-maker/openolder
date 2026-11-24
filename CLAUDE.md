# OpenOlder — instructions for Claude Code

Owner: Jiayi (reply in Chinese, plain language; she is not a developer).
Before starting any work, read `docs/TODO.md` — the single open-items list for this site. When you finish or change an item, update its status and date there in the same commit. Strategy, keyword scanning and candidate ideas live in Jiayi's handbook (a Claude doc), not in this repo. Sister project: `shenjiayi692-maker/geounpack` — its `docs/HANDOFF.md` and `docs/research/` hold the overall plan (06-demo-vs-full-plans.md part 1 = Premiere, part 3 = Ableton).

## Rules
- All processing client-side; never upload user files.
- No "Adobe", "Premiere", "Ableton" in domain/brand/logo; keep the non-affiliation footer.
- `src/lib/prproj.js` is a port of prem-down (MIT): keep the attribution header, the licenses page (`src/licenses/index.html`, exact MIT text) and `test/fixtures/NOTICE.md`.
- `src/lib/als.js` (Ableton Live 12 -> 11) is ported from live_set under the **Live Set Tools Noncommercial License 1.0** (`LICENSES/live_set.md`). The Ableton page must stay free and non-commercial: no ads, no payments, no promotion of paid products on it, unless Jiayi has a written commercial license from Michael Slinn. Keep the header notice, the licenses-page section (full license text + list of modifications) and the credit on the page.
- When Adobe ships a new Premiere release, update `RELEASES` (and `LAST_DENSE` only if serialisation changes) — mirror prem-down's `internal/premdown/releases.go`.
- Before pushing: `npm test` and `npm run build && node scripts/smoke-browser.cjs` must pass.

## Status
Premiere full version built (7 SEO pages from `src/pages.json` + `src/template.html`; single, batch, Production folder/zip) and **verified by Jiayi in real Premiere 2026 -> 2025 on 2026-11-04 (T1–T4 all opened, nothing missing)**. Next: buy openolder.com, switch to NOINDEX=0 + SITE_URL, submit to Search Console/Bing, then promote. Ableton beta page (`/ableton-12-to-11/`) tested only with a synthetic set.
Tests: `npm test`; `npm run build && node scripts/smoke-browser.cjs && node scripts/smoke-ableton.cjs` (use `PORT=` if busy, `BASE_URL=` for the live site). Deploy: Cloudflare Pages project `openolder`, auto-deploys branch `demo-v0.1`; `SITE_URL`/`NOINDEX=0` only at real launch.
