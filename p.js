'use strict';
/* ================= Accounts, sync and the coach (standalone site only) =================
   Talks to the FitPitt API (server/ in this repo, on Cloudflare). Signing in is by an invite code from Gabe, typed in
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
  const F = window.FP_PLAN, UI = window.FP_UI, ADMIN = 'Gabe';
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
    acct = null; saveAcct(); Cloud.db = null; Cloud.uid = null; Cloud.setStatus('local');
    try { localStorage.removeItem(SYNC_KEY); localStorage.removeItem(JOB_KEY); } catch (e) { /* ignore */ }
    requestRender();
  }
  async function join(code) {
    const label = /iPhone|iPad/.test(navigator.userAgent) ? (navigator.standalone ? 'iPhone app' : 'iPhone Safari') : /Android/.test(navigator.userAgent) ? 'Android' : 'browser';
    const r = await call('POST', '/join', { code, device: label }, { noAuth: true });
    acct = { token: r.token, person: r.person, api }; saveAcct();
    try { localStorage.removeItem(SYNC_KEY); } catch (e) { /* ignore */ }
    await Cloud.init();
    closeSheet(); render();
    toast('Signed in as ' + r.person.name + '. Your log now saves to your account.');
  }

  /* ---------- sync: the base app's Cloud object, pointed at the server ---------- */
  // Keys the base app uses: 'meta', 'active', 'sessions/<id>', 'scans/<id>'. This file adds 'plan/current' and 'intake/current'.
  const KIND = { meta: 'meta', active: 'active', sessions: 'session', scans: 'scan', plan: 'plan', intake: 'intake' };
  let state = { since: 0, pushed: 0 };
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
    const sent = [];
    try {
      const docs = [];
      for (const [key, data] of this.q.entries()) { const d = docOf(key, data); if (d) { docs.push(d); sent.push([key, data]); } }
      const r = await call('POST', '/sync', { since: state.since || 0, docs }, opts);
      sent.forEach(([key, data]) => { if (this.q.get(key) === data) this.q.delete(key); }); // not anything queued meanwhile
      let maxU = state.pushed || 0; r.acks.forEach(a => { if (a.u > maxU) maxU = a.u; });
      state.pushed = maxU;
      const changed = apply(r.docs);
      state.since = r.now; saveState();
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
      if (planDoc.deleted) { if (cur && (cur.at || 0) < planDoc.u) { F.forget(); if (S.meta.program === 'mine') S.meta.program = null; changed = true; } }
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
  const store0 = (plan, code, at) => { try { localStorage.setItem(F.KEY, JSON.stringify({ plan, code: code || '', at: at || Date.now() })); return true; } catch (e) { return false; } };
  const fstore = F.store;
  // "Use this plan" reloads the page right after storing, so the plan is sent at once, with keepalive to outlive the reload.
  F.store = function (plan, code) { const ok = fstore(plan, code); if (ok && Cloud.db) { const at = (F.read() || {}).at || Date.now(); Cloud.q.set('plan/current', { plan, code: code || '', u: at }); Cloud.flush().catch(() => { /* it goes on the next start */ }); } return ok; };
  const fforget = F.forget;
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
    if (j.kind === 'plan' && o.plan) { closeSheet(); UI.previewPlan(o.plan, o.code, o.notes); toast(KIND_WORDS.plan[1]); return; }
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
  const busy = e => { if (e && e.status === 402) { openSheet('<h2>Budget used up</h2><p>' + esc(e.message) + '</p><div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="closeSheet">Close</button></div>'); return; } toast(e && e.message ? e.message : 'Could not reach the coach.'); };

  // Build my plan: the intake sheet's button, when signed in.
  const send0 = ACT.fpSendIntake;
  ACT.fpSendIntake = () => {
    if (!signedIn()) { send0(); return; }
    const d = UI.collectIntake(); if (!d) return;
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
    openSheet('<h2>Sign in with an invite</h2><p class="fp-lede">' + ADMIN + ' sends an 8-character code. Type it here, or open the link he sent.</p>' +
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
      const r = await call('POST', '/setup', { key, name: ADMIN, device: 'admin phone' }, { noAuth: true });
      acct = { token: r.token, person: r.person, api }; saveAcct();
      try { localStorage.removeItem(SYNC_KEY); } catch (e) { /* ignore */ }
      await Cloud.init(); closeSheet(); render(); toast('Signed in as ' + r.person.name + ', admin.');
    } catch (e) { const el = $('#fp-setup-err'); if (el) el.textContent = e.message; }
  };
  ACT.fpJoinSend = () => {
    const code = ($('#fp-join') ? $('#fp-join').value : '').trim();
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { const el = $('#fp-join-err'); if (el) el.textContent = 'The code is 8 letters and numbers.'; return; }
    join(code).catch(e => { const el = $('#fp-join-err'); if (el) el.textContent = e.message; });
  };
  ACT.fpSignOut = () => { confirmSheet('Sign out on this phone?', 'Your log stays on this phone and in your account. Sign in again with a new invite code from ' + ADMIN + '.', 'fpSignOutNow', 'Sign out'); };
  ACT.fpSignOutNow = () => { signOut(true); closeSheet(); toast('Signed out.'); };

  function accountCard() {
    if (tab !== 'settings' || !S.meta.program || $('#fp-acct')) return;
    const anchor = $('#fp-set') || app.querySelector('.setting'); if (!anchor) return;
    const el = document.createElement('div'); el.className = 'setting'; el.id = 'fp-acct';
    el.innerHTML = signedIn()
      ? '<span class="s-l">Your account</span><p>Signed in as <b>' + esc(acct.person.name) + '</b>' + (isAdmin() ? ' (admin)' : '') + '. Your log saves to your account, so another phone you sign in on shows the same log. <span id="fp-sync">' + esc(STATUS[Cloud.status]) + '</span></p>' +
        '<div class="stack" style="margin-top:10px">' + (isAdmin() ? '<button class="btn quiet wide" data-act="adOpen">FitPitt admin: people, invites, costs</button>' : '') + '<button class="btn quiet wide" data-act="fpSignOut">Sign out on this phone</button></div>'
      : '<span class="s-l">Your account</span><p>With an invite from ' + ADMIN + ', the coach builds your plan, reviews your weeks and answers questions, and your log is saved to your account.</p><div class="stack" style="margin-top:10px"><button class="btn quiet wide" data-act="fpJoin">I have an invite code</button></div>';
    anchor.after(el);
    // The base app's "Your data" text assumed a different kind of account.
    if (signedIn()) app.querySelectorAll('.setting p').forEach(p => { if (/Claude login|saved on this device only/.test(p.textContent)) p.textContent = 'Saved to your FitPitt account and on this phone. A backup file is still a good idea now and then.'; });
  }
  // Wording on the first screen and the intake once the coach is there.
  const chooser0 = viewChooser;
  viewChooser = function () {
    let h = chooser0();
    if (signedIn()) h = h.replace('Two minutes of questions. ' + ADMIN + ' sends back a plan built around the exercises you already do.', 'Two minutes of questions, then the coach builds a plan around the exercises you already do.');
    else h = h.replace('<p class="fp-sub">Ready-made plans</p>', '<div class="pick" style="margin-top:10px"><button data-act="fpJoin"><strong>I have an invite code</strong><span>Sign in to use the coach and save your log to your account.</span></button></div><p class="fp-sub">Ready-made plans</p>');
    return h;
  };
  function fixSheet() {
    const body = $('#sheet:not([hidden]) .sheet-body'); if (!body) return;
    const h2 = body.querySelector('h2'); if (!h2) return;
    if (h2.textContent === 'Get a plan built for you' && signedIn()) {
      const lede = body.querySelector('.fp-lede'); if (lede && !lede.dataset.fp) { lede.dataset.fp = '1'; lede.textContent = 'The coach builds a plan around the exercises you already do. Answer these, then tap Build my plan.'; }
      const b = body.querySelector('[data-act="fpSendIntake"]'); if (b && b.textContent !== 'Build my plan') b.textContent = 'Build my plan';
    }
  }
  function buttons() {
    if (!signedIn()) return;
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
    h += '<p class="fp-sub">Budget and models</p><div class="frm"><div class="two"><label><span>Flag over, $ a month</span><input class="input" id="ad-flag" type="text" inputmode="decimal" value="' + s.flag_usd + '"></label><label><span>Stop at, $ a month</span><input class="input" id="ad-stop" type="text" inputmode="decimal" value="' + s.stop_usd + '"></label><label><span>Ceiling for everyone, $</span><input class="input" id="ad-ceiling" type="text" inputmode="decimal" value="' + s.ceiling_usd + '"></label></div>' +
      ['plan', 'review', 'ask'].map(k => '<div class="two"><label><span>' + { plan: 'Plan builds', review: 'Weekly reviews', ask: 'Questions' }[k] + ': model</span><input class="input" id="ad-m-' + k + '" type="text" value="' + esc(t[k].model) + '" autocapitalize="off" spellcheck="false"></label><label><span>Effort</span><select id="ad-e-' + k + '">' + ['low', 'medium', 'high', 'xhigh', 'max'].map(e => '<option' + (e === t[k].effort ? ' selected' : '') + '>' + e + '</option>').join('') + '</select></label></div>').join('') +
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
    ['plan', 'review', 'ask'].forEach(k => { patch.tasks[k] = { model: ($('#ad-m-' + k) || {}).value, effort: ($('#ad-e-' + k) || {}).value }; });
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
    '.fp-flag{color:var(--alert);font-weight:600;font-size:14px}.fp-code-big{font:700 26px/1.2 var(--fc);letter-spacing:.08em}.fp-code-in{font:600 24px/1.2 var(--fc);letter-spacing:.1em;text-align:center}';
  document.head.appendChild(css);

  /* ---------- arriving ---------- */
  function fromLink() {
    const m = location.hash.match(/^#join=([A-Za-z0-9-]{8,9})$/); if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
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
