'use strict';
/* ================= Manual stopwatch (standalone site only) =================
   Replaces the rest timer that started with every set. A small stopwatch sits under the session clock:
   tap to start or stop, hold to reset to zero, tap the circle to start over from zero. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  startRest = () => { /* no automatic rest timer any more */ };
  const KEY = 'fitpitt.stopwatch';
  let sw = { on: false, start: 0, acc: 0 }, holdT = null, held = false;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d.acc === 'number') sw = { on: !!d.on, start: +d.start || 0, acc: d.acc }; } catch (e) { /* start fresh */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sw)); } catch (e) { /* ignore */ } };
  const time = () => sw.acc + (sw.on ? Date.now() - sw.start : 0);
  function paint() { const el = document.getElementById('sw'); if (!el) return; el.textContent = fmtClock(time() / 1000); el.classList.toggle('on', sw.on); }
  function toggle() { if (sw.on) { sw.acc = time(); sw.on = false; } else { sw.start = Date.now(); sw.on = true; } save(); paint(); }
  function reset(run) { sw = { on: !!run, start: Date.now(), acc: 0 }; save(); paint(); }

  const css = document.createElement('style');
  css.textContent = '.clocks{display:flex;flex-direction:column;align-items:flex-end}.sw-row{display:flex;align-items:center;gap:2px;margin-top:-2px}' +
    '.sw{min-width:52px;background:none;border:0;padding:8px 0 8px 6px;text-align:right;font:700 20px/1 var(--fc);font-variant-numeric:tabular-nums;color:var(--alert);-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}' +
    '.sw.on{color:var(--good)}.sw-reset{width:34px;height:34px;border:0;background:none;display:grid;place-items:center;padding:0;color:var(--muted)}' +
    '.sw-reset svg{width:22px;height:22px;border:1.5px solid var(--line);border-radius:50%;padding:3px}';
  document.head.appendChild(css);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.2-5.1"/><path d="M19 4v4h-4"/></svg>';

  function mount() {
    const head = app.querySelector('.wk-head'), clock = head && head.querySelector('#elapsed');
    if (head && clock && !head.querySelector('.clocks')) {
      const box = document.createElement('div'); box.className = 'clocks'; clock.before(box); box.appendChild(clock);
      const row = document.createElement('div'); row.className = 'sw-row';
      row.innerHTML = '<button class="sw-reset" data-act="swRestart" aria-label="Start the stopwatch over from zero">' + ICON + '</button><button class="sw" id="sw" aria-label="Stopwatch. Tap to start or stop. Hold to reset.">0:00</button>';
      box.appendChild(row); paint();
    }
    // the rest timer settings and its beep no longer apply
    ['restC', 'sound'].forEach(id => { const el = document.getElementById(id), box = el && el.closest('.setting'); if (box) box.remove(); });
    const coach = document.getElementById('coach');
    if (coach && coach.innerHTML.indexOf('full timer') > 0) coach.innerHTML = coach.innerHTML.replace(/[Rr]est the full timer/g, m => m.charAt(0) + 'est 2 to 3 minutes on the big lifts');
  }
  ACT.swRestart = () => reset(true);
  const onSw = e => e.target && e.target.closest && e.target.closest('.sw');
  document.addEventListener('pointerdown', e => {
    if (!onSw(e)) return;
    held = false; clearTimeout(holdT);
    holdT = setTimeout(() => { held = true; reset(false); try { if (navigator.vibrate) navigator.vibrate(30); } catch (x) { /* ignore */ } }, 600);
  });
  document.addEventListener('pointerup', e => { if (!onSw(e)) return; clearTimeout(holdT); if (!held) toggle(); });
  document.addEventListener('pointercancel', () => clearTimeout(holdT));
  document.addEventListener('click', e => { if (onSw(e) && e.detail === 0) toggle(); }); // keyboard
  document.addEventListener('contextmenu', e => { if (onSw(e)) e.preventDefault(); });
  new MutationObserver(mount).observe(app, { childList: true });
  setInterval(paint, 250);
  mount();
})();
