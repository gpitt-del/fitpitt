'use strict';
/* ================= Personal plans: the screens (standalone site only) =================
   The first screen offers "Get a plan built for you" (a two-minute intake; with no API set, its answers go to the
   builder by text) and "I have a plan code" (paste a code or open a plan link). A plan is previewed before it is used.
   The person who runs FitPitt is "the builder" in every screen, never a name.
   Settings gets a card for the plan, backups carry the plan, and erasing everything removes it.
   Using a plan saves it, switches this phone to it and reloads, so every add-on starts with the plan in place.
   The plan model (checking, codes, turning a plan into a program) is in n.js. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE || !window.FP_PLAN) return;
  const F = window.FP_PLAN, DRAFT = 'fitpitt.intake', FLASH = 'fitpitt.flash', ADMIN = 'the builder';
  let pend = null; // the plan on screen in the preview: { plan, code, notes }

  /* ---------- look ---------- */
  const css = document.createElement('style');
  css.textContent = ':root{--purple:#6A4BD1;--on-purple:#FFFFFF;--slate:#4A5663;--on-slate:#FFFFFF}' +
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--purple:#9C86F2;--on-purple:#121922;--slate:#A7B4C2;--on-slate:#121922}}' +
    ':root[data-theme="dark"]{--purple:#9C86F2;--on-purple:#121922;--slate:#A7B4C2;--on-slate:#121922}' +
    'body[data-day="D"]{--day:var(--green);--on-day:var(--on-green)}body[data-day="E"]{--day:var(--purple);--on-day:var(--on-purple)}body[data-day="F"]{--day:var(--slate);--on-day:var(--on-slate)}' +
    '.plate[data-d="D"]{--pc:var(--green);--pt:var(--on-green)}.plate[data-d="E"]{--pc:var(--purple);--pt:var(--on-purple)}.plate[data-d="F"]{--pc:var(--slate);--pt:var(--on-slate)}' +
    // The day switch was laid out for three days in a row. Four go two by two; five or six go three to a row.
    '.dayswitch.fp-n4{display:grid;grid-template-columns:1fr 1fr}.dayswitch.fp-n5,.dayswitch.fp-n6{display:grid;grid-template-columns:repeat(3,1fr)}.dayswitch.fp-n5 button,.dayswitch.fp-n6 button{min-width:0}' +
    '.fp-q{margin-top:18px}.fp-q .s-l{margin-bottom:8px}.fp-q.fp-miss .s-l{color:var(--alert)}.fp-q.fp-miss .chips button,.fp-q.fp-miss .input{border-color:var(--alert)}' +
    '.fp-opt{font-weight:400;color:var(--muted);font-size:14px}.fp-lede{color:var(--muted);font-size:15px}' +
    'textarea.fp-code{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;resize:vertical}' +
    '.fp-err{color:var(--alert);font-size:15px}.fp-err:empty{display:none}.fp-err ul{padding-left:18px;margin-top:4px}' +
    '.fp-sub{font:700 20px/1.2 var(--fc);margin:22px 0 8px}.pick + .fp-sub{margin-top:26px}' +
    '.fp-fix summary{font-size:14px;color:var(--muted);cursor:pointer;margin-top:14px}' +
    '.fp-coach{padding:10px 12px;border-left:3px solid var(--day);font-size:15px;line-height:1.45}' +
    '.brand-who{white-space:nowrap;opacity:.8}';
  document.head.appendChild(css);

  /* ---------- the quote in the brand bar: one a day, tap for the next (Gabe, Oct 12: famous or fit people) ---------- */
  const QUOTES = [
    ['Nothing will work unless you do.', 'Maya Angelou'],
    ['Hard choices, easy life. Easy choices, hard life.', 'Jerzy Gregorek'],
    ['Confine yourself to the present.', 'Marcus Aurelius'],
    ["Practice like it's competition and compete like it's another day on the practice court.", 'Karch Kiraly'],
    ['Strength does not come from winning. Your struggles develop your strengths.', 'Arnold Schwarzenegger'],
    ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
    ['Adversity, if you allow it to, will fortify you and make you the best you can be.', 'Kerri Walsh Jennings'],
    ["Don't have $100 shoes and a 10-cent squat.", 'Louie Simmons'],
    ["You're either getting better or getting worse. I don't think you stay the same in sports.", 'Russ Rose'],
    ['Difficulties strengthen the mind, as labor does the body.', 'Seneca'],
    ['The goal is to keep the goal the goal.', 'Dan John'],
    ['The will to win is more important than the skill to win.', 'Lloy Ball'],
    ['The mind is the limit.', 'Arnold Schwarzenegger'],
    ['It is a shame to grow old without seeing the beauty and strength of which your body is capable.', 'Socrates'],
    ['You cannot succeed without believing in yourself, and that belief is completely under your control.', 'Karch Kiraly'],
    ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Aristotle'],
    ['The game teaches the game.', 'John Kessel'],
    ["Take care of your body. It's the only place you have to live.", 'Jim Rohn'],
    ['You have to be willing to fail, to improve.', 'Al Scates'],
    ["Don't count the days; make the days count.", 'Muhammad Ali'],
  ];
  let quoteAt = Math.floor(Date.now() / 86400000) % QUOTES.length;
  function showQuote() { const el = $('#brand-q'); if (!el) return; const q = QUOTES[quoteAt]; el.innerHTML = '“' + esc(q[0]) + '” <span class="brand-who">— ' + esc(q[1]) + '</span>'; }
  ACT.fpQuote = () => { quoteAt = (quoteAt + 1) % QUOTES.length; showQuote(); };
  showQuote();

  /* ---------- small helpers ---------- */
  const inIosBrowser = () => navigator.standalone === false; // iPhone Safari, not the copy on the Home Screen
  const madeLine = pl => (pl.for ? 'Made for ' + pl.for : 'Made for you') + (pl.made ? ' on ' + fmtDate(parseYmd(pl.made), true) : '') + '.';
  const boldEsc = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*/g, '');
  const target = s => s.sets + ' × ' + (s.lo === s.hi ? s.lo : s.lo + '–' + s.hi) + (s.unit === 'sec' ? ' sec' : '') + (s.per ? ' per ' + s.per : '');
  const flash = msg => { try { sessionStorage.setItem(FLASH, msg); } catch (e) { /* the toast is only a nicety */ } };
  function copySheet(title, lede, text) {
    openSheet('<h2>' + esc(title) + '</h2><p class="small muted">' + esc(lede) + '</p><textarea class="fp-code" id="fp-copybox" rows="8" readonly style="margin-top:12px"></textarea>' +
      '<div class="frm" style="margin-top:12px"><button class="btn link" data-act="closeSheet">Close</button></div>');
    const box = $('#fp-copybox'); box.value = text; box.focus(); box.select();
  }
  // Share sheet first, then the clipboard, then a box to copy from. Resolves to how it went.
  function share(title, text, lede) {
    if (navigator.share) return navigator.share({ title, text }).then(() => 'shared', e => (e && e.name === 'AbortError') ? 'cancelled' : copyText(title, text, lede));
    return copyText(title, text, lede);
  }
  function copyText(title, text, lede) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => 'copied', () => { copySheet(title, lede, text); return 'shown'; });
    copySheet(title, lede, text); return Promise.resolve('shown');
  }

  /* ---------- first screen ---------- */
  viewChooser = function () {
    const st = F.read();
    let h = '<header class="hero"><div><h1>Welcome</h1><p>Pick how you want to start. You can change it later in Settings.</p></div></header>';
    h += '<p class="fp-sub" style="margin-top:4px">Your own plan</p><div class="pick">' +
      (st ? '<button data-act="pickProgram" data-p="mine"><strong>' + esc(st.plan.name) + '</strong><span>' + esc(madeLine(st.plan) + ' ' + st.plan.line) + '</span></button>' : '') +
      '<button data-act="fpIntake"><strong>Get a plan built for you</strong><span>Two minutes of questions, then a plan built around the exercises you already do.</span></button>' +
      '<button data-act="fpPaste"><strong>I have a plan code</strong><span>Paste a plan code, or open a plan link.</span></button></div>';
    h += '<p class="fp-sub">Ready-made plans</p><div class="pick">' + Object.keys(PROGRAMS).filter(k => k !== 'mine').map(k => '<button data-act="pickProgram" data-p="' + k + '"><strong>' + PROGRAMS[k].name + '</strong><span>' + PROGRAMS[k].line + '</span></button>').join('') + '</div>';
    return h;
  };

  /* ---------- intake ---------- */
  // Five blocks for adults and five for kids. A block is a title and a few fields: chips (one answer), multi (up to
  // `pick` answers), text, area (a longer box) or num. Keys are shared between the two sets where a question means the
  // same thing. The person's name comes from their account when they are signed in (p.js tells us through intakeWho).
  const SPORT_PH = 'Volleyball, outside hitter';
  const ADULT = [
    { title: 'What you want', fields: [
      { k: 'goal', t: 'chips', label: 'Main goal', req: 1, opts: ['Build muscle', 'Lose fat, keep muscle', 'Get stronger', 'Fitter and healthier', 'Sport performance'] },
      { k: 'goalText', t: 'area', label: 'In your own words', max: 400, ph: 'Bigger shoulders and a stronger back. Ready for ski season in March.' },
      { k: 'sport', t: 'text', label: 'Sport and position, if you train for one', max: 120, ph: SPORT_PH } ] },
    { title: 'Your week', fields: [
      { k: 'days', t: 'chips', label: 'Days a week you can train', req: 1, opts: ['2', '3', '4', '5', '6', '7'] },
      { k: 'mins', t: 'chips', label: 'Time for each session', req: 1, opts: ['30 min', '45 min', '60 min', '75 min', '90 min'] } ] },
    { title: 'Where you train', fields: [
      { k: 'where', t: 'chips', label: 'Place', req: 1, opts: ['Full gym', 'Home, with dumbbells', 'Home, little or no equipment'] },
      { k: 'equip', t: 'text', label: 'Equipment worth knowing about', max: 300, ph: 'Dumbbells to 50 lb, a bench, a pull-up bar, bands' } ] },
    { title: 'Training so far', fields: [
      { k: 'exp', t: 'chips', label: 'Lifting experience', req: 1, opts: ['New, or back after a long break', 'Lifting under 2 years', 'Lifting 2 years or more'] },
      { k: 'likes', t: 'area', label: 'Exercises you do now and like', req: 1, max: 800, ph: 'Bench press, lat pulldown, leg press, curls. Write none if you are new.' } ] },
    { title: 'Things to work around', fields: [
      { k: 'limits', t: 'area', label: 'Injuries, pain, or exercises to avoid', req: 1, max: 800, ph: 'Left shoulder pinches on overhead presses. No barbell back squats. Write none if there is nothing.' },
      { k: 'age', t: 'num', label: 'Age', max: 3 },
      { k: 'sex', t: 'chips', label: 'Sex', opts: ['Male', 'Female'] },
      { k: 'other', t: 'area', label: 'Anything else', max: 800, ph: 'Travel one week a month. Tennis on Saturdays.' } ] },
  ];
  const KID = [
    { title: 'Your sport', fields: [
      { k: 'sport', t: 'text', label: 'Sport and position', req: 1, max: 120, ph: SPORT_PH },
      { k: 'level', t: 'chips', label: 'Level', req: 1, opts: ['Rec or PE', 'School team', 'Club', 'Club and school'] },
      { k: 'season', t: 'chips', label: 'Right now', req: 1, opts: ['In season', 'Pre-season', 'Off season'] } ] },
    { title: 'What to improve', fields: [
      { k: 'improve', t: 'multi', label: 'Pick up to two', req: 1, pick: 2, opts: ['Jump higher', 'Quicker and more agile', 'Hit or throw harder', 'Last longer', 'Stronger all over', 'Fewer injuries'] },
      { k: 'goalText', t: 'area', label: 'In your own words', max: 400, ph: 'Touch higher on blocks. Faster to the ball on defense.' } ] },
    { title: 'Your week', fields: [
      { k: 'practice', t: 'chips', label: 'Practices and games a week', req: 1, opts: ['0', '1', '2', '3', '4', '5 or more'] },
      { k: 'days', t: 'chips', label: 'Other days you can train', req: 1, opts: ['1', '2', '3', '4'] },
      { k: 'mins', t: 'chips', label: 'Time for each session', req: 1, opts: ['20 min', '30 min', '45 min', '60 min'] } ] },
    { title: 'Where you train', fields: [
      { k: 'where', t: 'chips', label: 'Place', req: 1, opts: ['School or club gym', 'Full gym, with an adult', 'Home, little or no equipment'] },
      { k: 'exp', t: 'chips', label: 'Strength training so far', req: 1, opts: ['None yet', 'Some, with a team or in PE', 'Regular for a year or more'] },
      { k: 'equip', t: 'text', label: 'Equipment worth knowing about', max: 300, ph: 'A box to jump on, bands, light dumbbells' } ] },
    { title: 'Things to work around', fields: [
      { k: 'limits', t: 'area', label: 'Injuries, pain, or things a doctor or coach said to avoid', req: 1, max: 800, ph: 'Knees ache after long practices. Write none if there is nothing.' },
      { k: 'age', t: 'num', label: 'Age', req: 1, max: 2 },
      { k: 'sex', t: 'chips', label: 'Sex', opts: ['Girl', 'Boy'] },
      { k: 'other', t: 'area', label: 'Anything else', max: 800, ph: 'Tournament most weekends in November.' } ] },
  ];
  const NAME_Q = { k: 'name', t: 'text', label: 'Your first name', req: 1, max: 30 };
  let who = { name: '', kind: 'adult' };
  const blocks = () => {
    const set = (who.kind === 'kid' ? KID : ADULT).map(b => ({ title: b.title, fields: b.fields.slice() }));
    if (!who.name) set[0].fields.unshift(NAME_Q);
    return set;
  };
  const fields = () => blocks().reduce((a, b) => a.concat(b.fields), []);
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(DRAFT) || '{}') || {}; } catch (e) { draft = {}; }
  const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify(draft)); } catch (e) { /* ignore */ } };
  const picked = q => { const v = draft[q.k]; return q.t === 'multi' ? (Array.isArray(v) ? v.filter(x => q.opts.includes(x)) : []) : (q.opts.includes(v) ? v : ''); };
  function question(q) {
    const v = q.t === 'chips' || q.t === 'multi' ? picked(q) : (draft[q.k] == null ? '' : String(draft[q.k]));
    const lab = '<span class="s-l">' + q.label + (q.req ? '' : ' <span class="fp-opt">(optional)</span>') + '</span>';
    let field;
    if (q.t === 'chips' || q.t === 'multi') {
      const on = o => (q.t === 'multi' ? v.includes(o) : v === o);
      field = '<div class="chips" role="group" aria-label="' + esc(q.label) + '">' + q.opts.map(o => '<button data-act="fpChip" data-q="' + q.k + '" data-v="' + esc(o) + '" aria-pressed="' + on(o) + '">' + esc(o) + '</button>').join('') + '</div>';
    } else if (q.t === 'area') field = '<textarea id="in-' + q.k + '" rows="3" maxlength="' + q.max + '" placeholder="' + esc(q.ph || '') + '" aria-label="' + esc(q.label) + '">' + esc(v) + '</textarea>';
    else field = '<input class="input" id="in-' + q.k + '" type="text"' + (q.t === 'num' ? ' inputmode="numeric" pattern="[0-9]*"' : '') + ' maxlength="' + q.max + '" value="' + esc(v) + '" placeholder="' + esc(q.ph || '') + '" autocomplete="' + (q.k === 'name' ? 'given-name' : 'off') + '" aria-label="' + esc(q.label) + '">';
    return '<div class="fp-q" data-q="' + q.k + '">' + lab + field + '</div>';
  }
  function intakeSheet() {
    const lede = who.kind === 'kid' ? 'Five short parts. The plan is built around your sport, your week and what you want to get better at.'
      : 'Five short parts. Your answers become a plan built around the exercises you already do. Nothing leaves this phone until you send it.';
    openSheet('<h2>Get a plan built for you</h2><p class="fp-lede">' + lede + '</p>' +
      blocks().map((b, i) => '<p class="fp-sub">' + (i + 1) + '. ' + esc(b.title) + '</p>' + b.fields.map(question).join('')).join('') +
      '<div class="frm" style="margin-top:22px"><button class="btn primary" data-act="fpSendIntake">Send to ' + ADMIN + '</button><button class="btn link" data-act="closeSheet">Close</button></div>');
  }
  // The brief the coach reads. Kids get a header that switches the coach to youth rules.
  function intakeText(d) {
    const L = [];
    const as = [d.age ? 'Age: ' + d.age : '', d.sex ? 'Sex: ' + d.sex.toLowerCase() : ''].filter(Boolean).join('. ');
    if (d.kind === 'kid') {
      L.push('FitPitt plan request for a kid (under 18): sport-focused, youth rules apply.', 'Name: ' + d.name);
      if (as) L.push(as);
      L.push('Sport and position: ' + d.sport + '. Level: ' + d.level + '. Right now: ' + d.season,
        'Wants to improve: ' + d.improve + (d.goalText ? '. Details: ' + d.goalText : ''),
        'Practices and games a week: ' + d.practice + '. Other days free to train: ' + d.days + ', about ' + d.mins + ' each',
        'Where: ' + d.where + (d.equip ? '. Equipment: ' + d.equip : ''), 'Strength training so far: ' + d.exp,
        'Injuries, pain or things to avoid: ' + d.limits);
    } else {
      L.push('FitPitt plan request', 'Name: ' + d.name, 'Goal: ' + d.goal + (d.goalText ? '. Details: ' + d.goalText : ''));
      if (d.sport) L.push('Sport and position: ' + d.sport);
      L.push('Days a week: ' + d.days + ', about ' + d.mins + ' each', 'Where: ' + d.where + (d.equip ? '. Equipment: ' + d.equip : ''), 'Experience: ' + d.exp,
        'Does now and likes: ' + d.likes, 'Injuries, pain or exercises to avoid: ' + d.limits);
      if (as) L.push(as);
    }
    if (d.other) L.push('Other: ' + d.other);
    L.push('Sent from FitPitt on ' + fmtDate(new Date(), true) + '.');
    return L.join('\n');
  }
  ACT.fpIntake = () => intakeSheet();
  ACT.fpChip = t => {
    const k = t.dataset.q, v = t.dataset.v, q = fields().find(x => x.k === k);
    if (q && q.t === 'multi') {
      const cur = picked(q);
      if (cur.includes(v)) draft[k] = cur.filter(x => x !== v);
      else if (cur.length >= q.pick) { toast('Pick up to ' + (q.pick === 2 ? 'two' : q.pick) + '. Tap one to drop it first.'); return; }
      else draft[k] = cur.concat(v);
      saveDraft();
      t.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(draft[k].includes(b.dataset.v))));
    } else {
      draft[k] = draft[k] === v ? '' : v; saveDraft();
      t.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === draft[k])));
    }
    const box = t.closest('.fp-q'); if (box) box.classList.remove('fp-miss');
  };
  // The answers, checked. Returns null (and marks what is missing) until every required question is answered.
  function collectIntake() {
    const d = { kind: who.kind, name: who.name || '' };
    const Q = fields();
    Q.forEach(q => { d[q.k] = q.t === 'multi' ? picked(q).join(', ') : q.t === 'chips' ? picked(q) : String(draft[q.k] == null ? '' : draft[q.k]).trim(); });
    if (who.name) d.name = who.name;
    const miss = Q.filter(q => q.req && !d[q.k]);
    document.querySelectorAll('.fp-q').forEach(el => el.classList.toggle('fp-miss', miss.some(q => q.k === el.dataset.q)));
    if (miss.length) { const el = document.querySelector('.fp-q.fp-miss'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast(miss.length === 1 ? 'One more: ' + miss[0].label.toLowerCase() + '.' : miss.length + ' questions still need an answer. They are marked.'); return null; }
    return d;
  }
  ACT.fpSendIntake = () => {
    const d = collectIntake(); if (!d) return;
    share('FitPitt plan request', intakeText(d), 'Copy this and text it to ' + ADMIN + '.').then(how => {
      if (how === 'cancelled' || how === 'shown') return;
      openSheet('<h2>' + (how === 'copied' ? 'Copied' : 'Sent') + '</h2><p>' + (how === 'copied' ? 'Paste it into a text to ' + ADMIN + '. ' : '') + 'When ' + ADMIN + ' sends back your plan code, open FitPitt and tap <b>I have a plan code</b>. Your answers stay on this phone in case you want to change them.</p>' +
        '<div class="frm" style="margin-top:16px"><button class="btn quiet wide" data-act="closeSheet">Close</button></div>');
    });
  };
  document.addEventListener('input', e => {
    const el = e.target; if (!el.id || el.id.indexOf('in-') !== 0) return;
    draft[el.id.slice(3)] = el.value; saveDraft();
    const box = el.closest('.fp-q'); if (box) box.classList.remove('fp-miss');
  });

  /* ---------- paste a code, then preview ---------- */
  function pasteSheet(text, errs) {
    const clip = !!(navigator.clipboard && navigator.clipboard.readText);
    openSheet('<h2>Load your plan</h2><p class="fp-lede">Paste a plan code. It starts with FP1. A plan link works too.</p>' +
      '<textarea class="fp-code" id="fp-text" rows="5" placeholder="FP1." autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Plan code" style="margin-top:12px"></textarea>' +
      '<div class="fp-err" id="fp-err" role="alert" style="margin-top:10px"></div>' +
      '<div class="frm" style="margin-top:14px"><button class="btn primary" data-act="fpCheck">Open the plan</button>' +
      (clip ? '<button class="btn quiet wide" data-act="fpClip">Paste what you copied</button>' : '') + '<button class="btn link" data-act="closeSheet">Cancel</button></div>');
    if (text) $('#fp-text').value = text;
    if (errs && errs.length) showErrs(errs);
  }
  function showErrs(errs) {
    const el = $('#fp-err'); if (!el) return;
    el.innerHTML = errs.length === 1 ? esc(errs[0]) : 'This plan has problems:<ul>' + errs.slice(0, 6).map(x => '<li>' + esc(x) + '</li>').join('') + (errs.length > 6 ? '<li>and ' + (errs.length - 6) + ' more</li>' : '') + '</ul>';
  }
  async function openText(text) {
    const r = await F.decode(text);
    if (!r.plan) { if ($('#fp-text')) showErrs(r.errs); else pasteSheet(text, r.errs); return; }
    pend = { plan: r.plan, code: r.code || '', notes: r.notes || [] };
    if (!pend.code) { try { pend.code = await F.encode(pend.plan); } catch (e) { pend.code = ''; } }
    previewSheet();
  }
  function previewSheet() {
    const pl = pend.plan, prog = F.toProgram(pl), keys = Object.keys(prog.days), cur = F.read();
    const turns = keys.some(k => prog.slots[k].some(s => s.names[0] !== s.names[1] || s.names[1] !== s.names[2]));
    let h = '<h2>' + esc(pl.name) + '</h2><p class="small muted">' + esc(madeLine(pl) + ' ' + pl.line) + ' The same 52-week year as the other plans: seven blocks, each ending with a deload week' + (pl.measure === 'tests' ? ' and a re-test.' : ' and a scan.') + '</p>';
    if (pl.goal) h += '<p style="margin-top:10px"><b>Goal:</b> ' + esc(pl.goal) + '</p>';
    if (pend.text) h += '<p class="fp-sub">From the coach</p><p class="fp-coach">' + esc(pend.text).replace(/\n+/g, '<br>') + '</p>';
    if (inIosBrowser() && pend.code) h += '<div class="notice"><b>Is FitPitt on your Home Screen?</b> Links open in Safari, which keeps a separate copy of the app. Copy the code, open FitPitt from your Home Screen and tap <b>I have a plan code</b>. Or use the plan right here in Safari.<br><button class="btn small" data-act="fpCopyCode">Copy the code</button></div>';
    h += '<div class="menu">' + keys.map(k => '<h3>' + plate(k, 'sm') + esc(prog.days[k][0]) + '</h3><ol>' + prog.slots[k].map(s => '<li><span>' + esc(s.names[0]) + '</span><span>' + esc(target(s)) + '</span></li>').join('') + '</ol>').join('') + '</div>';
    if (turns) h += '<p class="small muted" style="margin-top:8px">Some exercises change from block to block. The Plan tab shows each block.</p>';
    if (pl.rules) h += '<p class="fp-sub">Rules for this plan</p><ul class="rules">' + pl.rules.map(r => '<li>' + boldEsc(r) + '</li>').join('') + '</ul>';
    if (pend.notes.length) h += '<details class="fp-fix"><summary>Small fixes made while reading it (' + pend.notes.length + ')</summary><ul class="steps">' + pend.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></details>';
    const same = cur && cur.plan.id === pl.id && S.meta.program === 'mine';
    h += '<div class="frm" style="margin-top:18px">' + (same ? '<p class="small muted">This is the plan this phone is on now.</p>' : '<button class="btn primary" data-act="fpUse">Use this plan</button><p class="small muted">' + (S.meta.program ? 'This phone switches to it. Your log stays, and Settings switches back.' : 'You can change plans later in Settings.') + '</p>') +
      (pend.code ? '<button class="btn quiet wide" data-act="fpSend">Send it to someone as a link</button><button class="btn quiet wide" data-act="fpCopyCode">Copy the code</button>' : '') +
      '<button class="btn link" data-act="closeSheet">' + (same ? 'Close' : 'Cancel') + '</button></div>';
    openSheet(h);
  }
  ACT.fpPaste = () => pasteSheet('');
  ACT.fpClip = () => {
    navigator.clipboard.readText().then(t => { const box = $('#fp-text'); if (!box) return; box.value = t || ''; if (t) openText(t); else toast('Nothing copied yet. Copy the code from the message first.'); },
      () => toast('Press and hold in the box, then choose Paste.'));
  };
  ACT.fpCheck = () => { const box = $('#fp-text'); openText(box ? box.value : ''); };
  ACT.fpCopyCode = () => { if (!pend || !pend.code) return; copyText('Plan code', pend.code, 'Copy this code, then paste it into FitPitt.').then(how => { if (how === 'copied') toast('Code copied.'); }); };
  ACT.fpSend = () => {
    if (!pend || !pend.code) return;
    share('FitPitt plan', 'Your FitPitt plan' + (pend.plan.for ? ', ' + pend.plan.for : '') + ': ' + F.link(pend.code), 'Copy this link and text it.').then(how => { if (how === 'copied') toast('Link copied. Paste it into a text.'); });
  };
  ACT.fpUse = () => {
    if (!pend) return;
    if (S.active) { toast('Finish or discard the workout first.'); return; }
    const prev = F.read(), pl = pend.plan;
    if (!F.store(pl, pend.code)) { toast('This phone would not save the plan. Storage may be full or blocked.'); return; }
    if (!prev || prev.plan.id !== pl.id) Object.keys(S.meta.names || {}).forEach(k => { if (k.indexOf('mine:') === 0) delete S.meta.names[k]; }); // swaps were for the old plan's slots
    // Priority muscles: switching from another plan clears them, as the Settings plan list does.
    // A new version of a personal plan keeps the ones it still trains.
    const trains = new Set([].concat.apply([], pl.days.map(d => d.ex.map(x => x.g))));
    S.meta.priority = S.meta.program === 'mine' ? (S.meta.priority || []).filter(g => trains.has(g)) : [];
    if (!liveSessions().length) S.meta.startDate = defaultStart(); // a new phone starts its year now; an existing log keeps its dates
    S.meta.program = 'mine'; saveMeta();
    const st = parseYmd(S.meta.startDate);
    flash('Plan loaded.' + (dayNum(st) > dayNum(new Date()) ? ' Week 1 starts ' + fmtDow(st) + '. Workouts before then count toward it.' : ''));
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  };

  /* ---------- Settings ---------- */
  function settingsCard() {
    if (tab !== 'settings' || !S.meta.program || $('#fp-set')) return;
    const first = app.querySelector('.setting'); if (!first) return;
    const st = F.read(), on = st && S.meta.program === 'mine', el = document.createElement('div');
    el.className = 'setting'; el.id = 'fp-set';
    el.innerHTML = on
      ? '<span class="s-l">Your plan</span><p>' + esc(st.plan.name) + '. ' + esc(madeLine(st.plan)) + '</p><div class="stack" style="margin-top:10px"><button class="btn quiet wide" data-act="fpPaste">Load a new plan code</button>' + (st.code ? '<button class="btn quiet wide" data-act="fpMyCode">Copy this plan\'s code</button>' : '') + '<button class="btn quiet wide" data-act="fpIntake">Get a new plan built</button></div>'
      : '<span class="s-l">Your own plan</span><p>A plan built around the exercises you already do. Answer a few questions to get one built.</p><div class="stack" style="margin-top:10px"><button class="btn quiet wide" data-act="fpIntake">Get a plan built for you</button><button class="btn quiet wide" data-act="fpPaste">I have a plan code</button></div>';
    first.after(el);
  }
  ACT.fpMyCode = () => { const st = F.read(); if (!st || !st.code) return; copyText('Plan code', st.code, 'Copy this code to load the plan on another phone.').then(how => { if (how === 'copied') toast('Code copied. Paste it into FitPitt on the other phone.'); }); };
  // A friend sends the log summary to Gabe, who pastes it into Claude.
  function relabel() { if (S.meta.program !== 'mine') return; const b = app.querySelector('[data-act="coachShare"]'); if (b && !b.dataset.fp) { b.dataset.fp = '1'; b.textContent = 'Send my log to ' + ADMIN + ' for a review'; } }
  function fitDays() { const ds = app.querySelector('.dayswitch'); if (!ds) return; const n = ds.children.length; [4, 5, 6].forEach(k => ds.classList.toggle('fp-n' + k, n === k)); }
  const onRender = () => { settingsCard(); relabel(); fitDays(); };
  new MutationObserver(onRender).observe(app, { childList: true });

  /* ---------- backups carry the plan; erasing removes it ---------- */
  const save0 = saveFile;
  saveFile = function (filename, data, title) {
    const st = F.read();
    if (filename === 'fitpitt-backup.json' && st) { try { const o = JSON.parse(data); o.plan = { plan: st.plan, code: st.code }; data = JSON.stringify(o, null, 1); } catch (e) { /* save it as it came */ } }
    return save0(filename, data, title);
  };
  const import0 = importData;
  importData = function (text) {
    let d = null; try { d = JSON.parse(text); } catch (e) { d = null; }
    const c = d && Array.isArray(d.sessions) && Array.isArray(d.scans) && d.plan && d.plan.plan ? F.check(d.plan.plan) : null;
    if (!c || !c.plan) { import0(text); return; } // not a backup, or no plan in it: the restore goes on as before
    const prev = F.read();
    if (!F.store(c.plan, typeof d.plan.code === 'string' ? d.plan.code : '')) { toast('This phone would not save the backup. Storage may be full or blocked.'); return; }
    F.register(c.plan);
    if (!prev || prev.plan.id !== c.plan.id) Object.keys(S.meta.names || {}).forEach(k => { if (k.indexOf('mine:') === 0) delete S.meta.names[k]; });
    import0(text);
    flash('Backup restored, with your plan.'); location.reload();
  };
  const erase0 = eraseAll;
  eraseAll = function () { F.forget(); try { localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ } draft = {}; erase0(); };

  /* ---------- arriving ---------- */
  if (!S.meta.program) render(); // e.js drew the first screen before this file loaded
  try { const m = sessionStorage.getItem(FLASH); if (m) { sessionStorage.removeItem(FLASH); toast(m); } } catch (e) { /* ignore */ }
  function fromLink() {
    if (location.hash.indexOf('#plan=') !== 0) return;
    let code = location.hash.slice(6); try { code = decodeURIComponent(code); } catch (e) { /* use it as it is */ }
    history.replaceState(null, '', location.pathname + location.search);
    openText(code);
  }
  window.addEventListener('hashchange', fromLink); // a link opened in a page that already shows FitPitt
  // Used by the account add-on (p.js), which builds plans through the coach instead of a text to Gabe.
  window.FP_UI = { openText, collectIntake, intakeText, previewPlan(plan, code, notes, text) { pend = { plan, code: code || '', notes: notes || [], text: String(text || '').trim().slice(0, 1500) }; previewSheet(); }, intakeSheet,
    intakeWho(w) { who = { name: String((w && w.name) || '').slice(0, 30), kind: w && w.kind === 'kid' ? 'kid' : 'adult' }; } };
  fromLink();
  onRender();
})();
