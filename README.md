# OpenOlder

Browser tools that let older software open newer project files. First tool: **Premiere Pro project downgrader** (including Premiere Pro 2026 → 2025/2024). Files are processed in the browser and never uploaded.

- `src/lib/prproj.js`: conversion logic, a JavaScript port of [prem-down](https://github.com/lucuma13/prem-down) (MIT, © 2026 Luis Gómez Gutiérrez).
- `src/worker.js`, `src/app.js`, `src/index.html`: the page (module Web Worker).
- `src/lib/als.js`: Ableton Live set inspector and Live 12 → 11 converter, ported from [live_set](https://github.com/mslinn/live_set) under its **noncommercial** license (`LICENSES/live_set.md`).
- `test/prproj.test.mjs`: unit tests ported from prem-down (`npm test`).
- `scripts/smoke-browser.cjs`: headless Chromium end-to-end test (`npm run build && node scripts/smoke-browser.cjs`).

Build: `npm run build` → `dist/` (noindex preview by default; `NOINDEX=0` for the real launch).
Status: **demo** — waiting for a real-machine test in Premiere Pro (see `docs/TEST-CHECKLIST.zh.md`).

Not affiliated with Adobe. Premiere Pro is a trademark of Adobe.
