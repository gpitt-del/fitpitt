"""FitPitt personal plans: end-to-end checks in simulated phones (headless Chromium via Playwright).

    python3 tools/test_personal_plans.py [screenshot folder]

Serves the repository on a local port, runs every check, and prints PASS or FAIL for each.
Needs: pip install playwright (Chromium installed for it). Nothing is uploaded anywhere.
"""
import asyncio, json, os, re, sys, copy, subprocess, datetime, tempfile, socket, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import plancode
from playwright.async_api import async_playwright

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port()
SITE = 'http://localhost:%d/' % PORT
SHOTS = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='fitpitt-shots-')
os.makedirs(SHOTS, exist_ok=True)
DL = tempfile.mkdtemp(prefix='fitpitt-dl-')
PLAN = json.load(open(HERE / 'sample-plan.json'))
PLAN_TEXT = json.dumps(PLAN, ensure_ascii=False, indent=1)
CODE = plancode.encode(PLAN)
results = []

def ok(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or not detail else '  ::  ' + str(detail)[:400]), flush=True)

IPHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
              user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
ANDROID = dict(viewport={'width': 360, 'height': 780}, device_scale_factor=2, is_mobile=True, has_touch=True,
               user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')
STUBS = """
window.__shared = []; window.__copied = [];
navigator.share = d => { window.__shared.push(d); return Promise.resolve(); };
try { navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); }; } catch (e) {}
"""
IOS_BROWSER = "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => false, configurable: true });"

errors = []
def watch(page, tag):
    def on_console(m):
        if m.type == 'error' and 'Failed to load resource' not in m.text:
            errors.append((tag, m.text))
    page.on('console', on_console)
    page.on('pageerror', lambda e: errors.append((tag, 'pageerror: ' + str(e))))

async def newpage(browser, dev=IPHONE, ios_browser=False, tag='page'):
    ctx = await browser.new_context(**dev, accept_downloads=True)
    await ctx.add_init_script(STUBS)
    if ios_browser:
        await ctx.add_init_script(IOS_BROWSER)
    page = await ctx.new_page()
    watch(page, tag)
    return ctx, page

async def sheet_title(page):
    return (await page.locator('#sheet:not([hidden]) .sheet-body h2').first.inner_text()).strip()

async def shot(page, name, full=False):
    await page.wait_for_timeout(400)  # let the sheet's opening animation finish
    await page.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=full)

async def seed(page, meta=None, sessions=None, scans=None, extra=None):
    await page.goto(SITE)
    await page.evaluate("""([meta, sessions, scans, extra]) => {
      localStorage.clear();
      if (meta) localStorage.setItem('traininglog.v1', JSON.stringify({ meta, active: null, activeU: 0, sessions: sessions || [], scans: scans || [] }));
      if (extra) Object.keys(extra).forEach(k => localStorage.setItem(k, extra[k]));
    }""", [meta, sessions, scans, extra])
    await page.reload()
    await page.wait_for_selector('#app h1')

def monday(d):
    return d - datetime.timedelta(days=d.weekday())

async def fill_workout(page, reps_for=None, weight=50):
    """Logs every set of the open workout. reps_for(ei) gives the reps to type."""
    n_ex = await page.locator('#app .ex').count()
    for ei in range(n_ex):
        rows = page.locator('#app .ex[data-ei="%d"] .set' % ei)
        for si in range(await rows.count()):
            row = page.locator('#app .set[data-ei="%d"][data-si="%d"]' % (ei, si))
            if 'drop' in (await row.get_attribute('class')):
                continue
            w = row.locator('input[data-f="w"]')
            if await w.count():
                await w.fill(str(weight))
            await row.locator('input[data-f="r"]').fill(str(reps_for(ei) if reps_for else 10))
            await row.locator('.check').click()
    return n_ex

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ---------- 1. A new friend's phone: first screen and intake ----------
        ctx, page = await newpage(browser, tag='intake')
        await page.goto(SITE)
        await page.wait_for_selector('#app h1')
        h = await page.inner_text('#app')
        ok('first screen offers both personal-plan routes', 'Get a plan built for you' in h and 'I have a plan code' in h)
        ok('first screen lists the 4 ready-made plans', await page.locator('#app [data-act="pickProgram"]').count() == 4)
        ok('tabs hidden on the first screen', await page.locator('#tabs').is_hidden())
        await shot(page, '01-first-screen')
        await page.click('[data-act="fpIntake"]')
        ok('intake opens', await sheet_title(page) == 'Get a plan built for you')
        await shot(page, '02-intake-top')
        await page.fill('#in-name', 'Mike')
        await page.click('[data-act="fpChip"][data-q="goal"][data-v="Build muscle"]')
        await page.click('[data-act="fpSendIntake"]')
        miss = await page.eval_on_selector_all('.fp-q.fp-miss', 'els => els.map(e => e.dataset.q)')
        ok('missing answers are marked', miss == ['days', 'mins', 'where', 'exp', 'limits', 'likes'], miss)
        ok('nothing shared while answers are missing', await page.evaluate('window.__shared.length') == 0)
        await page.click('[data-act="fpChip"][data-q="days"][data-v="4"]')
        await page.click('[data-act="fpChip"][data-q="mins"][data-v="60 min"]')
        await page.click('[data-act="fpChip"][data-q="where"][data-v="Full gym"]')
        await page.click('[data-act="fpChip"][data-q="exp"][data-v="Lifting under 2 years"]')
        await page.fill('#in-limits', 'Left shoulder pinches on overhead presses')
        await page.fill('#in-likes', 'Bench press, lat pulldown, leg press, curls')
        await page.fill('#in-age', '41')
        await page.click('[data-act="fpChip"][data-q="sex"][data-v="Male"]')
        # tapping a chosen chip again clears it, then choose again
        await page.click('[data-act="fpChip"][data-q="sex"][data-v="Male"]')
        ok('tapping a chosen chip clears it', await page.get_attribute('[data-act="fpChip"][data-q="sex"][data-v="Male"]', 'aria-pressed') == 'false')
        await page.click('[data-act="fpChip"][data-q="sex"][data-v="Male"]')
        await shot(page, '03-intake-filled', full=False)
        # answers survive closing the sheet and a reload
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        await page.reload(); await page.wait_for_selector('#app h1')
        await page.click('[data-act="fpIntake"]')
        ok('answers kept after a reload', await page.input_value('#in-limits') == 'Left shoulder pinches on overhead presses'
           and await page.get_attribute('[data-act="fpChip"][data-q="days"][data-v="4"]', 'aria-pressed') == 'true')
        # The site is pointed at the API (index.html's fitpitt-api meta tag), so the intake ends in Save my answers and
        # nothing is ever texted to Gabe: the answers wait on the phone for the invite code. (tools/test_accounts.py
        # covers the signed-in path, where the coach builds the plan.)
        ok('intake button is Save my answers', (await page.inner_text('[data-act="fpSendIntake"]')).strip() == 'Save my answers')
        text = await page.evaluate('window.FP_UI.intakeText(window.FP_UI.collectIntake())')
        expect = ['FitPitt plan request', 'Name: Mike', 'Goal: Build muscle', 'Days a week: 4, about 60 min each', 'Where: Full gym', 'Experience: Lifting under 2 years',
                  'Injuries or pain: Left shoulder pinches on overhead presses', 'Does now and likes: Bench press, lat pulldown, leg press, curls', 'Age: 41. Sex: male']
        ok('intake text has every answer', all(x in text for x in expect), text)
        print('---- intake text ----\n' + text + '\n---------------------')
        await page.click('[data-act="fpSendIntake"]')
        await page.wait_for_function("document.querySelector('#sheet .sheet-body h2') && document.querySelector('#sheet .sheet-body h2').textContent === 'Your answers are saved'")
        ok('signed out, the answers are saved and the invite sign-in is offered', await page.locator('#sheet [data-act="fpJoin"]').count() == 1)
        ok('nothing was texted to Gabe', await page.evaluate('window.__shared.length + window.__copied.length') == 0)
        await shot(page, '03b-answers-saved', full=False)
        await ctx.close()

        # ---------- 2. Gabe pastes Claude's JSON on his phone and sends a link ----------
        ctx, page = await newpage(browser, tag='gabe-json')
        await page.goto(SITE); await page.wait_for_selector('#app h1')
        await page.click('[data-act="fpPaste"]')
        ok('paste sheet opens', await sheet_title(page) == 'Load your plan')
        await page.fill('#fp-text', 'Here is the plan:\n```json\n' + PLAN_TEXT + '\n```')
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_function("document.querySelector('#sheet .sheet-body h2').textContent.indexOf('upper/lower') > 0")
        ok('fenced JSON opens the preview', (await sheet_title(page)) == "Mike's upper/lower")
        menu = await page.inner_text('#sheet .menu')
        ok('preview lists the 4 days', await page.locator('#sheet .menu h3').count() == 4)
        ok('preview shows sets and reps', 'Barbell bench press' in menu and '3 × 6–10' in menu and 'Side plank' in menu and '2 × 30–45 sec per side' in menu, menu[:300])
        ok('preview shows the plan rules', 'Look after the left shoulder.' in await page.inner_text('#sheet'))
        ok('preview notes rotating exercises', 'change from block to block' in await page.inner_text('#sheet'))
        ok('no iPhone note outside iPhone Safari', await page.locator('#sheet .notice').count() == 0)
        await shot(page, '04-preview')
        await page.click('[data-act="fpSend"]')
        await page.wait_for_function('window.__shared.length > 0')
        msg = (await page.evaluate('window.__shared[0]'))['text']
        m = re.search(r'(http\S+#plan=(FP1\.[A-Za-z0-9_-]+))', msg)
        ok('send gives a link with a code', bool(m), msg[:120])
        link, app_code = m.group(1), m.group(2)
        back = plancode.decode(app_code)
        errs, notes = plancode.check(back)
        ok('the app\'s code reads back in Python and passes its checks', not errs and back['name'] == PLAN['name'] and len(back['days']) == 4, errs)
        ok('the app\'s code keeps every exercise', [[(e['name'] if isinstance(e['name'], list) else [e['name']]), e['sets'], e['reps']] for d in back['days'] for e in d['ex']]
           == [[(e['name'] if isinstance(e['name'], list) else [e['name']]), e['sets'], e['reps'] if isinstance(e['reps'], list) else [e['reps'], e['reps']]] for d in PLAN['days'] for e in d['ex']])
        print('link length:', len(link))
        await page.click('#sheet [data-act="fpCopyCode"]')
        ok('copy the code', (await page.evaluate('window.__copied'))[-1] == app_code)
        await ctx.close()

        # ---------- 3. The friend opens the link in iPhone Safari and uses the plan ----------
        ctx, page = await newpage(browser, ios_browser=True, tag='friend-link')
        await page.goto(link)
        await page.wait_for_selector('#sheet:not([hidden]) .menu')
        ok('link opens the preview', await sheet_title(page) == "Mike's upper/lower")
        ok('link removed from the address bar', '#plan=' not in page.url)
        note = await page.inner_text('#sheet .notice')
        ok('iPhone Safari gets the Home Screen note', 'Home Screen' in note and 'Copy the code' in note)
        await shot(page, '05-link-preview-iphone')
        await page.click('#sheet .notice [data-act="fpCopyCode"]')
        ok('copy the code from the note', (await page.evaluate('window.__copied'))[-1] == app_code)
        async with page.expect_navigation():
            await page.click('[data-act="fpUse"]')
        await page.wait_for_selector('#app .hero h1')
        ok('after loading, Today shows day A of the plan', (await page.inner_text('#app .hero h1')) == 'Upper 1')
        toast = await page.inner_text('#toast')
        ok('a toast confirms the plan', toast.startswith('Plan loaded.'), toast)
        ok('Today lists 7 exercises', await page.locator('#app .preview li').count() == 7)
        st = await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta")
        ok('phone is on the personal plan', st['program'] == 'mine')
        exp_start = monday(datetime.date.today()) + (datetime.timedelta(days=7) if datetime.date.today().weekday() else datetime.timedelta(0))
        ok('a new phone starts its year at the next Monday', st['startDate'] == exp_start.isoformat(), st['startDate'])
        await shot(page, '06-today-after-load')
        day_btns = await page.eval_on_selector_all('#app .dayswitch button', 'b => b.map(x => x.innerText.replace(/\\s+/g, " ").trim())')
        ok('day switch shows the 4 days', day_btns == ['A Upper 1', 'B Lower 1', 'C Upper 2', 'D Lower 2'], day_btns)
        ok('four days fit the screen, no sideways scroll', await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), await page.evaluate('[document.documentElement.scrollWidth, innerWidth]'))
        await page.click('[data-act="pickDay"][data-d="D"]')
        bg = await page.evaluate("getComputedStyle(document.querySelector('.btn.primary')).backgroundColor")
        ok('day D has its own colour', bg in ('rgb(46, 155, 87)',), bg)
        today_text = await page.inner_text('#app')
        ok('hold shows seconds per side', '2 × 30–45 sec per side' in today_text)
        await page.click('[data-act="pickDay"][data-d="A"]')
        # Plan tab
        await page.click('#tabs [data-tab="plan"]')
        rules = await page.inner_text('#app .rules')
        ok('Plan tab: 7 blocks', await page.locator('#app details.block').count() == 7)
        ok('Plan tab: plan rules plus the app rules', all(x in rules for x in ['Log every working set.', 'One step a week.', 'Look after the left shoulder.', 'Rest about 2 minutes', 'Deload week:', 'Pain is a stop sign.']), rules)
        ok('Plan tab: weekly-step wording applied', 'the weight goes up the following week.' in rules and 'add weight next time' not in rules)
        vol = await page.inner_text('#app .vol')
        ok('Plan tab: weekly sets counted', 'Chest' in vol and 'Hamstrings' in vol, vol[:200])
        await shot(page, '07-plan-tab', full=True)
        # rotation 2 names appear in block 2
        b2 = await page.eval_on_selector('#app details.block:nth-of-type(2)', 'e => e.textContent')
        ok('block 2 uses rotation 2 names', 'Flat DB press' in b2 and 'Hack squat' in b2, b2[:200])
        # Body tab and the photo reader
        await page.click('#tabs [data-tab="body"]')
        ok('Body tab for scans', 'Body composition' in await page.inner_text('#app'))
        await page.click('#app [data-act="addScan"]')
        ok('photo reader buttons on the scan form', await page.locator('#sheet [data-act="scanShoot"]').count() == 1 and await page.locator('#sheet [data-act="scanPick"]').count() == 1)
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        # Settings
        await page.click('#tabs [data-tab="settings"]')
        card = await page.inner_text('#fp-set')
        ok('Settings shows the plan card', 'Your plan' in card and "Mike's upper/lower" in card and 'Made for Mike on Oct 11, 2026.' in card, card)
        ok('Settings plan list has the plan selected', await page.eval_on_selector('#program', 'e => e.value') == 'mine')
        await shot(page, '08-settings')
        await page.click('[data-act="fpMyCode"]')
        ok("copy this plan's code", (await page.evaluate('window.__copied'))[-1] == app_code)
        # A workout on day A
        await page.click('#tabs [data-tab="today"]')
        await page.click('[data-act="start"]')
        await page.wait_for_selector('#app .ex')
        ok('workout has 7 exercises', await page.locator('#app .ex').count() == 7)
        await shot(page, '09-workout')
        await fill_workout(page, reps_for=lambda ei: 10)
        await page.click('[data-act="finish"]')
        await page.wait_for_selector('#app .hero h1')
        sess = await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).sessions")
        ok('workout saved under the personal plan', len(sess) == 1 and sess[0]['prog'] == 'mine' and len(sess[0]['ex']) == 7, sess[:1])
        ok('next in rotation is day B', (await page.inner_text('#app .hero h1')) == 'Lower 1')
        # Progress tab, signed out on a personal plan: the coach button asks for a sign-in, it never texts the log to Gabe
        await page.click('#tabs [data-tab="progress"]')
        ok('Progress: signed out, the coach button is a sign-in prompt', await page.locator('[data-act="coachShare"]').count() == 0
           and (await page.locator('#app [data-act="fpJoin"]').inner_text()).strip() == 'Sign in for a coach review')
        await page.click('#app [data-act="fpJoin"]')
        ok('Progress: the prompt opens the invite sign-in', await sheet_title(page) == 'Sign in with an invite')
        ok('Progress: nothing was texted to Gabe', await page.evaluate('window.__shared.length') == 0)
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        # Backup carries the plan
        await page.click('#tabs [data-tab="settings"]')
        async with page.expect_download() as dl_info:
            await page.click('[data-act="exportJson"]')
        dl = await dl_info.value
        path = os.path.join(DL, 'backup.json')
        await dl.save_as(path)
        bk = json.load(open(path))
        ok('backup file holds the plan', bk.get('plan', {}).get('plan', {}).get('name') == "Mike's upper/lower" and bk['plan']['code'] == app_code)
        # Erase everything removes the plan
        await page.click('[data-act="askErase"]')
        await page.click('#sheet [data-act="erase"]')
        await page.wait_for_selector('#app h1')
        ok('erase: back to the first screen without the plan', await page.locator('#app [data-p="mine"]').count() == 0 and 'Get a plan built for you' in await page.inner_text('#app'))
        ok('erase: plan and answers gone from storage', await page.evaluate("localStorage.getItem('fitpitt.plan') === null && localStorage.getItem('fitpitt.intake') === null"))
        await ctx.close()

        # ---------- 4. Restore that backup on another phone ----------
        ctx, page = await newpage(browser, dev=ANDROID, tag='restore')
        await page.goto(SITE); await page.wait_for_selector('#app h1')
        await page.click('[data-act="pickProgram"][data-p="shape"]')
        await page.click('#tabs [data-tab="settings"]')
        async with page.expect_navigation():
            await page.set_input_files('#importFile', path)
        await page.wait_for_selector('#app .hero h1')
        meta = await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta")
        ok('restore brings back the plan and the workout', meta['program'] == 'mine' and (await page.inner_text('#app .hero h1')) == 'Lower 1', meta['program'])
        ok('restore toast', 'with your plan' in await page.inner_text('#toast'))
        await ctx.close()

        # ---------- 5. Gabe's own phone: an existing log is not disturbed ----------
        ctx, page = await newpage(browser, tag='gabe-own')
        start = (monday(datetime.date.today()) - datetime.timedelta(days=7)).isoformat()
        d1 = (monday(datetime.date.today()) - datetime.timedelta(days=7)).isoformat()
        build_sess = [{'id': 's1', 'prog': 'build', 'day': 'A', 'date': d1, 'startedAt': 1, 'endedAt': 2, 'dur': 3600, 'block': 1, 'week': 1, 'wib': 1, 'deload': False, 'rot': 1, 'note': '', 'u': 1,
                       'ex': [{'slot': 'A1', 'name': 'Flat DB press', 'g': 'chest', 'lo': 6, 'hi': 10, 'bw': False, 'sets': [{'w': 80, 'r': 8, 't': 60}, {'w': 80, 'r': 7, 't': 300}]}]}]
        await seed(page, meta={'v': 1, 'program': 'build', 'startDate': start, 'paused': [], 'priority': ['sdelt'], 'restC': 150, 'restI': 75, 'restRp': 20, 'style': 'std', 'sound': True, 'effort': 'all', 'names': {'build:1:A9': 'Lean-away lateral raise'}, 'lastBackup': 0, 'resetAt': 0, 'u': 1}, sessions=build_sess)
        ok("Gabe's plan opens as before", (await page.inner_text('#app .hero h1')) in ('Chest + arms', 'Back + shoulders', 'Legs + abs'))
        await page.click('#tabs [data-tab="settings"]')
        card = await page.inner_text('#fp-set')
        ok('Settings offers a personal plan', 'Your own plan' in card and 'I have a plan code' in card)
        await page.click('#fp-set [data-act="fpPaste"]')
        await page.fill('#fp-text', CODE)
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu')
        ok('a Python-made code opens', (await sheet_title(page)) == "Mike's upper/lower")
        ok('preview says the log stays', 'Your log stays' in await page.inner_text('#sheet'))
        async with page.expect_navigation():
            await page.click('[data-act="fpUse"]')
        await page.wait_for_selector('#app .hero h1')
        meta = await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta")
        ok('existing log keeps its start date and swaps', meta['program'] == 'mine' and meta['startDate'] == start and meta['names'] == {'build:1:A9': 'Lean-away lateral raise'}, meta)
        ok('switching plans clears priority muscles, as the Settings list does', meta['priority'] == [], meta['priority'])
        await page.click('#tabs [data-tab="settings"]')
        await page.select_option('#program', 'build')
        await page.wait_for_timeout(300)
        await page.click('#tabs [data-tab="progress"]')
        ok('switching back shows his own workouts', '1 workout logged' in await page.inner_text('#app .hero'))
        await page.click('#tabs [data-tab="settings"]')
        ok('back on his plan, the card offers his saved personal plan code tools', 'Your own plan' in await page.inner_text('#fp-set'))
        opts = await page.eval_on_selector_all('#program option', 'o => o.map(x => x.value)')
        ok('plan list includes the saved personal plan', opts == ['build', 'shape', 'vb2', 'vb1', 'mine'], opts)
        await ctx.close()

        # ---------- 6. Targets on a personal plan follow the app's rules ----------
        ctx, page = await newpage(browser, tag='targets')
        mon = monday(datetime.date.today())
        start = (mon - datetime.timedelta(days=14)).isoformat()
        wk1 = (mon - datetime.timedelta(days=14)).isoformat()
        stored = json.dumps({'plan': PLAN, 'code': CODE, 'at': 1})
        def sess(i, date, sets):
            return {'id': 's%d' % i, 'prog': 'mine', 'day': 'A', 'date': date, 'startedAt': i, 'endedAt': i + 1, 'dur': 3000, 'block': 1, 'week': 1, 'wib': 1, 'deload': False, 'rot': 1, 'note': '', 'u': 1,
                    'ex': [{'slot': 'A1', 'name': 'Barbell bench press', 'g': 'chest', 'lo': 6, 'hi': 10, 'bw': False, 'sets': sets},
                           {'slot': 'A2', 'name': 'Lat pulldown', 'g': 'back', 'lo': 8, 'hi': 12, 'bw': False, 'sets': [{'w': 120, 'r': 6, 't': 1}, {'w': 120, 'r': 5, 't': 2}, {'w': 120, 'r': 5, 't': 3}]}]}
        sessions = [sess(1, wk1, [{'w': 135, 'r': 10, 't': 1}, {'w': 135, 'r': 10, 't': 2}, {'w': 135, 'r': 10, 't': 3}])]
        await seed(page, meta={'v': 1, 'program': 'mine', 'startDate': start, 'paused': [], 'priority': [], 'restC': 150, 'restI': 75, 'restRp': 20, 'style': 'std', 'sound': True, 'effort': 'last', 'names': {}, 'lastBackup': 0, 'resetAt': 0, 'u': 1},
                   sessions=sessions, extra={'fitpitt.plan': stored})
        await page.click('[data-act="pickDay"][data-d="A"]')
        pv = await page.inner_text('#app .preview')
        ok('earned in week 1, the bench goes up in week 3', 'Add weight: 140 lb' in pv, pv[:300])
        ok('too heavy for the range, the pulldown drops', 'Too heavy for 8 to 12 reps. Drop to' in pv, pv[:500])
        await page.click('[data-act="start"]')
        await page.wait_for_selector('#app .ex')
        w0 = await page.input_value('#app .set[data-ei="0"][data-si="0"] input[data-f="w"]')
        ok('the workout fills in the new weight', w0 == '140', w0)
        await ctx.close()

        # ---------- 7. Bad codes get plain reasons ----------
        ctx, page = await newpage(browser, tag='errors')
        await page.goto(SITE); await page.wait_for_selector('#app h1')
        await page.click('[data-act="fpPaste"]')
        async def try_text(t):
            await page.fill('#fp-text', t)
            await page.click('[data-act="fpCheck"]')
            await page.wait_for_timeout(250)
            return await page.inner_text('#fp-err') if await page.locator('#fp-err').count() else ''
        e1 = await try_text('hello there')
        ok('random text: says what a code looks like', 'starts with FP1' in e1, e1)
        e2 = await try_text(CODE[:200])
        ok('cut-off code: says to copy it again', 'cut off' in e2, e2)
        bad = {'fitpitt': 1, 'name': '', 'days': [{'name': 'X', 'ex': [{'name': 'Bench', 'g': 'chest', 'sets': 0, 'reps': [10, 5]}]}]}
        e3 = await try_text(json.dumps(bad))
        ok('broken plan: lists each problem', 'needs a name' in e3 and 'sets must be' in e3 and 'reps must be' in e3, e3)
        await shot(page, '10-paste-errors')
        e4 = await try_text('{"fitpitt": 2, "name": "x", "days": []}')
        ok('newer format: asks to update the app', 'newer FitPitt' in e4, e4)
        curly = PLAN_TEXT.replace('"', '“', 1)  # one curly quote, as a phone keyboard might leave
        curly = re.sub(r'"([^"]*)"', '“\\1”', PLAN_TEXT)
        await page.fill('#fp-text', curly)
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu', timeout=3000)
        ok('curly quotes are forgiven', (await sheet_title(page)) == "Mike's upper/lower")
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        await page.click('[data-act="fpPaste"]')
        wrapped = CODE[:60] + '\n' + CODE[60:700] + ' \n ' + CODE[700:]
        await page.fill('#fp-text', 'Your FitPitt plan:\n' + wrapped)
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu', timeout=3000)
        ok('a code broken over lines still opens', (await sheet_title(page)) == "Mike's upper/lower")
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        await page.click('[data-act="fpPaste"]')
        await page.fill('#fp-text', "Here's your plan: " + CODE + "\nLet me know how the first week goes.")
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu', timeout=3000)
        ok('a code with the rest of the message around it opens', (await sheet_title(page)) == "Mike's upper/lower")
        # a link pasted in, with an injected tag in a name, is defused
        evil = copy.deepcopy(PLAN); evil['name'] = 'Mike <img src=x onerror=alert(1)>'; evil['days'][0]['name'] = '<b>Upper</b>'
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        await page.click('[data-act="fpPaste"]')
        await page.fill('#fp-text', SITE + '#plan=' + plancode.encode(evil))
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu', timeout=3000)
        ok('angle brackets never reach the page', await page.locator('#sheet img').count() == 0 and (await sheet_title(page)) == 'Mike img src=x onerror=alert(1)')
        await ctx.close()

        # ---------- 8. A six-day plan: day colours D to F ----------
        six = copy.deepcopy(PLAN); six['name'] = 'Six-day test'; six['perWeek'] = 6
        six['days'] = six['days'] + [dict(six['days'][0], name='Upper 3', short='Upper 3'), dict(six['days'][1], name='Lower 3', short='Lower 3')]
        ctx, page = await newpage(browser, dev=ANDROID, tag='six')
        await seed(page, meta={'v': 1, 'program': 'mine', 'startDate': monday(datetime.date.today()).isoformat(), 'paused': [], 'priority': [], 'restC': 150, 'restI': 75, 'restRp': 20, 'style': 'std', 'sound': True, 'effort': 'last', 'names': {}, 'lastBackup': 0, 'resetAt': 0, 'u': 1},
                   extra={'fitpitt.plan': json.dumps({'plan': six, 'code': '', 'at': 1})})
        cols = {}
        for d in 'DEF':
            await page.click('[data-act="pickDay"][data-d="%s"]' % d)
            cols[d] = await page.evaluate("getComputedStyle(document.querySelector('.btn.primary')).backgroundColor")
        ok('days D, E and F each get a colour', len(set(cols.values())) == 3 and 'rgb(23, 33, 43)' not in cols.values(), cols)
        await page.click('[data-act="pickDay"][data-d="F"]')
        ok('six days fit the screen, no sideways scroll', await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), await page.evaluate('[document.documentElement.scrollWidth, innerWidth]'))
        await shot(page, '11-six-day')
        ok('six-day plan: streak and week notices still work', await page.locator('#app .hero h1').inner_text() == 'Lower 3')
        await ctx.close()

        # ---------- 9. Fixes from the review ----------
        ctx, page = await newpage(browser, tag='review')
        await page.goto(SITE); await page.wait_for_selector('#app h1')
        # a link opened in a page that already shows FitPitt
        await page.evaluate("c => { location.hash = '#plan=' + c; }", CODE)
        await page.wait_for_selector('#sheet:not([hidden]) .menu', timeout=5000)
        ok('a link opened in an open FitPitt shows the preview', (await sheet_title(page)) == "Mike's upper/lower")
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        await page.evaluate("c => { location.hash = '#plan=' + c; }", CODE)
        await page.wait_for_selector('#sheet:not([hidden]) .menu', timeout=5000)
        ok('the same link a second time works too', (await sheet_title(page)) == "Mike's upper/lower")
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        # weird input and a note above JSON
        await page.click('[data-act="fpPaste"]')
        await page.fill('#fp-text', '{"fitpitt":1,"name":{"toString":0},"days":[]}')
        await page.click('[data-act="fpCheck"]'); await page.wait_for_timeout(250)
        ok('an object where text belongs gets a reason, not a crash', 'needs a name' in await page.inner_text('#fp-err'))
        await page.fill('#fp-text', 'FP1. codes did not work on my phone, so here is the long one:\n' + PLAN_TEXT)
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu', timeout=3000)
        ok('a note mentioning FP1. above the JSON still opens', (await sheet_title(page)) == "Mike's upper/lower")
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        # a day name without a short name: reopening the same plan recognises it, and swaps survive
        odd = {'fitpitt': 1, 'name': 'Odd days', 'days': [{'name': 'Full body workout A', 'ex': [{'name': 'Leg press', 'g': 'quad', 'sets': 3, 'reps': [8, 12]}, {'name': 'Plank', 'g': 'abs', 'sets': 2, 'reps': [30, 60], 'hold': True}]},
                                                     {'name': '+ Upper body pressing day', 'ex': [{'name': 'Push-up', 'g': 'chest', 'sets': 2, 'reps': 12, 'bw': 'true'}]}]}
        odd_code = plancode.encode(odd)
        await page.click('[data-act="fpPaste"]'); await page.fill('#fp-text', odd_code); await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu')
        async with page.expect_navigation():
            await page.click('[data-act="fpUse"]')
        await page.wait_for_selector('#app .hero h1')
        await page.evaluate("() => { const d = JSON.parse(localStorage.getItem('traininglog.v1')); d.meta.names = { 'mine:1:A1': 'Hack squat' }; localStorage.setItem('traininglog.v1', JSON.stringify(d)); }")
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        await page.evaluate("c => { location.hash = '#plan=' + c; }", odd_code)
        await page.wait_for_selector('#sheet:not([hidden]) .menu', timeout=5000)
        ok('reopening the plan in use is recognised', 'This is the plan this phone is on now.' in await page.inner_text('#sheet') and await page.locator('#sheet [data-act="fpUse"]').count() == 0)
        await page.click('#sheet .sheet-body [data-act="closeSheet"]')
        ok('swaps survive a reload of the same plan', await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta.names['mine:1:A1']") == 'Hack squat')
        ok('the swap shows on Today', 'Hack squat' in await page.inner_text('#app .preview'))
        await page.click('[data-act="pickDay"][data-d="A"]')
        ok('a hold has a fixed rest and seconds', '2 × 30–60 sec' in await page.inner_text('#app .preview'))
        # rest-pause style never turns a hold into mini-sets
        await page.evaluate("() => { const d = JSON.parse(localStorage.getItem('traininglog.v1')); d.meta.style = 'rp'; localStorage.setItem('traininglog.v1', JSON.stringify(d)); }")
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        await page.click('[data-act="pickDay"][data-d="A"]')
        pv = await page.inner_text('#app .preview')
        ok('rest-pause leaves holds as straight sets', '2 × 30–60 sec' in pv and '30–60 sec + ' not in pv, pv[:300])
        # a broken backup that carries a plan does not replace the plan in use
        before = await page.evaluate("localStorage.getItem('fitpitt.plan')")
        bad_backup = os.path.join(DL, 'bad-backup.json')
        json.dump({'app': 'fitpitt', 'meta': {}, 'sessions': 'oops', 'scans': [], 'plan': {'plan': PLAN, 'code': CODE}}, open(bad_backup, 'w'))
        await page.click('#tabs [data-tab="settings"]')
        await page.set_input_files('#importFile', bad_backup)
        await page.wait_for_timeout(500)
        ok('a broken backup is refused and the plan stays', await page.evaluate("localStorage.getItem('fitpitt.plan')") == before and 'not a backup' in await page.inner_text('#toast'))
        # a new version of a personal plan keeps the priority muscles it still trains
        await page.evaluate("() => { const d = JSON.parse(localStorage.getItem('traininglog.v1')); d.meta.priority = ['quad', 'chest']; d.meta.style = 'std'; localStorage.setItem('traininglog.v1', JSON.stringify(d)); }")
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        v2 = copy.deepcopy(odd); v2['name'] = 'Odd days, version 2'; v2['days'] = [v2['days'][0]]
        await page.click('#tabs [data-tab="settings"]'); await page.click('#fp-set [data-act="fpPaste"]')
        await page.fill('#fp-text', plancode.encode(v2)); await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu')
        async with page.expect_navigation():
            await page.click('[data-act="fpUse"]')
        await page.wait_for_selector('#app .hero h1')
        meta = await page.evaluate("JSON.parse(localStorage.getItem('traininglog.v1')).meta")
        ok('a new version keeps the priorities it still trains', meta['priority'] == ['quad'], meta['priority'])
        ok('a new version clears the old swaps', meta['names'] == {}, meta['names'])
        await ctx.close()

        await browser.close()

    print('\nconsole errors:', errors if errors else 'none')
    bad = [n for n, c in results if not c]
    print('\n%d checks, %d failed' % (len(results), len(bad)))
    if bad:
        print('FAILED:', bad)
        sys.exit(1)

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.8)
    asyncio.run(main())
finally:
    server.terminate()
    print('screenshots:', SHOTS)
