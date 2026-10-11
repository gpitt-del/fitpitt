# FitPitt: notes for Claude

FitPitt is a phone workout log (a home-screen web app) at https://gpitt-del.github.io/fitpitt/, served by GitHub Pages from this repo's `gh-pages` branch. There is no build step. This repo is public, so nothing secret goes in it: no API keys, no personal data.

## How the app is put together
- `index.html` loads plain scripts in this order: a b c d **n** e f g h i j k l m **o**. a–e are the base app. The rest are add-ons that run only on this site (`STANDALONE`) and wrap or add to what the base defines (`ACT` handlers, `viewChooser`, `scanSheet`, `aim`, and so on). New features go in a new add-on file, not in edits to existing files.
- **`n.js` must load before `e.js`**, because `e.js` loads the log at its end and drops a plan key it does not know. Every other add-on loads after `e.js`, so the first screen has already been drawn once when they arrive.
- Each person's log lives on their own phone (localStorage key `traininglog.v1`). There is no server yet.
- `sw.js` gives offline use. Bump `CACHE` on every release (`fitpitt-v12` now) and keep `SHELL` listing every app file. `tools/` is not part of the app and is not cached.
- Photo reader for InBody sheets: `m.js` plus the `ocr7/` folder (Tesseract.js 7.0.0, unmodified). Never change `ocr7/` in place; a newer reader goes in a new folder.
- Personal plans: `n.js` is the model (checking, codes, turning a plan into the program key `"mine"`); `o.js` has the screens (intake, paste a code, preview, Settings card, backups that carry the plan). The plan format is checked the same way by `tools/plancode.py`; if the format changes, change both.

## Testing and releasing
- `python3 tools/test_personal_plans.py [screenshot folder]` runs 88 end-to-end checks in simulated phones (Playwright, headless Chromium).
- `python3 tools/test_update.py <previous release ref>` installs that release in a simulated phone, switches to this tree, and checks one reload brings the update, keeps the log, and works offline.
- A push to `gh-pages` is a release; Pages rebuilds in about 30 seconds. After pushing, compare the pushed files with the tested ones and check the Pages run finished.
- Push work in progress to a branch early. A whole build of personal plans was once lost because it lived only in a session that ended.

## Where things stand (Oct 11 2026)
- Personal plans, accounts, sync and the coach are built and tested here (tools/test_personal_plans.py 88 checks,
  tools/test_accounts.py 43, server/test/run.mjs 58, tools/test_update.py 10) but **not deployed**: the Worker has not
  been published and the app's `fitpitt-api` meta tag is empty, so the live site still behaves as before.
- Nothing is ever texted to Gabe. Without an account, the intake saves the answers and asks for an invite code.
- To deploy, follow server/README.md. Set the meta tag and bump the cache name in sw.js in the same release.

## How it is built (decided with Gabe, Oct 11 2026)
- **Server:** Cloudflare Workers + D1 + one Durable Object class (server/). The app stays on GitHub Pages; the API
  lives on workers.dev with CORS for `https://gpitt-del.github.io` and bearer device tokens, no cookies.
- **Accounts:** invite-only. The admin signs in with the ADMIN_SETUP_KEY secret; he adds people and makes invite
  codes (14 days, 3 phones). A phone holding one person's log refuses another person's code until the log is erased.
- **Sync:** per-person docs (meta, active, session, scan, plan, intake); the newer `u` wins; phones pull by the
  server's arrival order `seq`, so a workout pushed late still arrives. The Cloud object in b.js is taken over by p.js.
- **Coach:** Fable 5.1 for plans, reviews and questions (a setting per task). Plans come back through a strict
  `submit_plan` tool and pass the same checks as the app (server/src/plan.js = n.js). Jobs run in a Durable Object
  alarm so a phone can lock mid-build; every model reply is kept so a retry never pays twice. Training only: no
  medical, drug, supplement or peptide advice; pain means stop and get checked.
- **Money:** each call's tokens and cost are recorded, failures included. Admin screen flags anyone but Gabe over $5
  a month; the server stops a person at $20 (or their own cap) and everyone at a $150 ceiling. Unknown models are
  charged at the dearest known price; a task model without a price is refused.
- **Secrets:** ANTHROPIC_API_KEY and ADMIN_SETUP_KEY are Worker secrets Gabe sets. Never in code, the repo or a chat.
- **Kids:** a `kid` role with `parent_id` exists in the data; the volleyball-only coach for kids is not built yet.
