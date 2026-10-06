'use strict';
/* ================= Weekly weight steps =================
   A lift's weight goes up at most once a plan week: at its first session of a new week, when it was earned the week before.
   Any other session that week repeats the weight and chases reps. The first week in the log is the baseline and nothing goes up.
   A weight that is too heavy for the rep range still drops at the very next session. */
(() => {
  const BASE_DAYS = 6; // the baseline runs to the first plan-week boundary at least this many days after the first logged workout
  const prev = aim, realLast = lastFor;
  let pin = null; // lets the target rules be asked about one earlier session instead of the latest
  lastFor = function (name, includeDeload) { return pin && pin.name === name ? pin.hit : realLast(name, includeDeload); };
  const main = e => e.sets.filter(x => !x.drop);
  const startN = () => dayNum(parseYmd(S.meta.startDate));
  // Weeks count from the plan start date. Everything before the baseline ends counts as one week.
  function baseEnd() { const f = liveSessions()[0]; return f ? Math.ceil((dayNum(parseYmd(f.date)) + BASE_DAYS - startN()) / 7) : 0; }
  const weekOf = (d, b) => Math.max(b - 1, Math.floor((dayNum(d) - startN()) / 7));
  function history(name) {
    const out = [];
    S.sessions.forEach(s => { if (s.deleted || s.deload) return; const e = (s.ex || []).find(x => x.name === name && x.sets.some(y => !y.drop)); if (e) out.push({ s, e }); });
    return out;
  }

  aim = function (p, deload) {
    const out = prev(p, deload);
    if (deload || p.nw || (p.t && p.t !== 'str') || !out.ws.length) return out;
    const h = history(p.name); if (!h.length) return out;
    const last = h[h.length - 1], m = main(last.e), w = m[0].w || 0;
    if (!m.every(x => (x.w || 0) === w)) return out; // mixed weights last time: nothing to step
    const youth = !!P().youth, b = baseEnd(), today = new Date(), now = weekOf(today, b), lw = weekOf(parseYmd(last.s.date), b), to = out.ws[0];
    if (lw >= now) { // already trained this week, or still in the baseline: no step up
      if (!(to > w)) return out;
      const from = fmtDow(addDays(parseYmd(S.meta.startDate), 7 * (now + 1))), reps = m.map(x => x.r), base = now < b;
      const text = youth ? 'Every rep was clean. Stay at ' + fmtLoad(w, p.bw) + ' for now. The next small step, ' + fmtLoad(to, p.bw) + ', comes from ' + from + '.'
        : (base ? 'Baseline week. Stay at ' + fmtLoad(w, p.bw) : 'Stay at ' + fmtLoad(w, p.bw) + ' this week') + ' and beat ' + reps.join(', ') + '. It goes to ' + fmtLoad(to, p.bw) + ' from ' + from + '.';
      return { text, ws: m.map(() => w), reps };
    }
    if (to !== w) return out; // a new week, and the latest session already settles it
    for (let i = h.length - 2; i >= 0 && weekOf(parseYmd(h[i].s.date), b) === lw; i--) { // earned in an earlier session of that week?
      const mm = main(h[i].e); if (!mm.every(x => (x.w || 0) === w)) continue;
      let o; pin = { name: p.name, hit: h[i] }; try { o = prev(p, deload); } finally { pin = null; }
      if (o.ws.length && o.ws[0] > w) return { text: (youth ? 'Take the next small step: ' : 'Add weight: ') + fmtLoad(o.ws[0], p.bw) + '. Earned on ' + fmtDate(parseYmd(h[i].s.date)) + ' with ' + fmtLoad(w, p.bw) + ' for ' + mm.map(x => x.r).join(', ') + '.', ws: o.ws, reps: [] };
    }
    return out;
  };

  /* ---------- the written rules ---------- */
  Object.keys(PROGRAMS).forEach(k => {
    const pr = PROGRAMS[k], r = pr.rules; if (pr.youth || typeof r !== 'function') return;
    pr.rules = () => {
      const out = r().map(x => x.replace('add weight next time.', 'the weight goes up the following week.'));
      out.splice(1, 0, '<b>One step a week.</b> The first week is the baseline and nothing goes up. After that a lift can go up at its first session of a new week. Any other session that week repeats the weight, so chase reps. A weight that is too heavy for the rep range drops right away.');
      return out;
    };
  });

  /* ---------- a workout already open when this rule arrived ---------- */
  // Lifts not started yet go back to the held weight, unless the weights were changed by hand.
  function refit() {
    const a = S.active; if (!a || a.deload) return;
    let n = 0;
    a.ex.forEach(e => {
      if (!e.sets.length || e.sets.some(s => s.done)) return;
      const was = prev(e, false), now = aim(e, false);
      if (!was.ws.length || !now.ws.length || !(was.ws[0] > now.ws[0]) || e.aim !== was.text) return;
      if (!e.sets.every(s => s.w === was.ws[0])) return;
      e.sets.forEach(s => { s.w = now.ws[0]; }); e.aim = now.text; e.ph = now.reps; n++;
    });
    if (n) { saveActive(true); render(); toast('Weights set back to last time. Steps up now wait for a new week.'); }
  }
  refit();
})();
