// One Durable Object per coach job. The API creates the job row, then pokes this object, which sets an alarm for
// right now. The alarm handler does the slow part (a Fable plan build can take minutes) with no phone attached:
// a Worker request would be cut off 30 seconds after the phone disconnected, an alarm may run for 15 minutes.
import { runJob, sumUsage, costOf } from './coach.js';
import { getSettings } from './settings.js';
import { ensureSchema } from './schema.js';

const MAX_ATTEMPTS = 3;

export class CoachJob {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/start' && req.method === 'POST') {
      const { jobId } = await req.json();
      await this.state.storage.put('jobId', jobId);
      await this.state.storage.setAlarm(Date.now());
      return new Response('queued');
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    const env = this.env, jobId = await this.state.storage.get('jobId');
    if (!jobId) return;
    await ensureSchema(env);
    const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job || job.status === 'done' || job.status === 'failed') return;
    const attempt = (job.attempts || 0) + 1;
    await env.DB.prepare('UPDATE jobs SET status = ?, started = COALESCE(started, ?), attempts = ? WHERE id = ?').bind('running', Date.now(), attempt, jobId).run();
    const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(job.person_id).first();
    const settings = await getSettings(env);
    try {
      const r = await runJob(env, job, person || { name: '' }, settings);
      const u = sumUsage(r.usages), cost = r.usages.reduce((a, x) => a + costOf(settings.prices, r.model, x), 0);
      await env.DB.prepare('UPDATE jobs SET status = ?, finished = ?, model = ?, effort = ?, output = ?, error = NULL, in_tokens = ?, out_tokens = ?, cache_read = ?, cache_write = ?, cost_usd = ? WHERE id = ?')
        .bind('done', Date.now(), r.model, r.effort, JSON.stringify(r.output), u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, cost, jobId).run();
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 500);
      if (e && e.retryable && attempt < MAX_ATTEMPTS) {
        await env.DB.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?').bind('queued', 'Trying again: ' + msg, jobId).run();
        await this.state.storage.setAlarm(Date.now() + 20000 * attempt); // 20 s, then 40 s
        return;
      }
      await env.DB.prepare('UPDATE jobs SET status = ?, finished = ?, error = ? WHERE id = ?').bind('failed', Date.now(), msg, jobId).run();
    }
    // Nothing more to do: a thrown error here would make the platform retry, and that could bill the person twice.
  }
}
