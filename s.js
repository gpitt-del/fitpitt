'use strict';
/* ================= Tick first, type later (standalone site only) =================
   Gabe, Oct 12: a set ends when the weight goes down, and the clock should start right then, not after the reps are
   typed. Two things here:
   1. The tick restarts the stopwatch (k.js) from zero, every time a set is logged, so the stopwatch reads "time since
      the last set" without a second tap. It turns red once the exercise's rest (the number shown beside the sets) is
      up. The stopwatch's own controls still work.
   2. The tick logs the set even with the reps box blank; the box stays marked while you rest, and the reps go in when
      you have your breath. A set still blank when the workout is finished is saved with the reps the app expected
      (last time's reps, or the bottom of the range) and flagged `a` (assumed), and the target rules then ask you to
      beat last time instead of adding weight off a number nobody typed. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const css = document.createElement('style');
  css.textContent = '.set.done .field input.want{border-color:var(--day);background:var(--surface);box-shadow:inset 0 0 0 1px var(--day)}' +
    '.sw.on.late{color:var(--alert)}';
  document.head.appendChild(css);
  let toldOnce = null; // one hint per workout
  let restDue = 0; // when the current rest is up, ms since epoch; 0 = no set logged yet

  // The stopwatch starts over from zero whenever a set is logged.
  function restart(sec) {
    if (ACT.swRestart) ACT.swRestart();
    restDue = sec > 0 ? Date.now() + sec * 1000 : 0;
    late();
  }
  function late() { const el = document.getElementById('sw'); if (!el) return; el.classList.toggle('late', !!restDue && Date.now() > restDue); }
  setInterval(late, 1000);

  const tick = ACT.toggleSet;
  ACT.toggleSet = t => {
    const a = S.active; if (!a) return tick(t);
    const { ei, si } = rowOf(t), e = a.ex[ei], s = e.sets[si];
    if (s.done) return tick(t); // undo
    if (s.r > 0) { tick(t); if (s.done) restart(restOf(e)); return; } // a normal tick with the reps typed
    if (s.w == null) s.w = 0;
    resumeClock(a);
    s.done = true; s.t = Date.now(); s.r = null;
    if (trimLeadIn(a)) toast('Clock restarted from your first set.');
    saveActive(true); render();
    restart(restOf(e));
    if (toldOnce !== a.id) { toldOnce = a.id; toast('Logged. Type the reps when you have your breath.'); }
  };

  // Mark the reps box of a logged set that is still blank.
  function mark() {
    document.querySelectorAll('.set.done input[data-f="r"]').forEach(inp => { inp.classList.toggle('want', !(num(inp.value) > 0)); });
  }
  new MutationObserver(mark).observe($('#app'), { childList: true, subtree: true });
  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('.set.done input[data-f="r"]')) mark(); });

  // Finishing: fill the blanks with what the app expected and flag them.
  const realFinish = finishWorkout;
  finishWorkout = function () {
    const a = S.active; if (!a) return realFinish();
    const flagged = [];
    a.ex.forEach((e, ei) => {
      let n = 0;
      e.sets.forEach((s, si) => {
        if (!s.drop) n++;
        if (!s.done || s.r > 0) return;
        const ph = !s.drop && e.ph && e.ph[n - 1] ? +e.ph[n - 1] : 0;
        s.r = ph > 0 ? ph : Math.max(1, e.lo || 1); flagged.push([ei, si]);
      });
    });
    const id = a.id;
    realFinish();
    if (!flagged.length || S.active) return; // nothing assumed, or the finish was refused
    const sess = S.sessions.find(x => x.id === id); if (!sess) return;
    // The saved session keeps only done sets, in order; map each flagged set to its place among them.
    const pos = {}; a.ex.forEach((e, ei) => { let k = 0; e.sets.forEach((s, si) => { if (s.done) { pos[ei + ':' + si] = k++; } }); });
    const bySlot = {}; sess.ex.forEach(x => { bySlot[x.slot] = x; });
    flagged.forEach(([ei, si]) => { const x = bySlot[a.ex[ei].slot], k = pos[ei + ':' + si]; if (x && x.sets[k]) x.sets[k].a = true; });
    saveSession(sess);
    toast(flagged.length + (flagged.length === 1 ? ' set was saved with assumed reps.' : ' sets were saved with assumed reps.'));
  };

  // Targets: a session with assumed reps never earns a weight step on its own.
  const prev = aim;
  aim = function (p, deload) {
    const out = prev(p, deload);
    if (deload || (p.t && p.t !== 'str')) return out;
    const last = lastFor(p.name, false); if (!last) return out;
    const m = last.e.sets.filter(x => !x.drop), w = m[0] ? m[0].w || 0 : 0;
    const steps = (out.ws.length && out.ws[0] > w) || /Add weight|goes to|next small step|went past/.test(out.text || '');
    if (!m.some(x => x.a) || !steps) return out;
    const n = m.filter(x => x.a).length;
    return { text: 'Stay at ' + fmtLoad(w, p.bw) + ' and beat ' + m.map(x => x.r).join(', ') + '. Last time the reps on ' + (n === 1 ? 'one set were' : n + ' sets were') + ' assumed, not typed, so no weight goes on until a full set of real numbers.', ws: m.map(() => w), reps: m.map(x => x.r) };
  };
})();
