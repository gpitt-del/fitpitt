// The coach: turns a person's answers into a plan, reviews a week, answers questions. Calls the Claude API.
// What it may and may not say is fixed here, not in the app. Plans are checked by plan.js before anyone sees them.
import { check, encode, tidy, PLAN_SCHEMA, GROUP_NAMES } from './plan.js';
import { costOf } from './settings.js';

const API_VERSION = '2023-06-01';

// Names the app has photos, a sketch and steps for. Other names work but only get a web search for pictures.
const CATALOGUE = [
  'Flat DB press', 'DB bench press', 'Barbell bench press', 'Machine chest press', 'Incline DB press, 30°', 'Incline DB press, 45°', 'Incline DB press', 'Incline Smith press', 'Incline machine press',
  'Incline cable fly', 'Pec deck', 'Seated cable fly', 'Weighted dips', 'Push-up', 'Push-up, 3-second lower', 'Push-up, feet elevated', 'Push-up, hands on a bench',
  'Overhead cable triceps extension', 'Single-arm overhead cable extension', 'EZ-bar lying extension, behind the head', 'Rope pushdown', 'Straight-bar pushdown', 'Cross-body cable extension',
  'Incline DB curl', 'Preacher curl', 'Cross-body hammer curl', 'Rope hammer curl', 'Reverse EZ-bar curl', 'DB curl', 'Cable curl', 'Bayesian cable curl',
  'DB lateral raise', 'Cable lateral raise', 'Machine lateral raise', 'Weighted pull-up', 'Weighted neutral-grip pull-up', 'Weighted chin-up', 'Assisted pull-up',
  'Seated cable row', 'Chest-supported row', 'Single-arm DB row', 'Wide-grip lat pulldown', 'Lat pulldown', 'Neutral-grip lat pulldown', 'Single-arm cable pulldown', 'Straight-arm pulldown', 'Cable pullover',
  'Standing military press', 'Seated DB shoulder press', 'Machine shoulder press', 'Face pull', 'Reverse pec deck', 'Cable rear-delt fly', 'Band pull-apart', 'DB shrug', 'Barbell shrug',
  'Hack squat', 'Leg press', 'High-bar back squat', 'Smith squat', 'Goblet squat', 'Goblet squat, 3-second lower', 'DB front squat',
  'Romanian deadlift', 'Barbell Romanian deadlift', 'DB Romanian deadlift', 'Kettlebell deadlift', '45° back extension, weighted', '45° back extension', 'Cable pull-through',
  'Bulgarian split squat', 'Walking lunge', 'Reverse lunge', 'Split squat', 'Lateral lunge', 'Step-up', 'Hip thrust', 'Machine hip thrust', 'Barbell glute bridge', 'Glute bridge',
  'Seated leg curl', 'Lying leg curl', 'Leg extension', 'Single-leg leg extension', 'Standing calf raise', 'Leg-press calf raise', 'Single-leg calf raise', 'Single-leg calf raise, 3-second lower',
  'Adductor machine', 'Abductor machine', 'Cable crunch', 'Machine crunch', 'Hanging leg raise', "Captain's chair leg raise", 'Side plank', 'Dead bug', 'Pallof press hold',
];

const WHO = `You are the coach inside FitPitt, a small workout-log app a family and their friends use. You cover training, cardio, nutrition, recovery and sleep, and the everyday health questions that come with them.

Hard rules, in this order:
1. Answer the question. People here know you are an AI, not a doctor; do not refuse or hedge with "I'm not a doctor". Supplements (creatine, protein, caffeine, vitamin D, electrolytes, fish oil and the rest), hormones, medications and medical topics are fair questions: give what the evidence says, typical amounts, cautions and interactions, and when a clinician is the right next step. When the topic is a drug, a hormone or a medical condition, add one short line that this is information, not medical advice. Never diagnose, and never tell someone to change a prescribed dose: that is between them and their clinician.
2. Pain is a stop sign. Sharp pain, joint pain, numbness or anything that gets worse with training: tell the person to stop that movement and get it checked. Work around a reported injury rather than through it.
3. Be concrete and brief. Numbers, sets, reps, loads, grams, specific exercises. No pep talk, no filler, no headings in answers under 150 words.
4. Never invent facts about the person. Use only what is in the message.
5. Plain language. A friend, not a textbook. Say when evidence is weak or mixed.`;

const PLAN_GUIDE = `How FitPitt runs a plan (the app does all of this; do not restate it in the plan):
- A 52-week year in 7 blocks (7, 7, 7, 7, 8, 8, 8 weeks). The last week of each block is a deload (half the sets, same loads) and a body-scan week.
- Days run in order A, B, C... whatever the weekday. perWeek sets the weekly target.
- Weight targets: when every set hits the top of the rep range the weight goes up next week (2.5 lb under 20 lb, 5 lb under 100 lb, about 4% above). At most one step a week; the first week is a baseline. Too heavy for the range drops about 10%.
- Each exercise can have up to 3 names: blocks 1/4/7 use the first, 2/5 the second, 3/6 the third. One name keeps the lift the same all year. Put the person's favourite first.
- Logging, deloads, pain and weekly-step rules are added by the app; do not repeat them in "rules".

How to write a plan:
- Build it around the exercises they already do and like. Swap only for an injury, missing equipment or a gap.
- Fit their days and session length: about 3.25 minutes per set on long rest, 2 minutes on short rest, so 60 minutes holds roughly 18 to 24 sets.
- Split by days a week: 2, full body; 3, full body for beginners or push/pull/legs for the experienced; 4, upper/lower; 5 or 6, push/pull/legs or an upper/lower/body-part mix. Keep every muscle at twice a week where the volume allows (frequency is a tiebreaker once weekly volume is set).
- Only equipment they have.
- Volume: beginners about 6 to 10 hard sets per muscle per week; experienced 10 to 20. Spread a muscle over two or more days where it fits.
- Reps: 6 to 10 or 8 to 12 for big compound lifts, 10 to 15 or 12 to 20 for isolation. Holds (planks) use seconds with "hold": true.
- rest: "long" for presses, rows, squats, hinges, leg press; "short" for the rest.
- cue: one line of form only (position, path, what to feel, what to avoid). No weights, no rep counts, no "start at", no set structure: the app works the load out from the log and shows the cue beside it as "Form:", so a number in a cue contradicts the app.
- effort text: beginners stop 2 or 3 reps short; experienced leave 1 or 2 on early sets and take the last set to failure.
- warmup, for every day: 3 to 6 short lines (up to 90 characters each) that the app shows at the top of that workout. A few minutes easy (bike, row, walk), then movement prep for what the day trains (hips, hinges and leg swings before legs; arm circles, band pull-aparts and push-ups before pressing; balance, hip and hamstring work and soft landings before jumps), then two light ramp-up sets of the first exercise. Written for the day, not the same lines every day.
- rules: up to 8 short lines, each starting with a **bold lead**. Put injury work-arounds here (e.g. "**Look after the left shoulder.** No overhead pressing.").
- Prefer exercise names from this catalogue, spelled exactly (the app shows photos and a sketch for them):
${CATALOGUE.join(' · ')}
- Field limits: name 40 characters, goal 120, line 140, day name 30, short 18, exercise name 60, cue 160, rules 300 each, warm-up lines 90 each and 6 a day. Sets 1 to 8. perWeek 1 to 7. Up to 6 days, 14 exercises a day.
- Fill every field of submit_plan. Use "" for a text field you have nothing for, false for a flag you do not want, "" for per when it does not apply.`;

// Kids (the `kid` role) get the youth rules on top. Positions: Lloyd et al. 2014 international consensus on youth
// resistance training; the AAP's 2020 statement. Supervised maximal testing is fine in youth once technique is solid,
// so competitions on jumps, throws and sprints are in; what stays out is maxing a lift they have not learned yet.
const YOUTH = `This person is under 18 and trains for a sport. Youth rules, on top of everything above:
- The plan serves their sport: strength, jumping, landing, sprinting and change of direction, shoulder and trunk work for throwing or hitting sports. Fit it around practices and games; nothing hard the day before a game, and in season two sessions a week is enough.
- Technique before load. Bodyweight, dumbbells, goblet and split-squat patterns first; barbell lifts only once the pattern is clean and with an adult present. Loads that leave 2 or more reps in reserve on working sets.
- Max efforts are allowed: jump, throw and sprint tests any time (they compete on these), and heavy lifts with good technique and an adult present. On a lift they have done for under a month, test a 3- to 5-rep max rather than a single.
- Jumping and landing: teach the landing first (quiet, knees over toes, hips back); low volume (about 40 to 80 ground contacts a session), two days between jump sessions, and warm-ups that include balance, hip and hamstring work and landing or cutting drills, which cut knee injuries in adolescent athletes, especially girls.
- Growth: during a growth spurt or with aching knees or heels, ease the jumping and the loads and say so. Pain stays a stop sign.
- Sessions of 20 to 45 minutes; keep the exercise list short and name the sport purpose of each day in its name.
- With a kid, nutrition stays with food, protein, hydration and sleep. No supplement, hormone or medication talk beyond that: say it is a question for their parents.`;

export function systemFor(kind, person) {
  const kid = person && person.role === 'kid';
  const text = (kind === 'plan' ? WHO + '\n\n' + PLAN_GUIDE : WHO) + (kid ? '\n\n' + YOUTH : '');
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

const lim = (s, n) => String(s == null ? '' : s).slice(0, n);
export function userMessageFor(kind, input, person) {
  const name = person.name || 'the person';
  if (kind === 'plan') {
    const today = 'Today is ' + new Date().toISOString().slice(0, 10) + '.';
    const change = !!(input.currentPlan || input.note);
    const lines = change
      // A change to a plan they are already on: the log is the point here.
      ? ['Change ' + name + "'s plan. Start from their current plan and keep what works; keep exercise names where the lift stays the same, because history follows the name. Use the log to see what they actually do and skip and how loads and reps are going, make the changes they asked for, and fix anything the log shows is not working. Then call submit_plan with the whole new plan. Add up to 150 words of notes to " + name + ' on what changed and why; the app shows them with the plan. ' + today, '', lim(input.intake, 6000)]
      // A first build: no review of how they train (that is Review my week), or the plan never gets written.
      : ['Build a FitPitt plan for ' + name + ' from these answers and call submit_plan with it. If a log is included, use it only for the exercises they do and their current loads; do not review it or comment on how they train, that is a separate task. You may add up to 120 words of notes to ' + name + ' about how the plan is shaped; the app shows them with the plan. ' + today, '', lim(input.intake, 6000)];
    if (input.currentPlan) lines.push('', 'Their current plan:', lim(JSON.stringify(input.currentPlan), 12000));
    if (input.log) lines.push('', 'Their recent log:', lim(input.log, 12000));
    if (input.note) lines.push('', 'What they want changed: ' + lim(input.note, 1000));
    return lines.join('\n');
  }
  if (kind === 'review') {
    return ['Review this week for ' + name + '. Under 250 words, plain text, no headings. Cover: what went well; what to change next week, with specific loads or reps where the log supports it; anything in the notes that matters (sleep, soreness, missed sessions); whether the plan itself should change, and if so what (do not rewrite the plan).', '', lim(input.log, 14000),
      input.currentPlan ? '\nThe plan:\n' + lim(JSON.stringify(input.currentPlan), 8000) : ''].join('\n');
  }
  return ['Question from ' + name + '. Answer in under 150 words, plain text.', '', 'Context: ' + lim(input.context, 4000), '', 'Question: ' + lim(input.question, 1000)].join('\n');
}

export const TOOLS = [{ name: 'submit_plan', description: 'Submit the finished FitPitt plan. Call it exactly once, with every field filled.', strict: true, input_schema: PLAN_SCHEMA }];

const CALL_LIMIT = 13 * 60 * 1000; // streamed, so the API's own limit does not bite; the Durable Object alarm gets 15 minutes of wall time in all

/** One call to the Messages API, streamed. Returns { message, usage, text, toolInput, stop }. Throws on network or API errors.
 *  Streamed because a plan with thinking can take minutes, and a reply held back until it is complete gets cut off by
 *  the API's front door (an HTTP 524 after about 100 seconds of silence). The stream is put back together here into
 *  the same message object a plain call returns, thinking blocks and signatures included, so a repair round can hand
 *  the assistant turn back unchanged. */
export async function callClaude(env, body, msLeft) {
  const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const budget = Math.min(CALL_LIMIT, msLeft == null ? CALL_LIMIT : msLeft);
  if (budget < 30000) throw Object.assign(new Error('Out of time for this call.'), { retryable: false });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), budget);
  const tooLong = () => Object.assign(new Error('The coach took too long to answer.'), { retryable: false });
  let res;
  try {
    res = await fetch(base + '/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': API_VERSION }, body: JSON.stringify(Object.assign({}, body, { stream: true })) });
  } catch (e) { clearTimeout(timer); if (e && e.name === 'AbortError') throw tooLong(); throw Object.assign(new Error('Could not reach the Claude API.'), { retryable: true }); }
  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text().catch(() => ''); let data = null; try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
    const e = new Error((data && data.error && data.error.message) || ('Claude API ' + res.status)); e.status = res.status; e.retryable = res.status === 429 || res.status === 529 || res.status >= 500; throw e;
  }
  let data;
  const seen = { usage: {}, chars: 0 }; // what arrived before a cut-off, so a timed-out call is still billed for what the model wrote
  try { data = await readStream(res, seen); } catch (e) {
    if (e && e.name === 'AbortError') { const t = tooLong(); t.partialUsage = Object.assign({}, seen.usage, { output_tokens: Math.max(+seen.usage.output_tokens || 0, Math.ceil(seen.chars / 3.5)) }); throw t; }
    throw e;
  }
  finally { clearTimeout(timer); }
  const content = data.content || [];
  const out = { message: data, usage: data.usage || {}, text: content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim(), toolInput: null, stop: data.stop_reason };
  const tool = content.find(c => c.type === 'tool_use'); if (tool && tool.input && typeof tool.input === 'object') out.toolInput = tool.input;
  return out;
}

// Server-sent events from /v1/messages, assembled into one message. An `error` event mid-stream is retryable.
async function readStream(res, seen) {
  const blocks = [];
  const msg = { id: null, type: 'message', role: 'assistant', model: null, content: blocks, stop_reason: null, stop_sequence: null, usage: {} };
  const apply = (name, d) => {
    switch (name) {
      case 'message_start': { const m = d.message || {}; msg.id = m.id || null; msg.model = m.model || null; Object.assign(msg.usage, m.usage || {}); if (seen) Object.assign(seen.usage, m.usage || {}); break; }
      case 'content_block_start': {
        const b = Object.assign({}, d.content_block || {});
        if (b.type === 'text') b.text = b.text || '';
        if (b.type === 'thinking') b.thinking = b.thinking || '';
        if (b.type === 'tool_use') { b.input = b.input && Object.keys(b.input).length ? b.input : null; Object.defineProperty(b, '_json', { value: '', writable: true, enumerable: false }); }
        blocks[d.index] = b; break;
      }
      case 'content_block_delta': {
        const b = blocks[d.index], x = d.delta || {}; if (!b) break;
        if (x.type === 'text_delta') { b.text += x.text || ''; if (seen) seen.chars += (x.text || '').length; }
        else if (x.type === 'input_json_delta') { b._json += x.partial_json || ''; if (seen) seen.chars += (x.partial_json || '').length; }
        else if (x.type === 'thinking_delta') { b.thinking += x.thinking || ''; if (seen) seen.chars += (x.thinking || '').length; }
        else if (x.type === 'signature_delta') b.signature = x.signature || '';
        break;
      }
      case 'content_block_stop': {
        const b = blocks[d.index]; if (!b || b.type !== 'tool_use') break;
        if (b.input == null) { try { b.input = b._json ? JSON.parse(b._json) : {}; } catch (e) { b.input = null; } }
        break;
      }
      case 'message_delta': { const x = d.delta || {}; if (x.stop_reason) msg.stop_reason = x.stop_reason; if ('stop_sequence' in x) msg.stop_sequence = x.stop_sequence; Object.assign(msg.usage, d.usage || {}); break; }
      case 'error': throw Object.assign(new Error((d.error && d.error.message) || 'The Claude API stopped mid-answer.'), { retryable: true });
      default: break; // ping, message_stop
    }
  };
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', done = false;
  const takeEvent = raw => {
    let name = '', dataLines = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let d; try { d = JSON.parse(dataLines.join('\n')); } catch (e) { return; }
    apply(name || d.type, d);
  };
  while (!done) {
    const r = await reader.read(); done = r.done;
    if (r.value) buf += dec.decode(r.value, { stream: true });
    let at;
    while ((at = buf.indexOf('\n\n')) >= 0) { const raw = buf.slice(0, at); buf = buf.slice(at + 2); if (raw.trim()) takeEvent(raw); }
  }
  if (buf.trim()) takeEvent(buf);
  msg.content = blocks.filter(Boolean);
  if (!msg.stop_reason && !msg.content.length) throw Object.assign(new Error('The Claude API sent an empty answer.'), { retryable: true });
  return msg;
}

/** Runs one job end to end. Returns { output, usages, model, effort }; throws { message, retryable, usages }.
 *  memo.get(n)/memo.set(n, reply) keep each paid-for reply, so a run that is retried does not pay for it again.
 *  deadline is a time in ms; the calls share what is left of it. */
export async function runJob(env, job, person, settings, memo, deadline) {
  const task = settings.tasks[job.kind] || settings.tasks.ask, input = JSON.parse(job.input || '{}');
  const usages = [], left = () => (deadline || (Date.now() + 14 * 60000)) - Date.now();
  const base = { model: task.model, max_tokens: task.max_tokens, output_config: { effort: task.effort }, system: systemFor(job.kind, person) };
  const messages = [{ role: 'user', content: userMessageFor(job.kind, input, person) }];
  const fail = msg => Object.assign(new Error(msg), { retryable: false, usages });
  const ask = async (n, body) => {
    const kept = memo ? await memo.get(n) : null;
    if (kept) return kept;
    let r;
    try { r = await callClaude(env, body, left()); } catch (e) { if (e.partialUsage) usages.push(e.partialUsage); e.usages = usages; throw e; }
    usages.push(r.usage);
    if (memo) await memo.set(n, r);
    return r;
  };
  try {
    if (job.kind !== 'plan') {
      const r = await ask(0, Object.assign({}, base, { messages }));
      if (!r.text) throw fail('The coach gave no answer.');
      return { output: { text: r.text }, usages, model: task.model, effort: task.effort };
    }
    // A plan: ask for the tool call, check the plan, and give the model one chance to fix problems.
    let r = await ask(0, Object.assign({}, base, { messages, tools: TOOLS, tool_choice: { type: 'auto' } }));
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!r.toolInput) {
        if (r.stop === 'max_tokens') throw fail('The coach ran out of room before it finished the plan (' + task.max_tokens + ' output tokens, thinking included). Raise max output tokens for plan builds or lower the effort in Settings → FitPitt admin.');
        throw fail('The coach did not submit a plan.' + (r.text ? ' It said: ' + r.text.slice(0, 300) : ''));
      }
      const c = check(tidy(r.toolInput));
      if (c.plan) return { output: { plan: c.plan, code: await encode(c.plan), notes: c.notes, text: r.text }, usages, model: task.model, effort: task.effort };
      if (attempt === 1) throw fail('The plan had problems the coach could not fix: ' + c.errs.slice(0, 4).join(' '));
      const toolUse = r.message.content.find(x => x.type === 'tool_use');
      const fix = [...messages, { role: 'assistant', content: r.message.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'The plan was rejected: ' + c.errs.join(' ') + ' Fix these and call submit_plan again with the whole plan.' }] }];
      r = await ask(1, Object.assign({}, base, { messages: fix, tools: TOOLS, tool_choice: { type: 'auto' } }));
    }
    throw fail('The coach could not finish the plan.');
  } catch (e) { if (!e.usages) e.usages = usages; throw e; }
}

export function sumUsage(usages) {
  const t = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const u of usages || []) for (const k of Object.keys(t)) t[k] += +((u || {})[k]) || 0;
  return t;
}
export { costOf, GROUP_NAMES };
