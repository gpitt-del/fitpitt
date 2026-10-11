// A stand-in for the Claude API, for tests. Answers like the Messages API: a plan through the submit_plan tool, or text.
// Behaviour switches on the question text or an env var so tests can drive failures:
//   question contains "fail529"  -> 529 overloaded once, then success (checks the retry)
//   question contains "refuse"   -> 400 error
//   SLOW_MS                      -> delay every answer
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'tools', 'sample-plan.json'), 'utf8'));
let failed529 = false;
export const calls = [];

// Fill every field the strict schema wants, as the real model would.
function fullPlan(p, name) {
  const ex = e => ({ name: Array.isArray(e.name) ? e.name : [e.name], g: e.g, sets: e.sets, reps: Array.isArray(e.reps) ? e.reps : [e.reps, e.reps], rest: e.rest === 'long' ? 'long' : 'short', cue: e.cue || '', drop: !!e.drop, partials: !!e.partials, bw: !!e.bw, hold: !!e.hold, per: e.per || '' });
  return { fitpitt: 1, name: (name || 'Friend') + "'s plan", for: name || 'Friend', made: new Date().toISOString().slice(0, 10), goal: p.goal || '', line: p.line || '', perWeek: p.perWeek || p.days.length, measure: 'body', effort: p.effort || '', deload: '', rules: p.rules || [], days: p.days.map(d => ({ name: d.name, short: d.short || '', ex: d.ex.map(ex) })) };
}

export function start(port = 0) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        const reply = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.url !== '/v1/messages' || req.method !== 'POST') return reply(404, { error: { message: 'not found' } });
        if (req.headers['x-api-key'] !== 'test-key') return reply(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
        let b; try { b = JSON.parse(body); } catch (e) { return reply(400, { error: { message: 'bad json' } }); }
        calls.push(b);
        const text = JSON.stringify(b.messages);
        if (process.env.SLOW_MS) await new Promise(r => setTimeout(r, +process.env.SLOW_MS));
        if (text.includes('fail529') && !failed529) { failed529 = true; return reply(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }); }
        if (text.includes('refuse')) return reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'refused by the stand-in' } });
        const usage = { input_tokens: 2600, output_tokens: b.tools ? 2200 : 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 2000 };
        if (b.tools && b.tools.some(t => t.name === 'submit_plan')) {
          const nameM = text.match(/Name: ([A-Za-z]+)/), name = nameM ? nameM[1] : 'Friend';
          const last = b.messages[b.messages.length - 1];
          const isFix = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
          let plan = fullPlan(sample, name);
          if (text.includes('badplan') && !isFix) plan = Object.assign({}, plan, { name: '' }); // first try broken, fixed on the second
          if (text.includes('hopeless')) plan = Object.assign({}, plan, { days: [] });
          return reply(200, { id: 'msg_test', type: 'message', role: 'assistant', model: b.model, stop_reason: 'tool_use', usage,
            content: [{ type: 'text', text: 'Here is the plan.' }, { type: 'tool_use', id: 'toolu_1', name: 'submit_plan', input: plan }] });
        }
        const kind = text.includes('Review this week') ? 'review' : 'ask';
        const answer = kind === 'review' ? 'Good week: three of four sessions done. Next week keep the bench at 135 and get all three sets to 10, then it goes to 140. Sleep notes say two short nights; keep the deload as planned.'
          : 'Keep the weight the same and add a rep per set this week. Rest 2 minutes on the big lifts.';
        return reply(200, { id: 'msg_test', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', usage, content: [{ type: 'text', text: answer }] });
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve({ server: srv, port: srv.address().port, calls }));
  });
}

if (process.argv[1] && process.argv[1].endsWith('mock-anthropic.mjs')) start(+process.env.PORT || 8790).then(({ port }) => console.log('mock anthropic on', port));
