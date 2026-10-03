'use strict';
/* ================= Stick-figure sketches (standalone site only) =================
   Swaps the photos in the how-to sheet for a drawn sketch of the start and finish of each exercise.
   Each pose: [anchor, x, y, torso, upperArm, forearm, thigh, shin, upperArm2, forearm2, thigh2, shin2].
   anchor 0 = hip at x,y; 1 = ankle of the first leg at x,y; 2 = hand of the first arm at x,y. Angles are directions on the page: 0 up, 90 right, 180 down, 270 left.
   f = front view; e = fixed equipment; x = extra shapes per frame; g = what the hands hold; c, c2 = cable anchors; q = pad at the ankle; k = captions; nf = no floor. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const SEG = { T: 24, U: 12, F: 11, H: 19, S: 19, N: 7.5 };
  const SQ = [1, 52, 92, 35, 165, 20, 108, 200], ST = [1, 52, 92, 3, 165, 20, 180, 180];           // squat bottom / standing, weight at chest
  const DIP = [1, 46, 92, 30, 215, 215, 140, 190], UP = [1, 50, 92, 0, 180, 178, 180, 180];       // quarter squat with arms back / standing tall
  const BENCH = [['l', 16, 72, 66, 72], ['l', 22, 72, 22, 92], ['l', 60, 72, 60, 92]];
  const INCL = [['l', 52, 78, 70, 78], ['l', 61, 78, 33, 58], ['l', 64, 78, 64, 92], ['l', 40, 63, 40, 92]];
  const SEAT = [['l', 26, 76, 54, 76], ['l', 30, 76, 24, 44], ['l', 40, 76, 40, 92]];
  const SK = {
    bench: { p: [[0, 56, 68, 270, 90, 0, 95, 180], [0, 56, 68, 270, 0, 0, 95, 180]], e: BENCH, g: 'd' },
    incline: { p: [[0, 58, 74, 305, 100, 350, 87, 180], [0, 58, 74, 305, 355, 355, 87, 180]], e: INCL, g: 'd' },
    fly: { f: 1, p: [[0, 50, 54, 0, 100, 95, 176, 180, 260, 265, 184, 180], [0, 50, 54, 0, 145, 262, 176, 180, 215, 98, 184, 180]], c: [94, 10], c2: [6, 10] },
    rfly: { f: 1, p: [[0, 50, 54, 0, 145, 262, 176, 180, 215, 98, 184, 180], [0, 50, 54, 0, 100, 95, 176, 180, 260, 265, 184, 180]], g: 'd' },
    dip: { p: [[2, 50, 56, 10, 185, 180, 195, 260], [2, 50, 56, 25, 265, 180, 200, 265]], e: [['l', 50, 56, 50, 92]], k: ['Top', 'Bottom'] },
    tri_oh: { p: [[1, 50, 92, 10, 5, 215, 180, 180], [1, 50, 92, 10, 5, 10, 180, 180]], c: [10, 86] },
    skull: { p: [[0, 56, 68, 270, 345, 255, 95, 180], [0, 56, 68, 270, 345, 345, 95, 180]], e: BENCH, g: 'b' },
    pushdown: { p: [[1, 46, 92, 8, 172, 45, 180, 180], [1, 46, 92, 8, 172, 165, 180, 180]], e: [['l', 92, 8, 92, 92]], c: [90, 8] },
    curl: { p: [[1, 48, 92, 2, 168, 168, 180, 180], [1, 48, 92, 2, 165, 15, 180, 180]], g: 'd' },
    curl_incline: { p: [[0, 52, 74, 325, 185, 185, 88, 180], [0, 52, 74, 325, 185, 20, 88, 180]], e: [['l', 48, 78, 66, 78], ['l', 56, 78, 36, 50], ['l', 60, 78, 60, 92]], g: 'd' },
    curl_preacher: { p: [[1, 40, 92, 20, 125, 125, 180, 180], [1, 40, 92, 20, 125, 330, 180, 180]], e: [['l', 50, 37, 70, 51], ['l', 62, 45, 62, 92]], g: 'b' },
    curl_cable: { p: [[1, 44, 92, 2, 168, 165, 180, 180], [1, 44, 92, 2, 165, 15, 180, 180]], c: [88, 88] },
    curl_bayes: { p: [[1, 54, 92, 5, 195, 195, 180, 180], [1, 54, 92, 5, 195, 30, 180, 180]], c: [8, 88] },
    lateral: { f: 1, p: [[0, 50, 54, 0, 172, 172, 176, 180, 188, 188, 184, 180], [0, 50, 54, 0, 95, 95, 176, 180, 265, 265, 184, 180]], g: 'd' },
    pullup: { f: 1, nf: 1, p: [[0, 50, 60.5, 0, 12, 12, 178, 178, 348, 348, 182, 182], [0, 50, 41, 0, 150, 354, 178, 178, 210, 6, 182, 182]], e: [['l', 22, 14, 78, 14]], k: ['Hang', 'Top'] },
    pulldown: { f: 1, p: [[0, 50, 70, 0, 15, 10, null, null, 345, 350], [0, 50, 70, 0, 150, 5, null, null, 210, 355]], e: [['l', 38, 74, 62, 74], ['l', 50, 74, 50, 92]], g: 'b', c: [50, 2] },
    row: { p: [[0, 42, 74, 0, 100, 95, 92, 110], [0, 42, 74, 0, 235, 95, 92, 110]], e: [['l', 28, 78, 56, 78], ['l', 34, 78, 34, 92], ['l', 50, 78, 50, 92], ['l', 83, 72, 83, 90], ['l', 93, 50, 93, 92]], c: [92, 60] },
    row_cs: { p: [[0, 44, 70, 42, 180, 180, 205, 265], [0, 44, 70, 42, 255, 175, 205, 265]], e: [['l', 40, 80, 66, 52], ['l', 56, 64, 56, 92]], g: 'd' },
    row_1a: { p: [[1, 36, 92, 80, 180, 180, 160, 175, 170, 170], [1, 36, 92, 80, 262, 172, 160, 175, 170, 170]], e: [['l', 46, 75, 82, 75], ['l', 52, 75, 52, 92], ['l', 76, 75, 76, 92]], g: 'd' },
    sa_pulldown: { p: [[1, 40, 92, 22, 60, 60, 180, 180], [1, 40, 92, 22, 160, 160, 180, 180]], e: [['l', 94, 6, 94, 92]], c: [92, 6] },
    ohp: { p: [[1, 50, 92, 0, 150, 0, 180, 180], [1, 50, 92, 0, 2, 2, 180, 180]], g: 'b' },
    ohp_seat: { p: [[0, 50, 70, 0, 150, 0, 92, 180], [0, 50, 70, 0, 2, 2, 92, 180]], e: [['l', 38, 74, 58, 74], ['l', 43, 74, 43, 40], ['l', 42, 74, 42, 92], ['l', 56, 74, 56, 92]], g: 'd' },
    hk_press: { p: [[0, 46, 73, 0, 150, 0, 90, 180, null, null, 180, 270], [0, 46, 73, 0, 2, 2, 90, 180, null, null, 180, 270]], g: 'd' },
    landmine: { p: [[0, 46, 73, 0, 150, 20, 90, 180, null, null, 180, 270], [0, 46, 73, 0, 30, 30, 90, 180, null, null, 180, 270]], x: [[['l', 56, 45, 94, 92]], [['l', 58, 29, 94, 92]]] },
    facepull: { p: [[1, 42, 92, 355, 85, 85, 180, 180], [1, 42, 92, 355, 285, 30, 180, 180]], e: [['l', 92, 10, 92, 92]], c: [90, 24] },
    shrug: { f: 1, p: [[0, 50, 54, 0, 172, 172, 176, 180, 188, 188, 184, 180], [0, 50, 51, 0, 172, 172, 176, 180, 188, 188, 184, 180]], g: 'd', x: [[], [['a', 30, 30, 0], ['a', 70, 30, 0]]] },
    squat: { p: [ST, SQ], g: 'd' },
    squat_bb: { p: [[1, 52, 92, 3, 215, 320, 180, 180], [1, 52, 92, 35, 215, 320, 108, 200]], g: 's' },
    squat_box: { p: [ST, SQ], e: [['r', 26, 72, 18, 20]], g: 'd' },
    hack: { p: [[0, 44, 56, 340, 200, 200, 150, 165], [0, 50, 70, 340, 200, 200, 95, 215]], e: [['l', 27, 24, 52, 92], ['l', 50, 92, 74, 85]] },
    legpress: { p: [[0, 36, 76, 300, 150, 150, 35, 95], [0, 36, 76, 300, 150, 150, 62, 62]], e: [['l', 41, 81, 15, 66], ['l', 41, 81, 41, 92]], x: [[['l', 70, 52, 66, 72]], [['l', 75, 49, 68, 68]]] },
    rdl: { p: [[1, 54, 92, 2, 180, 180, 180, 180], [1, 54, 92, 78, 180, 180, 152, 177]], g: 'b' },
    backext: { p: [[0, 46, 58, 120, null, null, 215, 215], [0, 46, 58, 35, null, null, 215, 215]], e: [['l', 38, 67, 56, 55], ['l', 47, 61, 47, 92], ['c', 22, 91, 2]] },
    pullthrough: { p: [[1, 54, 92, 78, 200, 200, 152, 177], [1, 54, 92, 2, 180, 172, 180, 180]], c: [6, 86] },
    splitsq: { p: [[0, 48, 56, 3, 180, 180, 160, 180, null, null, 205, 215], [0, 48, 68, 5, 180, 180, 105, 195, null, null, 190, 265]], g: 'd' },
    bulg: { p: [[0, 48, 56, 3, 180, 180, 160, 180, null, null, 215, 250], [0, 48, 68, 5, 180, 180, 105, 195, null, null, 200, 295]], e: [['l', 8, 78, 32, 78], ['l', 12, 78, 12, 92], ['l', 28, 78, 28, 92]], g: 'd' },
    stepup: { p: [[0, 44, 54, 5, 180, 180, 110, 180, null, null, 180, 180], [0, 62, 38, 0, 180, 180, 180, 180]], e: [['r', 52, 76, 26, 16]], g: 'd' },
    latlunge: { f: 1, p: [[0, 50, 54, 0, 172, 172, 176, 180, 188, 188, 184, 180], [0, 58, 66, 0, 172, 172, 110, 185, 188, 188, 235, 235]] },
    legcurl: { p: [[0, 34, 72, 352, 170, 120, 90, 92], [0, 34, 72, 352, 170, 120, 90, 195]], e: SEAT, q: 'p' },
    legcurl_lying: { p: [[0, 52, 68, 270, 240, 180, 90, 90], [0, 52, 68, 270, 240, 180, 90, 350]], e: BENCH, q: 'p' },
    legext: { p: [[0, 34, 72, 352, 170, 120, 90, 185], [0, 34, 72, 352, 170, 120, 90, 92]], e: SEAT, q: 'p' },
    calf: { p: [[1, 52, 86, 0, 180, 178, 180, 180], [1, 52, 82, 0, 180, 178, 180, 180]], e: [['r', 40, 86, 24, 6]], x: [[], [['a', 68, 62, 0]]], k: ['Heels down', 'Heels up'] },
    adductor: { f: 1, p: [[0, 50, 58, 0, 172, 172, 115, 180, 188, 188, 245, 180], [0, 50, 58, 0, 172, 172, 150, 180, 188, 188, 210, 180]], e: [['l', 36, 61, 64, 61]], x: [[], [['a', 74, 70, 270], ['a', 26, 70, 90]]], k: ['Open', 'Squeeze in'] },
    abductor: { f: 1, p: [[0, 50, 58, 0, 172, 172, 150, 180, 188, 188, 210, 180], [0, 50, 58, 0, 172, 172, 115, 180, 188, 188, 245, 180]], e: [['l', 36, 61, 64, 61]], x: [[], [['a', 80, 60, 90], ['a', 20, 60, 270]]], k: ['Closed', 'Push out'] },
    crunch: { p: [[0, 40, 73, 15, 20, 320, 178, 270], [0, 40, 73, 95, 60, 0, 178, 270]], c: [84, 8] },
    hangraise: { nf: 1, p: [[2, 50, 12, 0, 0, 0, 180, 180], [2, 50, 12, 0, 0, 0, 95, 95]], e: [['l', 30, 12, 70, 12]], k: ['Hang', 'Legs up'] },
    sideplank: { p: [[1, 16, 92, 78, 180, 90, 258, 258, 350, 350]], k: ['Hold'] },
    deadbug: { p: [[0, 52, 88, 270, 0, 0, 0, 90], [0, 52, 88, 270, 0, 0, 0, 90, 290, 285, 80, 85]], k: ['Start', 'Reach'] },
    pallof: { p: [[1, 46, 92, 0, 150, 30, 180, 180], [1, 46, 92, 0, 90, 90, 180, 180]], k: ['At chest', 'Press out'] },
    balance: { p: [[1, 50, 92, 0, 160, 150, 180, 180, null, null, 140, 205]], k: ['Hold'] },
    reach: { p: [[1, 46, 92, 0, 160, 150, 180, 180, null, null, 140, 205], [1, 46, 92, 60, 150, 150, 150, 195, null, null, 225, 250]], e: [['c', 78, 90, 2]], k: ['Balance', 'Reach'] },
    bear: { p: [[0, 38, 72, 80, 170, 175, 150, 265]], k: ['Crawl'] },
    crab: { p: [[0, 46, 74, 285, 185, 175, 80, 175]], k: ['Walk'] },
    ext_rot: { f: 1, p: [[0, 50, 54, 0, 180, 265, 176, 180, 188, 188, 184, 180], [0, 50, 54, 0, 180, 95, 176, 180, 188, 188, 184, 180]], c: [6, 43] },
    snap: { p: [[1, 50, 89, 0, 0, 0, 180, 180], DIP], k: ['Tall', 'Stick'] },
    snap1: { p: [[1, 50, 89, 0, 0, 0, 180, 180], [1, 46, 92, 30, 215, 215, 140, 190, null, null, 150, 235]], k: ['Tall', 'Stick'] },
    cmj: { p: [DIP, [1, 52, 76, 0, 12, 12, 180, 180]], x: [[], [['a', 70, 60, 0]]], k: ['Dip', 'Jump'] },
    boxjump: { p: [[1, 26, 92, 30, 215, 215, 140, 190], [1, 76, 70, 30, 100, 100, 140, 190]], e: [['r', 60, 70, 34, 22]], k: ['Dip', 'Land'] },
    broad: { p: [[1, 20, 92, 30, 215, 215, 140, 190], [0, 62, 58, 40, 70, 70, 200, 235]], x: [[], [['a', 30, 70, 90]]], k: ['Dip', 'Jump'] },
    skater: { f: 1, p: [[0, 32, 56, 352, 100, 120, 150, 215, 255, 200, 183, 180], [0, 68, 56, 8, 105, 160, 177, 180, 260, 240, 210, 145]], k: ['Push off', 'Stick'] },
    pogo: { p: [UP, [1, 50, 85, 0, 180, 178, 180, 180]], x: [[], [['a', 64, 70, 0]]], k: ['Floor', 'Hop'] },
    drop: { p: [[1, 24, 72, 0, 180, 178, 180, 180], [1, 62, 92, 30, 215, 215, 140, 190]], e: [['r', 6, 72, 32, 20]], k: ['Step off', 'Stick'] },
    linehop: { f: 1, p: [[0, 30, 54, 0, 172, 172, 176, 180, 188, 188, 184, 180], [0, 70, 54, 0, 172, 172, 176, 180, 188, 188, 184, 180]], e: [['l', 50, 86, 50, 92]], x: [[], [['a', 50, 60, 90]]], k: ['One side', 'Other side'] },
    slam: { p: [[1, 46, 92, 355, 0, 0, 180, 180], [1, 46, 92, 60, 170, 170, 150, 185]], x: [[['c', 44, 2, 4.6, 1]], [['c', 70, 87, 4.6, 1]]], k: ['Reach', 'Slam'] },
    oh_throw: { p: [[1, 36, 92, 350, 350, 240, 180, 180], [1, 36, 92, 15, 75, 75, 180, 180]], e: [['l', 96, 8, 96, 92]], x: [[['c', 17, 22, 4.6, 1]], [['c', 82, 20, 4.6, 1]]], k: ['Load', 'Throw'] },
    side_throw: { p: [[1, 36, 92, 5, 200, 215, 180, 180], [1, 36, 92, 8, 88, 88, 180, 180]], e: [['l', 96, 8, 96, 92]], x: [[['c', 26, 56, 4.6, 1]], [['c', 82, 30, 4.6, 1]]], k: ['Load at the hip', 'Throw'] },
    scoop: { p: [[1, 46, 92, 45, 175, 175, 125, 195], [1, 46, 89, 355, 10, 10, 180, 180]], x: [[['c', 56, 73, 4.6, 1]], [['c', 54, -1, 4.6, 1]]], k: ['Dip', 'Throw up'] },
    back_toss: { p: [[1, 50, 92, 45, 175, 175, 125, 195], [1, 50, 89, 345, 345, 345, 180, 180]], x: [[['c', 60, 73, 4.6, 1]], [['c', 26, 2, 4.6, 1]]], k: ['Dip', 'Throw back'] },
    chest: { p: [[1, 36, 92, 0, 160, 30, 180, 180], [1, 36, 92, 5, 88, 88, 180, 180]], e: [['l', 96, 8, 96, 92]], x: [[['c', 50, 31, 4.6, 1]], [['c', 82, 30, 4.6, 1]]], k: ['At chest', 'Pass'] },
    pushup: { p: [[2, 72, 92, 68, 180, 180, 248, 248], [2, 72, 92, 82.6, 258, 120, 262.6, 262.6]], k: ['Top', 'Bottom'] },
    bridge: { p: [[0, 50, 88, 270, 90, 90, 35, 170], [0, 48, 74, 237.5, 100, 95, 70, 180]], k: ['Down', 'Up'] },
    hipthrust: { p: [[0, 50, 82, 295, 100, 60, 50, 175], [0, 52, 70, 270, 90, 60, 90, 180]], e: [['l', 6, 74, 30, 74], ['l', 10, 74, 10, 92], ['l', 26, 74, 26, 92]], x: [[['c', 52, 78, 3.4, 1]], [['c', 54, 66, 3.4, 1]]], k: ['Down', 'Up'] },
  };
  const pt = (p, a, len) => { const r = a * Math.PI / 180; return [p[0] + Math.sin(r) * len, p[1] - Math.cos(r) * len]; };
  function joints(P, front) {
    const an = P[0], x = P[1], y = P[2], t = P[3], sw = front ? 7 : 0, hw = front ? 4 : 0;
    let hip = [x, y];
    if (an === 1) { const h1 = pt(pt([x, y], P[7] + 180, SEG.S), P[6] + 180, SEG.H); hip = [h1[0] - hw, h1[1]]; }
    if (an === 2) { const s1 = pt(pt([x, y], P[5] + 180, SEG.F), P[4] + 180, SEG.U); hip = pt([s1[0] - sw, s1[1]], t + 180, SEG.T); }
    const sc = pt(hip, t, SEG.T), J = { hip, sc, head: pt(sc, t, SEG.N), arms: [], legs: [] };
    const arm = (u, f, o) => { if (u == null) return; const s = [sc[0] + o, sc[1]], e = pt(s, u, SEG.U); J.arms.push([s, e, pt(e, f, SEG.F)]); };
    const leg = (a, b, o) => { if (a == null) return; const h = [hip[0] + o, hip[1]], k = pt(h, a, SEG.H); J.legs.push([h, k, pt(k, b, SEG.S)]); };
    arm(P[4], P[5], sw); arm(P[8], P[9], -sw); leg(P[6], P[7], hw); leg(P[10], P[11], -hw);
    return J;
  }
  function sketchSvg(key) {
    const sk = SK[key]; if (!sk) return '';
    const n = sk.p.length, W = n === 1 ? 100 : 212, r = v => Math.round(v * 10) / 10, caps = sk.k || ['Start', 'Finish'];
    let s = '<svg class="sk' + (n === 1 ? ' one' : '') + '" viewBox="0 -8 ' + W + ' 116" role="img" aria-label="Sketch">';
    for (let i = 0; i < n; i++) {
      const ox = i * 112, J = joints(sk.p[i], sk.f);
      const ln = (a, b, c) => { s += '<line class="' + c + '" x1="' + r(a[0] + ox) + '" y1="' + r(a[1]) + '" x2="' + r(b[0] + ox) + '" y2="' + r(b[1]) + '"/>'; };
      const ci = (p, rad, c) => { s += '<circle class="' + c + '" cx="' + r(p[0] + ox) + '" cy="' + r(p[1]) + '" r="' + rad + '"/>'; };
      if (!sk.nf) ln([2, 92], [98, 92], 'sk-p');
      (sk.e || []).concat((sk.x && sk.x[i]) || []).forEach(q => {
        if (q[0] === 'l') ln([q[1], q[2]], [q[3], q[4]], 'sk-p');
        else if (q[0] === 'r') s += '<rect class="sk-p" x="' + (q[1] + ox) + '" y="' + q[2] + '" width="' + q[3] + '" height="' + q[4] + '"/>';
        else if (q[0] === 'c') ci([q[1], q[2]], q[3], q[4] ? 'sk-g' : 'sk-p');
        else if (q[0] === 'a') { const tip = pt([q[1], q[2]], q[3], 9); ln([q[1], q[2]], tip, 'sk-a'); ln(tip, pt(tip, q[3] + 150, 4), 'sk-a'); ln(tip, pt(tip, q[3] - 150, 4), 'sk-a'); }
      });
      const hands = J.arms.map(a => a[2]);
      const barFront = sk.g === 'b' && sk.f;
      if (sk.c && hands[0] && !barFront) { ln(hands[0], sk.c, 'sk-c'); ci(sk.c, 1.6, 'sk-p'); }
      if (sk.c2 && hands[1]) { ln(hands[1], sk.c2, 'sk-c'); ci(sk.c2, 1.6, 'sk-p'); }
      if (sk.g === 'b' && sk.f && hands.length > 1) { const y = (hands[0][1] + hands[1][1]) / 2; ln([hands[1][0] - 10, y], [hands[0][0] + 10, y], 'sk-b'); if (sk.c) { ln([sk.c[0], y], sk.c, 'sk-c'); } }
      ln(J.hip, J.sc, 'sk-f');
      if (sk.f) { ln([J.sc[0] - 7, J.sc[1]], [J.sc[0] + 7, J.sc[1]], 'sk-f'); ln([J.hip[0] - 4, J.hip[1]], [J.hip[0] + 4, J.hip[1]], 'sk-f'); }
      J.arms.concat(J.legs).forEach(l => { ln(l[0], l[1], 'sk-f'); ln(l[1], l[2], 'sk-f'); });
      ci(J.head, 4.5, 'sk-h');
      if (sk.q) J.legs.slice(0, 1).forEach(l => ci(l[2], 2.8, 'sk-g'));
      const held = sk.f ? hands : hands.slice(0, 1);
      if (sk.g === 'd') held.forEach(h => ci(h, 2.8, 'sk-g'));
      if (sk.g === 'b' && !sk.f) held.forEach(h => { ci(h, 4, 'sk-b0'); ci(h, 1.2, 'sk-g'); });
      if (sk.g === 's') { const b = [J.sc[0] - 2.5, J.sc[1] - 1.5]; ci(b, 4, 'sk-b0'); ci(b, 1.2, 'sk-g'); }
      s += '<text x="' + (ox + 50) + '" y="105" text-anchor="middle">' + (caps[i] || '') + '</text>';
    }
    return s + '</svg>';
  }
  // Which sketch each exercise name uses.
  const GROUPS = {
    bench: ['Flat DB press', 'DB bench press', 'Barbell bench press', 'Machine chest press'],
    incline: ['Incline DB press, 30°', 'Incline DB press, 45°', 'Incline DB press', 'Incline Smith press', 'Incline machine press'],
    fly: ['Incline cable fly', 'Pec deck', 'Seated cable fly'],
    dip: ['Weighted dips'],
    tri_oh: ['Overhead cable triceps extension', 'Single-arm overhead cable extension'],
    skull: ['EZ-bar lying extension, behind the head'],
    pushdown: ['Rope pushdown', 'Straight-bar pushdown', 'Cross-body cable extension'],
    curl: ['Cross-body hammer curl', 'Reverse EZ-bar curl', 'DB curl'],
    curl_incline: ['Incline DB curl'],
    curl_preacher: ['Preacher curl'],
    curl_cable: ['Rope hammer curl', 'Cable curl'],
    curl_bayes: ['Bayesian cable curl'],
    lateral: ['DB lateral raise', 'Cable lateral raise', 'Machine lateral raise'],
    pullup: ['Weighted pull-up', 'Weighted neutral-grip pull-up', 'Weighted chin-up', 'Assisted pull-up'],
    pulldown: ['Wide-grip lat pulldown', 'Neutral-grip lat pulldown', 'Single-arm cable pulldown', 'Lat pulldown'],
    row: ['Seated cable row', 'Band row'],
    row_cs: ['Chest-supported row'],
    row_1a: ['Single-arm DB row', 'One-arm DB row, each arm', 'One-arm DB row with a light weight'],
    sa_pulldown: ['Straight-arm pulldown', 'Cable pullover'],
    ohp: ['Standing military press'],
    ohp_seat: ['Seated DB shoulder press', 'Machine shoulder press'],
    hk_press: ['Half-kneeling one-arm DB press, each arm'],
    landmine: ['Landmine press, each arm'],
    facepull: ['Face pull'],
    rfly: ['Reverse pec deck', 'Cable rear-delt fly', 'Band pull-apart'],
    shrug: ['DB shrug', 'Barbell shrug'],
    squat: ['Goblet squat', 'Goblet squat, 3-second lower', 'Goblet squat with a light weight', 'DB front squat'],
    squat_bb: ['High-bar back squat', 'Smith squat'],
    squat_box: ['Squat to a box'],
    hack: ['Hack squat'],
    legpress: ['Leg press'],
    rdl: ['Romanian deadlift', 'Barbell Romanian deadlift', 'DB Romanian deadlift', 'Kettlebell deadlift'],
    backext: ['45° back extension, weighted', '45° back extension'],
    pullthrough: ['Cable pull-through'],
    splitsq: ['Split squat', 'Walking lunge', 'Reverse lunge'],
    bulg: ['Bulgarian split squat'],
    stepup: ['Step-up'],
    latlunge: ['Lateral lunge'],
    legcurl: ['Seated leg curl'],
    legcurl_lying: ['Lying leg curl'],
    legext: ['Leg extension', 'Single-leg leg extension'],
    calf: ['Standing calf raise', 'Leg-press calf raise', 'Single-leg calf raise', 'Single-leg calf raise, 3-second lower'],
    adductor: ['Adductor machine'],
    abductor: ['Abductor machine'],
    crunch: ['Cable crunch', 'Machine crunch'],
    hangraise: ['Hanging leg raise', "Captain's chair leg raise"],
    sideplank: ['Side plank'],
    deadbug: ['Dead bug'],
    pallof: ['Pallof press hold'],
    balance: ['Single-leg balance', 'Single-leg balance, eyes closed', 'Single-leg balance with a ball toss'],
    reach: ['Single-leg reach to a cone'],
    bear: ['Bear crawl'],
    crab: ['Crab walk'],
    ext_rot: ['Band external rotation, each arm', 'Side-lying DB external rotation, each arm', 'Band external rotation, elbow at shoulder height'],
    snap: ['Snap-down, stick the landing'],
    snap1: ['Snap-down to a single-leg stick'],
    drop: ['Drop landing from a low box', 'Step off a low box, stick the landing'],
    cmj: ['Countermovement jump', 'Jump and stick', 'Jump and reach', 'Approach jump, stick the landing'],
    boxjump: ['Box jump, step down'],
    broad: ['Broad jump', 'Broad jump, stick the landing'],
    skater: ['Skater hop, stick the landing', 'Skater hop, hold 3 seconds'],
    pogo: ['Pogo hops'],
    linehop: ['Line hops, side to side', 'Hop over a line, stick the landing'],
    slam: ['Med-ball overhead slam', 'Med-ball slam', 'Med-ball slam, step into it'],
    oh_throw: ['Med-ball overhead throw to a wall', 'Med-ball overhead throw, split stance'],
    side_throw: ['Med-ball side throw to a wall', 'Med-ball side throw, step behind', 'Med-ball side throw, half kneeling', 'Med-ball side toss to a partner'],
    scoop: ['Med-ball scoop toss'],
    back_toss: ['Med-ball backward overhead toss'],
    chest: ['Med-ball chest pass', 'Med-ball chest pass to a wall', 'Med-ball chest pass, step into it'],
    pushup: ['Push-up', 'Push-up, feet elevated', 'Push-up, 3-second lower', 'Push-up, hands on a bench'],
    bridge: ['Glute bridge', 'Barbell glute bridge'],
    hipthrust: ['Hip thrust', 'Machine hip thrust'],
  };
  const SKOF = {}; Object.keys(GROUPS).forEach(k => GROUPS[k].forEach(n => { SKOF[n] = k; }));
  const css = document.createElement('style');
  css.textContent = '.sk{display:block;width:100%;height:auto;margin:2px 0 12px;background:var(--surface);border:1px solid var(--line);border-radius:10px}.sk.one{width:54%}' +
    '.sk-f{stroke:var(--ink);stroke-width:2.8;stroke-linecap:round;fill:none}.sk-h{fill:var(--surface);stroke:var(--ink);stroke-width:2.6}.sk-p{stroke:var(--muted);stroke-width:1.8;stroke-linecap:round;fill:none}' +
    '.sk-c{stroke:var(--muted);stroke-width:1.2;stroke-dasharray:3 2;fill:none}.sk-g{fill:var(--day);stroke:none}.sk-b{stroke:var(--day);stroke-width:3;stroke-linecap:round}.sk-b0{fill:var(--surface);stroke:var(--day);stroke-width:1.8}' +
    '.sk-a{stroke:var(--day);stroke-width:1.6;stroke-linecap:round;fill:none}.sk text{font:500 8px var(--f);fill:var(--muted)}';
  document.head.appendChild(css);
  const photos = ACT.how; // the earlier how-to sheet: photos plus steps
  ACT.how = t => {
    photos(t);
    const body = document.querySelector('.sheet-body'), h2 = body && body.querySelector('h2'); if (!h2) return;
    const pics = body.querySelector('.how-pics'); if (pics) pics.remove();
    body.querySelectorAll('p.small.muted').forEach(p => p.remove());
    const key = SKOF[t.dataset.name || '']; if (key) h2.insertAdjacentHTML('afterend', sketchSvg(key));
    const a = body.querySelector('a.btn'); if (a) a.textContent = 'Photos on the web';
  };
  const relabel = () => app.querySelectorAll('.how').forEach(b => { b.textContent = 'How to'; });
  new MutationObserver(relabel).observe(app, { childList: true });
  relabel();
})();
