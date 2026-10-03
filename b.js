'use strict';
/* ================= Utilities ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const p = String(s || '').split('-').map(Number); return (p.length === 3 && p.every(Number.isFinite)) ? new Date(p[0], p[1] - 1, p[2]) : new Date(); };
const dayNum = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDate = (d, year) => d.toLocaleDateString('en-US', year ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
const fmtDow = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtClock = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s); };
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const plain = x => JSON.parse(JSON.stringify(x));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round1 = n => Math.round(n * 10) / 10;
const trim = n => (Math.round(n * 100) / 100).toString();
function defaultStart() { const t = new Date(); return ymd(addDays(t, t.getDay() === 1 ? 0 : (8 - t.getDay()) % 7)); }

/* ================= State ================= */
const LS_KEY = 'traininglog.v1';
const S = { meta: null, active: null, activeU: 0, sessions: [], scans: [] };
function defaultMeta() { return { v: 1, program: STANDALONE ? null : 'build', startDate: defaultStart(), paused: [], priority: [], restC: 150, restI: 75, restRp: 20, style: 'std', sound: true, effort: 'last', names: {}, lastBackup: 0, resetAt: 0, u: 1 }; }
function normMeta(m) {
  const d = defaultMeta();
  if (!m || typeof m !== 'object') return d;
  const o = Object.assign(d, m);
  o.paused = Array.isArray(m.paused) ? m.paused.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) : [];
  o.priority = Array.isArray(m.priority) ? m.priority.filter(g => PRIORITY.includes(g)).slice(0, 2) : [];
  o.names = (m.names && typeof m.names === 'object') ? m.names : {};
  o.restC = num(o.restC) || 150; o.restI = num(o.restI) || 75;
  o.effort = m.effort === 'all' ? 'all' : 'last';
  o.style = m.style === 'rp' ? 'rp' : 'std';
  o.restRp = [15, 20, 30].includes(+m.restRp) ? +m.restRp : 20;
  o.program = PROGRAMS[m.program] ? m.program : (STANDALONE ? null : 'build');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.startDate || '')) o.startDate = defaultStart();
  return o;
}
function sortAll() {
  S.sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  S.scans.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.u || 0) - (b.u || 0));
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S.meta = normMeta(d.meta); S.active = d.active || null; S.activeU = d.activeU || 0;
      S.sessions = Array.isArray(d.sessions) ? d.sessions : []; S.scans = Array.isArray(d.scans) ? d.scans : [];
    }
  } catch (e) { /* storage can be empty or blocked */ }
  if (!S.meta) S.meta = defaultMeta();
  sortAll();
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ meta: S.meta, active: S.active, activeU: S.activeU, sessions: S.sessions, scans: S.scans })); } catch (e) { /* ignore */ }
}
const liveSessions = () => S.sessions.filter(s => !s.deleted);
const liveScans = () => S.scans.filter(s => !s.deleted);

function saveMeta() { S.meta.u = Date.now(); saveLocal(); Cloud.put('meta', S.meta); }
let activeTimer = null;
function saveActive(now) {
  S.activeU = Date.now(); saveLocal();
  clearTimeout(activeTimer);
  const push = () => Cloud.put('active', { session: S.active, u: S.activeU });
  if (now) push(); else activeTimer = setTimeout(push, 1500);
}
function saveSession(s) { s.u = Date.now(); sortAll(); saveLocal(); Cloud.put('sessions/' + s.id, s); }
function saveScan(s) { s.u = Date.now(); sortAll(); saveLocal(); Cloud.put('scans/' + s.id, s); }

/* ================= Account storage (db capability), with this device as cache ================= */
const STATUS = { local: 'Saved on this device', saving: 'Saving', saved: 'Saved to your account', unsynced: 'Not synced yet' };
const TERMINAL = new Set(['revoked', 'not_granted', 'capability_disabled', 'capability_removed']);
const Cloud = {
  db: null, uid: null, q: new Map(), busy: false, syncing: false, status: 'local', lastSync: 0, retryT: null,
  setStatus(s) { this.status = s; const el = $('#sync'); if (el) el.textContent = STATUS[s]; },
  async init() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const id = user ? await user.id() : null;
      if (!db || !id) return;
      this.db = db; this.uid = id;
      await this.sync();
    } catch (e) { this.fail(e); }
  },
  ref(key) {
    const base = 'data/users/' + this.uid;
    if (key === 'meta' || key === 'active') return this.db.doc(base + '/' + key);
    const i = key.indexOf('/');
    return this.db.doc(base + '/log').collection(key.slice(0, i)).doc(key.slice(i + 1));
  },
  put(key, data) { if (!this.db) return; this.q.set(key, data === null ? null : plain(data)); this.pump(); },
  write(key, data) { const r = this.ref(key); return data === null ? r.delete() : r.set(data); },
  async pump() {
    if (this.busy || !this.db) return;
    this.busy = true; this.setStatus('saving');
    let ok = true;
    while (this.q.size && this.db) {
      const [key, data] = this.q.entries().next().value;
      this.q.delete(key);
      try { await this.write(key, data); }
      catch (e) {
        const code = e && e.code;
        if (TERMINAL.has(code)) { this.db = null; break; }
        if (code === 'invalid_argument' || code === 'transform_error') { ok = false; console.error('Could not save', key, e); continue; }
        if (code === 'quota_exceeded') { ok = false; toast('Account storage is full. New entries stay on this device.'); continue; }
        await sleep(code === 'resource_exhausted' ? 3000 : 700 + Math.random() * 600);
        try { await this.write(key, data); } catch (e2) { ok = false; }
      }
    }
    this.busy = false;
    this.setStatus(!this.db ? 'local' : ok ? 'saved' : 'unsynced');
    if (!ok && this.db) this.retrySoon();
  },
  retrySoon() { clearTimeout(this.retryT); this.retryT = setTimeout(() => this.sync(), 30000); },
  fail(e) {
    console.warn('Account storage problem', e);
    if (e && TERMINAL.has(e.code)) { this.db = null; this.setStatus('local'); }
    else if (this.db) { this.setStatus('unsynced'); this.retrySoon(); }
  },
  // Merge one list by id; the copy with the newer "u" stamp wins. Anything older than the last erase is dropped.
  mergeList(name, local, snap, resetAt) {
    const map = new Map(); let changed = false;
    for (const l of local) { if ((l.u || 0) >= resetAt) map.set(l.id, { v: l, inCloud: false, push: false }); else changed = true; }
    for (const d of snap.docs) {
      const raw = d.data(); if (!raw || typeof raw !== 'object') continue;
      const c = plain(raw); if (!c.id) c.id = d.id;
      if ((c.u || 0) < resetAt) { this.q.set(name + '/' + d.id, null); continue; }
      const cur = map.get(c.id);
      if (!cur) { map.set(c.id, { v: c, inCloud: true, push: false }); changed = true; }
      else if ((c.u || 0) > (cur.v.u || 0)) { cur.v = c; cur.inCloud = true; changed = true; }
      else { cur.inCloud = true; cur.push = (c.u || 0) < (cur.v.u || 0); }
    }
    const out = [];
    for (const e of map.values()) { out.push(e.v); if (!e.inCloud || e.push) this.q.set(name + '/' + e.v.id, plain(e.v)); }
    return { out, changed };
  },
  async sync() {
    if (!this.db || this.syncing) return;
    this.syncing = true;
    try {
      const base = 'data/users/' + this.uid, log = this.db.doc(base + '/log');
      const [m, a, ss, sc] = await Promise.all([
        this.db.doc(base + '/meta').get(), this.db.doc(base + '/active').get(),
        log.collection('sessions').limit(1000).get(), log.collection('scans').limit(1000).get(),
      ]);
      let changed = false;
      const cm = m.exists ? plain(m.data()) : null;
      if (cm && (S.meta.u || 0) <= (cm.u || 0)) {
        if (JSON.stringify(normMeta(cm)) !== JSON.stringify(S.meta)) { S.meta = normMeta(cm); changed = true; }
      } else this.q.set('meta', plain(S.meta));
      const resetAt = S.meta.resetAt || 0;
      const ca = a.exists ? plain(a.data()) : null;
      if (ca && (ca.u || 0) > (S.activeU || 0)) { S.active = (ca.u >= resetAt && ca.session) ? ca.session : null; S.activeU = ca.u; changed = true; }
      else if ((S.activeU || 0) > ((ca && ca.u) || 0)) this.q.set('active', plain({ session: S.active, u: S.activeU }));
      const r1 = this.mergeList('sessions', S.sessions, ss, resetAt); S.sessions = r1.out;
      const r2 = this.mergeList('scans', S.scans, sc, resetAt); S.scans = r2.out;
      changed = changed || r1.changed || r2.changed;
      if (S.active && S.sessions.some(s => s.id === S.active.id)) { S.active = null; changed = true; }
      sortAll(); saveLocal(); this.lastSync = Date.now();
      if (this.q.size) this.pump(); else if (!this.busy) this.setStatus('saved');
      if (changed) requestRender();
    } catch (e) { this.fail(e); }
    finally { this.syncing = false; }
  },
};

/* ================= Plan position ================= */
function blockOf(k) { let b = 0, acc = 0; for (;;) { const len = BLOCK_WEEKS[b] || 7; if (k < acc + len) return { b, wib: k - acc + 1, len, first: acc }; acc += len; b++; } }
function posFromPlanWeek(k) { const o = blockOf(k); return { k, week: k + 1, block: o.b + 1, wib: o.wib, len: o.len, first: o.first, deload: o.wib === o.len, rot: o.b % 3 + 1, beyond: k >= YEAR_WEEKS }; }
function rawWeek(d) { return Math.floor((dayNum(d) - dayNum(parseYmd(S.meta.startDate))) / 7); }
function pausedRaw() { const set = new Set(); (S.meta.paused || []).forEach(p => { const r = rawWeek(parseYmd(p)); if (r >= 0) set.add(r); }); return set; }
function posFor(d) {
  const r = rawWeek(d);
  if (r < 0) return Object.assign(posFromPlanWeek(0), { pre: true });
  const P = pausedRaw(); let before = 0; P.forEach(p => { if (p < r) before++; });
  return Object.assign(posFromPlanWeek(r - before), { paused: P.has(r) });
}
function rawForPlanWeek(k) { const P = pausedRaw(); let r = -1, c = -1; while (c < k) { r++; if (!P.has(r)) c++; } return r; }
function weekStart(k) { return addDays(parseYmd(S.meta.startDate), 7 * rawForPlanWeek(k)); }

/* ================= Program logic ================= */
const P = () => PROGRAMS[S.meta.program] || PROGRAMS.build;
const M = () => MEASURES[P().measure];
const dayKeys = () => Object.keys(P().days);
// Rest-pause style: one set to failure, then mini-sets on a short rest. Heavy free-weight lifts stay as straight sets.
const rpMode = () => S.meta.style === 'rp' && !P().youth;
const mySessions = () => liveSessions().filter(s => (s.prog || 'build') === (S.meta.program || 'build'));
function slotOf(id) { return (P().slots[id[0]] || []).find(s => s.id === id); }
const nameKey = (rot, id) => S.meta.program + ':' + rot + ':' + id;
function exName(rot, slot) { return (S.meta.names || {})[nameKey(rot, slot.id)] || slot.names[rot - 1]; }
function dayPlan(day, pos) {
  const pri = S.meta.priority || [], seen = {};
  return P().slots[day].map(slot => {
    seen[slot.g] = (seen[slot.g] || 0) + 1;
    const full = slot.sets + (pri.includes(slot.g) && seen[slot.g] <= 2 ? 1 : 0);
    const rp = rpMode() && !pos.deload && !!(slot.pp || slot.drop || slot.k === 'i');
    return {
      slot: slot.id, name: exName(pos.rot, slot), g: slot.g, full, sets: pos.deload ? Math.ceil(full / 2) : rp ? 1 : full, rpn: rp ? full : 0, lo: slot.lo, hi: slot.hi, k: slot.k,
      drop: !!slot.drop && !pos.deload, pp: !!slot.pp && !pos.deload, bw: !!slot.bw, per: slot.per || '', cue: slot.cue || '',
      t: slot.t || '', nw: !!slot.nw, unit: slot.unit || 'reps', rest: slot.rest || 0,
    };
  });
}
const restOf = p => p.rest || (p.rpn ? S.meta.restRp : p.k === 'c' ? (rpMode() ? Math.min(S.meta.restC, 120) : S.meta.restC) : S.meta.restI);
function estMinutes(plan) { const sec = plan.reduce((a, p) => a + (p.rpn ? 85 + p.rpn * (15 + S.meta.restRp) : p.sets * (45 + restOf(p))), 0); return Math.max(5, Math.round(sec / 300) * 5); }
function nextDay() { const keys = dayKeys(), l = mySessions(), i = l.length ? keys.indexOf(l[l.length - 1].day) : -1; return keys[(i + 1) % keys.length]; }
function lastFor(name, includeDeload) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const s = S.sessions[i]; if (s.deleted || (s.deload && !includeDeload)) continue;
    const e = (s.ex || []).find(x => x.name === name && x.sets.some(y => !y.drop));
    if (e) return { s, e };
  }
  return null;
}
function step(w) { return w < 20 ? 2.5 : w < 100 ? 5 : Math.max(5, Math.round(w * 0.04 / 5) * 5); }
function fmtLoad(w, bw) { return bw ? (w ? '+' + trim(w) + ' lb' : 'bodyweight') : trim(w) + ' lb'; }
function lastLine(p) {
  const last = lastFor(p.name, false) || lastFor(p.name, true);
  if (!last) return 'No history yet';
  const main = last.e.sets.filter(x => !x.drop), w = main[0].w || 0, reps = main.map(x => x.r).join(', ');
  if (p.nw) return 'Last: ' + reps + (p.unit === 'sec' ? ' sec' : ' reps');
  return 'Last: ' + (main.every(x => (x.w || 0) === w) ? fmtLoad(w, p.bw) + ' × ' + reps : main.map(x => trim(x.w || 0) + ' × ' + x.r).join(', '));
}
function aim(p, deload) {
  const last = lastFor(p.name, false) || lastFor(p.name, true), youth = !!P().youth;
  if (p.t && p.t !== 'str') return { text: last ? lastLine(p) + '.' : '', ws: last ? last.e.sets.filter(x => !x.drop).map(x => x.w || 0) : [], reps: [] };
  if (!last) return { text: youth ? 'First time. Start light enough that you could do 4 or 5 more reps.' : 'First time. Find a load that lands you between ' + p.lo + ' and ' + p.hi + ' reps.', ws: [], reps: [] };
  const main = last.e.sets.filter(x => !x.drop), w = main[0].w || 0, reps = main.map(x => x.r);
  const same = main.every(x => (x.w || 0) === w), ws = main.map(x => x.w || 0);
  const was = fmtLoad(w, p.bw) + ' for ' + reps.join(', ');
  if (deload) return { text: youth ? 'Easy week. Keep ' + fmtLoad(w, p.bw) + '.' : 'Deload. Keep ' + fmtLoad(w, p.bw) + ' and stop 3 or 4 reps short.', ws, reps: [] };
  const top = (!youth && S.meta.effort === 'all' && P().effortSetting) ? (main[0].r >= p.hi && main.every(x => x.r >= p.lo)) : main.every(x => x.r >= p.hi);
  if (same && main.length >= Math.min(2, p.rpn ? 1 : p.full) && top) {
    if (youth && p.bw && !w) return { text: 'Every set reached the top. Make it harder: slow the lowering or add a little weight.', ws, reps };
    const nw = w + (youth ? (w < 20 ? 2.5 : 5) : step(w));
    return { text: (youth ? 'Every rep was clean. Take the next small step: ' : 'Add weight: ') + fmtLoad(nw, p.bw) + '. Last time ' + was + '.', ws: main.map(() => nw), reps: [] };
  }
  return { text: (same ? 'Stay at ' + fmtLoad(w, p.bw) + ' and beat ' + reps.join(', ') : 'Match or beat last time: ' + main.map(x => trim(x.w || 0) + ' × ' + x.r).join(', ')) + '.', ws, reps };
}
function weekVolume(pos) {
  const done = {}, plan = {};
  const add = e => { const ok = x => x.done === undefined || x.done, n = e.sets.filter(x => !x.drop && ok(x)).length + 0.5 * e.sets.filter(x => x.mini && ok(x)).length; if (n) done[e.g] = (done[e.g] || 0) + n; };
  mySessions().filter(s => s.week === pos.week).forEach(s => s.ex.forEach(add));
  if (S.active && S.active.week === pos.week) S.active.ex.forEach(add);
  dayKeys().forEach(d => dayPlan(d, pos).forEach(p => { plan[p.g] = (plan[p.g] || 0) + P().freq * (p.sets + 0.5 * p.rpn); }));
  return { done, plan };
}
