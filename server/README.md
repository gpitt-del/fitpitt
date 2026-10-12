# FitPitt API

The server behind the FitPitt app: invite-only accounts, syncing a person's log between phones, and the coach
(plan builds, weekly reviews, questions) on the Claude API. It runs on Cloudflare Workers with a D1 database and
one Durable Object class that runs coach jobs after the phone has gone away. The app itself stays on GitHub Pages.

## Layout
- `src/index.js`: the API (routes, sign-in, sync, admin). `src/job.js`: the Durable Object that runs a coach job.
  `src/coach.js`: prompts, the Claude call, plan checking. `src/plan.js`: the plan format, the same checks as the app's `n.js`.
  `src/schema.js`: the database, created on first use. `src/settings.js`: flags, stops, models, prices.
- `test/run.mjs`: 68 checks against a local Worker and `test/mock-anthropic.mjs`, a stand-in Claude (it streams like the real API, and `GET /__calls` shows what the coach was told).
  `tools/test_accounts.py` (repo root) runs the app and this server together in simulated phones.

## Endpoints (JSON; `Authorization: Bearer <device token>` except where noted)
- `POST /setup {key, name}` (no token): with the ADMIN_SETUP_KEY secret, makes the admin on first use and returns a device token. Works again later to sign a new phone in as the admin.
- `POST /join {code, device}` (no token): an invite code becomes a device token. Codes last 14 days and work on up to 3 phones.
- `GET /me`, `POST /signout`
- `POST /sync {since, docs}`: push changes, pull everything newer. Newer `u` wins; deletions are tombstones.
- `POST /coach/jobs {kind: plan|review|ask, ...}` → 202 with the job; `GET /coach/jobs/:id`; `GET /coach/jobs?limit=`
- Admin: `GET/POST /admin/people`, `PATCH /admin/people/:id` ({name, disabled, cap_usd, role, note, signOutAll}),
  `POST /admin/people/:id/invite`, `GET /admin/usage?month=YYYY-MM`, `GET /admin/jobs?limit=`, `GET/PUT /admin/settings`.

## Money rules
Each coach call records tokens and a dollar cost from the price table in settings. A person other than an admin whose
month passes `flag_usd` ($5) is flagged on the admin screen. Past `stop_usd` ($20, or the person's own `cap_usd`) the
coach refuses them until next month. Past `ceiling_usd` ($150) it refuses everyone. The check happens before a call,
so one call can go a little past a line.

## Running it locally
```
cd server && npm install
echo 'ANTHROPIC_API_KEY=test-key' > .dev.vars        # the stand-in accepts only test-key
echo 'ANTHROPIC_BASE_URL=http://127.0.0.1:8790' >> .dev.vars
echo 'ADMIN_SETUP_KEY=anything' >> .dev.vars
node test/mock-anthropic.mjs &                      # the stand-in Claude on 8790
npx wrangler dev --local                            # the API on 8787
node test/run.mjs                                   # or: the full suite, which starts its own copies
```

## Deploying (first time)
1. Cloudflare account (free plan is enough). In the terminal of a machine or session signed in to it: `npx wrangler login`.
2. `cd server && npx wrangler d1 create fitpitt` → paste the `database_id` it prints into `wrangler.jsonc`.
3. `npx wrangler secret put ANTHROPIC_API_KEY` (Gabe pastes the key; it never goes in a file or a chat) and
   `npx wrangler secret put ADMIN_SETUP_KEY` (a long random password Gabe keeps; it signs his phones in as admin).
4. `npx wrangler deploy` → note the URL, `https://fitpitt-api.<account>.workers.dev`.
5. In the app's `index.html`, set `<meta name="fitpitt-api" content="https://fitpitt-api.<account>.workers.dev">`, bump the
   cache name in `sw.js`, push `gh-pages`.
6. On Gabe's phone: open the app, tap **I have an invite code**, then **Sign in with the setup key**, and type the
   ADMIN_SETUP_KEY. His phone is now the admin: Settings → FitPitt admin adds people and makes invites.
7. Later deploys: push to the repo and let Cloudflare's GitHub integration (Workers Builds, root directory `server`) deploy,
   or run `npx wrangler deploy` by hand. The database schema updates itself on the next request.

## First smoke test after deploying
Sign in as admin on a phone, Settings → Get a plan built for you → Build my plan, and watch Settings → FitPitt admin →
Recent coach calls. The first real attempt (Oct 11 2026) was cut off by the API's front door with a 524 after about 100 seconds because the reply was not streamed; calls are streamed now. The strict tool schema has still not been accepted by the real model in a finished call: if the first plan fails with an API error about the tool or schema, drop `strict: true` from `TOOLS` in `src/coach.js` first. `npx wrangler tail` shows the Worker's logs live.

## Not done yet
- Kids' competitions. A kid account (role `kid`) already gets the sport-focused intake and the youth rules in the coach's prompt.
- Push notifications when a plan is ready (the app checks when it is opened or comes to the front).
- Email sign-in; a domain of its own.
