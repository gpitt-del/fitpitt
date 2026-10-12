'use strict';
/* ================= Accounts, sync and the coach (standalone site only) =================
   Talks to the FitPitt API (server/ in this repo, on Cloudflare). Signing in is by an invite code, typed in
   or opened as a link (#join=CODE). Each phone keeps its own device token. Once signed in:
   - the log syncs: this phone pushes what changed and pulls what other phones changed (the newer stamp wins),
     taking over the Cloud object the base app already writes through;
   - "Get a plan built for you" ends in Build my plan: the coach builds it on the server, so the phone can be locked
     meanwhile, and the plan opens in the usual preview;
   - Ask the coach (Today and during a workout) and Review my week (Progress) are jobs on the same server;
   - an admin sees the roster, invites, costs and flags under Settings.
   The API address comes from a meta tag in index.html (fitpitt-api), or localStorage fitpitt.api for tests. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE || !window.FP_PLAN || !window.FP_UI) return;
  const F = window.FP_PLAN, UI = window.FP_UI, ADMIN = 'the builder', ADMIN_NAME = 'Gabe'; // ADMIN is how screens refer to whoever runs FitPitt; ADMIN_NAME is the admin account's name
  const KEY = 'fitpitt.account', SYNC_KEY = 'fitpitt.sync', JOB_KEY = 'fitpitt.job', LOG_KEY = 'fitpitt.coachlog';
  const api = (() => { try { const v = localStorage.getItem('fitpitt.api'); if (v) return v.replace(/\/$/, ''); } catch (e) { /* ignore */ } const m = document.querySelector('meta[name="fitpitt-api"]'); return m && m.content ? m.content.replace(/\/$/, '') : ''; })();
  if (!api) return; // no server set up for this copy of the app

  /* ---------- the account on this phone ---------- */
  let acct = null;
  try { acct = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { acct = null; }
  if (acct && (!acct.token || !acct.person)) acct = null;
  const saveAcct = () => { try { if (acct) localStorage.setItem(KEY, JSON.stringify(acct)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  const signedIn = () => !!acct;
  const isAdmin = () => !!acct && acct.person.role === 'admin';
  const isKid = () => !!acct && acct.person.role === 'kid';

  class ApiError extends Error { constructor(status, data) { super((data && data.error) || ('Server error ' + status)); this.status = status; this.code = data && data.code; } }
  async function call(method, path, body, opts) {
    const o = opts || {};
    let res;
    try {
      res = await fetch(api + path, { method, keepalive: !!o.keepalive, headers: Object.assign({ 'Content-Type': 'application/json' }, acct && !o.noAuth ? { Authorization: 'Bearer ' + acct.token } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw new ApiError(0, { error: 'No connection. Try again when you have signal.', code: 'offline' }); }
    let data = null; try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      if ((res.status === 401 && data && data.code === 'signed_out') || (res.status === 403 && data && data.code === 'disabled')) { signOut(false); toast(data.error); }
      throw new ApiError(res.status, data);
    }
    return data;
  }
  function signOut(tell) {
    if (acct && tell) call('POST', '/signout').catch(() => { /* the token is dropped either way */ });
    acct = null; saveAcct(); Cloud.db = null; Cloud.uid = null; Cloud.q.clear(); clearTimeout(Cloud.pumpT); clearTimeout(Cloud.retryT); Cloud.setStatus('local');
    // The sync bookkeeping stays, with the person it belongs to, so a different person's code cannot absorb this log.
    try { localStorage.removeItem(JOB_KEY); } catch (e) { /* ignore */ }
    requestRender();
  }
  const hasLog = () => liveSessions().length > 0 || liveScans().length > 0 || !!F.read();
  // Signing in. A phone that holds someone else's log refuses a different person's code until the log is erased.
  async function join(code) {
    if (acct) throw new ApiError(400, { error: 'This phone is signed in as ' + acct.person.name + '. Sign out in Settings first.' });
    const label = /iPhone|iPad/.test(navigator.userAgent) ? (navigator.standalone ? 'iPhone app' : 'iPhone Safari') : /Android/.test(navigator.userAgent) ? 'Android' : 'browser';
    const who = await call('POST', '/join', { code, check: true }, { noAuth: true });
    if (state.person && state.person !== who.person.id && hasLog()) throw new ApiError(400, { error: 'This phone holds another person\'s log. To sign in as ' + who.person.name + ', first erase everything in Settings (the other log is safe in its own account).' });
    const r = await call('POST', '/join', { code, device: label }, { noAuth: true });
    startAccount(r);
    await Cloud.init();
    closeSheet(); render();
    toast('Signed in as ' + r.person.name + '. Your log now saves to your account.');
  }
  function startAccount(r) {
    acct = { token: r.token, person: r.person, api }; saveAcct();
    if (state.person !== r.person.id) state = { since: 0, pushed: 0, person: r.person.id }; // a new person: pull everything; push what this phone holds
    saveState();
  }

  /* ---------- sync: the base app's Cloud object, pointed at the server ---------- */
  const store0 = (plan, code, at) => { try { localStorage.setItem(F.KEY, JSON.stringify({ plan, code: code || '', at: at || Date.now() })); return true; } catch (e) { return false; } };
  const fforget = F.forget;
  // Keys the base app uses: 'meta', 'active', 'sessions/<id>', 'scans/<id>'. This file adds 'plan/current' and 'intake/current'.
  const KIND = { meta: 'meta', active: 'active', sessions: 'session', scans: 'scan', plan: 'plan', intake: 'intake' };
  let state = { since: 0, pushed: 0, person: null };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(SYNC_KEY) || '{}')); } catch (e) { /* fresh */ }
  const saveState = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  function docOf(key, data) {
    const i = key.indexOf('/'), head = i < 0 ? key : key.slice(0, i), id = i < 0 ? key : key.slice(i + 1);
    const kind = KIND[head]; if (!kind) return null;
    if (data === null) return { kind, id, u: Date.now(), deleted: true };
    const u = (data && data.u) || Date.now();
    return { kind, id, u, body: data };
  }
  Cloud.init = async function () {
    if (!acct) return;
    this.db = { api }; this.uid = acct.person.id;
    // Anything this phone changed since the last acknowledged push goes out again.
    const since = state.pushed || 0;
    if ((S.meta.u || 0) > since) this.q.set('meta', plain(S.meta));
    if ((S.activeU || 0) > since) this.q.set('active', { session: S.active, u: S.activeU });
    S.sessions.forEach(s => { if ((s.u || 0) > since) this.q.set('sessions/' + s.id, s.deleted ? null : plain(s)); });
    S.scans.forEach(s => { if ((s.u || 0) > since) this.q.set('scans/' + s.id, s.deleted ? null : plain(s)); });
    const pl = F.read(); if (pl && (pl.at || 0) > since) this.q.set('plan/current', { plan: pl.plan, code: pl.code, u: pl.at });
    await this.sync();
  };
  Cloud.put = function (key, data) { if (!this.db) return; this.q.set(key, data === null ? null : plain(data)); this.pump(); };
  Cloud.pump = function () { clearTimeout(this.pumpT); if (this.q.size) this.setStatus('saving'); this.pumpT = setTimeout(() => this.sync(), 1200); };
  Cloud.flush = function () { clearTimeout(this.pumpT); return this.sync({ keepalive: true }); };
  Cloud.sync = async function (opts) {
    if (!this.db || this.syncing) { if (this.db && this.q.size) this.pump(); return; }
    this.syncing = true; this.setStatus('saving');
    try {
      let changed = false, rounds = 0;
      do { // 200 docs a round, and as many rounds as it takes; a round with nothing to push still pulls
        const docs = [], sent = [];
        for (const [key, data] of this.q.entries()) { const d = docOf(key, data); if (d) { docs.push(d); sent.push([key, d, data]); } if (docs.length >= 200) break; }
        const r = await call('POST', '/sync', { since: state.since || 0, docs }, opts);
        const acked = new Set((r.acks || []).map(a => a.kind + '/' + a.id + '/' + a.u));
        let maxU = state.pushed || 0;
        sent.forEach(([key, d, data]) => { if (acked.has(d.kind + '/' + d.id + '/' + d.u)) { if (this.q.get(key) === data) this.q.delete(key); if (d.u > maxU) maxU = d.u; } }); // only what the server took, and not anything queued meanwhile
        state.pushed = Math.min(maxU, Date.now()); // a stamp from a phone with a fast clock must not hide this phone's later changes
        if (apply(r.docs)) changed = true;
        state.since = r.cursor != null ? r.cursor : state.since; saveState();
        if (!r.more && !this.q.size) break;
        rounds++;
      } while (rounds < 50);
      this.lastSync = Date.now();
      this.setStatus(this.q.size ? 'saving' : 'saved');
      if (changed) { sortAll(); saveLocal(); requestRender(); }
      if (this.q.size) this.pump();
    } catch (e) {
      this.setStatus(e.code === 'offline' ? 'unsynced' : (this.db ? 'unsynced' : 'local'));
      if (this.db) { clearTimeout(this.retryT); this.retryT = setTimeout(() => this.sync(), e.code === 'offline' ? 30000 : 60000); }
    } finally { this.syncing = false; }
  };
  // Pulled docs land the way the base app's merge did: the newer stamp wins, deletions become tombstones.
  function apply(docs) {
    let changed = false;
    // The plan first: the settings may name it, and settings that name an unknown plan fall back to none.
    const planDoc = (docs || []).filter(d => d.kind === 'plan').pop();
    if (planDoc) {
      const cur = F.read();
      if (planDoc.deleted) { if (cur && (cur.at || 0) < planDoc.u) { fforget(); if (S.meta.program === 'mine') S.meta.program = null; changed = true; } }
      else if (planDoc.body && planDoc.body.plan && (!cur || (cur.at || 0) < planDoc.u)) {
        const c = F.check(planDoc.body.plan);
        if (c.plan) { store0(c.plan, planDoc.body.code || '', planDoc.u); F.register(c.plan); changed = true; }
      }
    }
    for (const d of docs || []) {
      if (d.kind === 'plan' || d.kind === 'intake') continue;
      if (d.kind === 'meta') { if (!d.deleted && d.body && (d.body.u || 0) > (S.meta.u || 0)) { S.meta = normMeta(d.body); changed = true; } continue; }
      if (d.kind === 'active') { if (!d.deleted && d.body && (d.body.u || 0) > (S.activeU || 0)) { S.active = d.body.session && !S.sessions.some(s => s.id === (d.body.session || {}).id) ? d.body.session : null; S.activeU = d.body.u; changed = true; } continue; }
      const list = d.kind === 'session' ? S.sessions : S.scans, i = list.findIndex(x => x.id === d.id);
      const cur = i >= 0 ? list[i] : null;
      if (cur && (cur.u || 0) >= d.u) continue;
      const v = d.deleted ? Object.assign({ id: d.id, deleted: true, u: d.u }, cur ? { startedAt: cur.startedAt, date: cur.date } : {}) : Object.assign({}, d.body, { id: d.id, u: d.u });
      if (i >= 0) list[i] = v; else list.push(v);
      changed = true;
    }
    return changed;
  }
  // The plan on this phone travels too.
  const fstore = F.store;
  // "Use this plan" reloads the page right after storing, so the plan is sent at once, with keepalive to outlive the reload.
  F.store = function (plan, code) { const ok = fstore(plan, code); if (ok && Cloud.db) { const at = (F.read() || {}).at || Date.now(); Cloud.q.set('plan/current', { plan, code: code || '', u: at }); Cloud.flush().catch(() => { /* it goes on the next start */ }); } return ok; };
  F.forget = function () { fforget(); Cloud.put('plan/current', null); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkJob(); });
  window.addEventListener('pagehide', () => { if (Cloud.db && Cloud.q.size) Cloud.flush(); });

  /* ---------- jobs: plan builds, reviews, questions ---------- */
  let jobTimer = null, jobClock = null, jobT0 = 0;
  const pending = () => { try { return JSON.parse(localStorage.getItem(JOB_KEY) || 'null'); } catch (e) { return null; } };
  const setPending = j => { try { if (j) localStorage.setItem(JOB_KEY, JSON.stringify(j)); else localStorage.removeItem(JOB_KEY); } catch (e) { /* ignore */ } };
  const KIND_WORDS = { plan: ['Building your plan', 'Your plan is ready.'], review: ['Reviewing your week', 'Your review is ready.'], ask: ['Asking the coach', 'The coach answered.'] };
  async function startJob(kind, body) {
    const r = await call('POST', '/coach/jobs', Object.assign({ kind }, body));
    setPending({ id: r.job.id, kind, at: Date.now() });
    jobSheet(r.job.id, kind);
  }
  function jobSheet(id, kind) {
    jobT0 = Date.now();
    openSheet('<h2>' + KIND_WORDS[kind][0] + '</h2><p class="fp-lede">' + (kind === 'plan' ? 'This takes a few minutes. You can lock your phone or leave the app; it keeps building, and it will be here when you come back.' : 'This takes up to a minute or two. You can lock your phone; the answer waits here.') + '</p>' +
      '<p class="fp-wait" id="fp-wait"><span class="fp-spin" aria-hidden="true"></span> <span id="fp-clock">0:00</span></p><div class="frm" style="margin-top:16px"><button class="btn link" data-act="closeSheet">Close and come back later</button></div>');
    clearInterval(jobClock); jobClock = setInterval(() => { const c = $('#fp-clock'); if (!c) { clearInterval(jobClock); return; } c.textContent = fmtClock((Date.now() - jobT0) / 1000); }, 1000);
    pollJob(id, kind);
  }
  // Keeps asking until the job ends: every 3 s while the waiting sheet is up, every 6 s in the background.
  function pollJob(id, kind) {
    clearTimeout(jobTimer);
    const clock = $('#fp-clock'); if (clock) clock.textContent = fmtClock((Date.now() - jobT0) / 1000);
    const again = ms => { const p = pending(); if (p && p.id === id) jobTimer = setTimeout(() => pollJob(id, kind), ms); };
    call('GET', '/coach/jobs/' + id).then(r => {
      const j = r.job;
      if (j.status === 'done' || j.status === 'failed') { setPending(null); if (j.status === 'done') showResult(j); else { closeSheet(); openSheet('<h2>The coach could not finish</h2><p>' + esc(j.error || 'Something went wrong.') + '</p><div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="closeSheet">Close</button></div>'); } return; }
      again($('#fp-wait') ? 3000 : 6000);
    }).catch(() => again(10000));
  }
  function checkJob() { const p = pending(); if (p && acct) { if (Date.now() - p.at > 30 * 60000) { setPending(null); return; } jobT0 = p.at; pollJob(p.id, p.kind); } }
  function showResult(j) {
    const o = j.output || {};
    if (j.kind === 'plan' && o.plan) { closeSheet(); UI.previewPlan(o.plan, o.code, o.notes, o.text); toast(KIND_WORDS.plan[1]); return; }
    const text = o.text || '';
    remember(j.kind, text);
    closeSheet(); if (j.kind === 'review') render();
    openSheet('<h2>' + (j.kind === 'review' ? 'Your week, reviewed' : 'The coach says') + '</h2><div class="fp-answer">' + esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</div>' +
      (j.kind === 'ask' ? '<div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="fpAsk">Ask something else</button><button class="btn link" data-act="closeSheet">Close</button></div>' : '<div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="closeSheet">Close</button></div>'));
    toast(KIND_WORDS[j.kind][1]);
  }
  function remember(kind, text) { try { const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); l.push({ kind, text, at: Date.now() }); localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-12))); } catch (e) { /* ignore */ } }
  const lastOf = kind => { try { const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]').filter(x => x.kind === kind); return l[l.length - 1] || null; } catch (e) { return null; } };
  const currentPlan = () => { const p = F.read(); return p && S.meta.program === 'mine' ? p.plan : null; };
  const logText = () => { try { return window.FP_COACH ? window.FP_COACH.summary() : ''; } catch (e) { return ''; } };
  const busy = e => { if (e && (e.status === 402 || e.status === 409)) { openSheet('<h2>' + (e.status === 402 ? 'Budget used up' : 'The coach is busy') + '</h2><p>' + esc(e.message) + '</p><div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="closeSheet">Close</button></div>'); return; } toast(e && e.message ? e.message : 'Could not reach the coach.'); };
  // The newest plan the coach built, for a preview that was closed or a build that finished mid-workout.
  ACT.fpLastPlan = async () => {
    try {
      const r = await call('GET', '/coach/jobs?limit=20'), j = (r.jobs || []).find(x => x.kind === 'plan' && x.status === 'done' && x.output && x.output.plan);
      if (!j) { toast('The coach has not built a plan for you yet.'); return; }
      UI.previewPlan(j.output.plan, j.output.code, j.output.notes, j.output.text);
    } catch (e) { busy(e); }
  };

  // Change my plan: a note on what to change; the coach starts from the current plan and the log (Gabe, Oct 12:
  // flexible and adaptable, log reviews welcome after the first build). The intake answers on the phone go along.
  ACT.fpChange = () => {
    if (!signedIn()) { ACT.fpJoin(); return; }
    openSheet('<h2>Change my plan</h2><p class="fp-lede">Say what you want different. The coach starts from your plan and your log, keeps what works, and shows what it changed.</p>' +
      '<textarea id="fp-change" rows="4" maxlength="1000" placeholder="Swap leg press for hack squat. Shorter Wednesdays, 45 minutes. I keep skipping the calf raises, drop them or move them." style="margin-top:12px"></textarea>' +
      '<div class="frm" style="margin-top:14px"><button class="btn primary" data-act="fpChangeSend">Ask for the change</button><button class="btn link" data-act="closeSheet">Cancel</button></div>');
    const t = $('#fp-change'); if (t) t.focus();
  };
  ACT.fpChangeSend = () => {
    const note = ($('#fp-change') ? $('#fp-change').value : '').trim(); if (!note) { toast('Say what you want changed first.'); return; }
    tellIntake(); const d = UI.collectIntake();
    if (!d) { toast('Answer the plan questions first; they go with the change.'); ACT.fpIntake(); return; }
    const intake = UI.intakeText(d);
    Cloud.put('intake/current', { text: intake, u: Date.now() });
    startJob('plan', { intake, currentPlan: currentPlan(), log: liveSessions().length ? logText() : '', note }).catch(busy);
  };

  // Who is answering the intake: the account's name and, for a kid account, the sport-focused question set.
  function tellIntake() { UI.intakeWho(acct ? { name: acct.person.name, kind: acct.person.role === 'kid' ? 'kid' : 'adult' } : { name: '', kind: 'adult' }); }
  const intake0 = ACT.fpIntake;
  ACT.fpIntake = () => { tellIntake(); intake0(); };
  // Build my plan: the intake sheet's button. Nothing is ever texted to Gabe; without an account the answers wait on the phone.
  ACT.fpSendIntake = () => {
    const d = UI.collectIntake(); if (!d) return;
    if (!signedIn()) {
      openSheet('<h2>Your answers are saved</h2><p>They stay on this phone. Sign in with your invite code and the coach builds your plan from them.</p><div class="frm" style="margin-top:16px"><button class="btn primary" data-act="fpJoin">I have an invite code</button><button class="btn link" data-act="closeSheet">Close</button></div>');
      return;
    }
    const intake = UI.intakeText(d);
    Cloud.put('intake/current', { text: intake, u: Date.now() });
    startJob('plan', { intake, currentPlan: currentPlan(), log: liveSessions().length ? logText() : '' }).catch(busy);
  };
  ACT.fpAsk = () => {
    const last = lastOf('ask');
    openSheet('<h2>Ask the coach</h2><p class="fp-lede">Training questions only: loads, reps, swaps, soreness, what to do today. Not medical advice.</p>' +
      '<textarea id="fp-q" rows="3" maxlength="1000" placeholder="My right knee feels fine but the left one aches on lunges. What should I do today?" style="margin-top:12px"></textarea>' +
      '<div class="frm" style="margin-top:14px"><button class="btn primary" data-act="fpAskSend">Ask</button><button class="btn link" data-act="closeSheet">Cancel</button></div>' +
      (last ? '<p class="fp-sub">Last answer</p><div class="fp-answer small">' + esc(last.text).replace(/\n/g, '<br>') + '</div>' : ''));
    const q = $('#fp-q'); if (q) q.focus();
  };
  ACT.fpAskSend = () => {
    const q = ($('#fp-q') ? $('#fp-q').value : '').trim(); if (!q) { toast('Type the question first.'); return; }
    const pos = posFor(new Date()), ctx = ['Plan: ' + P().name + '. Block ' + pos.block + ', week ' + pos.wib + (pos.deload ? ' (deload)' : '') + '.', S.active ? 'In a workout now: day ' + S.active.day + '.' : 'Not in a workout.', logText().split('\n').slice(0, 14).join('\n')].join('\n');
    startJob('ask', { question: q, context: ctx.slice(0, 4000) }).catch(busy);
  };
  ACT.fpReview = () => {
    if (!liveSessions().length) { toast('Log a workout first.'); return; }
    startJob('review', { log: logText(), currentPlan: currentPlan() }).catch(busy);
  };

  /* ---------- sign in, settings and admin screens ---------- */
  ACT.fpJoin = () => {
    openSheet('<h2>Sign in with an invite</h2><p class="fp-lede">Type your 8-character invite code, or open the invite link you were sent.</p>' +
      '<input class="input fp-code-in" id="fp-join" type="text" maxlength="9" placeholder="ABCD-EFGH" autocomplete="off" autocapitalize="characters" spellcheck="false" style="margin-top:12px;text-transform:uppercase">' +
      '<div class="fp-err" id="fp-join-err" role="alert" style="margin-top:10px"></div>' +
      '<div class="frm" style="margin-top:14px"><button class="btn primary" data-act="fpJoinSend">Sign in</button><button class="btn link" data-act="closeSheet">Cancel</button></div>' +
      '<p class="small muted" style="margin-top:18px">Running FitPitt yourself? <button class="btn link" data-act="fpAdminJoin" style="padding:0;min-height:0">Sign in with the setup key</button></p>');
    const i = $('#fp-join'); if (i) i.focus();
  };
  ACT.fpAdminJoin = () => {
    openSheet('<h2>Sign in as the admin</h2><p class="fp-lede">The setup key is the ADMIN_SETUP_KEY secret on the server. It signs this phone in as the admin.</p>' +
      '<input class="input" id="fp-setup" type="password" autocomplete="off" placeholder="Setup key" style="margin-top:12px"><div class="fp-err" id="fp-setup-err" role="alert" style="margin-top:10px"></div>' +
      '<div class="frm" style="margin-top:14px"><button class="btn primary" data-act="fpAdminJoinSend">Sign in</button><button class="btn link" data-act="closeSheet">Cancel</button></div>');
    const i = $('#fp-setup'); if (i) i.focus();
  };
  ACT.fpAdminJoinSend = async () => {
    const key = ($('#fp-setup') ? $('#fp-setup').value : '').trim(); if (!key) return;
    try {
      if (acct) throw new ApiError(400, { error: 'Sign out first.' });
      const r = await call('POST', '/setup', { key, name: ADMIN_NAME, device: 'admin phone' }, { noAuth: true });
      if (state.person && state.person !== r.person.id && hasLog()) { await call('POST', '/signout', undefined, { }).catch(() => {}); throw new ApiError(400, { error: 'This phone holds another person\'s log. Erase everything in Settings first.' }); }
      startAccount(r);
      await Cloud.init(); closeSheet(); render(); toast('Signed in as ' + r.person.name + ', admin.');
    } catch (e) { const el = $('#fp-setup-err'); if (el) el.textContent = e.message; }
  };
  ACT.fpJoinSend = () => {
    const code = ($('#fp-join') ? $('#fp-join').value : '').trim();
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { const el = $('#fp-join-err'); if (el) el.textContent = 'The code is 8 letters and numbers.'; return; }
    join(code).catch(e => { const el = $('#fp-join-err'); if (el) el.textContent = e.message; });
  };
  ACT.fpSignOut = () => { confirmSheet('Sign out on this phone?', 'Your log stays on this phone and in your account. Sign in again with an invite code.', 'fpSignOutNow', 'Sign out'); };
  ACT.fpSignOutNow = () => { signOut(true); closeSheet(); toast('Signed out.'); };

  function changeButton() {
    if (!signedIn() || S.meta.program !== 'mine') return;
    const b = app.querySelector('#fp-set [data-act="fpIntake"]'); if (!b || app.querySelector('[data-act="fpChange"]')) return;
    const c = document.createElement('button'); c.className = 'btn quiet wide'; c.dataset.act = 'fpChange'; c.textContent = 'Change my plan'; b.before(c);
  }
  function accountCard() {
    changeButton();
    if (tab !== 'settings' || !S.meta.program || $('#fp-acct')) return;
    const anchor = $('#fp-set') || app.querySelector('.setting'); if (!anchor) return;
    const el = document.createElement('div'); el.className = 'setting'; el.id = 'fp-acct';
    el.innerHTML = signedIn()
      ? '<span class="s-l">Your account</span><p>Signed in as <b>' + esc(acct.person.name) + '</b>' + (isAdmin() ? ' (admin)' : '') + '. Your log saves to your account, so another phone you sign in on shows the same log. <span id="fp-sync">' + esc(STATUS[Cloud.status]) + '</span></p>' +
        '<div class="stack" style="margin-top:10px">' + (isAdmin() ? '<button class="btn quiet wide" data-act="adOpen">FitPitt admin: people, invites, costs</button>' : '') + '<button class="btn quiet wide" data-act="fpLastPlan">Open the last plan the coach built</button><button class="btn quiet wide" data-act="fpSignOut">Sign out on this phone</button></div>'
      : '<span class="s-l">Your account</span><p>With an invite code, the coach builds your plan, reviews your weeks and answers questions, and your log is saved to your account.</p><div class="stack" style="margin-top:10px"><button class="btn quiet wide" data-act="fpJoin">I have an invite code</button></div>';
    anchor.after(el);
    // The base app's "Your data" text assumed a different kind of account.
    if (signedIn()) app.querySelectorAll('.setting p').forEach(p => { if (/Claude login|saved on this device only/.test(p.textContent)) p.textContent = 'Saved to your FitPitt account and on this phone. A backup file is still a good idea now and then.'; });
  }
  // Wording on the first screen and the intake once the coach is there.
  const chooser0 = viewChooser;
  viewChooser = function () {
    let h = chooser0();
    h = h.replace('Two minutes of questions, then a plan built around the exercises you already do.', 'Two minutes of questions, then the coach builds a plan around the exercises you already do.');
    if (!signedIn()) h = h.replace('<p class="fp-sub">Ready-made plans</p>', '<div class="pick" style="margin-top:10px"><button data-act="fpJoin"><strong>I have an invite code</strong><span>Sign in to use the coach and save your log to your account.</span></button></div><p class="fp-sub">Ready-made plans</p>');
    return h;
  };
  function fixSheet() {
    const body = $('#sheet:not([hidden]) .sheet-body'); if (!body) return;
    const h2 = body.querySelector('h2'); if (!h2) return;
    if (h2.textContent === 'Get a plan built for you') {
      const lede = body.querySelector('.fp-lede'); if (lede && !lede.dataset.fp) { lede.dataset.fp = '1'; lede.textContent = signedIn() ? 'The coach builds a plan around the exercises you already do. Answer these, then tap Build my plan.' : 'The coach builds a plan around the exercises you already do. Answer these, then sign in with your invite code.'; }
      const b = body.querySelector('[data-act="fpSendIntake"]'); const want = signedIn() ? 'Build my plan' : 'Save my answers'; if (b && b.textContent !== want) b.textContent = want;
    }
  }
  function buttons() {
    if (!signedIn()) {
      // Signed out on a personal plan, Progress would offer to text the log to Gabe (o.js). Nothing is texted: ask them to sign in instead.
      if (tab === 'progress' && S.meta.program === 'mine') { const b = app.querySelector('[data-act="coachShare"]'); if (b) { b.dataset.act = 'fpJoin'; b.textContent = 'Sign in for a coach review'; } }
      return;
    }
    if (tab === 'today' && !S.active && S.meta.program && !app.querySelector('[data-act="fpAsk"]')) {
      const eff = app.querySelector('.effort'); if (eff) { const b = document.createElement('button'); b.className = 'btn quiet small'; b.dataset.act = 'fpAsk'; b.textContent = 'Ask the coach'; b.style.marginTop = '12px'; eff.after(b); }
    }
    if (tab === 'today' && S.active && !app.querySelector('[data-act="fpAsk"]')) {
      const stack = app.querySelector('.stack'); if (stack) { const b = document.createElement('button'); b.className = 'btn quiet wide'; b.dataset.act = 'fpAsk'; b.textContent = 'Ask the coach'; stack.appendChild(b); }
    }
    if (tab === 'progress') {
      const b = app.querySelector('[data-act="coachShare"], [data-act="fpReview"]');
      if (b && b.dataset.act === 'coachShare') { b.dataset.act = 'fpReview'; b.textContent = 'Review my week with the coach'; }
      const last = lastOf('review');
      if (b && last && !app.querySelector('.fp-last-review')) { const d = document.createElement('div'); d.className = 'fp-answer small fp-last-review'; d.style.marginTop = '12px'; d.innerHTML = '<b>Last review, ' + fmtDate(new Date(last.at)) + ':</b> ' + esc(last.text).replace(/\n/g, '<br>'); b.parentNode.after(d); }
    }
  }
  function syncLabel() { const el = $('#fp-sync'); if (el) el.textContent = STATUS[Cloud.status]; }
  const setStatus0 = Cloud.setStatus.bind(Cloud);
  Cloud.setStatus = function (s) { setStatus0(s); syncLabel(); };

  /* ---------- admin ---------- */
  let ad = { people: [], totals: {}, settings: null, usage: null, jobs: [] };
  const money = v => '$' + (Math.round((+v || 0) * 100) / 100).toFixed(2);
  const ago = t => { if (!t) return 'never'; const d = Math.round((Date.now() - t) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  ACT.adOpen = async () => {
    openSheet('<h2>FitPitt admin</h2><p class="fp-lede">Loading…</p>');
    try { const [p, s] = await Promise.all([call('GET', '/admin/people'), call('GET', '/admin/settings')]); ad.people = p.people; ad.totals = p.totals; ad.month = p.month; ad.settings = s.settings; adminSheet(); }
    catch (e) { openSheet('<h2>FitPitt admin</h2><p class="fp-err">' + esc(e.message) + '</p><div class="frm" style="margin-top:16px"><button class="btn link" data-act="closeSheet">Close</button></div>'); }
  };
  function adminSheet() {
    const s = ad.settings, t = ad.tasks || s.tasks;
    let h = '<h2>FitPitt admin</h2><p class="fp-lede">' + ad.month + ': ' + money(ad.totals.spent_usd) + ' of a ' + money(ad.totals.ceiling_usd) + ' ceiling. Anyone but you over ' + money(ad.totals.flag_usd) + ' is flagged.</p>';
    h += '<p class="fp-sub">People</p><ul class="list">' + ad.people.map(p => '<li><div class="l-top"><strong>' + esc(p.name) + (p.role !== 'member' ? ' <span class="fp-opt">' + p.role + '</span>' : '') + (p.disabled ? ' <span class="fp-opt">closed</span>' : '') + '</strong><span class="' + (p.month.flagged ? 'fp-flag' : 'small muted') + '">' + money(p.month.spent_usd) + (p.month.flagged ? ' flagged' : '') + '</span></div>' +
      '<div class="l-sub">' + p.month.calls + ' coach calls this month · last seen ' + ago(p.last_seen) + ' · last workout ' + ago(p.last_session) + ' · ' + p.devices + (p.devices === 1 ? ' phone' : ' phones') + (p.cap_usd != null ? ' · stop ' + money(p.cap_usd) : '') + '</div>' +
      '<div class="l-act" style="margin-top:6px"><button data-act="adInvite" data-id="' + p.id + '">Invite code</button><button data-act="adCap" data-id="' + p.id + '">Stop at…</button>' + (p.role !== 'admin' ? '<button data-act="adToggle" data-id="' + p.id + '" data-v="' + (p.disabled ? 0 : 1) + '">' + (p.disabled ? 'Reopen' : 'Close') + '</button>' : '') + '</div></li>').join('') + '</ul>';
    h += '<div class="frm" style="margin-top:12px"><div class="two"><label><span>New person\'s first name</span><input class="input" id="ad-name" type="text" maxlength="40" autocomplete="off"></label><label><span>Kind</span><select id="ad-role"><option value="member">Adult</option><option value="kid">Kid (volleyball)</option></select></label></div><button class="btn small" data-act="adAdd">Add and make an invite</button></div>';
    h += '<div id="ad-invite"></div>';
    const NICE = { 'claude-fable-5-1': 'Fable 5.1', 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
    const models = Object.keys(s.prices || {}), perK = m => (s.prices && s.prices[m] ? '$' + (s.prices[m].out / 1000).toFixed(2) : '?');
    const TASKS = [
      ['plan', 'Plan builds', 'Runs when someone taps Build my plan or Change my plan. The biggest job: the coach thinks through the whole plan, then writes it. A six-day plan is about 8,000 tokens on its own, plus the thinking before it. 40,000 is a safe allowance; 64,000 is the most the server allows.'],
      ['review', 'Weekly reviews', 'Runs when someone taps Review my week on the Progress tab: a few paragraphs on the week\'s log. 12,000 is plenty.'],
      ['ask', 'Questions', 'Runs when someone taps Ask the coach on Today or during a workout: a short answer, so medium effort keeps it quick. 6,000 is plenty.'],
    ];
    h += '<p class="fp-sub">Budget</p><div class="frm"><p class="small muted">Flag marks a person on the roster once their month passes the first amount. Stop makes the coach refuse them past the second (or their own stop, set with Stop at… on their row). Ceiling stops everyone once the month\'s total passes it. Admins are not stopped.</p>' +
      '<div class="two" style="margin-top:10px"><label><span>Flag over, $ a month</span><input class="input" id="ad-flag" type="text" inputmode="decimal" value="' + s.flag_usd + '"></label><label><span>Stop at, $ a month</span><input class="input" id="ad-stop" type="text" inputmode="decimal" value="' + s.stop_usd + '"></label><label><span>Ceiling for everyone, $</span><input class="input" id="ad-ceiling" type="text" inputmode="decimal" value="' + s.ceiling_usd + '"></label></div></div>';
    h += '<p class="fp-sub">The coach, task by task</p><div class="frm"><p class="small muted">Each task has its own model, effort (how long the model thinks before answering) and longest answer. Thinking counts toward the longest answer and is billed like written output; room that goes unused costs nothing.</p>' +
      TASKS.map(([k, name, what]) => '<div class="fp-task"><p class="fp-task-name">' + name + '</p><p class="small muted">' + what + '</p><div class="two" style="margin-top:8px"><label><span>Model</span><select id="ad-m-' + k + '">' +
        (models.includes(t[k].model) ? models : models.concat(t[k].model)).map(m => '<option value="' + esc(m) + '"' + (m === t[k].model ? ' selected' : '') + '>' + esc(NICE[m] || m) + '</option>').join('') + '</select></label>' +
        '<label><span>Effort</span><select id="ad-e-' + k + '">' + ['low', 'medium', 'high', 'xhigh', 'max'].map(e => '<option value="' + e + '"' + (e === t[k].effort ? ' selected' : '') + '>' + ({ low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' })[e] + '</option>').join('') + '</select></label></div>' +
        '<label style="display:block;margin-top:8px"><span>Longest answer, in output tokens (thinking included; 500 to 64,000; about ' + perK(t[k].model) + ' per 1,000 on this model)</span><input class="input" id="ad-t-' + k + '" type="text" inputmode="numeric" value="' + (t[k].max_tokens || '') + '"></label></div>').join('') +
      '<p class="small muted" style="margin-top:10px">One call gets about 13 minutes on the server. A very long answer at extra-high or max effort can run out of time before it finishes; if that happens the error says so.</p>' +
      '<button class="btn small" data-act="adSave">Save settings</button></div>';
    h += '<div class="frm" style="margin-top:18px"><button class="btn quiet wide" data-act="adJobs">Recent coach calls</button><button class="btn link" data-act="closeSheet">Close</button></div>';
    openSheet(h);
  }
  ACT.adAdd = async () => {
    const name = ($('#ad-name') ? $('#ad-name').value : '').trim(), role = $('#ad-role') ? $('#ad-role').value : 'member';
    if (!name) { toast('Type the name first.'); return; }
    try { const r = await call('POST', '/admin/people', { name, role, parent_id: role === 'kid' ? acct.person.id : undefined }); await refreshAdmin(); adminSheet(); showInvite(r.person, r.invite); } catch (e) { toast(e.message); }
  };
  ACT.adInvite = async t => { try { const r = await call('POST', '/admin/people/' + t.dataset.id + '/invite'); showInvite(ad.people.find(p => p.id === t.dataset.id), r.invite); } catch (e) { toast(e.message); } };
  function showInvite(person, inv) {
    const box = $('#ad-invite'); if (!box) return;
    box.innerHTML = '<div class="notice"><b>Invite for ' + esc(person.name) + ':</b> <span class="fp-code-big">' + esc(inv.code) + '</span><br><span class="small muted">Good for 14 days, up to 3 phones. On an iPhone they should add FitPitt to the Home Screen first, then type the code in the app.</span><br><button class="btn small" data-act="adShare" data-code="' + esc(inv.code) + '" data-link="' + esc(inv.link) + '" data-name="' + esc(person.name) + '">Send it</button> <button class="btn small quiet" data-act="adCopy" data-code="' + esc(inv.code) + '">Copy the code</button></div>';
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  ACT.adShare = t => {
    const text = 'Your FitPitt invite, ' + t.dataset.name + ': ' + t.dataset.code + '\nOpen ' + t.dataset.link + ' (on an iPhone, add FitPitt to your Home Screen first, then type the code under "I have an invite code").';
    if (navigator.share) { navigator.share({ title: 'FitPitt invite', text }).catch(() => { /* closed */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into a text.')); return; }
    textSheet('Invite', text);
  };
  ACT.adCopy = t => { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.dataset.code).then(() => toast('Code copied.')); else textSheet('Invite code', t.dataset.code); };
  ACT.adToggle = async t => { try { await call('PATCH', '/admin/people/' + t.dataset.id, { disabled: t.dataset.v === '1' }); await refreshAdmin(); adminSheet(); } catch (e) { toast(e.message); } };
  ACT.adCap = t => {
    const p = ad.people.find(x => x.id === t.dataset.id); if (!p) return;
    openSheet('<h2>Monthly stop for ' + esc(p.name) + '</h2><p class="fp-lede">The coach stops answering ' + esc(p.name) + ' past this amount in a month. Leave it empty for the usual stop' + (p.role === 'admin' ? ' (none for an admin)' : ' (' + money(ad.settings.stop_usd) + ')') + '.</p>' +
      '<input class="input" id="ad-capv" type="text" inputmode="decimal" value="' + (p.cap_usd == null ? '' : p.cap_usd) + '" placeholder="dollars" style="margin-top:12px"><div class="frm" style="margin-top:14px"><button class="btn primary" data-act="adCapSave" data-id="' + p.id + '">Save</button><button class="btn link" data-act="adBack">Back</button></div>');
  };
  ACT.adCapSave = async t => { const v = ($('#ad-capv') ? $('#ad-capv').value : '').trim(); const n = v === '' ? null : num(v); if (v !== '' && (n == null || n < 0)) { toast('Dollars, or leave it empty.'); return; } try { await call('PATCH', '/admin/people/' + t.dataset.id, { cap_usd: n }); await refreshAdmin(); adminSheet(); } catch (e) { toast(e.message); } };
  ACT.adBack = () => adminSheet();
  ACT.adSave = async () => {
    const g = id => num(($('#' + id) || {}).value || '');
    const patch = { flag_usd: g('ad-flag'), stop_usd: g('ad-stop'), ceiling_usd: g('ad-ceiling'), tasks: {} };
    for (const k of ['flag_usd', 'stop_usd', 'ceiling_usd']) if (patch[k] == null) { toast('Every amount needs a number.'); return; }
    for (const k of ['plan', 'review', 'ask']) {
      const mt = Math.round(num(($('#ad-t-' + k) || {}).value || ''));
      if (!(mt >= 500 && mt <= 64000)) { toast('Max output tokens: a number from 500 to 64000.'); return; }
      patch.tasks[k] = { model: ($('#ad-m-' + k) || {}).value, effort: ($('#ad-e-' + k) || {}).value, max_tokens: mt };
    }
    try { const r = await call('PUT', '/admin/settings', patch); ad.settings = r.settings; await refreshAdmin(); adminSheet(); toast('Saved.'); } catch (e) { toast(e.message); }
  };
  ACT.adJobs = async () => {
    try {
      const r = await call('GET', '/admin/jobs?limit=30');
      openSheet('<h2>Recent coach calls</h2><ul class="list">' + r.jobs.map(j => '<li><div class="l-top"><strong>' + esc(j.person_name || '?') + ' · ' + j.kind + '</strong><span class="small muted">' + money(j.cost_usd) + '</span></div><div class="l-sub">' + fmtDate(new Date(j.created), true) + ' · ' + j.status + (j.error ? ' · ' + esc(j.error) : '') + ' · ' + (j.model || '') + (j.effort ? ' ' + j.effort : '') + ' · ' + (j.tokens.in + j.tokens.cache_read + j.tokens.cache_write) + ' in, ' + j.tokens.out + ' out</div></li>').join('') + '</ul><div class="frm" style="margin-top:16px"><button class="btn link" data-act="adBack">Back</button></div>');
    } catch (e) { toast(e.message); }
  };
  async function refreshAdmin() { const p = await call('GET', '/admin/people'); ad.people = p.people; ad.totals = p.totals; ad.month = p.month; }

  /* ---------- look ---------- */
  const css = document.createElement('style');
  css.textContent = '.fp-wait{display:flex;align-items:center;gap:10px;margin-top:16px;font:700 28px/1 var(--fc);font-variant-numeric:tabular-nums}.fp-spin{width:22px;height:22px;border:3px solid var(--line);border-top-color:var(--day);border-radius:50%;animation:fpspin 1s linear infinite}@keyframes fpspin{to{transform:rotate(360deg)}}' +
    '.fp-answer{margin-top:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:10px;font-size:16px;line-height:1.5}.fp-answer p+p{margin-top:8px}.fp-answer.small{font-size:14px}' +
    '.fp-task{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.fp-task-name{font-weight:700}' +
    '.fp-flag{color:var(--alert);font-weight:600;font-size:14px}.fp-code-big{font:700 26px/1.2 var(--fc);letter-spacing:.08em}.fp-code-in{font:600 24px/1.2 var(--fc);letter-spacing:.1em;text-align:center}';
  document.head.appendChild(css);

  /* ---------- arriving ---------- */
  function fromLink() {
    const m = location.hash.match(/^#join=([A-Za-z0-9-]{8,9})$/); if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (acct) { toast('This phone is already signed in as ' + acct.person.name + '. Sign out in Settings to use a new invite.'); return; }
    if (navigator.standalone === false && /iPhone|iPad/.test(navigator.userAgent)) {
      openSheet('<h2>Your FitPitt invite</h2><p>Your code is <span class="fp-code-big">' + esc(m[1].toUpperCase()) + '</span>.</p><p style="margin-top:10px">On an iPhone, FitPitt works best from the Home Screen: tap Share, then <b>Add to Home Screen</b>, open it from there and tap <b>I have an invite code</b>. Or sign in right here in Safari.</p>' +
        '<div class="frm" style="margin-top:16px"><button class="btn primary" data-act="fpJoinHere" data-code="' + esc(m[1]) + '">Sign in here in Safari</button><button class="btn link" data-act="closeSheet">Close</button></div>');
      return;
    }
    join(m[1]).catch(e => { openSheet('<h2>Could not sign in</h2><p>' + esc(e.message) + '</p><div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="fpJoin">Type the code instead</button><button class="btn link" data-act="closeSheet">Close</button></div>'); });
  }
  ACT.fpJoinHere = t => { join(t.dataset.code).catch(e => toast(e.message)); };
  window.addEventListener('hashchange', fromLink);
  new MutationObserver(() => { accountCard(); buttons(); }).observe(app, { childList: true });
  new MutationObserver(fixSheet).observe($('#sheet .sheet-body'), { childList: true });
  if (!S.meta.program) render(); // the first screen gains the invite button
  accountCard(); buttons(); fixSheet();
  fromLink();
  if (signedIn()) { Cloud.init().then(checkJob); }
})();
