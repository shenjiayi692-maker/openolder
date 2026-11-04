# OpenOlder — instructions for Claude Code

Owner: Jiayi (reply in Chinese, plain language; she is not a developer). Sister project: `shenjiayi692-maker/geounpack` — its `docs/HANDOFF.md` and `docs/research/` hold the overall plan (06-demo-vs-full-plans.md part 1 = Premiere, part 3 = Ableton).

## Rules
- All processing client-side; never upload user files.
- No "Adobe", "Premiere", "Ableton" in domain/brand/logo; keep the non-affiliation footer.
- `src/lib/prproj.js` is a port of prem-down (MIT): keep the attribution header, the licenses page (`src/licenses/index.html`, exact MIT text) and `test/fixtures/NOTICE.md`.
- `src/lib/als.js` (Ableton Live 12 -> 11) is ported from live_set under the **Live Set Tools Noncommercial License 1.0** (`LICENSES/live_set.md`). The Ableton page must stay free and non-commercial: no ads, no payments, no promotion of paid products on it, unless Jiayi has a written commercial license from Michael Slinn. Keep the header notice, the licenses-page section (full license text + list of modifications) and the credit on the page.
- When Adobe ships a new Premiere release, update `RELEASES` (and `LAST_DENSE` only if serialisation changes) — mirror prem-down's `internal/premdown/releases.go`.
- Before pushing: `npm test` and `npm run build && node scripts/smoke-browser.cjs` must pass.

## Status
Demo: Premiere page (`/`) and Ableton beta page (`/ableton-12-to-11/`, tested only with a synthetic set; no real Live 11/12 test yet). Full version waits for Jiayi's real-machine test in Premiere 2026/2025 (`docs/TEST-CHECKLIST.zh.md`).
