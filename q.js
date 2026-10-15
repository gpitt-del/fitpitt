'use strict';
/* ================= Exercise pictures (standalone site only) =================
   The how-to sheet shows a rendered picture of the start and finish of an exercise (img/<key>.webp, 1024 × 632, the panel cropped out of the 1024 square,
   drawn by Grok from Gabe's template, Oct 2026) in place of the h.js sketch. Exercises with no picture yet keep the
   sketch. The keys are the ones in h.js GROUPS (window.FP_SKOF maps an exercise name to its key). Every file listed
   here must exist in img/ and be in the sw.js SHELL, so the pictures work offline; a test checks all three agree. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const PICS = ['abductor', 'adductor', 'back_toss', 'balance', 'bear', 'bench', 'boxjump', 'bridge', 'broad', 'bulg', 'calf', 'chest', 'cmj', 'crab',
    'crunch', 'curl', 'curl_bayes', 'curl_cable', 'curl_incline', 'curl_preacher', 'deadbug', 'dip', 'drop', 'facepull', 'fly', 'hack', 'hangraise',
    'hipthrust', 'hk_press', 'incline', 'landmine', 'lateral', 'latlunge', 'legext', 'legpress', 'linehop', 'oh_throw', 'ohp', 'ohp_seat', 'pallof',
    'pogo', 'pulldown', 'pullthrough', 'pullup', 'pushdown', 'pushup', 'rdl', 'reach', 'rfly', 'row_1a', 'row_cs', 'sa_pulldown', 'scoop', 'side_throw',
    'sideplank', 'skater', 'skull', 'slam', 'snap', 'snap1', 'squat', 'squat_bb', 'squat_box', 'stepup', 'tri_oh'];
  // Where the picture shows a close cousin of the named exercise, say so under it.
  const SHOWN = { adductor: 'Shown: standing cable adduction. Same muscles as the machine, one leg at a time.',
    abductor: 'Shown: side-lying leg raise. Same muscles as the machine, one leg at a time.' };
  const HAS = {}; PICS.forEach(k => { HAS[k] = true; });
  window.FP_PICS = PICS;
  const css = document.createElement('style');
  css.textContent = '.sk-img{display:block;width:100%;height:auto;margin:2px 0 12px;border:1px solid var(--line);border-radius:10px;background:#fff}' +
    '.sk-cap{font-size:13px;color:var(--muted);margin:-6px 0 12px}';
  document.head.appendChild(css);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sketched = ACT.how; // g.js photos + steps, then h.js swaps in the sketch
  ACT.how = t => {
    sketched(t);
    const name = t.dataset.name || '', key = (window.FP_SKOF || {})[name]; if (!key || !HAS[key]) return;
    const body = document.querySelector('.sheet-body'), sk = body && body.querySelector('.sk'); if (!sk) return;
    const pic = '<img class="sk-img" src="img/' + key + '.webp" width="1024" height="632" alt="' + esc(name) + ', start and finish" data-key="' + key + '">' +
      (SHOWN[key] ? '<p class="sk-cap">' + esc(SHOWN[key]) + '</p>' : '');
    sk.insertAdjacentHTML('beforebegin', pic); sk.remove();
  };
})();
