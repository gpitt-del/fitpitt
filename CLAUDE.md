# FitPitt: notes for Claude

FitPitt is a phone workout log (a home-screen web app) at https://gpitt-del.github.io/fitpitt/, served by GitHub Pages from this repo's `gh-pages` branch. There is no build step. This repo is public, so nothing secret goes in it: no API keys, no personal data.

## How the app is put together
- `index.html` loads plain scripts in this order: a b c d **n** e f g h i j k l m **o p**. a–e are the base app. The rest are add-ons that run only on this site (`STANDALONE`) and wrap or add to what the base defines (`ACT` handlers, `viewChooser`, `scanSheet`, `aim`, and so on). New features go in a new add-on file, not in edits to existing files.
- **`n.js` must load before `e.js`**, because `e.js` loads the log at its end and drops a plan key it does not know. Every other add-on loads after `e.js`, so the first screen has already been drawn once when they arrive.
- Each person's log lives on their own phone (localStorage key `traininglog.v1`); a signed-in phone also syncs it to the person's account (p.js, server/).
- `sw.js` gives offline use. Bump `CACHE` on every release (`fitpitt-v22` now) **and the version in the `#brand` bar in index.html** (a check in tools/test_personal_plans.py keeps them equal); keep `SHELL` listing every app file. `tools/` is not part of the app and is not cached.
- Photo reader for InBody sheets: `m.js` plus the `ocr7/` folder (Tesseract.js 7.0.0, unmodified). Never change `ocr7/` in place; a newer reader goes in a new folder.
- Personal plans: `n.js` is the model (checking, codes, turning a plan into the program key `"mine"`); `o.js` has the screens (intake, paste a code, preview, Settings card, backups that carry the plan). The intake is five blocks for adults and five sport-focused blocks for kids (`ADULT` and `KID` in o.js); p.js picks the set by the account's role and supplies the name. The plan format is checked the same way by `tools/plancode.py`; if the format changes, change both.

## Testing and releasing
- `python3 tools/test_personal_plans.py [screenshot folder]` runs 105 end-to-end checks in simulated phones (Playwright, headless Chromium). It runs with the API address index.html ships, so a signed-out phone saves intake answers instead of texting them; `tools/test_accounts.py` covers the signed-in paths against a local Worker and a stand-in Claude.
- `python3 tools/test_update.py <previous release ref>` installs that release in a simulated phone, switches to this tree, and checks one reload brings the update, keeps the log, and works offline.
- A push to `gh-pages` is a release; Pages rebuilds in about 30 seconds. After pushing, compare the pushed files with the tested ones and check the Pages run finished.
- Push work in progress to a branch early. A whole build of personal plans was once lost because it lived only in a session that ended.

## Where things stand (Oct 11 2026)
- Personal plans, accounts, sync and the coach are built and tested (tools/test_personal_plans.py 105 checks,
  tools/test_accounts.py 56, server/test/run.mjs 68, tools/test_update.py 9 or 10).
- The Worker is deployed at https://fitpitt-api.fitpitt-api.workers.dev (Gabe's personal Cloudflare account, free plan,
  D1 database `fitpitt`), and index.html's `fitpitt-api` meta tag points at it. The release to `gh-pages` is the merge
  of `personal-plans`.
- Secrets: ADMIN_SETUP_KEY is set by Gabe with `wrangler secret put`. ANTHROPIC_API_KEY waits on the Team plan's API
  credit (claimable about Oct 17); until it is set, Build my plan answers "The coach is not set up yet" and nothing is
  charged. The real Claude API has not been called yet: the first plan build is the smoke test (server/README.md).
- Nothing is ever texted to Gabe. Without an account, the intake saves the answers and asks for an invite code, and
  Progress on a personal plan asks for a sign-in instead of offering to send the log.

## How it is built (decided with Gabe, Oct 11 2026)
- **Server:** Cloudflare Workers + D1 + one Durable Object class (server/). The app stays on GitHub Pages; the API
  lives on workers.dev with CORS for `https://gpitt-del.github.io` and bearer device tokens, no cookies.
- **Accounts:** invite-only. The admin signs in with the ADMIN_SETUP_KEY secret; he adds people and makes invite
  codes (14 days, 3 phones). A phone holding one person's log refuses another person's code until the log is erased.
- **Sync:** per-person docs (meta, active, session, scan, plan, intake); the newer `u` wins; phones pull by the
  server's arrival order `seq`, so a workout pushed late still arrives. The Cloud object in b.js is taken over by p.js.
- **Coach:** Fable 5.1 for plans, reviews and questions (a setting per task). Calls are **streamed** and put back
  together in coach.js (a reply held until complete was cut off by the API's front door with a 524 after about 100 s
  on the first real plan, Oct 11). Plans come back through a strict `submit_plan` tool and pass the same checks as
  the app (server/src/plan.js = n.js). A `kid` gets youth rules on top (sport first, technique before load, supervised
  max efforts allowed, landing and knee-injury prevention work, sessions fitted around practices). Jobs run in a
  Durable Object alarm so a phone can lock mid-build; every model reply is kept so a retry never pays twice. Pain
  means stop and get checked.
- **Scope (Gabe, Oct 12):** the coach covers training, cardio, nutrition, recovery and sleep and answers supplement,
  hormone and medical questions as information (evidence, typical amounts, cautions, when to see a clinician), with a
  one-line "information, not medical advice" note on drugs, hormones and conditions; it never diagnoses or changes a
  prescription and never refuses with "I'm not a doctor". Kids: food, protein, hydration and sleep only; the rest is
  for their parents. A health tip of the day rotates on Today (o.js TIPS).
- **Coach set-up (Gabe, Oct 12: accuracy over cost):** plans and weekly reviews at high effort with room to think
  (40000 and 12000 output tokens; thinking counts; 16000 was used up by thinking alone on the first real build),
  questions at medium for speed mid-workout. Model, effort and max tokens are per task in Settings → FitPitt admin;
  when the cap is hit the error says so. One streamed call gets 13 minutes (the Durable Object alarm allows 15); a call
  cut off by that limit is still billed for what had arrived, estimated from the stream. The admin form explains each
  task and offers the priced models in a dropdown.
- **First build vs. a change:** a first build is told not to review the log (it once wrote the review and never got to
  the plan) and may add up to 120 words of notes; **Change my plan** (Settings, on a personal plan) sends a note, the
  current plan and the log, and the coach starts from the plan, uses the log, and explains what changed. The notes
  show under the plan in the preview. The preview itself has **Ask the coach to change it** (comments on a plan before
  it is used; the same change request with the previewed plan), so a plan is refined in a loop, never taken as is.
- **Warm-ups (Gabe, Oct 12: every workout starts with one):** each day of a plan carries 3 to 6 warm-up lines
  (`warmup`, required by the tool schema, kept by n.js = plan.js = plancode.py, shown under the day in the preview).
  The workout screen opens with a **Warm-up** block above the first exercise (o.js `warmCard`), folded once a set is
  logged. A ready-made plan gets a generic warm-up built from what the day trains (n.js `warmFor`).
- **Money:** each call's tokens and cost are recorded, failures included. Admin screen flags anyone but Gabe over $5
  a month; the server stops a person at $20 (or their own cap) and everyone at a $150 ceiling. Unknown models are
  charged at the dearest known price; a task model without a price is refused.
- **Secrets:** ANTHROPIC_API_KEY and ADMIN_SETUP_KEY are Worker secrets Gabe sets. Never in code, the repo or a chat.
- **Kids:** a `kid` role with `parent_id`. Kids get the sport intake and the youth rules; their competitions (jump and
  throw tests, consistency) are not built yet.
