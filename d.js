'use strict';
/* ---------- Plan ---------- */
function viewPlan(pos) {
  const prog = P(), m = M(), keys = dayKeys(), start = weekStart(0), end = addDays(weekStart(YEAR_WEEKS - 1), 6);
  let h = '<header class="hero"><div><h1>The 52 weeks</h1><p>' + fmtDate(start, true) + ' to ' + fmtDate(end, true) + '. Seven blocks. Each builds for six or seven weeks, then ' + (prog.youth ? 'eases off' : 'deloads') + ' for one.</p></div></header>';
  h += yearBar(pos, true) + '<div class="legend"><span><i class="l-past"></i>Done</span><span><i class="l-now"></i>This week</span><span><i class="l-dl"></i>' + (prog.youth ? 'Easy week and re-test' : 'Deload and scan') + '</span></div>';
  h += '<h2>Blocks</h2>';
  let first = 0;
  BLOCK_WEEKS.forEach((len, b) => {
    const s = weekStart(first), dl = weekStart(first + len - 1), e = addDays(dl, 6), cur = !pos.pre && pos.block === b + 1, p = posFromPlanWeek(first);
    h += '<details class="block' + (cur ? ' cur' : '') + '"' + (cur || (pos.pre && b === 0) ? ' open' : '') + '><summary><span class="blk-n">Block ' + (b + 1) + '</span><span class="blk-r">Rotation ' + p.rot + '</span><span class="blk-d">' + fmtDate(s) + ' to ' + fmtDate(e, true) + '</span></summary><div class="inner">' +
      '<p class="small">' + (len - 1) + ' build weeks, then ' + (prog.youth ? 'an easy week and re-test' : 'a deload and body scan') + ' the week of ' + fmtDate(dl) + '.' + (b >= 3 ? ' Same exercises as block ' + (b - 2) + ', so compare your numbers.' : '') + '</p><div class="menu">' +
      keys.map(d => '<h3>' + plate(d, 'sm') + esc(prog.days[d][0]) + '</h3><ol>' + dayPlan(d, p).map(x => '<li><span>' + esc(x.name) + '</span><span>' + targetText(x, x.sets) + '</span></li>').join('') + '</ol>').join('') + '</div></div></details>';
    first += len;
  });
  const plan = {}; keys.forEach(d => dayPlan(d, posFromPlanWeek(0)).forEach(p => { plan[p.g] = (plan[p.g] || 0) + prog.freq * (p.sets + 0.5 * p.rpn); }));
  const top = Math.max(prog.youth ? 1 : 25, Math.max.apply(null, Object.keys(plan).map(g => plan[g])));
  h += '<h2>' + (prog.youth ? 'Sets per week' : 'Hard sets per week') + '</h2><p class="small muted" style="margin-bottom:12px">' + VOLNOTE[S.meta.program] + '</p><div class="vol">' +
    Object.keys(GROUPS).filter(g => plan[g]).map(g => '<span>' + GROUPS[g] + '</span><span class="track"><i style="width:' + Math.min(100, plan[g] / top * 100) + '%"></i></span><span class="n">' + trim(plan[g]) + '</span>').join('') + '</div>';
  h += '<h2>The rules</h2><ul class="rules">' + (rpMode() ? ['<b>Rest-pause on machine, cable and bodyweight lifts.</b> One set to failure, ' + S.meta.restRp + ' seconds of rest, then mini-sets to failure until they add up to about the first set. A mini-set counts as half a set here.'] : []).concat(prog.rules()).map(r => '<li>' + r + '</li>').join('') + '</ul>';
  return h;
}

/* ---------- Body or tests ---------- */
function lineChart(pts, unit, label) {
  if (pts.length < 2) return '<p class="small muted">One entry so far. The line starts with the next one.</p>';
  const W = 340, H = 132, L = 6, R = 6, T = 28, B = 24;
  const xs = pts.map(p => dayNum(p.t)), ys = pts.map(p => p.v);
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
  let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys); if (y1 === y0) { y0 -= 1; y1 += 1; }
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const lastI = pts.length - 1, by = Y(ys[0]).toFixed(1);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + ': ' + trim(ys[0]) + ' to ' + trim(ys[lastI]) + '">';
  s += '<line class="base" x1="' + L + '" x2="' + (W - R) + '" y1="' + by + '" y2="' + by + '"/>';
  s += '<path class="ln" d="' + pts.map((p, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ') + '"/>';
  pts.forEach((p, i) => { s += '<circle class="dot" cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3.5"/>'; });
  s += '<text class="v" x="' + L + '" y="' + (Y(ys[0]) - 10).toFixed(1) + '">' + trim(round1(ys[0])) + unit + '</text>';
  s += '<text class="v" text-anchor="end" x="' + (W - R) + '" y="' + (Y(ys[lastI]) - 10).toFixed(1) + '">' + trim(round1(ys[lastI])) + unit + '</text>';
  s += '<text x="' + L + '" y="' + (H - 5) + '">' + fmtDate(pts[0].t) + '</text><text text-anchor="end" x="' + (W - R) + '" y="' + (H - 5) + '">' + fmtDate(pts[lastI].t) + '</text>';
  return s + '</svg>';
}
function nextScanText(pos) {
  const m = M(), easy = P().youth ? 'easy' : 'deload', dl = weekStart(pos.first + pos.len - 1);
  if (pos.pre) return 'Next ' + m.word + ' after the first: the week of ' + fmtDate(dl) + ', your first ' + easy + ' week.';
  if (pos.deload) return scanDue(pos) ? cap(m.word) + ' due this week. It is your ' + easy + ' week.' : 'This ' + easy + ' week is done. Next one: the week of ' + fmtDate(weekStart(pos.first + pos.len + (BLOCK_WEEKS[pos.block] || 7) - 1)) + '.';
  return 'Next ' + m.word + ': the week of ' + fmtDate(dl) + ', your ' + easy + ' week.';
}
function viewBody(pos) {
  const m = M(), sc = liveScans(), F = { lean: ['lean', 'Lean mass, computed', 'lb', 1] };
  m.fields.forEach(f => { F[f[0]] = f; });
  let h = '<header class="hero"><div><h1>' + m.title + '</h1><p>' + m.lede + '</p></div></header>';
  if (!sc.length) return h + '<div class="notice" style="margin-top:0"><strong>' + m.none + '</strong> ' + m.why + howList() + '<button class="btn primary" data-act="addScan">Add ' + m.first.toLowerCase() + '</button></div>';
  const rows = sc.map(s => Object.assign({}, s, { lean: (s.weight != null && s.fat != null) ? round1(s.weight * (1 - s.fat / 100)) : null }));
  const tile = f => {
    const v = rows.filter(s => s[f[0]] != null); if (!v.length) return '';
    const b = v[0][f[0]], l = v[v.length - 1][f[0]], d = round1(l - b);
    const dt = v.length > 1 ? (d > 0 ? '+' : d < 0 ? '\u2212' : '') + trim(Math.abs(d)) + (f[2] === '%' ? ' points' : ' ' + f[2]) + ' since the first' : 'First entry, ' + fmtDate(parseYmd(v[0].date));
    return '<div class="tile"><span class="t-l">' + f[1] + '</span><span class="t-v">' + trim(l) + '<small> ' + f[2] + '</small></span><span class="t-d' + (v.length > 1 && d !== 0 && Math.sign(d) === f[3] ? ' good' : '') + '">' + dt + '</span></div>';
  };
  h += '<div class="tiles">' + m.tiles.map(k => tile(F[k])).join('') + '</div>';
  h += '<p class="small muted" style="margin:12px 0">' + nextScanText(pos) + '</p><button class="btn wide" data-act="addScan">Add ' + m.word + '</button>';
  h += '<h2>Trend</h2>' + m.charts.map(k => { const f = F[k], pts = rows.filter(s => s[k] != null).map(s => ({ t: parseYmd(s.date), v: s[k] })); return pts.length ? '<div class="chart"><h3>' + f[1] + ', ' + f[2] + '</h3>' + lineChart(pts, '', f[1]) + '</div>' : ''; }).join('');
  h += '<h2>' + cap(m.word) + 's</h2><ul class="list">' + sc.slice().reverse().map((s, i) => {
    const line = m.fields.filter(f => s[f[0]] != null).map(f => f[1].toLowerCase() + ' ' + trim(s[f[0]]) + (f[2] === '%' ? '%' : ' ' + f[2])).join(', ');
    return '<li><div class="l-top"><strong>' + fmtDate(parseYmd(s.date), true) + (i === sc.length - 1 ? ', first' : '') + '</strong><span class="l-act"><button data-act="addScan" data-id="' + s.id + '">Edit</button><button data-act="askDelScan" data-id="' + s.id + '">Delete</button></span></div><div class="l-sub">' + esc(line) + (s.note ? '<br>' + esc(s.note) : '') + '</div></li>';
  }).join('') + '</ul>';
  return h + '<h2>How to ' + (m.word === 'scan' ? 'scan' : 'test') + '</h2>' + howList();
}
function scanSheet(id) {
  const m = M(), s = id ? S.scans.find(x => x.id === id) : null, first = !liveScans().length;
  openSheet('<h2>' + (s ? 'Edit ' + m.word : first ? m.first : 'Add ' + m.word) + '</h2><div class="frm">' +
    '<label><span>Date</span><input class="input" type="date" id="sc-date" value="' + (s ? s.date : ymd(new Date())) + '"></label><div class="two">' +
    m.fields.map(f => '<label><span>' + f[1] + ', ' + f[2] + '</span><input class="input" type="text" inputmode="decimal" id="sc-' + f[0] + '" value="' + (s && s[f[0]] != null ? trim(s[f[0]]) : '') + '" autocomplete="off"></label>').join('') + '</div>' +
    '<label><span>Note</span><input class="input" type="text" id="sc-note" maxlength="140" value="' + esc(s ? s.note || '' : '') + '" placeholder="Time of day, anything unusual"></label>' +
    '<p class="small muted">' + m.hint + '</p>' +
    '<button class="btn primary" data-act="saveScan" data-id="' + (s ? s.id : '') + '">Save</button><button class="btn link" data-act="closeSheet">Cancel</button></div>');
}

/* ---------- Progress ---------- */
function bodyWeightAt(date) {
  const w = liveScans().filter(s => s.weight != null); if (!w.length) return 0;
  let pick = w[0]; w.forEach(s => { if (s.date <= date) pick = s; }); return pick.weight;
}
function exSeries(name) {
  const rows = [], youth = !!P().youth;
  mySessions().forEach(s => { const e = s.ex.find(x => x.name === name); if (!e) return; const main = e.sets.filter(x => !x.drop); if (main.length) rows.push({ s, e, main }); });
  const loaded = rows.some(r => r.main.some(x => (x.w || 0) + (r.e.bw && !youth ? bodyWeightAt(r.s.date) : 0) > 0));
  const pts = rows.map(r => {
    const bw = r.e.bw && !youth ? bodyWeightAt(r.s.date) : 0;
    const best = Math.max.apply(null, r.main.map(x => !loaded ? x.r : youth ? (x.w || 0) : ((x.w || 0) + bw) * (1 + x.r / 30)));
    return { t: parseYmd(r.s.date), v: round1(best) };
  });
  const unit = rows.length && rows[0].e.unit === 'sec' ? 'Seconds' : 'Reps';
  const label = !loaded ? unit + ' in the best set of each session.' : youth ? 'Heaviest weight used in each session, lb.' : 'Estimated one-rep max from the best set of each session' + (rows.some(r => r.e.bw) && bodyWeightAt('9999') > 0 ? ', bodyweight included' : '') + '.';
  return { rows, pts, label };
}
function setsLine(e) {
  const main = e.sets.filter(x => !x.drop), drops = e.sets.filter(x => x.drop && !x.part && !x.mini), parts = e.sets.filter(x => x.part), minis = e.sets.filter(x => x.mini);
  const w = main.length ? main[0].w || 0 : 0, same = main.every(x => (x.w || 0) === w), reps = main.map(x => x.r).join(', ');
  let t = !main.length ? '' : e.nw ? reps + (e.unit === 'sec' ? ' sec' : ' reps') : same ? fmtLoad(w, e.bw) + ' × ' + reps : main.map(x => trim(x.w || 0) + ' × ' + x.r).join(', ');
  if (minis.length) t += (t ? '; ' : '') + 'minis ' + minis.map(x => x.r).join(', ');
  if (drops.length) t += (t ? '; ' : '') + 'drop ' + drops.map(x => (x.w ? trim(x.w) : 'bodyweight') + ' × ' + x.r).join(', ');
  if (parts.length) t += (t ? '; ' : '') + 'partials ' + parts.map(x => x.r).join(', ');
  return t;
}
function viewProgress(pos) {
  const prog = P(), all = mySessions(), wk = all.filter(s => s.week === pos.week), vol = weekVolume(pos);
  let h = '<header class="hero"><div><h1>Progress</h1><p>' + all.length + (all.length === 1 ? ' workout' : ' workouts') + ' logged.</p></div></header>';
  h += '<h2 style="margin-top:6px">This week</h2><p class="small muted" style="margin-bottom:12px">' + wk.length + ' of ' + prog.perWeek + ' sessions, ' + Math.round(wk.reduce((a, s) => a + (s.dur || 0), 0) / 60) + ' minutes. Sets done against the plan.</p><div class="vol">' +
    Object.keys(GROUPS).filter(g => vol.plan[g] || vol.done[g]).map(g => { const d = vol.done[g] || 0, p = vol.plan[g] || 0; return '<span>' + GROUPS[g] + '</span><span class="track"><i style="width:' + (p ? Math.min(100, d / p * 100) : 100) + '%"></i></span><span class="n">' + trim(d) + '<small>/' + trim(p) + '</small></span>'; }).join('') + '</div>';
  h += '<h2>' + (prog.youth ? 'Drill by drill' : 'Lift by lift') + '</h2>';
  const names = Array.from(new Set([].concat.apply([], all.map(s => s.ex.map(e => e.name))))).sort();
  if (!names.length) h += '<p class="muted">Your exercises show up here after the first workout, one line each.</p>';
  else {
    if (!progEx || !names.includes(progEx)) progEx = all[all.length - 1].ex[0].name;
    const ser = exSeries(progEx);
    h += '<select id="progsel" aria-label="Exercise">' + names.map(n => '<option' + (n === progEx ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
    h += '<div class="chart"><p class="small muted">' + ser.label + '</p>' + lineChart(ser.pts, '', progEx) + '</div>';
    h += '<ul class="list" style="margin-top:12px">' + ser.rows.slice(-5).reverse().map(r => '<li><div class="l-top"><strong>' + fmtDate(parseYmd(r.s.date)) + '</strong><span class="small muted">' + (r.s.deload ? 'easy week' : 'block ' + r.s.block + ', week ' + r.s.wib) + '</span></div><div class="l-sub">' + esc(setsLine(r.e)) + '</div></li>').join('') + '</ul>';
  }
  h += '<h2>Workouts</h2>';
  if (!all.length) h += '<p class="muted">Nothing logged yet. Start from the Today tab.</p>';
  else {
    h += '<ul class="list">' + all.slice().reverse().slice(0, histN).map(s => '<li><details class="sess"><summary><div class="l-top"><strong>' + fmtDow(parseYmd(s.date)) + '</strong><span class="small muted">day ' + s.day + '</span></div><div class="l-sub">' + setN(s) + ' sets in ' + Math.round((s.dur || 0) / 60) + ' minutes, block ' + s.block + ' week ' + s.wib + (s.deload ? ', easy week' : '') + '</div></summary><div class="lines">' +
      s.ex.map(e => '<div><b>' + esc(e.name) + ':</b> ' + esc(setsLine(e)) + '</div>').join('') + (s.note ? '<div class="muted">' + esc(s.note) + '</div>' : '') +
      '<div class="l-act"><button data-act="askDelSession" data-id="' + s.id + '">Delete this workout</button></div></div></details></li>').join('') + '</ul>';
    if (all.length > histN) h += '<button class="btn quiet wide" style="margin-top:12px" data-act="more">Show older workouts</button>';
  }
  return h;
}

/* ---------- Settings ---------- */
function viewSettings() {
  const prog = P(), pri = S.meta.priority || [], start = parseYmd(S.meta.startDate);
  const opts = (list, cur) => list.map(v => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + fmtClock(v) + '</option>').join('');
  const paused = (S.meta.paused || []).slice().sort(), have = {};
  dayKeys().forEach(d => prog.slots[d].forEach(s => { have[s.g] = 1; }));
  const installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  let h = '<header class="hero"><div><h1>Settings</h1></div></header>';
  h += '<div class="setting"><label for="program">Plan</label><p>' + prog.line + '</p><select id="program">' + Object.keys(PROGRAMS).map(k => '<option value="' + k + '"' + (k === S.meta.program ? ' selected' : '') + '>' + PROGRAMS[k].name + '</option>').join('') + '</select></div>';
  if (STANDALONE && !installed) h += '<div class="setting"><span class="s-l">Put FitPitt on your home screen</span><p>Android: open the browser menu and choose Add to Home screen. iPhone: tap Share, then Add to Home Screen.</p>' + (installEvt ? '<button class="btn small" data-act="install">Install on this phone</button>' : '') + '</div>';
  h += '<div class="setting"><label for="startDate">Plan start date</label><p>Week 1 begins here. Every block, easy week and re-measure date follows from it.</p><input class="input" type="date" id="startDate" value="' + S.meta.startDate + '"></div>';
  h += '<div class="setting"><span class="s-l">Pause a week</span><p>Travelling, sick or a tournament week? Pause it and the plan picks up where it left off, one week later.</p><div class="row"><input class="input" style="flex:1;min-width:150px" type="date" id="pauseDate" aria-label="A date in the week to pause" value="' + ymd(new Date()) + '"><button class="btn small" data-act="pauseWeek">Pause that week</button></div>' +
    (paused.length ? '<ul class="list" style="margin-top:12px">' + paused.map(p => '<li><div class="l-top"><span>Week of ' + fmtDate(addDays(start, 7 * rawWeek(parseYmd(p))), true) + '</span><span class="l-act"><button data-act="unpause" data-p="' + p + '">Resume</button></span></div></li>').join('') + '</ul>' : '') + '</div>';
  if (prog.effortSetting) h += '<div class="setting"><span class="s-l">Effort</span><p>Sets the cues and when the app tells you to add weight. With every set to failure, reps fall off from set to set, so the trigger becomes the first set reaching the top of the range.</p><div class="chips"><button data-act="setEffort" data-v="last" aria-pressed="' + (S.meta.effort !== 'all') + '">Last set to failure</button><button data-act="setEffort" data-v="all" aria-pressed="' + (S.meta.effort === 'all') + '">Every set to failure</button></div></div>';
  if (!prog.youth) {
    h += '<div class="setting"><span class="s-l">Session style</span><p>Rest-pause cuts a session by about a third: machine, cable and bodyweight lifts become one set to failure plus mini-sets on a short rest, and heavy free-weight lifts keep straight sets with rests capped at 2 minutes.</p><div class="chips"><button data-act="setStyle" data-v="std" aria-pressed="' + (S.meta.style !== 'rp') + '">Straight sets</button><button data-act="setStyle" data-v="rp" aria-pressed="' + (S.meta.style === 'rp') + '">Rest-pause</button></div></div>';
    h += '<div class="setting"><span class="s-l">Priority muscles</span><p>Pick up to two that lag. Each gets one extra set on its first two exercises.</p><div class="chips">' + PRIORITY.filter(g => have[g]).map(g => '<button data-act="togglePri" data-g="' + g + '" aria-pressed="' + pri.includes(g) + '">' + GROUPS[g] + '</button>').join('') + '</div></div>';
    h += '<div class="setting"><span class="s-l">Rest timer</span><p>Starts when you log a set.</p><div class="two"><label><span>Compound lifts</span><select id="restC">' + opts([90, 120, 150, 180, 210], S.meta.restC) + '</select></label><label><span>Everything else</span><select id="restI">' + opts([45, 60, 75, 90, 120], S.meta.restI) + '</select></label><label><span>Between mini-sets</span><select id="restRp">' + opts([15, 20, 30], S.meta.restRp) + '</select></label></div></div>';
  }
  h += '<div class="setting"><span class="s-l">Sound</span><div class="tickrow" style="margin-top:6px"><label><input type="checkbox" id="sound"' + (S.meta.sound ? ' checked' : '') + '> Beep and vibrate when rest is up</label></div></div>';
  h += '<div class="setting"><span class="s-l">Your data</span><p>' + (Cloud.db ? 'Everything saves with this page under your Claude login, so your phone and computer show the same log. A copy also stays on this device.' : 'Your log is saved on this device only. Download a backup from time to time.' + (STANDALONE ? ' Last backup: ' + (S.meta.lastBackup ? fmtDate(new Date(S.meta.lastBackup), true) : 'never') + '.' : '')) + '</p><div class="stack">' +
    '<button class="btn quiet wide" data-act="exportCsv">Download workout log, CSV</button><button class="btn quiet wide" data-act="exportJson">Download full backup, JSON</button><button class="btn quiet wide" data-act="importJson">Restore from a backup file</button><input type="file" id="importFile" accept=".json,application/json" hidden>' +
    '<button class="btn danger wide" data-act="askErase">Erase everything</button></div></div>';
  return h;
}
