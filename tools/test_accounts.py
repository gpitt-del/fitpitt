"""Accounts, sync and the coach, end to end: the app in simulated phones + the API on a local Worker + a stand-in Claude.

    cd server && npm install        (once)
    python3 tools/test_accounts.py [screenshot folder]

Starts: a static server for the app, the stand-in Claude API (node), and wrangler dev with a fresh local database.
"""
import asyncio, json, os, re, sys, subprocess, tempfile, socket, time, shutil
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SERVER = ROOT / 'server'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='fitpitt-acct-shots-')
os.makedirs(SHOTS, exist_ok=True)
results = []

def ok(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or not detail else '  ::  ' + str(detail)[:400]), flush=True)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

SITE_PORT, MOCK_PORT, API_PORT = free_port(), free_port(), free_port()
SITE = 'http://localhost:%d/' % SITE_PORT
API = 'http://127.0.0.1:%d' % API_PORT
SETUP = 'setup-secret-for-tests'
(SERVER / '.dev.vars').write_text('ANTHROPIC_API_KEY=test-key\nANTHROPIC_BASE_URL=http://127.0.0.1:%d\nADMIN_SETUP_KEY=%s\n' % (MOCK_PORT, SETUP))
persist = tempfile.mkdtemp(prefix='fitpitt-d1-')
procs = [
    subprocess.Popen([sys.executable, '-m', 'http.server', str(SITE_PORT), '--bind', '127.0.0.1', '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen(['node', str(SERVER / 'test' / 'mock-anthropic.mjs')], env=dict(os.environ, PORT=str(MOCK_PORT), SLOW_MS='3000'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen([str(SERVER / 'node_modules' / '.bin' / 'wrangler'), 'dev', '--local', '--port', str(API_PORT), '--persist-to', persist, '--var', 'ALLOWED_ORIGINS:http://localhost,http://127.0.0.1', '--var', 'SITE_URL:' + SITE], cwd=str(SERVER), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True),
]
import urllib.request
for _ in range(80):
    try:
        if urllib.request.urlopen(API + '/health', timeout=1).status == 200: break
    except Exception: time.sleep(0.5)

IPHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
              user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
ANDROID = dict(viewport={'width': 360, 'height': 780}, device_scale_factor=2, is_mobile=True, has_touch=True,
               user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')
STUBS = "window.__shared = []; window.__copied = []; navigator.share = d => { window.__shared.push(d); return Promise.resolve(); }; try { navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); }; } catch (e) {}"
errors = []

async def newpage(browser, dev=IPHONE, tag='page', standalone=True):
    ctx = await browser.new_context(**dev)
    await ctx.add_init_script(STUBS)
    await ctx.add_init_script("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => %s, configurable: true });" % ('true' if standalone else 'false'))
    await ctx.add_init_script("try { localStorage.setItem('fitpitt.api', %s); } catch (e) {}" % json.dumps(API))
    page = await ctx.new_page()
    page.on('console', lambda m: errors.append((tag, m.text)) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append((tag, 'pageerror: ' + str(e))))
    return ctx, page

async def sheet_title(page):
    return (await page.locator('#sheet:not([hidden]) .sheet-body h2').first.inner_text()).strip()
async def shot(page, name):
    await page.wait_for_timeout(400); await page.screenshot(path=os.path.join(SHOTS, name + '.png'))
async def wait_sheet(page, title, timeout=40000):
    await page.wait_for_function("t => { const h = document.querySelector('#sheet:not([hidden]) .sheet-body h2'); return h && h.textContent.trim() === t; }", arg=title, timeout=timeout)
async def wait_status(page, text, timeout=15000):
    await page.wait_for_function("t => (document.querySelector('#sync') || document.querySelector('#fp-sync') || {}).textContent === t", arg=text, timeout=timeout)

def api(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')

async def fill_workout(page, reps=10, weight=50):
    n = await page.locator('#app .ex').count()
    for ei in range(n):
        for si in range(await page.locator('#app .ex[data-ei="%d"] .set' % ei).count()):
            row = page.locator('#app .set[data-ei="%d"][data-si="%d"]' % (ei, si))
            if 'drop' in (await row.get_attribute('class')): continue
            w = row.locator('input[data-f="w"]')
            if await w.count(): await w.fill(str(weight))
            await row.locator('input[data-f="r"]').fill(str(reps)); await row.locator('.check').click()

async def main():
    # Gabe's admin token, as the setup step would give his phone
    st, r = api('POST', '/setup', {'key': SETUP, 'name': 'Gabe', 'device': 'test'})
    assert st == 200, r
    gabe_token = r['token']
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ---------- 1. Gabe's phone: admin screen, add Mike, get an invite ----------
        ctx, gabe = await newpage(browser, tag='gabe')
        await gabe.goto(SITE); await gabe.wait_for_selector('#app h1')
        await gabe.click('[data-act="fpJoin"]'); await wait_sheet(gabe, 'Sign in with an invite')
        await gabe.click('[data-act="fpAdminJoin"]'); await wait_sheet(gabe, 'Sign in as the admin')
        await gabe.fill('#fp-setup', 'wrong'); await gabe.click('[data-act="fpAdminJoinSend"]')
        await gabe.wait_for_function("document.querySelector('#fp-setup-err').textContent.length > 0")
        ok('a wrong setup key is refused', 'Wrong setup key' in await gabe.inner_text('#fp-setup-err'))
        await gabe.fill('#fp-setup', SETUP); await gabe.click('[data-act="fpAdminJoinSend"]')
        await gabe.wait_for_function("document.querySelector('#toast') && /admin/.test(document.querySelector('#toast').textContent)")
        ok('the setup key signs Gabe in as admin', (await gabe.evaluate("JSON.parse(localStorage.getItem('fitpitt.account')).person.role")) == 'admin')
        ok('first screen offers an invite sign-in only when signed out', await gabe.locator('[data-act="fpJoin"]').count() == 0)
        await gabe.click('[data-act="pickProgram"][data-p="build"]')
        await gabe.click('#tabs [data-tab="settings"]')
        card = await gabe.inner_text('#fp-acct')
        ok('Settings shows the account and the admin button', 'Signed in as Gabe' in card and 'FitPitt admin' in card, card)
        await wait_status(gabe, 'Saved to your account')
        await gabe.click('[data-act="adOpen"]'); await wait_sheet(gabe, 'FitPitt admin')
        ok('admin screen lists Gabe', 'Gabe' in await gabe.inner_text('#sheet .list'))
        await gabe.fill('#ad-name', 'Mike'); await gabe.click('[data-act="adAdd"]')
        await gabe.wait_for_selector('#ad-invite .fp-code-big')
        code = (await gabe.inner_text('#ad-invite .fp-code-big')).strip()
        ok('adding Mike shows an invite code', re.fullmatch(r'[A-Z2-9]{4}-[A-Z2-9]{4}', code), code)
        await shot(gabe, 'a1-admin-invite')
        await gabe.click('#ad-invite [data-act="adShare"]')
        shared = await gabe.evaluate('window.__shared')
        ok('Send it shares the code and the link', shared and code in shared[-1]['text'] and '#join=' + code in shared[-1]['text'], shared)
        people = await gabe.eval_on_selector_all('#sheet .list li strong', 'els => els.map(e => e.textContent)')
        ok('Mike is on the roster', any('Mike' in p for p in people), people)
        await gabe.click('#sheet .sheet-body [data-act="closeSheet"]')

        # ---------- 2. Mike's iPhone: opens the link in Safari, then signs in in the Home Screen app ----------
        ctx_saf, saf = await newpage(browser, tag='mike-safari', standalone=False)
        await saf.goto(SITE + '#join=' + code); await wait_sheet(saf, 'Your FitPitt invite')
        ok('a link in iPhone Safari shows the code and the Home Screen advice', code in await saf.inner_text('#sheet') and 'Add to Home Screen' in await saf.inner_text('#sheet'))
        await shot(saf, 'a2-invite-in-safari')
        await ctx_saf.close()
        ctx_m, mike = await newpage(browser, tag='mike')
        await mike.goto(SITE); await mike.wait_for_selector('#app h1')
        ok('first screen offers the invite sign-in', await mike.locator('[data-act="fpJoin"]').count() == 1)
        await mike.click('[data-act="fpIntake"]'); await wait_sheet(mike, 'Get a plan built for you')
        ok('signed out, the intake ends in Save my answers, not a text to Gabe', await mike.locator('[data-act="fpSendIntake"]').inner_text() == 'Save my answers' and 'sign in' in await mike.inner_text('#sheet .fp-lede'))
        await mike.fill('#in-name', 'Mike')
        for q, v in [('goal', 'Build muscle'), ('days', '4'), ('mins', '60 min'), ('where', 'Full gym'), ('exp', 'Lifting under 2 years')]:
            await mike.click('[data-act="fpChip"][data-q="%s"][data-v="%s"]' % (q, v))
        await mike.fill('#in-limits', 'Left shoulder pinches overhead'); await mike.fill('#in-likes', 'Bench, pulldown, leg press')
        await mike.click('[data-act="fpSendIntake"]'); await wait_sheet(mike, 'Your answers are saved')
        ok('saved answers lead to the invite sign-in, and nothing was shared', await mike.evaluate('window.__shared.length') == 0)
        await mike.click('#sheet [data-act="fpJoin"]'); await wait_sheet(mike, 'Sign in with an invite')
        await mike.fill('#fp-join', 'ZZZZ-ZZZZ'); await mike.click('[data-act="fpJoinSend"]')
        await mike.wait_for_function("document.querySelector('#fp-join-err').textContent.length > 0")
        ok('a wrong code gets a reason', 'not one of ours' in await mike.inner_text('#fp-join-err'))
        await mike.fill('#fp-join', code.lower()); await mike.click('[data-act="fpJoinSend"]')
        await mike.wait_for_function("document.querySelector('#toast') && /Signed in as Mike/.test(document.querySelector('#toast').textContent)")
        ok('Mike signs in by typing the code', True)
        acct = await mike.evaluate("JSON.parse(localStorage.getItem('fitpitt.account'))")
        ok('the phone keeps a device token, not the code', acct['person']['name'] == 'Mike' and len(acct['token']) > 30 and code not in json.dumps(acct))
        await shot(mike, 'a3-mike-signed-in')

        # ---------- 3. Build my plan through the coach ----------
        await mike.click('[data-act="fpIntake"]'); await wait_sheet(mike, 'Get a plan built for you')
        ok('signed in, the intake ends in Build my plan with the saved answers', await mike.locator('[data-act="fpSendIntake"]').inner_text() == 'Build my plan' and await mike.input_value('#in-likes') == 'Bench, pulldown, leg press')
        await mike.click('[data-act="fpSendIntake"]'); await wait_sheet(mike, 'Building your plan')
        ok('the job sheet says the phone can be locked', 'lock your phone' in await mike.inner_text('#sheet'))
        await shot(mike, 'a4-building')
        ok('nothing was texted to Gabe', await mike.evaluate('window.__shared.length') == 0)
        await wait_sheet(mike, "Mike's plan", 60000)
        ok('the plan comes back in the usual preview', await mike.locator('#sheet .menu h3').count() == 4 and 'Made for Mike' in await mike.inner_text('#sheet'))
        await shot(mike, 'a5-plan-preview')
        async with mike.expect_navigation():
            await mike.click('[data-act="fpUse"]')
        await mike.wait_for_selector('#app .hero h1')
        ok('Mike is on his plan', (await mike.inner_text('#app .hero h1')) == 'Upper 1')
        st, r = api('GET', '/admin/jobs?limit=1', token=gabe_token)
        ok("the job is on Gabe's side with a cost", r['jobs'][0]['person_name'] == 'Mike' and r['jobs'][0]['kind'] == 'plan' and r['jobs'][0]['cost_usd'] > 0, r)

        # ---------- 3b. A kid: Gabe adds Anderson as Kid; her intake is about her sport; the coach gets the youth rules ----------
        st, r = api('POST', '/admin/people', {'name': 'Anderson', 'role': 'kid'}, token=gabe_token)
        assert st == 201, r
        inv = r['invite']
        ctx_k, kid = await newpage(browser, tag='kid')
        await kid.goto(SITE); await kid.wait_for_selector('#app h1')
        await kid.click('[data-act="fpJoin"]'); await wait_sheet(kid, 'Sign in with an invite')
        await kid.fill('#fp-join', inv['code']); await kid.click('[data-act="fpJoinSend"]')
        await kid.wait_for_function("document.querySelector('#toast') && /Signed in as Anderson/.test(document.querySelector('#toast').textContent)")
        await kid.click('[data-act="fpIntake"]'); await wait_sheet(kid, 'Get a plan built for you')
        sheet = await kid.inner_text('#sheet')
        ok('a kid gets the sport intake, five blocks, no name field', await kid.locator('#sheet .fp-sub').count() == 5 and 'Your sport' in sheet and 'What to improve' in sheet and await kid.locator('#in-name').count() == 0, sheet[:300])
        await kid.fill('#in-sport', 'Volleyball, setter')
        for q, v in [('level', 'Club'), ('season', 'In season'), ('improve', 'Jump higher'), ('improve', 'Quicker and more agile'), ('improve', 'Hit or throw harder'),
                     ('practice', '3'), ('days', '2'), ('mins', '30 min'), ('where', 'School or club gym'), ('exp', 'None yet'), ('sex', 'Girl')]:
            await kid.click('[data-act="fpChip"][data-q="%s"][data-v="%s"]' % (q, v))
        pressed = await kid.eval_on_selector_all('[data-act="fpChip"][data-q="improve"][aria-pressed="true"]', 'els => els.map(e => e.dataset.v)')
        ok('pick up to two: a third choice is refused', pressed == ['Jump higher', 'Quicker and more agile'], pressed)
        await kid.fill('#in-limits', 'none'); await kid.fill('#in-age', '13')
        text = await kid.evaluate('window.FP_UI.intakeText(window.FP_UI.collectIntake())')
        ok('the kid brief names the sport, the season, the goals and the week', all(x in text for x in ['for a kid (under 18)', 'Name: Anderson', 'Age: 13. Sex: girl', 'Volleyball, setter. Level: Club. Right now: In season', 'Wants to improve: Jump higher, Quicker and more agile', 'Practices and games a week: 3. Other days free to train: 2, about 30 min each']), text)
        await kid.click('[data-act="fpSendIntake"]'); await wait_sheet(kid, 'Building your plan')
        await wait_sheet(kid, "Anderson's plan", 60000)
        ok("the kid's plan comes back in the preview", 'Made for Anderson' in await kid.inner_text('#sheet'))
        calls = json.loads(urllib.request.urlopen('http://127.0.0.1:%d/__calls' % MOCK_PORT, timeout=10).read())['calls']
        last = calls[-1]
        ok('the coach got the youth rules for a kid, and not for Mike', 'under 18 and trains for a sport' in last['system'][0]['text'] and not any('under 18 and trains for a sport' in c['system'][0]['text'] for c in calls[:-1] if 'Build a FitPitt plan for Mike' in json.dumps(c['messages'])))
        await ctx_k.close()

        # ---------- 3c. Change my plan: a note, the current plan and the log go to the coach; its notes show with the plan ----------
        await mike.click('#tabs [data-tab="settings"]')
        ok('on a personal plan, Settings offers Change my plan', await mike.locator('#fp-set [data-act="fpChange"]').count() == 1)
        await mike.click('#fp-set [data-act="fpChange"]'); await wait_sheet(mike, 'Change my plan')
        await mike.fill('#fp-change', 'Swap leg press for hack squat'); await mike.click('[data-act="fpChangeSend"]'); await wait_sheet(mike, 'Building your plan')
        await wait_sheet(mike, "Mike's plan", 60000)
        ok("the changed plan shows the coach's notes", 'From the coach' in await mike.inner_text('#sheet') and 'Here is the plan.' in await mike.inner_text('#sheet'))
        calls = json.loads(urllib.request.urlopen('http://127.0.0.1:%d/__calls' % MOCK_PORT, timeout=10).read())['calls']
        msg = calls[-1]['messages'][0]['content']
        ok('the change request carries the note and the current plan', msg.startswith("Change Mike's plan") and 'Swap leg press for hack squat' in msg and 'Their current plan:' in msg, msg[:160])
        await mike.click('#sheet .sheet-body [data-act="closeSheet"]')
        await mike.click('#tabs [data-tab="today"]')

        # ---------- 4. A workout syncs to a second phone ----------
        await mike.click('[data-act="start"]'); await mike.wait_for_selector('#app .ex')
        ok('Ask the coach is on the workout screen', await mike.locator('[data-act="fpAsk"]').count() == 1)
        await fill_workout(mike)
        await mike.click('[data-act="finish"]'); await mike.wait_for_selector('#app .hero h1')
        await mike.click('#tabs [data-tab="settings"]')
        await mike.wait_for_function("Cloud.q.size === 0 && Cloud.status === 'saved'", timeout=15000)
        ok('the workout is saved to the account', 'Saved to your account' in await mike.inner_text('#fp-acct'))
        st, r = api('POST', '/admin/people/' + acct['person']['id'] + '/invite', token=gabe_token)
        code2 = r['invite']['code']
        ctx_m2, mike2 = await newpage(browser, dev=ANDROID, tag='mike-android')
        await mike2.goto(SITE + '#join=' + code2)
        await mike2.wait_for_function("document.querySelector('#toast') && /Signed in as Mike/.test(document.querySelector('#toast').textContent)", timeout=20000)
        await mike2.wait_for_function("JSON.parse(localStorage.getItem('traininglog.v1') || '{}').sessions && JSON.parse(localStorage.getItem('traininglog.v1')).sessions.length === 1", timeout=20000)
        await mike2.wait_for_selector('#app .hero h1')
        meta2 = await mike2.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta")
        ok('the Android phone gets the plan, the settings and the workout', meta2['program'] == 'mine' and (await mike2.inner_text('#app .hero h1')) == 'Lower 1', meta2)
        ok('the plan itself arrived', await mike2.evaluate("JSON.parse(localStorage.getItem('fitpitt.plan')).plan.name") == "Mike's plan")
        await shot(mike2, 'a6-android-synced')
        # a scan on phone 2 reaches phone 1
        await mike2.click('#tabs [data-tab="body"]'); await mike2.click('#app [data-act="addScan"]')
        await mike2.fill('#sc-weight', '201'); await mike2.fill('#sc-muscle', '95'); await mike2.fill('#sc-fat', '17.5'); await mike2.click('[data-act="saveScan"]')
        await mike2.wait_for_timeout(2500)
        await mike.evaluate('Cloud.sync()'); await mike.wait_for_timeout(1500)
        ok('a scan on the Android phone reaches the iPhone', await mike.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).scans.length") == 1)
        # a deletion on phone 1 reaches phone 2
        await mike.click('#tabs [data-tab="progress"]')
        await mike.locator('#app details.sess summary').first.click()
        await mike.click('[data-act="askDelSession"]'); await mike.click('#sheet [data-act="delSession"]')
        await mike.wait_for_timeout(2500)
        await mike2.evaluate('Cloud.sync()'); await mike2.wait_for_timeout(1500)
        ok('a deleted workout disappears on the other phone', await mike2.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).sessions.filter(s => !s.deleted).length") == 0)

        # ---------- 5. Review and questions ----------
        await mike2.click('#tabs [data-tab="today"]'); await mike2.click('[data-act="start"]'); await mike2.wait_for_selector('#app .ex'); await fill_workout(mike2); await mike2.click('[data-act="finish"]'); await mike2.wait_for_selector('#app .hero h1')
        await mike2.click('#tabs [data-tab="progress"]')
        b = mike2.locator('[data-act="fpReview"]')
        ok('Progress offers a coach review instead of a text to Gabe', await b.count() == 1 and await b.inner_text() == 'Review my week with the coach' and await mike2.locator('[data-act="coachShare"]').count() == 0)
        await b.click(); await wait_sheet(mike2, 'Reviewing your week'); await wait_sheet(mike2, 'Your week, reviewed', 60000)
        ok('the review arrives', 'Good week' in await mike2.inner_text('#sheet .fp-answer'))
        await shot(mike2, 'a7-review')
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')
        ok('the last review shows under Progress', 'Last review' in await mike2.inner_text('#app'))
        await mike2.click('#tabs [data-tab="today"]'); await mike2.click('[data-act="fpAsk"]'); await wait_sheet(mike2, 'Ask the coach')
        await mike2.fill('#fp-q', 'Should I add weight today?'); await mike2.click('[data-act="fpAskSend"]')
        await wait_sheet(mike2, 'The coach says', 60000)
        ok('a question gets an answer', 'Keep the weight' in await mike2.inner_text('#sheet .fp-answer'))
        await shot(mike2, 'a8-answer')
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')

        # ---------- 6. A plan build survives closing the sheet and reopening the app ----------
        await mike2.click('#tabs [data-tab="settings"]'); await mike2.click('#fp-set [data-act="fpIntake"]'); await wait_sheet(mike2, 'Get a plan built for you')
        ok('signed in, the intake takes the name from the account', await mike2.locator('#in-name').count() == 0)
        for q, v in [('goal', 'Get stronger'), ('days', '3'), ('mins', '45 min'), ('where', 'Full gym'), ('exp', 'Lifting under 2 years')]:
            await mike2.click('[data-act="fpChip"][data-q="%s"][data-v="%s"]' % (q, v))
        await mike2.fill('#in-limits', 'none'); await mike2.fill('#in-likes', 'squats')
        await mike2.click('[data-act="fpSendIntake"]'); await wait_sheet(mike2, 'Building your plan')
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')
        pend = await mike2.evaluate("JSON.parse(localStorage.getItem('fitpitt.job'))")
        ok('closing the sheet keeps the job pending on the phone', pend and pend['kind'] == 'plan')
        await mike2.reload(); await mike2.wait_for_selector('#app .hero h1')
        await wait_sheet(mike2, "Mike's plan", 60000)
        ok('reopening the app shows the finished plan', 'Made for Mike' in await mike2.inner_text('#sheet'))
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')

        # ---------- 7. Caps and the admin's view of costs ----------
        st, r = api('PATCH', '/admin/people/' + acct['person']['id'], {'cap_usd': 0.01}, token=gabe_token)
        await mike2.click('#tabs [data-tab="today"]'); await mike2.click('[data-act="fpAsk"]'); await mike2.fill('#fp-q', 'More?'); await mike2.click('[data-act="fpAskSend"]')
        await wait_sheet(mike2, 'Budget used up')
        ok('past his stop, Mike sees a plain message', 'used up' in await mike2.inner_text('#sheet'))
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')
        st, r = api('PATCH', '/admin/people/' + acct['person']['id'], {'cap_usd': None}, token=gabe_token)
        st, r = api('PUT', '/admin/settings', {'flag_usd': 0.01}, token=gabe_token)
        await gabe.click('[data-act="adOpen"]'); await wait_sheet(gabe, 'FitPitt admin')
        row = await gabe.locator('#sheet .list li', has_text='Mike').first.inner_text()
        ok('Gabe sees Mike flagged with his month and phones', 'flagged' in row and '2 phones' in row and 'coach calls this month' in row, row)
        await shot(gabe, 'a9-admin-flag')
        await gabe.click('[data-act="adJobs"]'); await wait_sheet(gabe, 'Recent coach calls')
        ok('recent calls list Mike with model and cost', 'Mike · plan' in await gabe.inner_text('#sheet') and 'claude-fable-5-1 high' in await gabe.inner_text('#sheet'))
        await gabe.click('[data-act="adBack"]'); await wait_sheet(gabe, 'FitPitt admin')
        await gabe.fill('#ad-flag', '5'); await gabe.select_option('#ad-e-ask', 'low'); await gabe.click('[data-act="adSave"]')
        await gabe.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').textContent === 'Saved.'")
        st, r = api('GET', '/admin/settings', token=gabe_token)
        ok('settings saved from the admin screen, max tokens included', r['settings']['flag_usd'] == 5 and r['settings']['tasks']['ask']['effort'] == 'low' and r['settings']['tasks']['plan']['max_tokens'] == 40000, r['settings'])

        # ---------- 8. Sign out, another person's code, and a closed account ----------
        st, r = api('POST', '/admin/people', {'name': 'Sarah'}, token=gabe_token); sarah_code = r['invite']['code']
        await mike2.goto(SITE + '#join=' + sarah_code); await mike2.wait_for_selector('#app .hero h1')
        await mike2.wait_for_function("document.querySelector('#toast') && /already signed in as Mike/.test(document.querySelector('#toast').textContent)")
        ok("a link for someone else on a signed-in phone does nothing", (await mike2.evaluate("JSON.parse(localStorage.getItem('fitpitt.account')).person.name")) == 'Mike')
        await mike2.click('#tabs [data-tab="settings"]'); await mike2.click('[data-act="fpSignOut"]'); await mike2.click('#sheet [data-act="fpSignOutNow"]')
        await mike2.wait_for_timeout(500)
        ok('signing out keeps the log on the phone', await mike2.evaluate("localStorage.getItem('fitpitt.account') === null && JSON.parse(localStorage.getItem('traininglog.v1')).sessions.length >= 1"))
        ok('Settings offers the invite sign-in again', 'I have an invite code' in await mike2.inner_text('#fp-acct'))
        await mike2.click('#fp-acct [data-act="fpJoin"]'); await wait_sheet(mike2, 'Sign in with an invite')
        await mike2.fill('#fp-join', sarah_code); await mike2.click('[data-act="fpJoinSend"]')
        await mike2.wait_for_function("document.querySelector('#fp-join-err').textContent.length > 0")
        ok("Sarah's code is refused while Mike's log is on the phone", "another person's log" in await mike2.inner_text('#fp-join-err') and await mike2.evaluate("localStorage.getItem('fitpitt.account') === null"))
        st, r = api('POST', '/join', {'code': sarah_code, 'check': True})
        st2, r2 = api('POST', '/join', {'code': sarah_code})
        ok("Sarah's code was not spent by the refusal", st2 == 200 and r2['person']['name'] == 'Sarah')
        await mike2.click('#sheet .sheet-body [data-act="closeSheet"]')
        st, r = api('PATCH', '/admin/people/' + acct['person']['id'], {'disabled': True}, token=gabe_token)
        await mike.evaluate('Cloud.sync()'); await mike.wait_for_timeout(1500)
        ok('a closed account signs the phone out with a message', await mike.evaluate("localStorage.getItem('fitpitt.account') === null") and 'closed' in await mike.inner_text('#toast'))

        await ctx.close(); await ctx_m.close(); await ctx_m2.close()
        await browser.close()

try:
    asyncio.run(main())
except Exception as e:
    import traceback; traceback.print_exc(); results.append(('crash', False))
finally:
    for p in procs: p.terminate()
    time.sleep(0.5)
    shutil.rmtree(persist, ignore_errors=True)
print('\nconsole errors:', errors if errors else 'none')
bad = [n for n, c in results if not c]
print('\n%d checks, %d failed' % (len(results), len(bad)))
print('screenshots:', SHOTS)
if bad:
    print('FAILED:', bad)
    out = procs[2].stdout.read() if procs[2].stdout else ''
    print('--- wrangler tail ---\n' + out[-3000:])
    sys.exit(1)
