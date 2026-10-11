// One Durable Object per coach job. The API creates the job row, then pokes this object, which sets an alarm for
// right now. The alarm handler does the slow part (a Fable plan build can take minutes) with no phone attached:
// a Worker request would be cut off 30 seconds after the phone disconnected, an alarm may run for 15 minutes.
// Every reply from the model is kept in this object's storage, so if the platform retries the alarm, or a database
// write fails after the model answered, the run picks up where it was instead of paying for the answer again.
// Tokens and cost are recorded whether the job ends well or badly.
import { runJob, sumUsage, costOf } from './coach.js';
import { getSettings } from './settings.js';
import { ensureSchema } from './schema.js';

const MAX_ATTEMPTS = 3, ALARM_BUDGET = 14 * 60 * 1000; // the platform allows 15 minutes per alarm

export class CoachJob {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/start' && req.method === 'POST') {
      const { jobId } = await req.json();
      if (await this.state.storage.get('jobId')) return new Response('already started'); // a second poke must not run it twice
      await this.state.storage.put('jobId', jobId);
      await this.state.storage.setAlarm(Date.now());
      return new Response('queued');
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    const env = this.env, st = this.state.storage, jobId = await st.get('jobId');
    if (!jobId) return;
    await ensureSchema(env);
    const deadline = Date.now() + ALARM_BUDGET;
    // A finished run whose database write failed last time: only the write is retried.
    const kept = await st.get('result');
    if (kept) { await this.finish(jobId, kept); return; }
    const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.status === 'done' || job.status === 'failed') { await st.deleteAll(); return; }
    const attempt = (job.attempts || 0) + 1;
    await env.DB.prepare('UPDATE jobs SET status = ?, started = COALESCE(started, ?), attempts = ? WHERE id = ?').bind('running', Date.now(), attempt, jobId).run();
    const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(job.person_id).first();
    const settings = await getSettings(env);
    const model = (settings.tasks[job.kind] || settings.tasks.ask).model;
    const memo = { get: n => st.get('reply:' + n), set: (n, r) => st.put('reply:' + n, r) };
    let result;
    try {
      const r = await runJob(env, job, person || { name: '' }, settings, memo, deadline);
      await this.bill(jobId, r.usages, r.model, settings);
      result = { status: 'done', model: r.model, effort: r.effort, output: r.output };
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 500);
      try { await this.bill(jobId, e && e.usages, model, settings); } catch (e2) { console.error('billing failed', e2); }
      if (e && e.retryable && attempt < MAX_ATTEMPTS) {
        await env.DB.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?').bind('queued', 'Trying again: ' + msg, jobId).run().catch(() => { /* the next alarm sets it */ });
        await st.setAlarm(Date.now() + 20000 * attempt); // 20 s, then 40 s
        return;
      }
      result = { status: 'failed', error: msg };
    }
    await st.put('result', result);
    await this.finish(jobId, result);
  }

  // Tokens and cost for the replies not yet billed. Each reply is billed once, in the order it was kept.
  async bill(jobId, usages, model, settings) {
    const n = (await this.state.storage.get('billed')) || 0, fresh = (usages || []).slice(n);
    if (!fresh.length) return;
    const u = sumUsage(fresh), cost = fresh.reduce((a, x) => a + costOf(settings.prices, model, x), 0);
    await this.env.DB.prepare('UPDATE jobs SET model = ?, in_tokens = in_tokens + ?, out_tokens = out_tokens + ?, cache_read = cache_read + ?, cache_write = cache_write + ?, cost_usd = cost_usd + ? WHERE id = ?')
      .bind(model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, cost, jobId).run();
    await this.state.storage.put('billed', n + fresh.length);
  }

  async finish(jobId, result) {
    try {
      if (result.status === 'done') await this.env.DB.prepare('UPDATE jobs SET status = ?, finished = ?, model = ?, effort = ?, output = ?, error = NULL WHERE id = ?').bind('done', Date.now(), result.model, result.effort, JSON.stringify(result.output), jobId).run();
      else await this.env.DB.prepare('UPDATE jobs SET status = ?, finished = ?, error = ? WHERE id = ?').bind('failed', Date.now(), result.error, jobId).run();
      await this.state.storage.deleteAll(); // done with this object
    } catch (e) {
      await this.state.storage.setAlarm(Date.now() + 15000); // the database was unhappy; write again shortly, no model call involved
    }
  }
}
