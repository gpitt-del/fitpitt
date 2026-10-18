// The plan format, checked exactly as the app checks it (n.js in the app). If one changes, change the other and
// run tools/test_plan_parity.py, which feeds both the same plans and expects the same answers.
// A plan the coach writes passes through check() before any phone sees it.

export const DAYS = 'ABCDEF';
export const GROUPS = ['chest', 'back', 'press', 'sdelt', 'rdelt', 'trap', 'tri', 'bi', 'quad', 'ham', 'glute', 'calf', 'add', 'abd', 'abs', 'other'];
export const GROUP_NAMES = {
  chest: 'Chest', back: 'Back', press: 'Overhead press', sdelt: 'Side delts', rdelt: 'Rear delts', trap: 'Traps', tri: 'Triceps', bi: 'Biceps',
  quad: 'Quads', ham: 'Hamstrings', glute: 'Glutes', calf: 'Calves', add: 'Adductors', abd: 'Abductors', abs: 'Abs', other: 'Other',
};

const clean = (s, max) => (typeof s === 'string' ? s : typeof s === 'number' && Number.isFinite(s) ? String(s) : '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const flag = v => v === true || v === 1 || v === 'true';
const int = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? Math.round(+v) : NaN;
function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

/** Returns { plan, errs, notes }. errs stop the plan; notes are small fixes made along the way. Never throws. */
export function check(raw) {
  try { return checkInner(raw); } catch (e) { return { plan: null, errs: ['This plan could not be read. Ask for a fresh copy.'], notes: [] }; }
}
function checkInner(raw) {
  const errs = [], notes = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { plan: null, errs: ['This is not a FitPitt plan.'], notes };
  const ver = int(raw.fitpitt === true ? 1 : raw.fitpitt);
  if (ver !== 1) errs.push(ver > 1 ? 'This plan needs a newer FitPitt. Close the app fully and open it again to update.' : 'This is not a FitPitt plan (it needs "fitpitt": 1).');
  const pl = { fitpitt: 1, name: clean(raw.name, 40) };
  if (!pl.name) errs.push('The plan needs a name.');
  ['for', 'goal'].forEach(k => { const v = clean(raw[k], k === 'goal' ? 120 : 40); if (v) pl[k] = v; });
  if (typeof raw.made === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.made)) pl.made = raw.made;
  const days = Array.isArray(raw.days) ? raw.days : [];
  if (!days.length) errs.push('The plan needs at least one day of exercises.');
  if (days.length > DAYS.length) errs.push('Six days at most in the rotation. This plan has ' + days.length + '.');
  pl.days = days.slice(0, DAYS.length).map((d, di) => dayOf(d, di, errs, notes));
  const pw = raw.perWeek == null ? Math.max(1, pl.days.length) : int(raw.perWeek);
  if (!(pw >= 1 && pw <= 7)) errs.push('Sessions per week must be a number from 1 to 7.');
  pl.perWeek = pw >= 1 && pw <= 7 ? pw : 3;
  pl.measure = raw.measure === 'tests' ? 'tests' : 'body';
  if (raw.measure != null && raw.measure !== 'body' && raw.measure !== 'tests') notes.push('Measure "' + clean(raw.measure, 20) + '" is not known, so body scans are used.');
  pl.line = clean(raw.line, 140) || (pl.perWeek + (pl.perWeek === 1 ? ' session' : ' sessions') + ' a week, ' + pl.days.length + '-day rotation.');
  ['effort', 'deload'].forEach(k => { const v = clean(raw[k], 300); if (v) pl[k] = v; });
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map(r => clean(r, 300)).filter(Boolean);
  if (rules.length > 8) notes.push('Only the first 8 rules are kept.');
  if (rules.length) pl.rules = rules.slice(0, 8);
  pl.id = hash(JSON.stringify(pl));
  return { plan: errs.length ? null : pl, errs, notes };
}
function dayOf(d, di, errs, notes) {
  const at = 'Day ' + (di + 1);
  if (!d || typeof d !== 'object') { errs.push(at + ' is not written as a day.'); return { name: at, short: at, ex: [] }; }
  const name = clean(d.name, 30) || at, out = { name, short: clean(d.short, 18) || clean(name.split(/[,+&/]| and /)[0], 18) || clean(name, 18) };
  const ex = Array.isArray(d.ex) ? d.ex : [];
  if (!ex.length) errs.push(at + ' has no exercises.');
  if (ex.length > 14) errs.push(at + ' has ' + ex.length + ' exercises. Fourteen at most.');
  out.ex = ex.slice(0, 14).map((e, ei) => exOf(e, at + ', exercise ' + (ei + 1), errs, notes));
  const wu = (Array.isArray(d.warmup) ? d.warmup : []).map(w => clean(w, 90)).filter(Boolean);
  if (wu.length > 6) notes.push(at + ': only the first 6 warm-up lines are kept.');
  if (wu.length) out.warmup = wu.slice(0, 6);
  return out;
}
function exOf(e, at, errs, notes) {
  if (!e || typeof e !== 'object') { errs.push(at + ' is not written as an exercise.'); return { name: ['?'], g: 'other', sets: 1, reps: [1, 1] }; }
  const names = (Array.isArray(e.name) ? e.name : [e.name]).map(n => clean(n, 60)).filter(Boolean).map(n => n in {} ? n + ' exercise' : n).slice(0, 3);
  const label = names[0] ? at + ' (' + names[0] + ')' : at;
  if (!names.length) errs.push(at + ' needs a name.');
  let g = clean(e.g, 20);
  if (!GROUPS.includes(g)) { notes.push(label + (g ? ': muscle group "' + clean(g, 20) + '" is not known' : ': no muscle group given') + ', so it counts as Other.'); g = 'other'; }
  const sets = int(e.sets);
  if (!(sets >= 1 && sets <= 8)) errs.push(label + ': sets must be a number from 1 to 8.');
  const rr = Array.isArray(e.reps) ? e.reps : [e.reps, e.reps], lo = int(rr[0]), hi = int(rr[1] == null ? rr[0] : rr[1]);
  const top = flag(e.hold) ? 600 : 100;
  if (!(lo >= 1 && hi >= lo && hi <= top)) errs.push(label + ': reps must be a number, or [low, high] with low at most high' + (flag(e.hold) ? ' (seconds for a hold, up to 600).' : ', up to 100.'));
  const x = { name: names.length ? names : ['?'], g, sets: sets >= 1 && sets <= 8 ? sets : 1, reps: lo >= 1 && hi >= lo && hi <= top ? [lo, hi] : [1, 1] };
  if (e.rest === 'long' || e.rest === 'short') x.rest = e.rest;
  else if (e.rest != null) { const r = int(e.rest); if (r >= 10 && r <= 600) x.rest = r; else notes.push(label + ': rest should be "long", "short" or seconds from 10 to 600, so it was left to the default.'); }
  const cue = clean(e.cue, 160); if (cue) x.cue = cue;
  if (flag(e.hold)) x.hold = true;
  else ['drop', 'partials', 'bw'].forEach(k => { if (flag(e[k])) x[k] = true; });
  if (['leg', 'side', 'arm'].includes(e.per)) x.per = e.per;
  else if (e.per) notes.push(label + ': "per" can be leg, side or arm. It was left off.');
  return x;
}

/* ---------- codes: "FP1." + base64url(raw-deflate(JSON)), as the app makes them ---------- */
const b64u = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
export async function encode(plan) {
  const body = Object.assign({}, plan); delete body.id;
  return 'FP1.' + b64u(await deflate(new TextEncoder().encode(JSON.stringify(body))));
}

/* ---------- the JSON schema the coach fills in (strict tool input) ---------- */
const exerciseSchema = {
  type: 'object',
  properties: {
    name: { type: 'array', items: { type: 'string' }, description: 'One to three names: one per rotation (blocks 1/4/7, 2/5, 3/6). Prefer names from the catalogue, spelled exactly.' },
    g: { type: 'string', enum: GROUPS },
    sets: { type: 'integer', description: '1 to 8.' },
    reps: { type: 'array', items: { type: 'integer' }, description: 'Exactly two numbers, [low, high], low at most high, up to 100. Seconds for a hold, up to 600.' },
    rest: { type: 'string', enum: ['long', 'short'], description: 'long = 2 to 3 minutes (compound lifts), short = 60 to 90 seconds.' },
    cue: { type: 'string', description: 'One form cue, up to 160 characters, or an empty string: position, path, what to feel, what to avoid. No weights, rep counts or set structure; the app sets the load.' },
    drop: { type: 'boolean' }, partials: { type: 'boolean' }, bw: { type: 'boolean' }, hold: { type: 'boolean' },
    per: { type: 'string', enum: ['', 'leg', 'side', 'arm'] },
  },
  required: ['name', 'g', 'sets', 'reps', 'rest', 'cue', 'drop', 'partials', 'bw', 'hold', 'per'],
  additionalProperties: false,
};
export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    fitpitt: { type: 'integer', enum: [1] },
    name: { type: 'string', description: 'Plan name, up to 40 characters.' },
    for: { type: 'string', description: "The person's first name." },
    made: { type: 'string', description: 'Today, YYYY-MM-DD.' },
    goal: { type: 'string', description: 'One line, up to 120 characters.' },
    line: { type: 'string', description: 'One-line summary, up to 140 characters.' },
    perWeek: { type: 'integer', description: 'Sessions a week, 1 to 7.' },
    measure: { type: 'string', enum: ['body', 'tests'] },
    effort: { type: 'string', description: 'How hard to push, up to 300 characters.' },
    deload: { type: 'string', description: 'Deload-week text, up to 300 characters, or an empty string for the default.' },
    rules: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short rules with **bold** leads.' },
    days: {
      type: 'array', description: '1 to 6 days, each with 1 to 14 exercises.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Up to 30 characters.' },
          short: { type: 'string', description: 'Up to 18 characters, shown under the day letter.' },
          warmup: { type: 'array', items: { type: 'string' }, description: 'The warm-up for this day: 3 to 6 short lines, up to 90 characters each, shown at the top of the workout.' },
          ex: { type: 'array', items: exerciseSchema },
        },
        required: ['name', 'short', 'warmup', 'ex'], additionalProperties: false,
      },
    },
  },
  required: ['fitpitt', 'name', 'for', 'made', 'goal', 'line', 'perWeek', 'measure', 'effort', 'deload', 'rules', 'days'],
  additionalProperties: false,
};
// The model fills every field (strict mode needs that). Empty strings and false flags mean "left out".
export function tidy(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === '' || v === false || v == null) continue;
    if (k === 'days' && Array.isArray(v)) out.days = v.map(d => d && typeof d === 'object' ? Object.assign({}, d, { ex: Array.isArray(d.ex) ? d.ex.map(tidy) : d.ex }) : d);
    else out[k] = v;
  }
  return out;
}
