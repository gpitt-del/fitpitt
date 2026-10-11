"""Update rehearsal: a phone on an earlier release picks up this one, keeps its log, then works offline.

    python3 tools/test_update.py [old git ref, default HEAD~1]

Exports the old release with git archive, serves it, installs it in a simulated phone, then swaps the
served folder to this working tree and reloads, as a GitHub Pages update would.
"""
import asyncio, json, os, sys, datetime, subprocess, tempfile, socket, time, shutil
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import plancode
from playwright.async_api import async_playwright

OLD_REF = sys.argv[1] if len(sys.argv) > 1 else 'HEAD~1'
TMP = Path(tempfile.mkdtemp(prefix='fitpitt-update-'))
OLD = TMP / 'old'; OLD.mkdir()
subprocess.run('git -C "%s" archive %s | tar -x -C "%s"' % (ROOT, OLD_REF, OLD), shell=True, check=True)
LINK = str(TMP / 'site')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
SITE = 'http://localhost:%d/' % PORT
PLAN = json.load(open(HERE / 'sample-plan.json'))
import re
cache_of = lambda d: re.search(r"const CACHE = '([^']+)'", open(os.path.join(d, 'sw.js')).read()).group(1)
OLD_CACHE, NEW_CACHE = cache_of(OLD), cache_of(ROOT)
CODE = plancode.encode(PLAN)
results = []
def ok(name, cond, detail=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond or not detail else '  ::  ' + str(detail)[:300]), flush=True)
def point(target):
    tmp = LINK + '.tmp'; os.symlink(target, tmp); os.replace(tmp, LINK)

async def caches(page):
    return await page.evaluate('caches.keys()')

async def main():
    point(str(OLD))
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(SITE); await page.wait_for_selector('#app h1')
        await page.evaluate('navigator.serviceWorker.ready')
        for _ in range(60):
            if OLD_CACHE in await caches(page): break
            await page.wait_for_timeout(250)
        ok('old version installed with its cache ' + OLD_CACHE, OLD_CACHE in await caches(page), await caches(page))
        if not (OLD / 'n.js').exists(): ok('old version has no personal plans', 'Get a plan built for you' not in await page.inner_text('#app'))
        # Gabe's log on the old version
        start = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday() + 7)).isoformat()
        sess = [{'id': 's1', 'prog': 'build', 'day': 'A', 'date': start, 'startedAt': 1, 'endedAt': 2, 'dur': 3000, 'block': 1, 'week': 1, 'wib': 1, 'deload': False, 'rot': 1, 'note': '', 'u': 1,
                 'ex': [{'slot': 'A1', 'name': 'Flat DB press', 'g': 'chest', 'lo': 6, 'hi': 10, 'bw': False, 'sets': [{'w': 80, 'r': 9, 't': 60}]}]}]
        await page.evaluate("s => localStorage.setItem('traininglog.v1', JSON.stringify({ meta: { v: 1, program: 'build', startDate: s[0], paused: [], priority: [], effort: 'all', names: {}, u: 1 }, active: null, activeU: 0, sessions: s[1], scans: [] }))", [start, sess])
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        before = await page.evaluate("localStorage.getItem('traininglog.v1')")

        # ---- release: the server now has the new files ----
        point(str(ROOT))
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        for _ in range(60):
            k = await caches(page)
            if NEW_CACHE in k and OLD_CACHE not in k: break
            await page.wait_for_timeout(250)
        print('caches after update:', await caches(page), '| controller:', await page.evaluate("navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL"))
        ok('after one reload the new cache replaces the old', NEW_CACHE in await caches(page) and set(await caches(page)) <= {NEW_CACHE, 'fitpitt-ocr7'}, await caches(page))
        shell = await page.evaluate("name => caches.open(name).then(c => c.keys()).then(ks => ks.map(r => new URL(r.url).pathname.replace(/^\\//, '')))", NEW_CACHE)
        ok('new cache holds n.js and o.js', 'n.js' in shell and 'o.js' in shell, shell)
        ok('log untouched by the update', await page.evaluate("localStorage.getItem('traininglog.v1')") == before)
        ok('his plan still opens', (await page.inner_text('#app .hero h1')) in ('Chest + arms', 'Back + shoulders', 'Legs + abs'))
        await page.click('#tabs [data-tab="settings"]')
        ok('the new Settings card is there', 'Your own plan' in await page.inner_text('#fp-set'))

        # ---- offline ----
        await ctx.set_offline(True)
        await page.reload(); await page.wait_for_selector('#app .hero h1')
        ok('opens offline', (await page.inner_text('#app .hero h1')) in ('Chest + arms', 'Back + shoulders', 'Legs + abs'))
        await page.click('#tabs [data-tab="settings"]')
        await page.click('#fp-set [data-act="fpPaste"]')
        await page.fill('#fp-text', CODE)
        await page.click('[data-act="fpCheck"]')
        await page.wait_for_selector('#sheet .menu')
        ok('a plan code opens offline', 'upper/lower' in await page.inner_text('#sheet h2'))
        async with page.expect_navigation():
            await page.click('[data-act="fpUse"]')
        await page.wait_for_selector('#app .hero h1')
        ok('and loads offline', (await page.inner_text('#app .hero h1')) == 'Upper 1')
        await ctx.set_offline(False)
        print('page errors:', errs or 'none')
        await browser.close()
    bad = [n for n, c in results if not c]
    print('\n%d checks, %d failed' % (len(results), len(bad)))
    sys.exit(1 if bad else 0)

point(str(ROOT))
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', LINK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.8)
    asyncio.run(main())
finally:
    server.terminate()
    shutil.rmtree(TMP, ignore_errors=True)
