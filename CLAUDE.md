# OpenOlder — instructions for Claude Code

Owner: Jiayi (reply in Chinese, plain language; she is not a developer). Sister project: `shenjiayi692-maker/geounpack` — its `docs/HANDOFF.md` and `docs/research/` hold the overall plan (06-demo-vs-full-plans.md part 1 = Premiere, part 3 = Ableton).

## Rules
- All processing client-side; never upload user files.
- No "Adobe", "Premiere", "Ableton" in domain/brand/logo; keep the non-affiliation footer.
- `src/lib/prproj.js` is a port of prem-down (MIT): keep the attribution header, the licenses page (`src/licenses/index.html`, exact MIT text) and `test/fixtures/NOTICE.md`.
- When Adobe ships a new Premiere release, update `RELEASES` (and `LAST_DENSE` only if serialisation changes) — mirror prem-down's `internal/premdown/releases.go`.
- Before pushing: `npm test` and `npm run build && node scripts/smoke-browser.cjs` must pass.

## Status
Demo (single page). Full version waits for Jiayi's real-machine test in Premiere 2026/2025 (`docs/TEST-CHECKLIST.zh.md`).
