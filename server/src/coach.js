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

const WHO = `You are the coach inside FitPitt, a small workout-log app a friend group uses. You write training plans and training advice only.

Hard rules, in this order:
1. Training only. Never give medical, drug, supplement, hormone or peptide advice, even when asked, even in passing. Say it is outside what the coach covers and that a clinician is the right person.
2. Pain is a stop sign. Sharp pain, joint pain, numbness or anything that gets worse with training: tell the person to stop that movement and get it checked. Work around a reported injury rather than through it.
3. Be concrete and brief. Numbers, sets, reps, loads, specific exercises. No pep talk, no filler, no headings in answers under 150 words.
4. Never invent facts about the person. Use only what is in the message.
5. Plain language. A friend, not a textbook.`;

const PLAN_GUIDE = `How FitPitt runs a plan (the app does all of this; do not restate it in the plan):
- A 52-week year in 7 blocks (7, 7, 7, 7, 8, 8, 8 weeks). The last week of each block is a deload (half the sets, same loads) and a body-scan week.
- Days run in order A, B, C... whatever the weekday. perWeek sets the weekly target.
- Weight targets: when every set hits the top of the rep range the weight goes up next week (2.5 lb under 20 lb, 5 lb under 100 lb, about 4% above). At most one step a week; the first week is a baseline. Too heavy for the range drops about 10%.
- Each exercise can have up to 3 names: blocks 1/4/7 use the first, 2/5 the second, 3/6 the third. One name keeps the lift the same all year. Put the person's favourite first.
- Logging, deloads, pain and weekly-step rules are added by the app; do not repeat them in "rules".

How to write a plan:
- Build it around the exercises they already do and like. Swap only for an injury, missing equipment or a gap.
- Fit their days and session length: about 3.25 minutes per set on long rest, 2 minutes on short rest, so 60 minutes holds roughly 18 to 24 sets.
- Only equipment they have.
- Volume: beginners about 6 to 10 hard sets per muscle per week; experienced 10 to 20. Spread a muscle over two or more days where it fits.
- Reps: 6 to 10 or 8 to 12 for big compound lifts, 10 to 15 or 12 to 20 for isolation. Holds (planks) use seconds with "hold": true.
- rest: "long" for presses, rows, squats, hinges, leg press; "short" for the rest.
- effort text: beginners stop 2 or 3 reps short; experienced leave 1 or 2 on early sets and take the last set to failure.
- rules: up to 8 short lines, each starting with a **bold lead**. Put injury work-arounds here (e.g. "**Look after the left shoulder.** No overhead pressing.").
- Prefer exercise names from this catalogue, spelled exactly (the app shows photos and a sketch for them):
${CATALOGUE.join(' · ')}
- Field limits: name 40 characters, goal 120, line 140, day name 30, short 18, exercise name 60, cue 160, rules 300 each. Sets 1 to 8. perWeek 1 to 7. Up to 6 days, 14 exercises a day.
- Fill every field of submit_plan. Use "" for a text field you have nothing for, false for a flag you do not want, "" for per when it does not apply.`;

export function systemFor(kind) {
  return [{ type: 'text', text: kind === 'plan' ? WHO + '\n\n' + PLAN_GUIDE : WHO, cache_control: { type: 'ephemeral' } }];
}

const lim = (s, n) => String(s == null ? '' : s).slice(0, n);
export function userMessageFor(kind, input, person) {
  const name = person.name || 'the person';
  if (kind === 'plan') {
    const lines = ['Build a FitPitt plan for ' + name + ' from these answers, then call submit_plan with it. Today is ' + new Date().toISOString().slice(0, 10) + '.', '', lim(input.intake, 4000)];
    if (input.currentPlan) lines.push('', 'Their current plan, for continuity (keep exercise names the same where the lift stays the same, because history follows the name):', lim(JSON.stringify(input.currentPlan), 12000));
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

/** One call to the Messages API. Returns { message, usage, text, toolInput, stop }. Throws on network or API errors. */
export async function callClaude(env, body) {
  const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 13 * 60 * 1000);
  let res;
  try {
    res = await fetch(base + '/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': API_VERSION }, body: JSON.stringify(body) });
  } finally { clearTimeout(timer); }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('Claude API ' + res.status)); e.status = res.status; e.retryable = res.status === 429 || res.status === 529 || res.status >= 500; throw e; }
  const content = (data && data.content) || [];
  const out = { message: data, usage: data.usage || {}, text: content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim(), toolInput: null, stop: data.stop_reason };
  const tool = content.find(c => c.type === 'tool_use'); if (tool) out.toolInput = tool.input;
  return out;
}

/** Runs one job end to end. Returns { output, usage[], model, effort } or throws { message, retryable }. */
export async function runJob(env, job, person, settings) {
  const task = settings.tasks[job.kind] || settings.tasks.ask, input = JSON.parse(job.input || '{}');
  const usages = [];
  const base = { model: task.model, max_tokens: task.max_tokens, output_config: { effort: task.effort }, system: systemFor(job.kind) };
  const messages = [{ role: 'user', content: userMessageFor(job.kind, input, person) }];
  if (job.kind !== 'plan') {
    const r = await callClaude(env, Object.assign({}, base, { messages }));
    usages.push(r.usage);
    if (!r.text) throw Object.assign(new Error('The coach gave no answer.'), { retryable: false });
    return { output: { text: r.text }, usages, model: task.model, effort: task.effort };
  }
  // A plan: ask for the tool call, check the plan, and give the model one chance to fix problems.
  let r = await callClaude(env, Object.assign({}, base, { messages, tools: TOOLS, tool_choice: { type: 'auto' } }));
  usages.push(r.usage);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!r.toolInput) throw Object.assign(new Error('The coach did not submit a plan.' + (r.text ? ' It said: ' + r.text.slice(0, 300) : '')), { retryable: false });
    const c = check(tidy(r.toolInput));
    if (c.plan) return { output: { plan: c.plan, code: await encode(c.plan), notes: c.notes, text: r.text }, usages, model: task.model, effort: task.effort };
    if (attempt === 1) throw Object.assign(new Error('The plan had problems the coach could not fix: ' + c.errs.slice(0, 4).join(' ')), { retryable: false });
    const toolUse = r.message.content.find(x => x.type === 'tool_use');
    const fix = [...messages, { role: 'assistant', content: r.message.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'The plan was rejected: ' + c.errs.join(' ') + ' Fix these and call submit_plan again with the whole plan.' }] }];
    r = await callClaude(env, Object.assign({}, base, { messages: fix, tools: TOOLS, tool_choice: { type: 'auto' } }));
    usages.push(r.usage);
  }
  throw Object.assign(new Error('The coach could not finish the plan.'), { retryable: false });
}

export function sumUsage(usages) {
  const t = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const u of usages || []) for (const k of Object.keys(t)) t[k] += +((u || {})[k]) || 0;
  return t;
}
export { costOf, GROUP_NAMES };
