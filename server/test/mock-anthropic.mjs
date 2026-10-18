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
  const ex = e => ({ name: Array.isArray(e.name) ? e.name : [e.name], g: e.g, sets: e.sets, reps: Array.isArray(e.reps) ? e.reps : [e.reps, e.reps], rest: e.rest === 'long' ? 'long' : 'short', cue: e.cue || '', rp: e.rp === true, drop: !!e.drop, partials: !!e.partials, bw: !!e.bw, hold: !!e.hold, per: e.per || '' });
  return { fitpitt: 1, name: (name || 'Friend') + "'s plan", for: name || 'Friend', made: new Date().toISOString().slice(0, 10), goal: p.goal || '', line: p.line || '', perWeek: p.perWeek || p.days.length, measure: 'body', effort: p.effort || '', deload: '', rules: p.rules || [], days: p.days.map(d => ({ name: d.name, short: d.short || '', warmup: d.warmup || [], ex: d.ex.map(ex) })) };
}

export function start(port = 0) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        const reply = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        // A finished message, sent the way the API streams it when the request asked for a stream: thinking first
        // (a thinking block with a signature, as adaptive thinking produces), then text and tool blocks in small deltas.
        const send = (b, m) => {
          if (!b.stream) return reply(200, m);
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const ev = (name, d) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(Object.assign({ type: name }, d)) + '\n\n');
          const u = m.usage;
          ev('message_start', { message: { id: m.id, type: 'message', role: 'assistant', model: m.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: u.input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens, cache_read_input_tokens: u.cache_read_input_tokens, output_tokens: 1 } } });
          const content = [{ type: 'thinking', thinking: 'Working out the split from the answers.', signature: 'sig_test' }, ...m.content];
          content.forEach((c, i) => {
            if (c.type === 'thinking') { ev('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '' } }); ev('content_block_delta', { index: i, delta: { type: 'thinking_delta', thinking: c.thinking } }); ev('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: c.signature } }); }
            else if (c.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); for (const part of c.text.match(/.{1,7}/g) || []) ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } }); }
            else if (c.type === 'tool_use') { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: c.id, name: c.name, input: {} } }); for (const part of JSON.stringify(c.input).match(/[\s\S]{1,40}/g) || []) ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: part } }); }
            ev('ping', {});
            ev('content_block_stop', { index: i });
          });
          ev('message_delta', { delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: u.output_tokens } });
          ev('message_stop', {});
          res.end();
        };
        if (req.url === '/__calls' && req.method === 'GET') return reply(200, { calls }); // what the coach was told, for tests
        if (req.url !== '/v1/messages' || req.method !== 'POST') return reply(404, { error: { message: 'not found' } });
        if (req.headers['x-api-key'] !== 'test-key') return reply(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
        let b; try { b = JSON.parse(body); } catch (e) { return reply(400, { error: { message: 'bad json' } }); }
        calls.push(b);
        const text = JSON.stringify(b.messages);
        if (process.env.SLOW_MS) await new Promise(r => setTimeout(r, +process.env.SLOW_MS));
        if (text.includes('fail529') && !failed529) { failed529 = true; return reply(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }); }
        if (text.includes('refuse')) return reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'refused by the stand-in' } });
        if (text.includes('stall') && b.stream) { // starts answering, then never finishes: the caller's time limit has to cut it off
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const ev = (name, d) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(Object.assign({ type: name }, d)) + '\n\n');
          ev('message_start', { message: { id: 'msg_stall', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2600, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 1 } } });
          ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } });
          ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'x'.repeat(700) } });
          return; // the connection stays open until the client gives up
        }
        const usage = { input_tokens: 2600, output_tokens: b.tools ? 2200 : 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 2000 };
        if (b.tools && b.tools.some(t => t.name === 'submit_plan')) {
          const nameM = text.match(/Name: ([A-Za-z]+)/), name = nameM ? nameM[1] : 'Friend';
          const last = b.messages[b.messages.length - 1];
          const isFix = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
          let plan = fullPlan(sample, name);
          if (text.includes('badplan') && !isFix) plan = Object.assign({}, plan, { name: '' }); // first try broken, fixed on the second
          if (text.includes('hopeless')) plan = Object.assign({}, plan, { days: [] });
          if (text.includes('capped') && b.stream) { // ran out of output: the tool JSON stops mid-way and stop_reason is max_tokens
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            const ev = (name, d) => res.write('event: ' + name + '\ndata: ' + JSON.stringify(Object.assign({ type: name }, d)) + '\n\n');
            ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2600, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 1 } } });
            ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } }); ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'Still thinking…' } }); ev('content_block_stop', { index: 0 });
            ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'submit_plan', input: {} } }); ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(plan).slice(0, 120) } }); ev('content_block_stop', { index: 1 });
            ev('message_delta', { delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 24000 } }); ev('message_stop', {});
            return res.end();
          }
          return send(b, { id: 'msg_test', type: 'message', role: 'assistant', model: b.model, stop_reason: 'tool_use', usage,
            content: [{ type: 'text', text: 'Here is the plan.' }, { type: 'tool_use', id: 'toolu_1', name: 'submit_plan', input: plan }] });
        }
        const kind = text.includes('Review this week') ? 'review' : 'ask';
        const answer = kind === 'review' ? 'Good week: three of four sessions done. Next week keep the bench at 135 and get all three sets to 10, then it goes to 140. Sleep notes say two short nights; keep the deload as planned.'
          : 'Keep the weight the same and add a rep per set this week. Rest 2 minutes on the big lifts.';
        return send(b, { id: 'msg_test', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', usage, content: [{ type: 'text', text: answer }] });
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve({ server: srv, port: srv.address().port, calls }));
  });
}

if (process.argv[1] && process.argv[1].endsWith('mock-anthropic.mjs')) start(+process.env.PORT || 8790).then(({ port }) => console.log('mock anthropic on', port));
