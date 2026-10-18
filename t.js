'use strict';
/* ================= The week outside the gym (standalone site only) =================
   Plan 2.0 part C (Gabe, Oct 12 and 13). Targets for the days around the lifting, a Today card to log them against,
   a line on Progress, and the same numbers in the coach's weekly review.
   - Settings → Outside the gym: goal (build, keep, cut), activity, weight and body fat (from the latest scan unless
     typed), and targets for steps, sleep, zone 2 minutes a week and 4x4 sessions a week. Maintenance is estimated
     with Katch-McArdle from lean mass (BMR = 370 + 21.6 × lean kg), times an activity factor; calories are maintenance
     +300 to build, −450 to cut; protein 0.9 g per lb (1.0 on a cut); water about half an ounce per lb. The estimate
     is a starting point: after two weeks of calories and morning weights the app offers a corrected maintenance and
     the person taps to accept it (the app never changes the number on its own).
   - Today: one row per target with a box to type into and a tick when it is met; zone 2 and the 4x4 count across the
     week. Entries are one record per date (S.days, synced as the 'day' kind).
   - Kids (youth plans or the kid role): protein, water, sleep and steps only. No calorie targets, nothing about cutting.
   - The coach's weekly review gets the last 7 days and the targets (FP_COACH.summary). */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  // Right after a release a browser can run this file with a cached older b.js for a few minutes (Pages caches for 10):
  // then S.days and saveDay do not exist yet. Entries typed in that window stay on the screen only; the next load has both.
  if (!Array.isArray(S.days)) S.days = [];
  const persist = typeof saveDay === 'function' ? saveDay : d => { if (!S.days.includes(d)) S.days.push(d); };
  const DEF = { goal: 'build', act: 'desk', lb: null, bf: null, adj: 0, steps: 8000, sleep: 7.5, z2: 90, hiit: 1 };
  const MULT = { desk: 1.35, feet: 1.5, active: 1.65 }, DELTA = { build: 300, keep: 0, cut: -450 };
  const ACTS = [['desk', 'Mostly sitting'], ['feet', 'On my feet a lot'], ['active', 'Active job']];
  const GOALS = [['build', 'Build'], ['keep', 'Keep'], ['cut', 'Cut']];
  const W = () => Object.assign({}, DEF, S.meta.week || {});
  const kid = () => !!(P().youth || (window.FP_KID && window.FP_KID()));
  const r5 = n => Math.round(n / 5) * 5, r10 = n => Math.round(n / 10) * 10;
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const today = () => ymd(new Date());
  const latestScan = () => liveScans().filter(s => s.weight > 0).slice(-1)[0] || null;

  function targets() {
    const w = W(), sc = latestScan(), lb = w.lb || (sc && sc.weight) || 0;
    const bf = w.bf != null ? w.bf : (sc && sc.fat > 0 ? sc.fat : 20);
    const lbm = lb * (1 - bf / 100), bmr = lbm > 0 ? 370 + 21.6 * lbm * 0.4536 : 0;
    const maint = bmr ? r10(bmr * (MULT[w.act] || 1.35) + (w.adj || 0)) : 0;
    const k = kid();
    return {
      kid: k, lb, bf, lbm, bmr: Math.round(bmr), maint, fromScan: !!(sc && !w.lb), scanDate: sc ? sc.date : '',
      kcal: k || !maint ? 0 : maint + (DELTA[w.goal] || 0),
      pro: lb ? r5(lb * (k ? 0.7 : w.goal === 'cut' ? 1.0 : 0.9)) : 0,
      water: lb ? Math.min(128, Math.round(lb * 0.5 / 4) * 4) : 0,
      steps: w.steps, sleep: k && !(S.meta.week && S.meta.week.sleep) ? 9 : w.sleep, z2: k ? 0 : w.z2, hiit: k ? 0 : w.hiit,
    };
  }
  const dayOf = id => S.days.find(d => d.id === id && !d.deleted) || null;
  function setDay(id, patch) {
    let d = S.days.find(x => x.id === id);
    if (!d || d.deleted) d = { id };
    Object.keys(patch).forEach(k => { if (patch[k] == null) delete d[k]; else d[k] = patch[k]; });
    persist(d);
  }
  function weekDays(ref) { // Monday to Sunday around a date
    const d = parseYmd(ref), dow = (d.getDay() + 6) % 7, mon = addDays(d, -dow);
    return Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i)));
  }
  const weekSum = (ref, k) => weekDays(ref).reduce((a, id) => { const d = dayOf(id); return a + (d && d[k] > 0 ? +d[k] : 0); }, 0);
  const met = (k, v, T) => v == null ? false : k === 'kcal' ? Math.abs(v - T.kcal) <= T.kcal * 0.1 : k === 'pro' ? v >= T.pro : k === 'water' ? v >= T.water : k === 'steps' ? v >= T.steps : k === 'sleep' ? v >= T.sleep : false;

  /* ---------- the maintenance correction from the log ---------- */
  function suggest(T) {
    if (T.kid || !T.maint) return null;
    const ids = Array.from({ length: 14 }, (_, i) => ymd(addDays(new Date(), -i))).reverse();
    const ds = ids.map(id => dayOf(id)).filter(Boolean);
    const withK = ds.filter(d => d.kcal > 0), withW = ds.filter(d => d.wt > 0);
    if (withK.length < 10 || withW.length < 4) return null;
    const t0 = parseYmd(withW[0].id), xs = withW.map(d => (parseYmd(d.id) - t0) / 86400000), ys = withW.map(d => +d.wt);
    if (xs[xs.length - 1] < 10) return null;
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) * (x - mx), 0) || 1); // lb a day
    const avgK = withK.reduce((a, d) => a + d.kcal, 0) / withK.length, expected = (avgK - T.maint) / 3500;
    // Gaining faster than the estimate predicts means maintenance is lower than estimated, and the other way round.
    const adj = Math.max(-150, Math.min(150, r10((expected - slope) * 3500)));
    if (Math.abs(adj) < 50) return null;
    return { adj, to: T.maint + adj, days: withK.length, slope };
  }

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = '.wko{margin-top:14px;padding:12px 14px;background:var(--surface);border-radius:10px;border:1px solid var(--line)}.wko .s-l{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}' +
    '.wk-row{display:grid;grid-template-columns:1fr 92px 34px;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--line)}.wk-row:first-of-type{border-top:0}.wk-row label{font-size:15px}.wk-row small{display:block;color:var(--muted);font-size:13px}' +
    '.wk-row input{width:100%;min-height:40px;padding:0 8px;border:1.5px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:600 17px var(--f);text-align:right}' +
    '.wk-ok{width:30px;height:30px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;color:transparent;font-weight:700}.wk-ok.on{background:var(--green);border-color:var(--green);color:var(--on-green)}' +
    '.wk-hiit{min-height:40px;border:1.5px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:600 15px var(--f)}.wk-hiit.on{background:var(--green);border-color:var(--green);color:var(--on-green)}' +
    '.wk-note{color:var(--muted);font-size:13px;margin-top:8px}.wko .chips{margin:6px 0 10px}.wk-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.wk-two label{font-size:13px;color:var(--muted)}.wk-two input{width:100%;min-height:40px;margin-top:3px;padding:0 8px;border:1.5px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:600 16px var(--f)}' +
    '.wk-est{margin-top:10px;padding:10px 12px;border-left:3px solid var(--day);font-size:15px;line-height:1.45}';
  document.head.appendChild(css);

  /* ---------- Today card ---------- */
  const row = (k, label, sub, val, unit, ok) => '<div class="wk-row"><label for="wk-' + k + '">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</label>' +
    '<input id="wk-' + k + '" type="text" inputmode="decimal" autocomplete="off" data-wk="' + k + '" value="' + (val == null ? '' : val) + '" placeholder="' + esc(unit) + '" aria-label="' + esc(label) + '">' +
    '<span class="wk-ok' + (ok ? ' on' : '') + '" aria-label="' + (ok ? 'Done' : 'Not yet') + '">✓</span></div>';
  function todayCard() {
    if (tab !== 'today' || S.active || !S.meta.program) return;
    let el = app.querySelector('.wk-today');
    if (!el) { const after = app.querySelector('.fp-tip') || app.querySelector('.dayswitch') || app.querySelector('[data-act="start"]'); if (!after) return; el = document.createElement('section'); el.className = 'wko wk-today'; after.after(el); }
    const T = targets(), id = today(), d = dayOf(id) || {}, z2wk = weekSum(id, 'z2'), hiitWk = weekSum(id, 'hiit');
    let h = '<span class="s-l">Outside the gym, today</span>';
    if (!T.kid) h += row('kcal', 'Calories', T.kcal ? 'target ' + fmtN(T.kcal) : 'set a weight in Settings for a target', d.kcal, 'kcal', met('kcal', d.kcal, T));
    h += row('pro', 'Protein', T.pro ? 'target ' + T.pro + ' g' : 'set a weight in Settings for a target', d.pro, 'g', met('pro', d.pro, T));
    h += row('water', 'Water', T.water ? 'target ' + T.water + ' oz' : '', d.water, 'oz', met('water', d.water, T));
    h += row('steps', 'Steps', 'target ' + fmtN(T.steps), d.steps, 'steps', met('steps', d.steps, T));
    h += row('sleep', 'Sleep last night', 'target ' + T.sleep + ' h. Lights down an hour before bed, no screens or LEDs in the room.', d.sleep, 'hours', met('sleep', d.sleep, T));
    if (!T.kid) {
      h += row('z2', 'Zone 2 cardio', 'this week ' + z2wk + ' of ' + T.z2 + ' min. Easy pace, you can talk in sentences.', d.z2, 'min', z2wk >= T.z2);
      h += '<div class="wk-row"><label>Norwegian 4×4<small>this week ' + hiitWk + ' of ' + T.hiit + '. 4 × 4 min hard, 3 min easy between.</small></label><button class="wk-hiit' + (d.hiit ? ' on' : '') + '" data-act="wkHiit" aria-pressed="' + !!d.hiit + '">' + (d.hiit ? 'Done today' : 'Did it') + '</button><span class="wk-ok' + (hiitWk >= T.hiit ? ' on' : '') + '">✓</span></div>';
      h += row('wt', 'Morning weight', 'optional; a trend over two weeks corrects the calorie estimate', d.wt, 'lb', false);
    }
    el.innerHTML = h;
  }
  ACT.wkHiit = () => { const id = today(), d = dayOf(id) || {}; setDay(id, { hiit: d.hiit ? null : 1 }); todayCard(); };

  /* ---------- Settings card ---------- */
  const chips = (act, cur, opts) => '<div class="chips">' + opts.map(([v, l]) => '<button data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + l + '</button>').join('') + '</div>';
  const box = (k, label, val, ph) => '<label>' + label + '<input type="text" inputmode="decimal" autocomplete="off" data-wkset="' + k + '" value="' + (val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '"></label>';
  function settingsCard() {
    if (tab !== 'settings' || !S.meta.program) return;
    let el = $('#wk-set');
    if (!el) { const after = $('#fp-set') || app.querySelector('.setting'); if (!after) return; el = document.createElement('div'); el.className = 'setting wko'; el.id = 'wk-set'; after.after(el); }
    const w = W(), T = targets(), sc = latestScan();
    let h = '<span class="s-l">Outside the gym</span>';
    if (!T.kid) {
      h += '<p>Goal</p>' + chips('wkGoal', w.goal, GOALS) + '<p>Your day, apart from training</p>' + chips('wkAct', w.act, ACTS);
      h += '<div class="wk-two">' + box('lb', 'Weight, lb' + (T.fromScan ? ' (from your scan)' : ''), w.lb, sc && sc.weight ? String(sc.weight) : '200') + box('bf', 'Body fat, %' + (w.bf == null && sc && sc.fat > 0 ? ' (from your scan)' : ''), w.bf, sc && sc.fat > 0 ? String(sc.fat) : '20') + '</div>';
      if (T.maint) {
        h += '<div class="wk-est">Maintenance about <b>' + fmtN(T.maint) + ' kcal</b> a day (lean mass ' + Math.round(T.lbm) + ' lb' + (T.fromScan && T.scanDate ? ' from your scan on ' + fmtDate(parseYmd(T.scanDate)) : '') + ', Katch-McArdle, ' + (ACTS.find(a => a[0] === w.act) || ACTS[0])[1].toLowerCase() + '). ' +
          'Target <b>' + fmtN(T.kcal) + ' kcal</b> and <b>' + T.pro + ' g protein</b> to ' + { build: 'build', keep: 'hold', cut: 'cut' }[w.goal] + ', water ' + T.water + ' oz. The formula is good to about 10%; two weeks of calories and morning weights on Today sharpen it.' + (w.adj ? ' Corrected by ' + (w.adj > 0 ? '+' : '') + w.adj + ' from your log.' : '') + '</div>';
        const sg = suggest(T);
        if (sg) h += '<div class="wk-est">Your log says maintenance is closer to <b>' + fmtN(sg.to) + ' kcal</b> (' + sg.days + ' days of calories, weight ' + (sg.slope >= 0 ? 'up' : 'down') + ' ' + Math.abs(sg.slope * 7).toFixed(1) + ' lb a week). <button class="btn quiet small" data-act="wkUse" data-v="' + sg.adj + '">Use ' + fmtN(sg.to) + '</button></div>';
      } else h += '<p class="wk-note">Add a scan with your weight and body fat, or type them here, and the targets appear.</p>';
    } else {
      h += '<p class="wk-note">Food, water and sleep: the three that matter most for a young athlete. No calorie counting here.</p>';
      h += '<div class="wk-two">' + box('lb', 'Weight, lb', w.lb, sc && sc.weight ? String(sc.weight) : '') + '</div>';
      if (T.pro) h += '<div class="wk-est">About <b>' + T.pro + ' g protein</b> a day (0.7 g per lb), water ' + T.water + ' oz.</div>';
    }
    h += '<div class="wk-two">' + box('steps', 'Steps a day', w.steps, '8000') + box('sleep', 'Sleep, hours', T.sleep, T.kid ? '9' : '7.5') + (T.kid ? '' : box('z2', 'Zone 2, minutes a week', w.z2, '90') + box('hiit', 'Norwegian 4×4, a week', w.hiit, '1')) + '</div>';
    el.innerHTML = h;
  }
  function setWeek(patch) { const w = Object.assign({}, S.meta.week || {}); Object.keys(patch).forEach(k => { if (patch[k] == null) delete w[k]; else w[k] = patch[k]; }); S.meta.week = w; saveMeta(); } // only what was set is stored; the rest falls back to DEF
  ACT.wkGoal = t => { setWeek({ goal: t.dataset.v }); settingsCard(); };
  ACT.wkAct = t => { setWeek({ act: t.dataset.v }); settingsCard(); };
  ACT.wkUse = t => { setWeek({ adj: (W().adj || 0) + (+t.dataset.v || 0) }); settingsCard(); toast('Maintenance updated from your log.'); };

  /* ---------- typing ---------- */
  let typeT = null;
  document.addEventListener('input', e => {
    const el = e.target; if (!el.matches) return;
    if (el.matches('[data-wk]')) {
      const k = el.dataset.wk, v = num(el.value);
      clearTimeout(typeT);
      typeT = setTimeout(() => { setDay(today(), { [k]: v == null || v < 0 ? null : v }); const T = targets(), d = dayOf(today()) || {}; const ok = el.closest('.wk-row').querySelector('.wk-ok'); if (ok) ok.classList.toggle('on', k === 'z2' ? weekSum(today(), 'z2') >= T.z2 : met(k, d[k], T)); }, 500);
    } else if (el.matches('[data-wkset]')) {
      const k = el.dataset.wkset, v = num(el.value);
      clearTimeout(typeT);
      typeT = setTimeout(() => { setWeek({ [k]: v == null || v <= 0 ? null : v }); if (k === 'lb' || k === 'bf') settingsCard(); }, 600);
    }
  });

  /* ---------- Progress line ---------- */
  function progressLine() {
    if (tab !== 'progress' || !S.meta.program || app.querySelector('.wk-week')) return;
    const h2 = Array.from(app.querySelectorAll('h2')).find(x => x.textContent.trim() === 'This week'); if (!h2) return;
    const T = targets(), ids = weekDays(today()), ds = ids.map(id => dayOf(id)).filter(Boolean);
    if (!ds.length) return;
    const n = k => ds.filter(d => met(k, d[k], T)).length, avg = k => { const v = ds.filter(d => d[k] > 0); return v.length ? v.reduce((a, d) => a + d[k], 0) / v.length : 0; };
    const bits = [];
    if (T.pro) bits.push('protein hit ' + n('pro') + ' of ' + ds.length + ' days');
    if (!T.kid && T.kcal) bits.push('calories within 10% on ' + n('kcal'));
    if (avg('sleep')) bits.push('sleep ' + avg('sleep').toFixed(1) + ' h');
    if (avg('steps')) bits.push(fmtN(avg('steps')) + ' steps a day');
    if (!T.kid) { bits.push('zone 2 ' + weekSum(today(), 'z2') + ' of ' + T.z2 + ' min'); bits.push('4×4 ' + weekSum(today(), 'hiit') + ' of ' + T.hiit); }
    const el = document.createElement('p'); el.className = 'small muted wk-week'; el.style.marginBottom = '12px';
    el.textContent = 'Outside the gym: ' + bits.join(' · ') + '.';
    const p = h2.nextElementSibling; if (p && p.tagName === 'P') p.after(el); else h2.after(el);
  }

  /* ---------- the coach sees it ---------- */
  function addToSummary() {
    if (!window.FP_COACH || window.FP_COACH.weekAdded) return;
    const s0 = window.FP_COACH.summary;
    window.FP_COACH.summary = function () {
      const base = s0.apply(this, arguments), T = targets();
      const ids = Array.from({ length: 7 }, (_, i) => ymd(addDays(new Date(), -i))).reverse(), ds = ids.map(id => dayOf(id)).filter(Boolean);
      if (!ds.length) return base;
      const tg = [T.kcal ? fmtN(T.kcal) + ' kcal' : '', T.pro ? T.pro + ' g protein' : '', T.water ? T.water + ' oz water' : '', fmtN(T.steps) + ' steps', T.sleep + ' h sleep', T.z2 ? T.z2 + ' min zone 2 a week' : '', T.hiit ? T.hiit + ' Norwegian 4x4 a week' : ''].filter(Boolean).join(', ');
      const lines = ds.map(d => d.id + ': ' + [d.kcal > 0 ? fmtN(d.kcal) + ' kcal' : '', d.pro > 0 ? d.pro + ' g protein' : '', d.water > 0 ? d.water + ' oz' : '', d.steps > 0 ? fmtN(d.steps) + ' steps' : '', d.sleep > 0 ? d.sleep + ' h sleep' : '', d.z2 > 0 ? d.z2 + ' min zone 2' : '', d.hiit ? '4x4 done' : '', d.wt > 0 ? d.wt + ' lb' : ''].filter(Boolean).join(', '));
      return base + '\n\nOutside the gym, last 7 days (targets: ' + tg + (T.maint ? '; estimated maintenance ' + fmtN(T.maint) + ' kcal' : '') + '):\n' + lines.join('\n');
    };
    window.FP_COACH.weekAdded = true;
  }

  const onRender = () => { todayCard(); settingsCard(); progressLine(); addToSummary(); };
  new MutationObserver(onRender).observe(app, { childList: true });
  onRender();
  window.FP_WEEK = { targets, suggest, dayOf, setDay }; // for the tests
})();
