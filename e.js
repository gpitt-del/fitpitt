'use strict';
/* ================= Sheets ================= */
function openSheet(html) { const s = $('#sheet'); $('.sheet-body', s).innerHTML = html; s.hidden = false; }
function closeSheet() { const s = $('#sheet'); s.hidden = true; $('.sheet-body', s).innerHTML = ''; if (pendingRender) render(); }
function confirmSheet(title, text, act, label, id) {
  openSheet('<h2>' + title + '</h2><p>' + text + '</p><div class="frm" style="margin-top:16px"><button class="btn danger wide" data-act="' + act + '" data-id="' + (id || '') + '">' + label + '</button><button class="btn link" data-act="closeSheet">Cancel</button></div>');
}
function renameSheet(slotId, ei) {
  const rot = S.active ? S.active.rot : posFor(new Date()).rot;
  let cur = null, def = '';
  if (ei != null) { const e = S.active.ex[ei]; cur = e.name; slotId = e.slot || ''; }
  const slot = slotId ? slotOf(slotId) : null;
  if (slot) { def = slot.names[rot - 1]; if (cur == null) cur = exName(rot, slot); }
  const attrs = ' data-slot="' + (slotId || '') + '" data-ei="' + (ei == null ? '' : ei) + '"';
  openSheet('<h2>Swap exercise</h2><p class="small muted">Type what you are doing instead. Each name keeps its own history' + (slot ? ', and this one will be used whenever this slot comes up in rotation ' + rot : '') + '.</p>' +
    '<div class="frm" style="margin-top:14px"><label><span>Exercise name</span><input class="input" type="text" id="rn-name" value="' + esc(cur || '') + '" maxlength="60" autocomplete="off"></label>' +
    '<button class="btn primary" data-act="saveName"' + attrs + '>Save name</button>' +
    (slot && cur !== def ? '<button class="btn quiet wide" data-act="resetName"' + attrs + '>Back to ' + esc(def) + '</button>' : '') +
    '<button class="btn link" data-act="closeSheet">Cancel</button></div>');
}
function applyName(slotId, ei, name) {
  const rot = S.active ? S.active.rot : posFor(new Date()).rot, slot = slotId ? slotOf(slotId) : null;
  if (slot) {
    S.meta.names = S.meta.names || {};
    if (name === slot.names[rot - 1]) delete S.meta.names[nameKey(rot, slot.id)]; else S.meta.names[nameKey(rot, slot.id)] = name;
    saveMeta();
  }
  const list = S.active ? S.active.ex : [];
  const e = ei !== '' && ei != null ? list[+ei] : list.find(x => slot && x.slot === slot.id);
  if (e) {
    e.name = name;
    const a = aim(e, S.active.deload); e.aim = a.text; e.ph = a.reps;
    let n = 0; e.sets.forEach(s => { if (s.drop) return; if (!s.done && a.ws.length) s.w = a.ws[n] != null ? a.ws[n] : a.ws[a.ws.length - 1]; n++; });
    saveActive(true);
  }
  closeSheet(); render();
}
function addExSheet() {
  openSheet('<h2>Add an exercise</h2><div class="frm"><label><span>Exercise name</span><input class="input" type="text" id="ax-name" maxlength="60" autocomplete="off"></label>' +
    '<div class="two"><label><span>Sets</span><select id="ax-sets">' + [1, 2, 3, 4, 5].map(n => '<option' + (n === 2 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '<label><span>Counts toward</span><select id="ax-g">' + Object.keys(GROUPS).map(g => '<option value="' + g + '"' + (g === 'other' ? ' selected' : '') + '>' + GROUPS[g] + '</option>').join('') + '</select></label></div>' +
    '<button class="btn primary" data-act="saveEx">Add to this workout</button><button class="btn link" data-act="closeSheet">Cancel</button></div>');
}
function textSheet(title, text) {
  openSheet('<h2>' + title + '</h2><p class="small muted">Saving files is not available in this view. Select all of the text below and copy it.</p><textarea id="copybox" rows="10" readonly style="margin-top:12px;font-size:13px"></textarea><div class="frm" style="margin-top:12px"><button class="btn link" data-act="closeSheet">Close</button></div>');
  $('#copybox').value = text;
}

/* ================= Rest timer, clock, sound ================= */
const Rest = { endsAt: 0, total: 1, fired: false, on: false };
// Session time, not counting any stretch the clock was paused.
function elapsedMs(a, now) { return Math.max(0, (a.pausedAt || now) - a.startedAt - (a.pausedMs || 0)); }
// If the workout sat open before training began, count time from just before the first logged set.
function trimLeadIn(a) {
  if (!a || a.trimmed) return false;
  let first = 0; a.ex.forEach(e => e.sets.forEach(s => { if (s.done && s.t && (!first || s.t < first)) first = s.t; }));
  if (!first || first - a.startedAt < 30 * 60000) return false;
  a.startedAt = first - 5 * 60000; a.pausedMs = 0; if (a.pausedAt && a.pausedAt < first) a.pausedAt = null; a.trimmed = true;
  return true;
}
function resumeClock(a) { if (a.pausedAt) { a.pausedMs = (a.pausedMs || 0) + Date.now() - a.pausedAt; a.pausedAt = null; } }
function startRest(sec) { Rest.endsAt = Date.now() + sec * 1000; Rest.total = sec; Rest.fired = false; Rest.on = true; $('#rest').hidden = false; document.body.classList.add('resting'); tick(); }
function stopRest() { Rest.on = false; $('#rest').hidden = true; document.body.classList.remove('resting'); }
function tick() {
  const now = Date.now();
  if (S.active) { const el = $('#elapsed'); if (el) el.textContent = fmtClock(elapsedMs(S.active, now) / 1000); }
  if (!Rest.on) return;
  const left = (Rest.endsAt - now) / 1000, box = $('#rest');
  if (left > 0) {
    $('#resttime').textContent = fmtClock(Math.ceil(left)); $('#restlabel').textContent = 'Rest'; box.classList.remove('over');
    $('#restfill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, left / Rest.total)) + ')';
  } else {
    if (!Rest.fired) { Rest.fired = true; buzz(); }
    $('#resttime').textContent = '+' + fmtClock(-left); $('#restlabel').textContent = 'Rest is up'; box.classList.add('over');
    $('#restfill').style.transform = 'scaleX(0)';
    if (left < -240) stopRest();
  }
}
let AC = null, wake = null;
function primeAudio() { if (!S.meta.sound) return; try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = AC || new C(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* no audio here */ } }
function buzz() {
  if (!S.meta.sound) return;
  try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* ignore */ }
  try {
    if (!AC) return; const t = AC.currentTime;
    [0, 0.28].forEach(d => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(AC.destination);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2); o.start(t + d); o.stop(t + d + 0.22); });
  } catch (e) { /* ignore */ }
}
async function keepAwake() { try { if (S.active && navigator.wakeLock && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed here */ } }
function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }

/* ================= Export, restore, erase ================= */
async function saveFile(filename, data, title) {
  let dl = null;
  try { dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (!dl) {
    if (!STANDALONE) { textSheet(title, data); return; }
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); toast('Saved ' + filename); }
    catch (e) { textSheet(title, data); }
    return;
  }
  try { await dl.save({ filename, data }); toast('Saved ' + filename); }
  catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') { toast('A save is already open. Try again in a moment.'); return; } textSheet(title, data); }
}
function csvText() {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['plan', 'date', 'day', 'block', 'week_in_block', 'deload', 'exercise', 'muscle_group', 'set', 'weight_lb', 'reps', 'drop_set', 'partials', 'mini_set', 'minutes_into_session', 'session_minutes']];
  liveSessions().forEach(s => s.ex.forEach(e => e.sets.forEach((x, i) => rows.push([s.prog || 'build', s.date, s.day, s.block, s.wib, s.deload ? 1 : 0, e.name, GROUPS[e.g] || e.g, i + 1, x.w || 0, x.r, x.drop && !x.part && !x.mini ? 1 : 0, x.part ? 1 : 0, x.mini ? 1 : 0, x.t != null ? round1(x.t / 60) : '', Math.round((s.dur || 0) / 60)]))));
  return rows.map(r => r.map(q).join(',')).join('\n');
}
function importData(text) {
  let d = null; try { d = JSON.parse(text); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.sessions) || !Array.isArray(d.scans)) { toast('That file is not a backup from this app.'); return; }
  const now = Date.now();
  const merge = (local, inc) => { const m = new Map(local.map(x => [x.id, x])); let n = 0; inc.forEach(x => { if (!x || typeof x !== 'object' || !x.id) return; const cur = m.get(x.id); if (!cur || (x.u || 0) > (cur.u || 0)) { x.u = now; m.set(x.id, x); n++; } }); return { list: Array.from(m.values()), n }; };
  const a = merge(S.sessions, d.sessions), b = merge(S.scans, d.scans);
  S.sessions = a.list; S.scans = b.list;
  if (d.meta && typeof d.meta === 'object') S.meta = normMeta(Object.assign({}, d.meta, { resetAt: S.meta.resetAt || 0 }));
  sortAll(); saveMeta();
  S.sessions.forEach(s => { if (s.u === now) Cloud.put('sessions/' + s.id, s); }); S.scans.forEach(s => { if (s.u === now) Cloud.put('scans/' + s.id, s); });
  render(); toast('Restored ' + a.n + ' workouts and ' + b.n + ' measurements.');
}
function eraseAll() {
  const now = Date.now();
  S.sessions.forEach(s => Cloud.put('sessions/' + s.id, null)); S.scans.forEach(s => Cloud.put('scans/' + s.id, null));
  S.sessions = []; S.scans = []; S.active = null; S.activeU = now;
  S.meta = Object.assign(defaultMeta(), { resetAt: now, u: now });
  saveLocal(); Cloud.put('meta', S.meta); Cloud.put('active', { session: null, u: now });
  stopRest(); releaseWake(); closeSheet(); tab = 'today'; selDay = null; progEx = null; render(); toast('Everything erased.');
}

/* ================= Actions ================= */
const rowOf = t => { const r = t.closest('.set'); return { ei: +r.dataset.ei, si: +r.dataset.si, row: r }; };
const exOf = t => +t.closest('.ex').dataset.ei;
const ACT = {
  tab(t) { tab = t.dataset.tab; editNames = false; window.scrollTo(0, 0); render(); },
  toggleEdit() { editNames = !editNames; render(); },
  pauseClock() { const a = S.active; if (!a) return; if (a.pausedAt) resumeClock(a); else a.pausedAt = Date.now(); saveActive(true); render(); },
  resetClock() { const a = S.active; if (!a) return; a.startedAt = Date.now(); a.pausedMs = 0; a.pausedAt = null; saveActive(true); render(); toast('Clock reset to zero.'); },
  pickDay(t) { selDay = t.dataset.d; render(); },
  start() { const keys = dayKeys(); startWorkout(keys.includes(selDay) ? selDay : nextDay()); },
  pickProgram(t) { if (!PROGRAMS[t.dataset.p]) return; S.meta.program = t.dataset.p; S.meta.priority = []; saveMeta(); selDay = null; progEx = null; tab = 'today'; window.scrollTo(0, 0); render(); },
  install() { if (!installEvt) return; try { installEvt.prompt(); } catch (e) { /* ignore */ } installEvt = null; },
  toggleSet(t) {
    const { ei, si, row } = rowOf(t), e = S.active.ex[ei], s = e.sets[si];
    if (s.done) { s.done = false; delete s.t; saveActive(true); render(); return; }
    if (!(s.r > 0)) { const inp = $('input[data-f="r"]', row); inp.classList.add('bad'); inp.focus(); toast('Enter the reps, then tick the set.'); return; }
    if (s.w == null) s.w = 0;
    resumeClock(S.active);
    s.done = true; s.t = Date.now();
    if (trimLeadIn(S.active)) toast('Clock restarted from your first set.');
    primeAudio(); startRest(restOf(e));
    saveActive(true); render();
  },
  addSet(t) { const e = S.active.ex[exOf(t)], main = e.sets.filter(s => !s.drop), last = main[main.length - 1]; const at = e.sets.findIndex(s => s.drop); const ns = { w: last ? last.w : null, r: null, done: false }; if (at < 0) e.sets.push(ns); else e.sets.splice(at, 0, ns); saveActive(true); render(); },
  addDrop(t) { const e = S.active.ex[exOf(t)], last = e.sets[e.sets.length - 1]; const w = last && last.w ? (e.bw && !last.drop ? 0 : Math.max(0, Math.round(last.w * 0.67 / 5) * 5)) : 0; e.sets.push({ w, r: null, done: false, drop: true }); saveActive(true); render(); },
  addMini(t) { const e = S.active.ex[exOf(t)], m = e.sets.find(s => !s.drop); const at = e.sets.findIndex(s => s.drop && !s.mini); const ns = { w: m ? m.w : null, r: null, done: false, drop: true, mini: true }; if (at < 0) e.sets.push(ns); else e.sets.splice(at, 0, ns); saveActive(true); render(); },
  addPart(t) { const e = S.active.ex[exOf(t)], last = e.sets[e.sets.length - 1]; e.sets.push({ w: last ? last.w : null, r: null, done: false, drop: true, part: true }); saveActive(true); render(); },
  rmSet(t) { const e = S.active.ex[exOf(t)]; if (e.sets.length && !e.sets[e.sets.length - 1].done) { e.sets.pop(); saveActive(true); render(); } },
  rename(t) { if (t.dataset.ei != null && t.dataset.ei !== '' && S.active) renameSheet(null, +t.dataset.ei); else renameSheet(t.dataset.slot, null); const i = $('#rn-name'); if (i) i.focus(); },
  saveName(t) { const name = $('#rn-name').value.trim(); if (!name) { toast('Give it a name.'); return; } applyName(t.dataset.slot, t.dataset.ei, name); },
  resetName(t) { const slot = slotOf(t.dataset.slot); const rot = S.active ? S.active.rot : posFor(new Date()).rot; applyName(t.dataset.slot, t.dataset.ei, slot.names[rot - 1]); },
  addEx() { addExSheet(); },
  saveEx() {
    const name = $('#ax-name').value.trim(); if (!name) { toast('Give it a name.'); return; }
    const n = +$('#ax-sets').value || 2, g = $('#ax-g').value;
    S.active.ex.push(buildExercise({ slot: '', name, g, full: n, sets: n, lo: 10, hi: 15, k: 'i', drop: false, pp: !S.active.deload && !P().youth, bw: false, per: '', cue: '', t: '', nw: false, unit: 'reps', rest: 0 }, S.active.deload));
    saveActive(true); closeSheet(); render();
  },
  finish() { finishWorkout(); },
  askDiscard() { confirmSheet('Discard this workout?', 'The sets you ticked in this session will not be saved.', 'discard', 'Discard workout'); },
  discard() { S.active = null; S.activeU = Date.now(); saveLocal(); Cloud.put('active', { session: null, u: S.activeU }); stopRest(); releaseWake(); closeSheet(); window.scrollTo(0, 0); render(); },
  restAdd() { if (Date.now() > Rest.endsAt) { Rest.endsAt = Date.now() + 30000; Rest.total = 30; } else { Rest.endsAt += 30000; Rest.total += 30; } Rest.fired = false; tick(); },
  restSkip() { stopRest(); },
  addScan(t) { scanSheet(t.dataset.id || null); },
  saveScan(t) {
    const m = M(), date = $('#sc-date').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick the date.'); return; }
    const o = {}; m.fields.forEach(f => { o[f[0]] = num($('#sc-' + f[0]).value); });
    if (m.need.every(k => o[k] == null)) { toast('Enter at least one number.'); return; }
    if (o.fat != null && (o.fat <= 0 || o.fat >= 70)) { toast('Body fat should be a percentage, like 18.5.'); return; }
    let s = t.dataset.id ? S.scans.find(x => x.id === t.dataset.id) : null;
    if (!s) { s = { id: newId('b') }; S.scans.push(s); }
    Object.assign(s, o, { date, note: $('#sc-note').value.trim() });
    saveScan(s); closeSheet(); tab = 'body'; render(); toast('Saved.');
  },
  askDelScan(t) { confirmSheet('Delete this entry?', 'It comes off the trend lines.', 'delScan', 'Delete', t.dataset.id); },
  delScan(t) { const i = S.scans.findIndex(x => x.id === t.dataset.id); if (i >= 0) { S.scans[i] = { id: S.scans[i].id, date: S.scans[i].date, deleted: true }; saveScan(S.scans[i]); } closeSheet(); render(); },
  askDelSession(t) { confirmSheet('Delete this workout?', 'Its sets leave your history and weekly totals.', 'delSession', 'Delete workout', t.dataset.id); },
  delSession(t) { const i = S.sessions.findIndex(x => x.id === t.dataset.id); if (i >= 0) { const o = S.sessions[i]; S.sessions[i] = { id: o.id, startedAt: o.startedAt, deleted: true }; saveSession(S.sessions[i]); } closeSheet(); render(); },
  more() { histN += 20; render(); },
  setStyle(t) { S.meta.style = t.dataset.v === 'rp' ? 'rp' : 'std'; saveMeta(); render(); if (S.active) toast('Applies from your next workout.'); },
  setEffort(t) { S.meta.effort = t.dataset.v === 'all' ? 'all' : 'last'; saveMeta(); render(); },
  togglePri(t) {
    const g = t.dataset.g, p = S.meta.priority || [];
    if (p.includes(g)) S.meta.priority = p.filter(x => x !== g);
    else if (p.length >= 2) { toast('Two at most. Drop one first.'); return; }
    else S.meta.priority = p.concat(g);
    saveMeta(); render();
    if (S.active) toast('Applies from your next workout.');
  },
  pauseWeek() {
    const v = $('#pauseDate').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('Pick a date in the week to pause.'); return; }
    const r = rawWeek(parseYmd(v)); if (r < 0) { toast('That date is before the plan starts.'); return; }
    if (pausedRaw().has(r)) { toast('That week is already paused.'); return; }
    S.meta.paused = (S.meta.paused || []).concat(ymd(addDays(parseYmd(S.meta.startDate), 7 * r))); saveMeta(); render(); toast('Paused. The plan shifts a week later from there.');
  },
  unpause(t) { S.meta.paused = (S.meta.paused || []).filter(p => p !== t.dataset.p); saveMeta(); render(); },
  exportCsv() { if (!liveSessions().length) { toast('No workouts logged yet.'); return; } saveFile('fitpitt-log.csv', csvText(), 'Workout log'); },
  exportJson() { S.meta.lastBackup = Date.now(); saveMeta(); saveFile('fitpitt-backup.json', JSON.stringify({ app: 'fitpitt', exported: new Date().toISOString(), meta: S.meta, sessions: liveSessions(), scans: liveScans() }, null, 1), 'Full backup'); },
  importJson() { const f = $('#importFile'); if (f) f.click(); },
  askErase() { confirmSheet('Erase everything?', 'Every workout, measurement and setting is removed. Download a backup first if you might want it back.', 'erase', 'Erase everything'); },
  erase() { eraseAll(); },
  closeSheet() { closeSheet(); },
};

document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t) return; const fn = ACT[t.dataset.act]; if (fn) fn(t, e); });
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('.set input[data-f="w"]')) prevW = num(e.target.value); });
document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { if (pendingRender) requestRender(); }, 80); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches('.set input') && S.active) {
    const { ei, si } = rowOf(el), s = S.active.ex[ei].sets[si], v = num(el.value);
    if (el.dataset.f === 'w') s.w = v == null ? null : Math.max(0, v); else s.r = v == null ? null : Math.max(0, Math.round(v));
    el.classList.remove('bad'); saveActive(false);
  } else if (el.id === 'note' && S.active) { S.active.note = el.value; saveActive(false); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('.set input[data-f="w"]') && S.active) {
    const { ei, si } = rowOf(el), ex = S.active.ex[ei], now = num(el.value);
    if (now != null && !ex.sets[si].drop) {
      ex.sets.forEach((s, j) => { if (j > si && !s.done && (!s.drop || s.mini) && (s.w == null || s.w === prevW)) { s.w = now; const inp = $('.set[data-ei="' + ei + '"][data-si="' + j + '"] input[data-f="w"]'); if (inp) inp.value = trim(now); } });
      saveActive(false);
    }
    prevW = now;
  } else if (el.id === 'startDate') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) { S.meta.startDate = el.value; saveMeta(); toast('Plan now starts ' + fmtDow(parseYmd(el.value)) + '.'); pendingRender = true; }
  } else if (el.id === 'restC' || el.id === 'restI' || el.id === 'restRp') { S.meta[el.id] = +el.value; saveMeta(); }
  else if (el.id === 'sound') { S.meta.sound = el.checked; saveMeta(); if (el.checked) primeAudio(); }
  else if (el.id === 'progsel') { progEx = el.value; pendingRender = false; render(); }
  else if (el.id === 'program') {
    if (S.active) { toast('Finish or discard the workout first.'); el.value = S.meta.program; return; }
    if (PROGRAMS[el.value]) { S.meta.program = el.value; S.meta.priority = []; saveMeta(); selDay = null; progEx = null; pendingRender = false; render(); toast('Plan changed to ' + PROGRAMS[el.value].name + '.'); }
  }
  else if (el.id === 'importFile' && el.files && el.files[0]) {
    const fr = new FileReader(); fr.onload = () => importData(String(fr.result || '')); fr.onerror = () => toast('Could not read that file.'); fr.readAsText(el.files[0]); el.value = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.set input[data-f="r"]')) { e.preventDefault(); const btn = $('.check', e.target.closest('.set')); e.target.blur(); if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click(); }
  if (e.key === 'Enter' && e.target.id === 'rn-name') { const b = $('[data-act="saveName"]'); if (b) b.click(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick(); keepAwake();
  if (Cloud.db && Date.now() - Cloud.lastSync > 120000) Cloud.sync();
});
window.addEventListener('online', () => { if (Cloud.db) Cloud.sync(); });

/* ================= Start ================= */
loadLocal();
if (S.active && trimLeadIn(S.active)) saveActive(true);
render();
function touchIcon() { // iPhone home-screen icon, drawn here because the site ships no image files
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d'); x.scale(180 / 512, 180 / 512);
    x.fillStyle = '#121922'; x.fillRect(0, 0, 512, 512); x.fillStyle = '#D2362B'; x.beginPath(); x.arc(256, 256, 180, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 8; x.beginPath(); x.arc(256, 256, 146, 0, 7); x.stroke();
    x.fillStyle = '#fff'; [[180, 196, 22, 120], [180, 196, 58, 22], [180, 244, 46, 20], [260, 196, 22, 120]].forEach(r => x.fillRect(r[0], r[1], r[2], r[3]));
    x.strokeStyle = '#fff'; x.lineWidth = 22; x.beginPath(); x.moveTo(271, 207); x.lineTo(294, 207); x.arc(294, 234, 27, -Math.PI / 2, Math.PI / 2); x.lineTo(271, 261); x.stroke();
    const l = $('#ati'); if (l) l.href = c.toDataURL('image/png');
  } catch (e) { /* the SVG icon stays */ }
}
if (STANDALONE) {
  touchIcon();
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; requestRender(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline use just will not be available */ });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
}
setInterval(tick, 500);
if (S.active) keepAwake();
Cloud.init();
