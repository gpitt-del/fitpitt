// End-to-end checks of the API against a local Worker (wrangler dev) and the stand-in Claude API.
//   cd server && npm install && node test/run.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { start as startMock } from './mock-anthropic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
const results = [];
const ok = (name, cond, detail) => { results.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '  ::  ' + JSON.stringify(detail).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const mock = await startMock(0);
const port = await freePort();
const SETUP = 'setup-secret-for-tests';
fs.writeFileSync(path.join(root, '.dev.vars'), `ANTHROPIC_API_KEY=test-key\nANTHROPIC_BASE_URL=http://127.0.0.1:${mock.port}\nADMIN_SETUP_KEY=${SETUP}\n`);
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'fitpitt-d1-'));
const wr = spawn(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--local', '--port', String(port), '--persist-to', persist, '--var', 'ALLOWED_ORIGINS:http://localhost,http://127.0.0.1,https://gpitt-del.github.io', '--var', 'SITE_URL:http://localhost:9999/'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = ''; wr.stdout.on('data', d => { wlog += d; }); wr.stderr.on('data', d => { wlog += d; });
const API = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { const r = await fetch(API + '/health'); if (r.ok) break; } catch (e) { /* not up yet */ } await sleep(500); }

async function call(method, p, body, token, headers = {}) {
  const r = await fetch(API + p, { method, headers: Object.assign({ 'content-type': 'application/json', origin: 'http://localhost:9999' }, token ? { authorization: 'Bearer ' + token } : {}, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
  return { status: r.status, data, headers: r.headers };
}
async function waitJob(token, id, timeout = 30000) {
  const t0 = Date.now();
  for (;;) { const r = await call('GET', '/coach/jobs/' + id, undefined, token); if (r.data.job && (r.data.job.status === 'done' || r.data.job.status === 'failed')) return r.data.job; if (Date.now() - t0 > timeout) return r.data.job; await sleep(300); }
}

try {
  // ---- health and CORS ----
  let r = await call('GET', '/health');
  ok('health', r.status === 200 && r.data.ok);
  const pre = await fetch(API + '/sync', { method: 'OPTIONS', headers: { origin: 'https://gpitt-del.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  ok('preflight from the live app is allowed', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://gpitt-del.github.io');
  const bad = await fetch(API + '/health', { headers: { origin: 'https://evil.example' } });
  ok('other origins get no CORS header', !bad.headers.get('access-control-allow-origin'));

  // ---- setup ----
  r = await call('POST', '/setup', { key: 'wrong', name: 'Gabe' });
  ok('setup refuses a wrong key', r.status === 403);
  r = await call('POST', '/setup', { key: SETUP, name: 'Gabe', device: 'test' });
  ok('setup makes the admin', r.status === 200 && r.data.person.role === 'admin' && r.data.token.length > 30, r.data);
  const gabe = r.data.token;
  r = await call('POST', '/setup', { key: SETUP, name: 'Someone else' });
  ok('setup again signs in the same admin, no second admin', r.data.person.name === 'Gabe');
  r = await call('GET', '/me', undefined, gabe);
  ok('/me for the admin: no stop', r.status === 200 && r.data.stop_usd === null && r.data.spent_usd === 0, r.data);
  r = await call('GET', '/me');
  ok('no token: 401 signed_out', r.status === 401 && r.data.code === 'signed_out');

  // ---- people and invites ----
  r = await call('POST', '/admin/people', { name: 'Mike' }, gabe);
  ok('admin adds Mike and gets an invite', r.status === 201 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.data.invite.code) && r.data.invite.link.endsWith('#join=' + r.data.invite.code), r.data);
  const mikeId = r.data.person.id, code = r.data.invite.code;
  r = await call('POST', '/join', { code: 'ZZZZ-ZZZZ' });
  ok('a wrong code is refused', r.status === 404);
  r = await call('POST', '/join', { code, check: true });
  ok('a check-only join names the person without spending a use', r.status === 200 && r.data.person.name === 'Mike' && !r.data.token, r.data);
  r = await call('POST', '/join', { code: code.toLowerCase().replace('-', ' '), device: 'iPhone' });
  ok('the code works typed loosely', r.status === 200 && r.data.person.name === 'Mike', r.data);
  const mike = r.data.token;
  r = await call('POST', '/join', { code, device: 'Safari' }); const mike2 = r.data.token;
  r = await call('POST', '/join', { code, device: 'iPad' });
  ok('three uses allowed', r.status === 200);
  r = await call('POST', '/join', { code });
  ok('a fourth use is refused', r.status === 410, r.data);
  r = await call('GET', '/admin/people', undefined, mike);
  ok('a member cannot use admin endpoints', r.status === 403);
  r = await call('GET', '/me', undefined, mike);
  ok('/me for Mike: $20 stop, $5 flag', r.data.stop_usd === 20 && r.data.flag_usd === 5, r.data);

  // ---- sync ----
  const t1 = Date.now();
  r = await call('POST', '/sync', { since: 0, docs: [
    { kind: 'meta', id: 'meta', u: t1, body: { program: 'mine', startDate: '2026-10-12' } },
    { kind: 'session', id: 's1', u: t1, body: { id: 's1', day: 'A', ex: [] } },
    { kind: 'scan', id: 'b1', u: t1, body: { id: 'b1', weight: 200 } },
    { kind: 'bogus', id: 'x', u: t1, body: {} },
  ] }, mike);
  ok('push from phone 1', r.status === 200 && r.data.acks.length === 3 && r.data.docs.length === 3 && r.data.cursor > 0, r.data);
  const cur1 = r.data.cursor;
  r = await call('POST', '/sync', { since: 0, docs: [] }, mike2);
  ok('phone 2 pulls everything', r.data.docs.length === 3 && r.data.docs.find(d => d.kind === 'meta').body.program === 'mine');
  r = await call('POST', '/sync', { since: 0, docs: [{ kind: 'session', id: 's1', u: t1 - 1000, body: { id: 's1', day: 'OLD' } }] }, mike2);
  ok('an older copy does not overwrite', r.data.docs.find(d => d.id === 's1').body.day === 'A');
  r = await call('POST', '/sync', { since: 0, docs: [{ kind: 'session', id: 's1', u: t1 + 1000, deleted: true }] }, mike2);
  ok('a deletion wins with a newer stamp', r.data.docs.find(d => d.id === 's1').deleted === true);
  r = await call('POST', '/sync', { since: cur1, docs: [] }, mike);
  ok('phone 1 asks for changes since its cursor and gets only the deletion', r.data.docs.length === 1 && r.data.docs[0].deleted);
  const cur2 = r.data.cursor;
  // A workout logged offline hours ago and pushed now carries an old stamp but must still reach the other phone.
  r = await call('POST', '/sync', { since: 0, docs: [{ kind: 'session', id: 'offline1', u: t1 - 3600000, body: { id: 'offline1', day: 'B' } }] }, mike2);
  r = await call('POST', '/sync', { since: cur2, docs: [] }, mike);
  ok('an old-stamped doc pushed later still arrives on the other phone', r.data.docs.length === 1 && r.data.docs[0].id === 'offline1', r.data);

  r = await call('POST', '/sync', { since: 0, docs: [] }, gabe);
  ok("the admin's sync never shows Mike's docs", r.data.docs.length === 0);

  // ---- coach ----
  r = await call('POST', '/coach/jobs', { kind: 'nope' }, mike);
  ok('unknown job kind refused', r.status === 400);
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'FitPitt plan request\nName: Mike\nGoal: Build muscle\nDays a week: 4' }, mike);
  ok('plan job accepted', r.status === 202 && r.data.job.status === 'queued', r.data);
  let job = await waitJob(mike, r.data.job.id);
  ok('plan job finishes with a checked plan and a code', job.status === 'done' && job.output.plan && job.output.plan.name === "Mike's plan" && job.output.code.startsWith('FP1.') && job.output.plan.days.length === 4, job);
  ok('plan job costs money and records tokens', job.cost_usd > 0.1 && job.tokens.in === 2600 && job.model === 'claude-fable-5-1' && job.effort === 'high', job);
  const firstReq = mock.calls[mock.calls.length - 1];
  ok('a first build is told to skip the log review and keep notes short', /do not review it/.test(firstReq.messages[0].content) && /120 words/.test(firstReq.messages[0].content) && firstReq.max_tokens === 40000);
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike', currentPlan: job.output.plan, note: 'Swap leg press for hack squat', log: 'FitPitt log: leg press skipped twice' }, mike);
  job = await waitJob(mike, r.data.job.id);
  const changeReq = mock.calls[mock.calls.length - 1];
  ok('a change starts from the current plan, uses the log and carries the note', job.status === 'done' && /^Change Mike's plan/.test(changeReq.messages[0].content) && /What they want changed: Swap leg press/.test(changeReq.messages[0].content) && /leg press skipped twice/.test(changeReq.messages[0].content) && job.output.text === 'Here is the plan.', changeReq.messages[0].content.slice(0, 200));
  const planCost = job.cost_usd;
  const n0 = mock.calls.length;
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike badplan' }, mike);
  job = await waitJob(mike, r.data.job.id);
  ok('a broken first plan is sent back once and fixed', job.status === 'done' && mock.calls.length - n0 === 2 && job.cost_usd > planCost, { status: job.status, calls: mock.calls.length - n0 });
  const fixCall = mock.calls[mock.calls.length - 1];
  ok('the fix request carries the tool result with the errors', JSON.stringify(fixCall.messages).includes('The plan was rejected'));
  const prior = fixCall.messages[1];
  ok('calls are streamed, and the repair round hands back the whole assistant turn, thinking block and signature included',
    fixCall.stream === true && prior.role === 'assistant' && prior.content[0].type === 'thinking' && prior.content[0].signature === 'sig_test' && prior.content.some(c => c.type === 'tool_use' && c.input && c.input.days), prior.content.map(c => c.type));
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike capped' }, mike);
  job = await waitJob(mike, r.data.job.id);
  ok('a plan cut off by the output cap says so, with the number', job.status === 'failed' && /ran out of room/.test(job.error) && /40000 output tokens/.test(job.error), job.error);
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike hopeless' }, mike);
  job = await waitJob(mike, r.data.job.id);
  ok('a plan that cannot be fixed fails with a reason', job.status === 'failed' && /could not fix/.test(job.error), job);
  ok('a failed job is still billed for its two calls', job.cost_usd > planCost && job.tokens.in === 5200, job);
  process.env.SLOW_MS = '2500'; // the stand-in answers slowly for a moment, so the job is still running when the next requests arrive
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike' }, mike); const pj = r.data.job.id;
  r = await call('POST', '/coach/jobs', { kind: 'ask', question: 'Hi?' }, mike);
  ok('a second request of another kind while one runs is refused plainly', r.status === 409 && r.data.code === 'busy' && /still working on your plan/.test(r.data.error), r.data);
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'Name: Mike' }, mike);
  ok('the same kind again is handed the running job', r.status === 202 && r.data.reused === true && r.data.job.id === pj);
  await waitJob(mike, pj);
  const burst = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/coach/jobs', { kind: 'ask', question: 'burst' }, mike)));
  ok('four taps at once make one job', new Set(burst.map(x => x.data.job && x.data.job.id)).size === 1 && burst.every(x => x.status === 202), burst.map(x => x.status));
  await waitJob(mike, burst[0].data.job.id);
  delete process.env.SLOW_MS;
  r = await call('POST', '/coach/jobs', { kind: 'review', log: 'FitPitt log fail529 ...' }, mike);
  job = await waitJob(mike, r.data.job.id, 60000);
  ok('an overloaded API is retried and the review arrives', job.status === 'done' && job.attempts === 2 && /Good week/.test(job.output.text), job);
  r = await call('POST', '/coach/jobs', { kind: 'ask', question: 'Should I add weight?', context: 'Day A' }, mike);
  job = await waitJob(mike, r.data.job.id);
  ok('a question gets a text answer on medium effort', job.status === 'done' && /Keep the weight/.test(job.output.text) && job.effort === 'medium', job);
  const askReq = mock.calls[mock.calls.length - 1];
  ok('requests use adaptive thinking (no thinking field), effort in output_config, cached system prompt', !('thinking' in askReq) && askReq.output_config.effort === 'medium' && askReq.system[0].cache_control.type === 'ephemeral');
  ok("an adult's prompt has no youth rules", !askReq.system[0].text.includes('under 18 and trains for a sport'));
  ok('the coach may answer supplement, hormone and medical questions as information, never with "I\'m not a doctor"', /Supplements \(creatine/.test(askReq.system[0].text) && /information, not medical advice/.test(askReq.system[0].text) && /do not refuse/.test(askReq.system[0].text) && !/Training only\. Never give/.test(askReq.system[0].text));
  r = await call('POST', '/admin/people', { name: 'Anderson', role: 'kid' }, gabe);
  const kidInv = r.data.invite.code;
  r = await call('POST', '/join', { code: kidInv, device: 'kid phone' });
  const kid = r.data.token;
  r = await call('POST', '/coach/jobs', { kind: 'plan', intake: 'FitPitt plan request for a kid (under 18): sport-focused, youth rules apply.\nName: Anderson\nAge: 13. Sex: girl\nSport and position: Volleyball, setter' }, kid);
  job = await waitJob(kid, r.data.job.id);
  const kidReq = mock.calls[mock.calls.length - 1];
  ok("a kid's plan is built with the youth rules in the system prompt", job.status === 'done' && kidReq.system[0].text.includes('under 18 and trains for a sport') && kidReq.system[0].text.includes('Max efforts are allowed'), job.status);
  ok("a kid's coach keeps nutrition to food, protein, hydration and sleep", /question for their parents/.test(kidReq.system[0].text));
  r = await call('POST', '/coach/jobs', { kind: 'ask', question: 'please refuse this', context: '' }, mike);
  job = await waitJob(mike, r.data.job.id);
  ok('an API refusal fails cleanly without retries', job.status === 'failed' && job.attempts === 1 && /refused by the stand-in/.test(job.error), job);
  r = await call('GET', '/coach/jobs?limit=3', undefined, mike);
  ok('a person can list their recent jobs', r.data.jobs.length === 3 && r.data.jobs.every(j => j.person_id === mikeId));
  { // a call cut off by the time limit is still billed for what had arrived (the API bills those tokens)
    const { callClaude } = await import('../src/coach.js');
    const env = { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + mock.port };
    let err = null; const t0 = Date.now();
    try { await callClaude(env, { model: 'claude-fable-5-1', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'stall' }] }, 30000); } catch (e) { err = e; }
    ok('a stalled stream is cut off at the time limit and carries an estimate of what was billed', err && /too long/.test(err.message) && err.retryable === false && err.partialUsage && err.partialUsage.input_tokens === 2600 && err.partialUsage.output_tokens >= 200 && Date.now() - t0 >= 29000, err && (err.message + ' ' + JSON.stringify(err.partialUsage)));
  }
  r = await call('GET', '/coach/jobs/' + job.id, undefined, gabe);
  ok("another person cannot read Mike's job", r.status === 404);

  // ---- caps and flags ----
  r = await call('GET', '/admin/people', undefined, gabe);
  const mikeRow = r.data.people.find(p => p.id === mikeId);
  ok('admin roster shows Mike\'s month, not yet flagged at $5', mikeRow.month.spent_usd > 0 && mikeRow.month.spent_usd < 5 && mikeRow.month.flagged === false && mikeRow.devices === 3, mikeRow);
  r = await call('PUT', '/admin/settings', { flag_usd: 0.01 }, gabe);
  ok('settings update', r.status === 200 && r.data.settings.flag_usd === 0.01);
  r = await call('GET', '/admin/usage', undefined, gabe);
  ok('usage flags Mike once the flag is lowered', r.data.people.find(p => p.id === mikeId).flagged === true && r.data.total_usd > 0 && r.data.models.length >= 1, r.data);
  r = await call('PATCH', '/admin/people/' + mikeId, { cap_usd: 0.05 }, gabe);
  ok('a personal cap is set', r.data.person.cap_usd === 0.05);
  r = await call('POST', '/coach/jobs', { kind: 'ask', question: 'More?' }, mike);
  ok('past the cap, the coach refuses with a plain message', r.status === 402 && r.data.code === 'cap' && /used up/.test(r.data.error), r.data);
  r = await call('PATCH', '/admin/people/' + mikeId, { cap_usd: null }, gabe);
  r = await call('PUT', '/admin/settings', { ceiling_usd: 0.01 }, gabe);
  r = await call('POST', '/coach/jobs', { kind: 'ask', question: 'More?' }, gabe);
  ok('the global ceiling stops everyone, admin included', r.status === 402 && r.data.code === 'ceiling');
  r = await call('PUT', '/admin/settings', { tasks: { ask: { model: 'claude-mystery-9' } } }, gabe);
  ok('a task model with no price is refused', r.status === 400 && /No price/.test(r.data.error), r.data);
  r = await call('PUT', '/admin/settings', { ceiling_usd: 150, flag_usd: 5, tasks: { ask: { effort: 'low', model: 'claude-opus-5-5' } } }, gabe);
  ok('task model and effort can be changed', r.data.settings.tasks.ask.model === 'claude-opus-5-5' && r.data.settings.tasks.ask.effort === 'low' && r.data.settings.tasks.plan.model === 'claude-fable-5-1');
  r = await call('PUT', '/admin/settings', { stop_usd: -1 }, gabe);
  ok('a bad setting is refused', r.status === 400);
  r = await call('GET', '/admin/jobs?limit=5', undefined, gabe);
  ok('admin sees recent jobs with names but not outputs', r.data.jobs.length === 5 && r.data.jobs[0].person_name === 'Mike' && r.data.jobs[0].output === undefined);

  // ---- closing an account, signing out ----
  r = await call('POST', '/signout', undefined, mike2);
  r = await call('GET', '/me', undefined, mike2);
  ok('a signed-out phone is signed out', r.status === 401);
  r = await call('GET', '/me', undefined, mike);
  ok('the other phone still works', r.status === 200);
  r = await call('PATCH', '/admin/people/' + mikeId, { disabled: true }, gabe);
  r = await call('GET', '/me', undefined, mike);
  ok('a closed account is refused', r.status === 403 && r.data.code === 'disabled');
  r = await call('POST', '/admin/people/' + mikeId + '/invite', undefined, gabe);
  ok('no invite for a closed account', r.status === 400);
  r = await call('PATCH', '/admin/people/' + mikeId, { disabled: false }, gabe);
  r = await call('POST', '/admin/people/' + mikeId + '/invite', undefined, gabe);
  ok('a fresh invite for a reopened account', r.status === 200 && r.data.invite.code);
  const joins = await Promise.all([1, 2, 3, 4, 5, 6].map(() => call('POST', '/join', { code: r.data.invite.code })));
  ok('six phones at once on a 3-use code: exactly three get in', joins.filter(x => x.status === 200).length === 3, joins.map(x => x.status));
  r = await call('PATCH', '/admin/people/' + r.data.invite.code, { disabled: true }, gabe);
  ok('unknown person: 404', r.status === 404);
  const me = await call('GET', '/me', undefined, gabe);
  r = await call('PATCH', '/admin/people/' + me.data.person.id, { disabled: true }, gabe);
  ok('the admin cannot close his own account', r.status === 400);
} catch (e) {
  console.error('TEST CRASH', e);
  results.push(['crash', false]);
} finally {
  wr.kill('SIGTERM'); mock.server.close();
  await sleep(300);
  try { fs.rmSync(persist, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
const failed = results.filter(r => !r[1]);
console.log('\n%d checks, %d failed', results.length, failed.length);
if (failed.length) { console.log('FAILED:', failed.map(f => f[0])); console.log('--- wrangler log tail ---\n' + wlog.slice(-3000)); process.exit(1); }
