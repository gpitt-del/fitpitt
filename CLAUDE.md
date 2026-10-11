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
- Personal plans are built and tested but **not released**. The intake still ends in "Send to Gabe", and Gabe does not want friends' answers texted to him. Plans are to be built inside the app by the coach, so the friend-facing parts wait for the coach.

## What comes next (decided with Gabe, Oct 11 2026)
- **Server:** Cloudflare Workers with a D1 database (Gabe is creating the account). The app stays on GitHub Pages so nobody's local log moves; the API runs on workers.dev with CORS for `https://gpitt-del.github.io` and bearer tokens, no cookies. Plan builds can take minutes on the strongest model, so long jobs must survive the phone locking (store results server-side; the phone fetches them).
- **Accounts:** invite-only. Gabe adds a person in an admin screen and sends them a personal sign-in link; each device gets its own token. Email sign-in can come later, with a domain.
- **Sync:** logs (meta, sessions, scans, the active workout) per person in D1, with the phone as cache. The base app's `Cloud` object in `b.js` was written for another storage API and shows the merge rules (newest `u` wins, deletions as tombstones).
- **Coach:** the Claude API with Fable 5.1 for plan builds, weekly reviews and questions; the model is a setting per task. Plans come back in the `tools/plancode.py` format and pass the same checks before a phone sees them. The coach stays on training: no medical, drug, supplement or peptide advice, and it tells people to get pain checked.
- **Metering:** record each call's tokens and cost per person. Gabe's admin screen shows each person's month so far, flags anyone other than Gabe above $5 in a month, and the server stops a person at $20 a month (Gabe can change both).
- **Secrets:** Gabe sets the Anthropic API key as a Worker secret himself. Never put it in code, the repo or a chat.
- **Kids** join later, under a parent, with a coach limited to their volleyball plan.
