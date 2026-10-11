'use strict';
/* ================= Personal plans: the plan model (standalone site only) =================
   A personal plan arrives as data: JSON that Claude writes from a person's intake answers. It travels as a code,
   "FP1." followed by the JSON deflated and base64url-encoded, or as a link with that code after #plan=.
   Plain JSON (starting with "{") is accepted too, for chats that cannot make a code.
   This file checks a plan, turns it into an entry of PROGRAMS under the key "mine", and registers a saved plan.
   It loads BEFORE e.js, so the log loads with the plan already known and a phone on its own plan opens straight into it.
   The screens (intake form, paste a code, preview, Settings card) are in o.js. The format is described in the
   project file claude/fitpitt-plan-format.md. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const KEY = 'fitpitt.plan', PFX = 'FP1.', DAYS = 'ABCDEF';
  const LIFT_G = Object.keys(GROUPS).filter(g => !['jump', 'throw', 'lower', 'upper', 'armor'].includes(g));
  const DEF_EFFORT = 'Stop each set 1 or 2 reps short of failure. The last rep should be slow but clean.';
  const DEF_DELOAD = m => 'Deload week: half the sets, same loads, stop 3 or 4 reps short. ' + (m === 'tests' ? 'Re-test this week.' : 'Scan this week.');

  // Text from a plan lands in the page as HTML in a few places, so angle brackets never get through.
  // Only strings and numbers count. The result is the same if it is cleaned again, so a plan's id never drifts.
  const clean = (s, max) => (typeof s === 'string' ? s : typeof s === 'number' && Number.isFinite(s) ? String(s) : '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  const flag = v => v === true || v === 1 || v === 'true';
  const bold = s => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*/g, '');
  const int = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? Math.round(+v) : NaN;
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

  /* ---------- checking a plan ---------- */
  // Returns { plan, errs, notes }. errs stop the plan from loading; notes are small fixes made along the way.
  function check(raw) {
    const errs = [], notes = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errs: ['This is not a FitPitt plan.'], notes };
    const ver = int(raw.fitpitt === true ? 1 : raw.fitpitt);
    if (ver !== 1) errs.push(ver > 1 ?'This plan needs a newer FitPitt. Close the app fully and open it again to update.' : 'This is not a FitPitt plan (it needs "fitpitt": 1).');
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
    return out;
  }
  function exOf(e, at, errs, notes) {
    if (!e || typeof e !== 'object') { errs.push(at + ' is not written as an exercise.'); return { name: ['?'], g: 'other', sets: 1, reps: [1, 1] }; }
    const names = (Array.isArray(e.name) ? e.name : [e.name]).map(n => clean(n, 60)).filter(Boolean).map(n => n in {} ? n + ' exercise' : n).slice(0, 3);
    const label = names[0] ? at + ' (' + names[0] + ')' : at;
    if (!names.length) errs.push(at + ' needs a name.');
    let g = clean(e.g, 20);
    if (!LIFT_G.includes(g)) { notes.push(label + (g ? ': muscle group "' + clean(g, 20) + '" is not known' : ': no muscle group given') + ', so it counts as Other.'); g = 'other'; }
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

  /* ---------- turning a plan into a program the app runs ---------- */
  function slotOfEx(x, id) {
    const n = x.name, names = n.length === 1 ? [n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0]] : n.slice(0, 3);
    const long = x.hold || x.rest === 'long' || (typeof x.rest === 'number' && x.rest >= 120);
    const o = {};
    if (typeof x.rest === 'number') o.rest = x.rest;
    else if (x.hold) o.rest = x.rest === 'long' ? 90 : 45; // holds keep a fixed rest and stay out of rest-pause
    if (x.cue) o.cue = x.cue;
    if (x.per) o.per = x.per;
    if (x.hold) Object.assign(o, { t: 'hold', nw: 1, unit: 'sec' });
    else { if (x.drop) o.drop = 1; if (x.partials) o.pp = 1; if (x.bw) o.bw = 1; }
    return X(id, x.g, x.sets, x.reps[0], x.reps[1], long ? 'c' : 'i', names, o);
  }
  function toProgram(pl) {
    const days = {}, slots = {};
    pl.days.forEach((d, i) => { const k = DAYS[i]; days[k] = [d.name, d.short]; slots[k] = d.ex.map((x, j) => slotOfEx(x, k + (j + 1))); });
    const own = (pl.rules || []).map(r => bold(r));
    return {
      name: pl.name, line: pl.line, perWeek: pl.perWeek, freq: pl.perWeek / pl.days.length, measure: pl.measure, personal: pl,
      days, slots,
      effort: () => pl.effort || DEF_EFFORT,
      deload: pl.deload || DEF_DELOAD(pl.measure),
      // The first rule ends in "add weight next time." so the weekly-step add-on (l.js) rewrites it like the other plans.
      rules: () => ['<b>Log every working set.</b> Warm-ups do not count. When every set reaches the top of the rep range, add weight next time.']
        .concat(own, [
          '<b>Deload week:</b> same lifts and loads, half the sets. ' + (pl.measure === 'tests' ? 'Re-test that week.' : 'Scan that week, same machine, morning, before training.'),
          '<b>Pain is a stop sign.</b> Sharp or joint pain means stop that exercise and get it checked. This plan is training, not medical advice.',
        ]),
    };
  }
  function register(pl) {
    PROGRAMS.mine = toProgram(pl);
    VOLNOTE.mine = 'Direct sets in a build week at ' + pl.perWeek + (pl.perWeek === 1 ? ' session.' : ' sessions.') + (pl.days.length > 1 ? ' The ' + pl.days.length + ' days take turns.' : '');
  }

  /* ---------- saved on this phone ---------- */
  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d || !d.plan) return null;
      const c = safeCheck(d.plan); if (!c.plan) return null;
      return { plan: c.plan, code: typeof d.code === 'string' && d.code.indexOf(PFX) === 0 ? d.code : '', at: d.at || 0 };
    } catch (e) { return null; }
  }
  function store(plan, code) { try { localStorage.setItem(KEY, JSON.stringify({ plan, code: code || '', at: Date.now() })); return true; } catch (e) { return false; } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } delete PROGRAMS.mine; delete VOLNOTE.mine; }

  /* ---------- codes ---------- */
  let zipOk = null;
  const canZip = () => { if (zipOk === null) { try { new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw'); zipOk = true; } catch (e) { zipOk = false; } } return zipOk; };
  const b64u = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
  async function pipe(bytes, Kind) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Kind('deflate-raw'))).arrayBuffer()); }
  async function encode(pl) {
    if (!canZip()) return '';
    const body = Object.assign({}, pl); delete body.id; // the id is worked out again on arrival
    return PFX + b64u(await pipe(new TextEncoder().encode(JSON.stringify(body)), CompressionStream));
  }
  const link = code => location.origin + location.pathname.replace(/index\.html$/, '') + '#plan=' + code;
  // Reads whatever was pasted: a code, a link holding a code, or the plan's JSON (fenced or not, curly quotes and all).
  async function decode(text) {
    const t = String(text || '').trim(), fail = m => ({ errs: [m], notes: [] });
    if (!t) return fail('Paste the plan code first.');
    // The code runs from FP1. to the first character outside its alphabet. If that does not open, try it again with
    // line breaks taken out, in case something wrapped it.
    const at = t.indexOf('#plan='), hay = at >= 0 ? t.slice(at + 6) : t, from = hay.indexOf('FP1.'), tries = [];
    if (from >= 0) {
      const a = hay.slice(from).match(/^FP1\.([A-Za-z0-9_-]+)/), b = hay.slice(from).replace(/\s+/g, '').match(/^FP1\.([A-Za-z0-9_-]+)/);
      if (a) tries.push(a[1]);
      if (b && (!a || b[1] !== a[1])) tries.push(b[1]);
    }
    if (tries.length) {
      if (!canZip()) return fail('This phone\'s browser is too old to open short codes. Update the phone, or ask the builder for the long version that starts with {.');
      for (const k of tries) {
        let raw;
        try { raw = JSON.parse(new TextDecoder().decode(await pipe(unb64u(k), DecompressionStream))); } catch (e) { continue; }
        const c = safeCheck(raw); c.code = PFX + k; return c;
      }
      if (t.indexOf('{') < 0) return fail('This code is cut off or changed. Copy it again from the message, all of it.');
    }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) return fail(/FP1/.test(t) ? 'This code is cut off or changed. Copy it again from the message, all of it.' : 'That is not a plan code. It starts with FP1.');
    const body = t.slice(a, b + 1);
    let raw = null;
    try { raw = JSON.parse(body); } catch (e) {
      try { raw = JSON.parse(body.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'")); }
      catch (e2) { return fail('This looks like a plan, but part of it is missing or mistyped. Copy it again, all of it.'); }
    }
    return safeCheck(raw);
  }
  function safeCheck(raw) { try { return check(raw); } catch (e) { return { errs: ['This plan could not be read. Ask for a fresh copy.'], notes: [] }; } }

  window.FP_PLAN = { KEY, DAYS, check: safeCheck, toProgram, register, read, store, forget, encode, decode, link, canZip };
  const saved = read();
  if (saved) register(saved.plan);
})();
