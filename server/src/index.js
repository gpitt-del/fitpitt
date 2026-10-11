// FitPitt API. Accounts are invite-only; each phone holds a device token; logs sync per person; the coach runs as jobs.
// Every response is JSON. Money is dollars. Times are milliseconds since 1970, as the app keeps them.
import { ensureSchema } from './schema.js';
import { getSettings, putSettings } from './settings.js';
import { now, month, id, token, inviteCode, normCode, sha256, sameString, HttpError, corsHeaders, json, readJson, str } from './util.js';
export { CoachJob } from './job.js';

const KINDS = new Set(['meta', 'active', 'session', 'scan', 'plan', 'intake']);
const JOB_KINDS = new Set(['plan', 'review', 'ask']);
const INVITE_DAYS = 14, SEEN_EVERY = 10 * 60 * 1000;

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      await ensureSchema(env);
      const res = await route(req, env, ctx);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('unhandled', e && e.stack || e);
      return json(Object.assign({ error: status === 500 ? 'Something went wrong on the server.' : e.message }, e.extra || {}), status, cors);
    }
  },
};

async function route(req, env, ctx) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/', m = req.method;
  if (path === '/' || path === '/health') return json({ ok: true, service: 'fitpitt-api', time: now() });

  // ---- open endpoints ----
  if (path === '/setup' && m === 'POST') return setup(req, env);
  if (path === '/join' && m === 'POST') return join(req, env);

  // ---- signed in ----
  const me = await auth(req, env, ctx);
  if (path === '/me' && m === 'GET') return whoami(env, me);
  if (path === '/sync' && m === 'POST') return sync(req, env, me);
  if (path === '/signout' && m === 'POST') { await env.DB.prepare('UPDATE devices SET revoked = 1 WHERE token_hash = ?').bind(me.tokenHash).run(); return json({ ok: true }); }
  if (path === '/coach/jobs' && m === 'POST') return createJob(req, env, me);
  if (path === '/coach/jobs' && m === 'GET') return listJobs(env, me, url);
  let mm = path.match(/^\/coach\/jobs\/([a-z0-9]+)$/);
  if (mm && m === 'GET') return getJob(env, me, mm[1]);

  // ---- admin ----
  if (path.startsWith('/admin/')) {
    if (me.role !== 'admin') throw new HttpError(403, 'Admins only.');
    if (path === '/admin/people' && m === 'GET') return listPeople(env, url);
    if (path === '/admin/people' && m === 'POST') return addPerson(req, env);
    mm = path.match(/^\/admin\/people\/([a-z0-9]+)$/); if (mm && m === 'PATCH') return patchPerson(req, env, mm[1], me);
    mm = path.match(/^\/admin\/people\/([a-z0-9]+)\/invite$/); if (mm && m === 'POST') return invite(env, mm[1]);
    if (path === '/admin/usage' && m === 'GET') return usage(env, url);
    if (path === '/admin/jobs' && m === 'GET') return adminJobs(env, url);
    if (path === '/admin/settings' && m === 'GET') return json({ settings: await getSettings(env) });
    if (path === '/admin/settings' && m === 'PUT') { try { return json({ settings: await putSettings(env, await readJson(req)) }); } catch (e) { throw new HttpError(400, e.message); } }
  }
  throw new HttpError(404, 'No such endpoint.');
}

/* ================= accounts ================= */
// First run: the setup key (a Worker secret) makes the admin and a device token for Gabe's phone. It also works
// later, to sign a new phone in as the admin, which is why it is a secret and not a one-time code.
async function setup(req, env) {
  const b = await readJson(req);
  if (!env.ADMIN_SETUP_KEY || !sameString(b.key, env.ADMIN_SETUP_KEY)) throw new HttpError(403, 'Wrong setup key.');
  let admin = await env.DB.prepare("SELECT * FROM people WHERE role = 'admin' ORDER BY created LIMIT 1").first();
  if (!admin) {
    admin = { id: id('p'), name: str(b.name, 40) || 'Gabe', role: 'admin', created: now() };
    await env.DB.prepare('INSERT INTO people (id, name, role, created) VALUES (?, ?, ?, ?)').bind(admin.id, admin.name, 'admin', admin.created).run();
  }
  const t = await newDevice(env, admin.id, str(b.device, 60) || 'setup');
  return json({ token: t, person: pub(admin) });
}
async function join(req, env) {
  const b = await readJson(req), code = normCode(b.code);
  if (code.length !== 9) throw new HttpError(400, 'The code is 8 letters and numbers, like ABCD-EFGH.');
  const h = await sha256(code), inv = await env.DB.prepare('SELECT * FROM invites WHERE code_hash = ?').bind(h).first();
  if (!inv) throw new HttpError(404, 'That code is not one of ours. Check it and try again.');
  if (inv.expires < now()) throw new HttpError(410, 'That code has expired. Ask for a new one.');
  if (inv.uses >= inv.max_uses) throw new HttpError(410, 'That code has been used up. Ask for a new one.');
  const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(inv.person_id).first();
  if (!person || person.disabled) throw new HttpError(403, 'This account is closed.');
  await env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code_hash = ?').bind(h).run();
  const t = await newDevice(env, person.id, str(b.device, 60) || 'phone');
  return json({ token: t, person: pub(person) });
}
async function newDevice(env, personId, label) {
  const t = token(), h = await sha256(t);
  await env.DB.prepare('INSERT INTO devices (token_hash, person_id, created, last_seen, label) VALUES (?, ?, ?, ?, ?)').bind(h, personId, now(), now(), label).run();
  return t;
}
async function auth(req, env, ctx) {
  const a = req.headers.get('Authorization') || '', t = a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  if (!t) throw new HttpError(401, 'Sign in first.', { code: 'signed_out' });
  const h = await sha256(t);
  const row = await env.DB.prepare('SELECT d.token_hash, d.last_seen AS d_seen, p.* FROM devices d JOIN people p ON p.id = d.person_id WHERE d.token_hash = ? AND d.revoked = 0').bind(h).first();
  if (!row) throw new HttpError(401, 'This phone is signed out. Ask for a new invite code.', { code: 'signed_out' });
  if (row.disabled) throw new HttpError(403, 'This account is closed.', { code: 'disabled' });
  if (!row.d_seen || now() - row.d_seen > SEEN_EVERY) ctx.waitUntil(env.DB.batch([
    env.DB.prepare('UPDATE devices SET last_seen = ? WHERE token_hash = ?').bind(now(), h),
    env.DB.prepare('UPDATE people SET last_seen = ? WHERE id = ?').bind(now(), row.id),
  ]));
  return { id: row.id, name: row.name, role: row.role, parent_id: row.parent_id, cap_usd: row.cap_usd, tokenHash: h };
}
const pub = p => ({ id: p.id, name: p.name, role: p.role });

async function whoami(env, me) {
  const s = await getSettings(env), spent = await monthCost(env, me.id);
  return json({ person: pub(me), month: month(), spent_usd: round(spent), stop_usd: stopFor(me, s), flag_usd: s.flag_usd });
}

/* ================= sync ================= */
// The phone sends what changed since its last sync and gets back everything newer than it has. The newer stamp wins.
async function sync(req, env, me) {
  const b = await readJson(req, 4_000_000), since = Math.max(0, +b.since || 0), docs = Array.isArray(b.docs) ? b.docs.slice(0, 500) : [];
  const stmts = [], acks = [];
  for (const d of docs) {
    if (!d || !KINDS.has(d.kind) || typeof d.id !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(d.id)) continue;
    const u = Math.round(+d.u || 0); if (!u) continue;
    const body = d.deleted ? '{}' : JSON.stringify(d.body == null ? {} : d.body);
    if (body.length > 400_000) continue;
    stmts.push(env.DB.prepare('INSERT INTO docs (person_id, kind, id, u, deleted, body) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(person_id, kind, id) DO UPDATE SET u = excluded.u, deleted = excluded.deleted, body = excluded.body WHERE excluded.u > docs.u')
      .bind(me.id, d.kind, d.id, u, d.deleted ? 1 : 0, body));
    acks.push({ kind: d.kind, id: d.id, u });
  }
  if (stmts.length) await env.DB.batch(stmts);
  const rows = await env.DB.prepare('SELECT kind, id, u, deleted, body FROM docs WHERE person_id = ? AND u > ? ORDER BY u LIMIT 2000').bind(me.id, since).all();
  const out = (rows.results || []).map(r => ({ kind: r.kind, id: r.id, u: r.u, deleted: !!r.deleted, body: r.deleted ? null : safeParse(r.body) }));
  return json({ now: now(), docs: out, acks, more: out.length === 2000 });
}
const safeParse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

/* ================= coach jobs ================= */
async function createJob(req, env, me) {
  const b = await readJson(req, 300_000), kind = b.kind;
  if (!JOB_KINDS.has(kind)) throw new HttpError(400, 'Job kind must be plan, review or ask.');
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'The coach is not set up yet (no API key on the server).');
  const s = await getSettings(env);
  const spent = await monthCost(env, me.id), stop = stopFor(me, s);
  if (stop != null && spent >= stop) throw new HttpError(402, 'Your coach budget for this month is used up ($' + round(spent) + ' of $' + stop + '). Ask Gabe to raise it.', { code: 'cap' });
  const all = await monthCost(env, null);
  if (s.ceiling_usd && all >= s.ceiling_usd) throw new HttpError(402, "The coach's monthly budget for everyone is used up. Ask Gabe.", { code: 'ceiling' });
  const open = await env.DB.prepare("SELECT id, created FROM jobs WHERE person_id = ? AND status IN ('queued', 'running') ORDER BY created DESC LIMIT 1").bind(me.id).first();
  if (open && now() - open.created < 20 * 60 * 1000) return json({ job: await jobRow(env, open.id), reused: true }, 202);
  const input = {};
  if (kind === 'plan') { input.intake = str(b.intake, 4000); if (!input.intake) throw new HttpError(400, 'Send the intake answers.'); input.note = str(b.note, 1000); }
  if (kind === 'review') { input.log = String(b.log || '').slice(0, 14000); if (!input.log.trim()) throw new HttpError(400, 'Send the log to review.'); }
  if (kind === 'ask') { input.question = str(b.question, 1000); if (!input.question) throw new HttpError(400, 'Ask a question.'); input.context = String(b.context || '').slice(0, 4000); }
  if (kind !== 'ask' && b.log && kind === 'plan') input.log = String(b.log).slice(0, 12000);
  if (b.currentPlan && typeof b.currentPlan === 'object') input.currentPlan = b.currentPlan;
  const jid = id('j');
  await env.DB.prepare('INSERT INTO jobs (id, person_id, kind, status, created, input) VALUES (?, ?, ?, ?, ?, ?)').bind(jid, me.id, kind, 'queued', now(), JSON.stringify(input)).run();
  const stub = env.JOBS.get(env.JOBS.idFromName(jid));
  await stub.fetch('https://job/start', { method: 'POST', body: JSON.stringify({ jobId: jid }) });
  return json({ job: await jobRow(env, jid) }, 202);
}
async function getJob(env, me, jid) {
  const j = await jobRow(env, jid);
  if (!j || j.person_id !== me.id) throw new HttpError(404, 'No such job.');
  return json({ job: j });
}
async function listJobs(env, me, url) {
  const n = Math.min(50, Math.max(1, +url.searchParams.get('limit') || 10));
  const rows = await env.DB.prepare('SELECT * FROM jobs WHERE person_id = ? ORDER BY created DESC LIMIT ?').bind(me.id, n).all();
  return json({ jobs: (rows.results || []).map(view) });
}
async function jobRow(env, jid) { const r = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(jid).first(); return r ? view(r) : null; }
function view(r) {
  return { id: r.id, person_id: r.person_id, kind: r.kind, status: r.status, created: r.created, started: r.started, finished: r.finished, attempts: r.attempts, model: r.model, effort: r.effort,
    output: r.status === 'done' ? safeParse(r.output) : null, error: r.status === 'failed' ? r.error : (r.status === 'queued' && r.error ? r.error : null), cost_usd: round(r.cost_usd), tokens: { in: r.in_tokens, out: r.out_tokens, cache_read: r.cache_read, cache_write: r.cache_write } };
}
async function monthCost(env, personId) {
  const start = Date.parse(month() + '-01T00:00:00Z');
  const r = personId
    ? await env.DB.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM jobs WHERE person_id = ? AND created >= ?').bind(personId, start).first()
    : await env.DB.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM jobs WHERE created >= ?').bind(start).first();
  return +(r && r.c) || 0;
}
const stopFor = (p, s) => p.cap_usd != null ? p.cap_usd : (p.role === 'admin' ? null : s.stop_usd);
const round = v => Math.round((+v || 0) * 10000) / 10000;

/* ================= admin ================= */
async function listPeople(env, url) {
  const s = await getSettings(env), start = Date.parse(month() + '-01T00:00:00Z');
  const rows = await env.DB.prepare(`SELECT p.*, (SELECT COALESCE(SUM(cost_usd), 0) FROM jobs j WHERE j.person_id = p.id AND j.created >= ?) AS spent,
    (SELECT COUNT(*) FROM jobs j WHERE j.person_id = p.id AND j.created >= ?) AS calls,
    (SELECT MAX(u) FROM docs d WHERE d.person_id = p.id AND d.kind = 'session') AS last_session,
    (SELECT COUNT(*) FROM devices d WHERE d.person_id = p.id AND d.revoked = 0) AS devices FROM people p ORDER BY p.created`).bind(start, start).all();
  const people = (rows.results || []).map(p => ({ id: p.id, name: p.name, role: p.role, parent_id: p.parent_id, created: p.created, last_seen: p.last_seen, disabled: !!p.disabled, cap_usd: p.cap_usd, note: p.note,
    devices: p.devices, last_session: p.last_session, month: { spent_usd: round(p.spent), calls: p.calls, flagged: p.role !== 'admin' && p.spent > s.flag_usd, stop_usd: stopFor(p, s) } }));
  return json({ month: month(), people, totals: { spent_usd: round(people.reduce((a, p) => a + p.month.spent_usd, 0)), ceiling_usd: s.ceiling_usd, flag_usd: s.flag_usd } });
}
async function addPerson(req, env) {
  const b = await readJson(req), name = str(b.name, 40), role = ['member', 'kid', 'admin'].includes(b.role) ? b.role : 'member';
  if (!name) throw new HttpError(400, 'Give the person a name.');
  const p = { id: id('p'), name, role, parent_id: role === 'kid' ? str(b.parent_id, 40) || null : null, created: now(), note: str(b.note, 200) || null };
  await env.DB.prepare('INSERT INTO people (id, name, role, parent_id, created, note) VALUES (?, ?, ?, ?, ?, ?)').bind(p.id, p.name, p.role, p.parent_id, p.created, p.note).run();
  const inv = await makeInvite(env, p.id);
  return json({ person: p, invite: inv }, 201);
}
async function patchPerson(req, env, pid, me) {
  const b = await readJson(req), p = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(pid).first();
  if (!p) throw new HttpError(404, 'No such person.');
  const sets = [], vals = [];
  if ('name' in b) { const n = str(b.name, 40); if (!n) throw new HttpError(400, 'A name is needed.'); sets.push('name = ?'); vals.push(n); }
  if ('disabled' in b) { if (pid === me.id && b.disabled) throw new HttpError(400, 'You cannot close your own account.'); sets.push('disabled = ?'); vals.push(b.disabled ? 1 : 0); }
  if ('cap_usd' in b) { const v = b.cap_usd == null ? null : +b.cap_usd; if (v != null && !(v >= 0)) throw new HttpError(400, 'The cap must be dollars, 0 or more, or empty for the usual stop.'); sets.push('cap_usd = ?'); vals.push(v); }
  if ('note' in b) { sets.push('note = ?'); vals.push(str(b.note, 200) || null); }
  if ('role' in b && ['member', 'kid', 'admin'].includes(b.role)) { if (pid === me.id && b.role !== 'admin') throw new HttpError(400, 'You cannot take admin from yourself.'); sets.push('role = ?'); vals.push(b.role); }
  if (b.signOutAll) await env.DB.prepare('UPDATE devices SET revoked = 1 WHERE person_id = ?').bind(pid).run();
  if (sets.length) await env.DB.prepare('UPDATE people SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals, pid).run();
  return json({ person: await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(pid).first() });
}
async function invite(env, pid) {
  const p = await env.DB.prepare('SELECT id, disabled FROM people WHERE id = ?').bind(pid).first();
  if (!p) throw new HttpError(404, 'No such person.');
  if (p.disabled) throw new HttpError(400, 'This account is closed. Reopen it first.');
  return json({ invite: await makeInvite(env, pid) });
}
async function makeInvite(env, pid) {
  const code = inviteCode(), expires = now() + INVITE_DAYS * 864e5;
  await env.DB.prepare('INSERT INTO invites (code_hash, person_id, created, expires) VALUES (?, ?, ?, ?)').bind(await sha256(code), pid, now(), expires).run();
  const site = String(env.SITE_URL || '').replace(/index\.html$/, '');
  return { code, link: site + '#join=' + code, expires, max_uses: 3 };
}
async function usage(env, url) {
  const mo = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : month();
  const start = Date.parse(mo + '-01T00:00:00Z'), end = Date.parse((mo.slice(5) === '12' ? (+mo.slice(0, 4) + 1) + '-01' : mo.slice(0, 5) + String(+mo.slice(5) + 1).padStart(2, '0')) + '-01T00:00:00Z');
  const s = await getSettings(env);
  const byPerson = await env.DB.prepare(`SELECT p.id, p.name, p.role, COUNT(j.id) AS calls, COALESCE(SUM(j.cost_usd), 0) AS spent, SUM(j.in_tokens) AS in_tokens, SUM(j.out_tokens) AS out_tokens
    FROM people p LEFT JOIN jobs j ON j.person_id = p.id AND j.created >= ? AND j.created < ? GROUP BY p.id ORDER BY spent DESC`).bind(start, end).all();
  const byModel = await env.DB.prepare('SELECT model, kind, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS spent FROM jobs WHERE created >= ? AND created < ? GROUP BY model, kind ORDER BY spent DESC').bind(start, end).all();
  const people = (byPerson.results || []).map(r => ({ id: r.id, name: r.name, role: r.role, calls: r.calls, spent_usd: round(r.spent), in_tokens: r.in_tokens || 0, out_tokens: r.out_tokens || 0, flagged: r.role !== 'admin' && r.spent > s.flag_usd }));
  return json({ month: mo, people, models: (byModel.results || []).map(r => ({ model: r.model, kind: r.kind, calls: r.calls, spent_usd: round(r.spent) })), total_usd: round(people.reduce((a, p) => a + p.spent_usd, 0)), flag_usd: s.flag_usd, stop_usd: s.stop_usd, ceiling_usd: s.ceiling_usd });
}
async function adminJobs(env, url) {
  const n = Math.min(100, Math.max(1, +url.searchParams.get('limit') || 30));
  const rows = await env.DB.prepare('SELECT j.*, p.name AS person_name FROM jobs j LEFT JOIN people p ON p.id = j.person_id ORDER BY j.created DESC LIMIT ?').bind(n).all();
  return json({ jobs: (rows.results || []).map(r => Object.assign(view(r), { person_name: r.person_name, output: undefined })) });
}
