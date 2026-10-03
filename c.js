'use strict';
/* ================= UI ================= */
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const VOLNOTE = {
  build: 'Direct sets in a build week with each day done twice. The target band is 15 to 20 for the big muscles; arms also work on every press and pull.',
  shape: 'Direct sets in a build week at three sessions. Squats, hinges, presses and rows also work the muscles around them, and a fourth day adds more.',
  vb2: 'Sets in a normal week with each day done once.', vb1: 'Sets in a normal week with each day done once.',
};
const tags = p => (p.drop ? '<span class="tag">drop set</span>' : '') + (p.pp ? '<span class="tag">partials</span>' : '');
const plate = (d, cls) => '<span class="plate ' + (cls || '') + '" data-d="' + d + '" aria-hidden="true">' + d + '</span>';
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1"/><rect x="13.5" y="5" width="4.5" height="14" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const RP_TEXT = () => 'Rest-pause: take the first set to failure, rest ' + S.meta.restRp + ' seconds, and repeat until the mini-sets add up to about the first set. Heavy presses, squats and hinges stay as straight sets.';
const effortText = () => rpMode() ? RP_TEXT() : P().effort();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const app = $('#app');
let tab = 'today', selDay = null, progEx = null, histN = 12, pendingRender = false, toastT = null, prevW = null, installEvt = null, editNames = false;

function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3400); }
function requestRender() {
  const a = document.activeElement;
  if ((a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !$('#sheet').hidden) { pendingRender = true; return; }
  render();
}
function render() {
  pendingRender = false;
  const tabs = $('#tabs');
  if (!S.meta.program) { tabs.hidden = true; document.body.dataset.day = 'A'; app.innerHTML = viewChooser(); return; }
  tabs.hidden = false;
  const pos = posFor(new Date()), keys = dayKeys();
  let day = S.active ? S.active.day : (selDay || nextDay());
  if (!keys.includes(day)) day = keys[0];
  document.body.dataset.day = day;
  let h;
  if (tab === 'today') h = S.active ? viewWorkout() : viewToday(pos, day);
  else if (tab === 'plan') h = viewPlan(pos);
  else if (tab === 'body') h = viewBody(pos);
  else if (tab === 'progress') h = viewProgress(pos);
  else h = viewSettings();
  app.innerHTML = h;
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#tabs [data-tab="body"] span').textContent = M().tab;
  if (!S.active && Rest.on) stopRest();
  tick();
}
function viewChooser() {
  return '<header class="hero"><div><h1>FitPitt</h1><p>Pick your plan. You can change it later in Settings.</p></div></header><div class="pick">' +
    Object.keys(PROGRAMS).map(k => '<button data-act="pickProgram" data-p="' + k + '"><strong>' + PROGRAMS[k].name + '</strong><span>' + PROGRAMS[k].line + '</span></button>').join('') + '</div>';
}

function yearBar(pos, big) {
  const starts = new Set(); let acc = 0; BLOCK_WEEKS.forEach(len => { starts.add(acc); acc += len; });
  let h = '';
  for (let k = 0; k < YEAR_WEEKS; k++) {
    const c = ['wk'];
    if (k && starts.has(k)) c.push('bs');
    if (posFromPlanWeek(k).deload) c.push('dl');
    if (!pos.pre && k < pos.k) c.push('past');
    if (!pos.pre && k === pos.k) c.push('now');
    h += '<i class="' + c.join(' ') + '"></i>';
  }
  return '<div class="year' + (big ? ' big' : '') + '" role="img" aria-label="' + (pos.pre ? 'Plan not started yet' : 'Week ' + Math.min(pos.week, YEAR_WEEKS) + ' of ' + YEAR_WEEKS) + '">' + h + '</div>';
}
function strip(pos) {
  let where, kind = '';
  if (pos.pre) where = 'Plan starts ' + fmtDow(parseYmd(S.meta.startDate));
  else if (pos.paused) where = 'Plan paused this week';
  else if (pos.beyond) where = 'Week ' + pos.week + ', past the first year';
  else { where = 'Block ' + pos.block + ', week ' + pos.wib + ' of ' + pos.len; kind = pos.deload ? '<span class="kind dl">' + (P().youth ? 'Easy week' : 'Deload') + '</span>' : '<span class="kind">Build</span>'; }
  return '<div class="strip"><span><strong>' + where + '</strong>' + kind + '</span><span id="sync" class="sync">' + STATUS[Cloud.status] + '</span></div>' + yearBar(pos);
}
function targetText(p, n) { return n + ' × ' + (p.lo === p.hi ? p.lo : p.lo + '–' + p.hi) + (p.unit === 'sec' ? ' sec' : '') + (p.per ? ' per ' + p.per : '') + (p.rpn ? ' + ' + p.rpn + ' mini' : ''); }
const restText = p => 'rest ' + (p.rest ? p.rest + ' s' : p.rpn ? S.meta.restRp + ' s' : p.k === 'c' ? (rpMode() ? '90 s to 2 min' : '2 to 3 min') : '60 to 90 s');
const setN = s => s.ex.reduce((a, e) => a + e.sets.filter(x => !x.drop).length, 0);
function scanDue(pos) {
  if (pos.pre || !pos.deload) return false;
  const a = ymd(weekStart(pos.k)), b = ymd(addDays(weekStart(pos.k), 6));
  return !liveScans().some(s => s.date >= a && s.date <= b);
}
function streak() { const dates = new Set(liveSessions().map(s => s.date)), t = new Date(); let n = 0; for (let i = 1; i <= 6; i++) { if (dates.has(ymd(addDays(t, -i)))) n++; else break; } return n; }
const howList = () => '<ul class="steps">' + M().how.map(x => '<li>' + x + '</li>').join('') + '</ul>';

/* ---------- Today ---------- */
function viewToday(pos, day) {
  const prog = P(), m = M(), plan = dayPlan(day, pos), nSets = plan.reduce((a, p) => a + p.sets, 0), nd = nextDay();
  const mine = mySessions(), todayStr = ymd(new Date()), doneToday = mine.filter(s => s.date === todayStr), wk = mine.filter(s => s.week === pos.week).length;
  let h = strip(pos);
  h += '<header class="hero">' + plate(day, 'big') + '<div><h1>' + esc(prog.days[day][0]) + '</h1><p>' + (day === nd ? 'Next in your rotation. ' : '') + plan.length + ' exercises, ' + nSets + ' sets, about ' + estMinutes(plan) + ' minutes.</p></div></header>';
  h += '<button class="btn primary" data-act="start">Start day ' + day + '</button>';
  h += '<div class="dayswitch" role="group" aria-label="Pick a day">' + dayKeys().map(d => '<button data-act="pickDay" data-d="' + d + '" aria-pressed="' + (d === day) + '">' + plate(d, 'sm') + '<span>' + prog.days[d][1] + '</span></button>').join('') + '</div>';
  if (doneToday.length) { const s = doneToday[doneToday.length - 1]; h += '<div class="notice">Done today: day ' + s.day + ', ' + setN(s) + ' sets in ' + Math.round(s.dur / 60) + ' minutes.</div>'; }
  else if (prog.perWeek >= 6 && streak() >= 6) h += '<div class="notice">Six lifting days in a row. Today is for the core class or Zone 2, not the weights.</div>';
  else if (prog.perWeek < 6 && !pos.pre && wk >= prog.perWeek) h += '<div class="notice">This week\'s ' + prog.perWeek + ' sessions are done. ' + (prog.youth ? 'More is not better here. Save the legs for volleyball.' : 'An extra day just continues the rotation.') + '</div>';
  if (!liveScans().length) h += '<div class="notice"><strong>' + m.none + '</strong> ' + m.why + '<br><button class="btn small" data-act="addScan">Add ' + m.first.toLowerCase() + '</button></div>';
  else if (scanDue(pos)) h += '<div class="notice"><strong>' + cap(m.word) + ' week.</strong> ' + m.due + '<br><button class="btn small" data-act="addScan">Add ' + m.word + '</button></div>';
  if (pos.paused) h += '<div class="notice">The plan is paused this week. Anything you log still counts, and the block picks up next week.</div>';
  if (STANDALONE && mine.length >= 6 && Date.now() - (S.meta.lastBackup || 0) > 30 * 864e5) h += '<div class="notice">Your log lives only on this phone. Download a backup from Settings now and then.</div>';
  h += pos.deload ? '<p class="effort dl">' + prog.deload + '</p>' : '<p class="effort">' + effortText() + '</p>';
  h += '<h2>Day ' + day + ', rotation ' + pos.rot + '</h2><ol class="preview">' + plan.map(p =>
    '<li><span class="pv-name">' + esc(p.name) + '</span><span class="pv-target">' + targetText(p, p.sets) + '</span><span class="pv-last">' + esc(lastLine(p)) + tags(p) + (editNames ? '<button class="swap" data-act="rename" data-slot="' + p.slot + '">Change</button>' : '') + '</span></li>').join('') + '</ol>';
  h += '<div style="margin-top:12px"><button class="btn quiet small" data-act="toggleEdit">' + (editNames ? 'Done changing' : 'Change exercises') + '</button></div>';
  return h;
}

/* ---------- Workout ---------- */
function exCard(e, ei) {
  const main = e.sets.filter(s => !s.drop).length, unit = e.unit === 'sec' ? 'sec' : 'reps';
  let n = 0;
  const rows = e.sets.map((s, si) => {
    if (!s.drop) n++;
    const lab = s.mini ? 'mini-set' : s.part ? 'partials' : s.drop ? 'drop set' : 'set ' + n, ph = (!s.drop && e.ph && e.ph[n - 1]) ? e.ph[n - 1] : '';
    return '<div class="set' + (s.done ? ' done' : '') + (s.drop ? ' drop' : '') + (e.nw ? ' now' : '') + '" data-ei="' + ei + '" data-si="' + si + '">' +
      '<span class="set-n">' + (s.mini ? 'M' : s.part ? 'P' : s.drop ? 'D' : n) + '</span>' +
      (e.nw ? '' : '<label class="field"><input type="text" inputmode="decimal" autocomplete="off" data-f="w" value="' + (s.w == null ? '' : trim(s.w)) + '" aria-label="Weight, ' + lab + '"><span>' + (e.bw ? '+lb' : 'lb') + '</span></label>') +
      '<label class="field"><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-f="r" value="' + (s.r == null ? '' : s.r) + '" placeholder="' + ph + '" aria-label="' + cap(unit) + ', ' + lab + '"><span>' + unit + '</span></label>' +
      '<button class="check" data-act="toggleSet" aria-pressed="' + !!s.done + '" aria-label="' + (s.done ? 'Undo ' : 'Log ') + lab + '">' + CHECK + '</button></div>';
  }).join('');
  const lastSet = e.sets[e.sets.length - 1], note = [e.aim, e.cue].filter(Boolean).join(' ');
  return '<section class="ex" data-ei="' + ei + '"><div class="ex-head"><span class="ex-n">' + (ei + 1) + '</span>' +
    '<h3 class="ex-name">' + esc(e.name) + '</h3>' +
    '<p class="ex-meta"><b>' + targetText(e, main) + '</b>' + restText(e) + tags(e) + '</p>' +
    (note ? '<p class="ex-aim">' + esc(note) + '</p>' : '') + '</div>' +
    '<div class="sets">' + rows + '</div>' +
    '<div class="ex-actions">' + (editNames ? '<button data-act="rename" data-ei="' + ei + '">Change exercise</button>' : '') + (e.rpn ? '<button data-act="addMini">Add mini-set</button>' : '<button data-act="addSet">Add set</button>') + (e.drop || (lastSet && lastSet.drop && !lastSet.part && !lastSet.mini) ? '<button data-act="addDrop">Add drop set</button>' : '') + (e.pp ? '<button data-act="addPart">Add partials</button>' : '') + (lastSet && !lastSet.done && (lastSet.drop || e.sets.length > (e.planned || 0)) ? '<button data-act="rmSet">Remove last set</button>' : '') + '</div></section>';
}
function setCount(a) { let t = 0, d = 0; a.ex.forEach(e => e.sets.forEach(s => { if (!s.drop) { t++; if (s.done) d++; } })); return d + ' of ' + t + ' sets'; }
function viewWorkout() {
  const a = S.active, prog = P();
  const idle = !a.pausedAt && !a.ex.some(e => e.sets.some(s => s.done)) && elapsedMs(a, Date.now()) > 45 * 60000;
  let h = '<div class="wk-head">' + plate(a.day) + '<div class="wk-title"><strong>' + esc((prog.days[a.day] || [''])[0]) + '</strong><span id="setcount">' + setCount(a) + '</span></div>' +
    '<button class="clk" data-act="pauseClock" aria-label="' + (a.pausedAt ? 'Resume the clock' : 'Pause the clock') + '">' + (a.pausedAt ? PLAY : PAUSE) + '</button><div class="clock' + (a.pausedAt ? ' paused' : '') + '" id="elapsed" aria-label="Time in session">0:00</div></div>';
  if (a.pausedAt) h += '<div class="notice">Clock paused. It starts again when you log a set.<br><button class="btn small" data-act="pauseClock">Resume</button> <button class="btn small quiet" data-act="resetClock">Reset to zero</button></div>';
  else if (idle) h += '<div class="notice">This workout has been open a while with nothing logged.<br><button class="btn small" data-act="resetClock">Reset the clock</button> <button class="btn small quiet" data-act="askDiscard">Discard it</button></div>';
  h += a.deload ? '<p class="effort dl">' + prog.deload + '</p>' : '<p class="effort">' + effortText() + '</p>';
  h += a.ex.map(exCard).join('');
  h += '<div class="stack" style="margin-top:18px"><button class="btn quiet wide" data-act="addEx">Add an exercise</button><button class="btn quiet wide" data-act="toggleEdit">' + (editNames ? 'Done changing exercises' : 'Change exercises') + '</button></div>';
  h += '<label class="note"><span>Session note</span><textarea id="note" rows="2" placeholder="Sleep, soreness, anything worth remembering">' + esc(a.note || '') + '</textarea></label>';
  h += '<button class="btn primary" data-act="finish">Finish workout</button><div style="text-align:center;margin-top:6px"><button class="btn link danger" data-act="askDiscard">Discard this workout</button></div>';
  return h;
}
function buildExercise(p, deload) {
  const a = aim(p, deload);
  const sets = Array.from({ length: p.sets }, (_, i) => ({ w: a.ws.length ? (a.ws[i] != null ? a.ws[i] : a.ws[a.ws.length - 1]) : null, r: (p.t && p.t !== 'str' && p.lo === p.hi) ? p.lo : null, done: false }));
  for (let i = 0; i < (p.rpn || 0); i++) sets.push({ w: sets.length ? sets[0].w : null, r: null, done: false, drop: true, mini: true });
  return Object.assign({}, p, { aim: a.text, ph: a.reps, planned: sets.length, sets });
}
function startWorkout(day) {
  const pos = posFor(new Date());
  S.active = { id: newId('s'), prog: S.meta.program, day, date: ymd(new Date()), startedAt: Date.now(), block: pos.block, week: pos.week, wib: pos.wib, deload: pos.deload, rot: pos.rot, note: '',
    ex: dayPlan(day, pos).map(p => buildExercise(p, pos.deload)) };
  editNames = false; saveActive(true); primeAudio(); keepAwake(); tab = 'today'; window.scrollTo(0, 0); render();
}
function finishWorkout() {
  const a = S.active; if (!a) return;
  trimLeadIn(a);
  const ex = a.ex.map(e => {
    const o = { slot: e.slot, name: e.name, g: e.g, lo: e.lo, hi: e.hi, bw: !!e.bw,
      sets: e.sets.filter(s => s.done).map(s => { const x = { w: s.w || 0, r: s.r, t: Math.max(0, Math.round(((s.t || a.startedAt) - a.startedAt) / 1000)) }; if (s.drop) x.drop = true; if (s.part) x.part = true; if (s.mini) x.mini = true; return x; }) };
    if (e.nw) o.nw = true; if (e.unit === 'sec') o.unit = 'sec';
    return o;
  }).filter(e => e.sets.length);
  if (!ex.length) { toast('Log at least one set first, or discard the workout.'); return; }
  let lastT = a.startedAt; a.ex.forEach(e => e.sets.forEach(s => { if (s.done && s.t > lastT) lastT = s.t; }));
  const now = Date.now(), end = now - lastT > 20 * 60000 ? lastT + 60000 : now;
  const sess = { id: a.id, prog: a.prog || S.meta.program, day: a.day, date: a.date, startedAt: a.startedAt, endedAt: end, dur: Math.max(0, Math.round(elapsedMs(a, end) / 1000)), block: a.block, week: a.week, wib: a.wib, deload: !!a.deload, rot: a.rot, note: a.note || '', ex };
  S.sessions.push(sess); S.active = null; S.activeU = Date.now(); selDay = null; editNames = false;
  saveSession(sess); Cloud.put('active', { session: null, u: S.activeU });
  stopRest(); releaseWake(); window.scrollTo(0, 0); render();
  toast('Workout saved. ' + setN(sess) + ' sets in ' + Math.round(sess.dur / 60) + ' minutes.');
}
