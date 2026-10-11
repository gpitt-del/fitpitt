# FitPitt tools

Not part of the app. The service worker does not cache this folder.

- `plancode.py plan.json` checks a personal plan the way the app does and prints its code and link. `plancode.py --read FP1...` turns a code back into JSON. The plan format is written up in the Health And Fitness project file `claude/fitpitt-plan-format.md`, which also holds a copy of this script for chats. If the format changes, change `n.js`, this script and that copy together.
- `sample-plan.json` is a made-up four-day plan used by the tests and as the example in the format write-up.
- `test_personal_plans.py [screenshot folder]` runs 88 end-to-end checks of personal plans in simulated phones (headless Chromium through Playwright): intake, codes and links, preview, loading, workouts, weight targets, Settings, backups, erasing, bad codes, and four- to six-day plans.
- `test_update.py [old git ref]` installs an earlier release (default `HEAD~1`) in a simulated phone, switches the served files to this working tree, and checks that one reload brings the new version, keeps the log, and works offline.
- `test_accounts.py [screenshot folder]` runs the app together with the server (`server/`, needs `npm install` there) and a stand-in Claude in simulated phones: 41 checks of sign-in, syncing between two phones, plan builds, reviews, questions, caps and the admin screen.
