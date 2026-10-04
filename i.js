'use strict';
/* ================= Coach (standalone site only) =================
   Reads the log on this phone and turns it into next-session targets and plain notes on the Progress tab.
   These are fixed rules, not AI. "Share with Claude" hands a summary to Claude for a real review. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const main = e => e.sets.filter(x => !x.drop);
  const est = x => (x.w || 0) * (1 + x.r / 30);
  const list = a => a.slice(0, 4).join(', ') + (a.length > 4 ? ' and ' + (a.length - 4) + ' more' : '');

  /* ---------- sharper targets ---------- */
  const rule = aim;
  aim = function (p, deload) {
    const out = rule(p, deload);
    if (deload || P().youth || (p.t && p.t !== 'str')) return out;
    const last = lastFor(p.name, false); if (!last) return out;
    const m = main(last.e), w = m[0].w || 0, reps = m.map(x => x.r);
    if (!w || !m.every(x => (x.w || 0) === w) || out.text.indexOf('Add weight') === 0) return out;
    const was = fmtLoad(w, p.bw) + ' for ' + reps.join(', ');
    if (reps.every(r => r < p.lo)) {
      const nw = Math.max(0, w - Math.max(step(w), Math.round(w * 0.1 / 5) * 5));
      return { text: 'Too heavy for ' + p.lo + ' to ' + p.hi + ' reps. Drop to ' + fmtLoad(nw, p.bw) + '. Last time ' + was + '.', ws: m.map(() => nw), reps: [] };
    }
    if (reps[0] >= p.hi + 2 && reps.every(r => r >= p.lo)) {
      const nw = w + step(w);
      return { text: 'First set went past ' + p.hi + '. Add weight: ' + fmtLoad(nw, p.bw) + '. Last time ' + was + '.', ws: m.map(() => nw), reps: [] };
    }
    return out;
  };

  /* ---------- notes ---------- */
  function history(name) {
    return mySessions().filter(s => !s.deload).map(s => { const e = s.ex.find(x => x.name === name); return e && main(e).length ? { s, e, m: main(e) } : null; }).filter(Boolean);
  }
  const score = h => Math.max.apply(null, h.m.map(h.m.some(x => x.w > 0) ? est : x => x.r));
  function notes() {
    const prog = P(), all = mySessions(), pos = posFor(new Date()), out = [];
    if (!all.length) return out;
    const under = [], stall = [], down = [], fade = [], best = [];
    Array.from(new Set([].concat.apply([], all.slice(-14).map(s => s.ex.map(e => e.name))))).forEach(name => {
      const h = history(name); if (!h.length) return;
      const last = h[h.length - 1], sc = h.map(score), n = sc.length, reps = last.m.map(x => x.r), w = last.m[0].w || 0, same = last.m.every(x => (x.w || 0) === w);
      if (!prog.youth && same && w && last.e.lo && reps.every(r => r < last.e.lo)) under.push(esc(name) + ' (' + reps.join(', ') + ' at ' + trim(w) + ' lb)');
      else if (n >= 3 && sc[n - 1] <= sc[n - 3] * 1.005 && sc[n - 2] <= sc[n - 3] * 1.005) stall.push(esc(name));
      else if (n >= 2 && sc[n - 1] < sc[n - 2] * 0.95) down.push(esc(name) + ' (' + Math.round((1 - sc[n - 1] / sc[n - 2]) * 100) + '%)');
      else if (n >= 2 && sc[n - 1] > Math.max.apply(null, sc.slice(0, n - 1)) * 1.001) best.push(esc(name));
      if (!prog.youth && same && reps.length >= 3 && reps[0] >= 6 && (reps[0] - reps[reps.length - 1]) / reps[0] >= 0.4) fade.push(esc(name) + ' (' + reps[0] + ' to ' + reps[reps.length - 1] + ')');
    });
    if (pos.deload) out.push('<b>Deload week.</b> Half the sets, same loads, and re-measure. Nothing here should feel hard.');
    if (under.length) out.push('<b>Too heavy for the rep range:</b> ' + list(under) + '. Drop about 10% so the reps land in range. The targets already show the lower weight.');
    if (down.length) out.push('<b>Down from the session before:</b> ' + list(down) + '. One off day is noise. Two in a row means look at sleep, food and total fatigue before changing the plan.');
    if (stall.length) out.push('<b>No progress in three sessions:</b> ' + list(stall) + '. In order, try: rest the full timer, add one set through Priority muscles in Settings, then swap the exercise at the next block.');
    if (fade.length) out.push('<b>Reps fall off fast:</b> ' + list(fade) + '. You are losing 40% or more from the first set to the last. Rest the full timer, or leave one rep on the first set. If you mean to take every set to failure, switch Effort in Settings so the weight targets fit.');
    const wk = pos.pre ? 0 : pos.week, ref = wk > 1 ? wk - 1 : wk, lastWk = all.filter(s => s.week === ref);
    if (wk > 1) {
      const done = {}, plan = {};
      lastWk.forEach(s => s.ex.forEach(e => { const k = main(e).length + 0.5 * e.sets.filter(x => x.mini).length; if (k) done[e.g] = (done[e.g] || 0) + k; }));
      dayKeys().forEach(d => dayPlan(d, posFromPlanWeek(ref - 1)).forEach(p => { plan[p.g] = (plan[p.g] || 0) + prog.freq * (p.sets + 0.5 * p.rpn); }));
      const low = Object.keys(plan).filter(g => plan[g] >= 6 && (done[g] || 0) < plan[g] * 0.7).map(g => GROUPS[g] + ' ' + trim(done[g] || 0) + ' of ' + trim(plan[g]));
      if (lastWk.length < prog.perWeek) out.push('<b>Last week:</b> ' + lastWk.length + ' of ' + prog.perWeek + ' sessions.' + (low.length ? ' Short on sets: ' + list(low) + '.' : ''));
      else if (low.length) out.push('<b>Short on sets last week:</b> ' + list(low) + '.');
    }
    const sc = liveScans(), a = sc[0], b = sc[sc.length - 1];
    if (prog.measure === 'body' && sc.length >= 2) {
      const d = k => (a[k] != null && b[k] != null) ? round1(b[k] - a[k]) : null, sign = v => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + trim(Math.abs(v));
      const bits = [['muscle', 'muscle', ' lb'], ['fat', 'body fat', ' points'], ['weight', 'weight', ' lb']].filter(x => d(x[0]) != null).map(x => x[1] + ' ' + sign(d(x[0])) + x[2]);
      if (bits.length) out.push('<b>Since the first scan:</b> ' + bits.join(', ') + '.' + (d('weight') != null && d('weight') <= -3 && stall.length + down.length >= 2 ? ' Weight is falling while lifts stall, which usually means too little food for growth.' : ''));
    }
    if (best.length) out.push('<b>Best yet:</b> ' + list(best) + '.');
    if (!out.length) out.push(all.length < 4 ? 'Still the baseline. Targets and trends fill in from the second time you do each exercise.' : 'Nothing to flag. Loads and reps are moving the right way.');
    return out;
  }
  function targetList() {
    const pos = posFor(new Date());
    return dayKeys().map(d => '<h3 style="margin:12px 0 4px">Day ' + d + '</h3>' + dayPlan(d, pos).map(p => { const a = aim(p, pos.deload); return '<div class="small" style="padding:3px 0"><b>' + esc(p.name) + ':</b> ' + esc(lastFor(p.name, true) && a.text ? a.text : 'no history yet') + '</div>'; }).join('')).join('');
  }
  function summary() {
    const prog = P(), pos = posFor(new Date()), all = mySessions().slice(-24), sc = liveScans(), strip = h => h.replace(/<[^>]+>/g, '');
    return 'FitPitt log, ' + ymd(new Date()) + '. Plan: ' + prog.name + ', block ' + pos.block + ' week ' + pos.wib + ' of ' + pos.len + (pos.deload ? ' (deload)' : '') + '. Effort: ' + (S.meta.effort === 'all' ? 'every set to failure' : 'last set to failure') + '. Style: ' + (S.meta.style === 'rp' ? 'rest-pause' : 'straight sets') + '.\n\nWorkouts, oldest first:\n' +
      all.map(s => s.date + ' day ' + s.day + ', ' + Math.round((s.dur || 0) / 60) + ' min' + (s.deload ? ', deload' : '') + ': ' + s.ex.map(e => e.name + ' ' + setsLine(e)).join(' | ') + (s.note ? ' | note: ' + s.note : '')).join('\n') +
      (sc.length ? '\n\nMeasurements:\n' + sc.map(x => x.date + ': ' + M().fields.filter(f => x[f[0]] != null).map(f => f[1].toLowerCase() + ' ' + trim(x[f[0]]) + ' ' + f[2]).join(', ')).join('\n') : '') +
      '\n\nApp notes:\n' + notes().map(n => '- ' + strip(n)).join('\n') + '\n\nReview this and tell me what to change.';
  }
  ACT.coachShare = () => {
    const text = summary();
    if (navigator.share) { navigator.share({ title: 'FitPitt log', text }).catch(() => { /* closed without sharing */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into Claude.'), () => textSheet('Summary for Claude', text)); return; }
    textSheet('Summary for Claude', text);
  };

  /* ---------- put it on screen ---------- */
  function paint() {
    if (!S.meta.program) return;
    if (tab === 'progress' && !document.getElementById('coach')) {
      const hero = app.querySelector('.hero'); if (!hero) return;
      const el = document.createElement('div'); el.id = 'coach';
      el.innerHTML = '<h2 style="margin-top:6px">Coach notes</h2><ul class="rules">' + notes().map(n => '<li>' + n + '</li>').join('') + '</ul>' +
        '<details class="block" style="border-top:1px solid var(--line)"><summary><span class="blk-n" style="font-size:19px">Targets for next time</span><span class="blk-r">every lift</span></summary><div class="inner">' + targetList() + '</div></details>' +
        '<div style="margin-top:12px"><button class="btn quiet small" data-act="coachShare">Share with Claude for a review</button></div>';
      hero.after(el);
    }
    if (tab === 'today' && !S.active) {
      const pos = posFor(new Date()), keys = dayKeys(); let day = selDay || nextDay(); if (!keys.includes(day)) day = keys[0];
      const plan = dayPlan(day, pos);
      app.querySelectorAll('.preview li').forEach((li, i) => {
        const p = plan[i], el = li.querySelector('.pv-last'); if (!p || !el || el.dataset.coach) return;
        el.dataset.coach = '1';
        if (!lastFor(p.name, true)) return;
        const a = aim(p, pos.deload);
        if (a.text && el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = a.text + ' ';
      });
    }
  }
  new MutationObserver(paint).observe(app, { childList: true });
  paint();
})();
