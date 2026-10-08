'use strict';
/* ================= Read a scan sheet from a photo (standalone site only) =================
   Adds "Take a photo" and "Choose a photo" to the add-scan form of the plans that track body composition.
   The photo is read on the phone and nothing is uploaded. It fills the date, weight, muscle mass and body fat,
   each with a small picture of where it was read, to check before Save. Typing the numbers in works as before.
   Built for the InBody result sheet. A photo that cannot be read gets a reason: too dark, blurry, too far, cut off.
   The text reader is Tesseract.js 7 (Apache 2.0) from the ocr7 folder, fetched the first time a photo is read. */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const OCR = new URL('ocr7/', location.href).href;

  /* ---------- pixels ---------- */
  const made = []; // the canvases of the reading in hand, handed back when it ends
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); made.push(c); return c; };
  // Halve until within 2x of the wanted size, so small print survives the downscale on every browser.
  function shrink(src, sw, sh, long) {
    let c = src, w = sw, h = sh;
    while (Math.max(w, h) / 2 >= long) { const n = mk(w / 2, h / 2); n.getContext('2d').drawImage(c, 0, 0, n.width, n.height); c = n; w = n.width; h = n.height; }
    if (c === src || Math.max(w, h) > long) { const k = Math.min(1, long / Math.max(w, h)), n = mk(w * k, h * k), x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); c = n; }
    return c;
  }
  function grayOf(c) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, g = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return { w, h, g };
  }
  function canvasOf(im) {
    const c = mk(im.w, im.h), x = c.getContext('2d'), id = x.createImageData(im.w, im.h), d = id.data;
    for (let i = 0, j = 0; j < im.g.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = im.g[j]; d[i + 3] = 255; }
    x.putImageData(id, 0, 0); return c;
  }
  // Even out the lighting: divide by the local paper brightness, so shadows and gradients do not hide the print,
  // then deepen faint print to a normal strength. `ink` reports how strong the print was to begin with (about 180 is normal).
  function flatten(im) {
    const { w, h, g } = im, cs = Math.max(12, Math.round(Math.max(w, h) / 64)), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), bg = new Float32Array(gw * gh), hist = new Uint32Array(256);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      hist.fill(0); let n = 0;
      for (let y = cy * cs, ye = Math.min(h, y + cs); y < ye; y += 2) for (let x = cx * cs, xe = Math.min(w, x + cs), o = y * w; x < xe; x += 2) { hist[g[o + x]]++; n++; }
      let acc = 0, v = 255; const want = n * 0.2; while (v > 0 && (acc += hist[v]) < want) v--;
      bg[cy * gw + cx] = v;
    }
    // What is far darker than the paper is not paper: a table, the room behind. It is lifted only part of the way, so its grain is not blown up into noise.
    const all = Array.from(bg).sort((a, b) => a - b), floor = Math.max(30, all[Math.floor(all.length * 0.98)] * 0.33), sm = new Float32Array(gw * gh), inner = new Uint8Array(gw * gh);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) { // brightest of the neighbours, so a cell full of print still gets the paper level
      let m = 0, lo = 255; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = cy + dy, xx = cx + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { m = Math.max(m, bg[yy * gw + xx]); lo = Math.min(lo, bg[yy * gw + xx]); } }
      sm[cy * gw + cx] = Math.max(floor, m); inner[cy * gw + cx] = lo >= floor ? 1 : 0;
    }
    const out = new Uint8ClampedArray(w * h), ink = new Uint32Array(256); let ni = 0;
    for (let y = 0; y < h; y++) {
      const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cs - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0, row = Math.min(gh - 1, Math.floor(y / cs)) * gw;
      for (let x = 0, o = y * w; x < w; x++) {
        const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cs - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
        const b = (sm[y0 * gw + x0] * (1 - tx) + sm[y0 * gw + x1] * tx) * (1 - ty) + (sm[y1 * gw + x0] * (1 - tx) + sm[y1 * gw + x1] * tx) * ty;
        const v = Math.min(255, Math.round(g[o + x] * 235 / b)); out[o + x] = v;
        if (!(x & 1) && !(y & 1) && inner[row + Math.min(gw - 1, Math.floor(x / cs))]) { ink[v]++; ni++; }
      }
    }
    let acc = 0, lo = 0; while (lo < 235 && (acc += ink[lo]) < ni * 0.004) lo++;
    const gain = ni && 235 - lo < 165 ? Math.min(3.5, 210 / Math.max(1, 235 - lo)) : 1;
    if (gain > 1) for (let i = 0; i < out.length; i++) out[i] = 235 - (235 - out[i]) * gain;
    return { w, h, g: out, ink: ni ? 235 - lo : 0 };
  }
  // The brightness below which a share q of a region falls.
  function level(im, x0, y0, x1, y1, q) {
    const hist = new Uint32Array(256); let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0, o = y * im.w; x < x1; x++) { hist[im.g[o + x]]++; n++; }
    let acc = 0, v = 0; const want = n * q; while (v < 255 && (acc += hist[v]) < want) v++;
    return v;
  }
  const clampBox = (im, b) => ({ x0: Math.max(0, Math.round(b.x0)), y0: Math.max(0, Math.round(b.y0)), x1: Math.min(im.w, Math.round(b.x1)), y1: Math.min(im.h, Math.round(b.y1)) });
  // Where print and ruled lines have their top and bottom edges: the points that show which way a page's rows run.
  function edges(im, y0, y1) {
    const s = Math.max(1, Math.round(Math.max(im.w, y1 - y0) / 600)), pts = []; pts.step = s;
    for (let y = y0 + s; y < y1 - s; y += s) for (let x = 0, o = y * im.w; x < im.w - s; x += s) { // an edge that carries on to the next pixel along: grain and noise do not
      const d = im.g[o + s * im.w + x] - im.g[o - s * im.w + x], e = im.g[o + s * im.w + x + s] - im.g[o - s * im.w + x + s];
      if ((d > 50 && e > 25) || (d < -50 && e < -25)) pts.push(x, y);
    }
    return pts;
  }
  // The angle, in degrees, at which those points fall into the sharpest rows. `how` says how much sharper than at other angles.
  function tilt(pts, span, step) {
    let best = 0, top = 0, sum = 0, n = 0; const size = 8192, hist = new Float32Array(size), bin = pts.step || 1; // bins as wide as the points are spaced, or the level angle gets a false boost
    for (let a = -span; a <= span + 1e-6; a += step) {
      const t = a * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t); hist.fill(0);
      for (let i = 0; i < pts.length; i += 2) hist[(Math.round((pts[i + 1] * c - pts[i] * sn) / bin) + size * 4) % size]++;
      let sc = 0; for (let r = 0; r < size; r++) sc += hist[r] * hist[r];
      sum += sc; n++; if (sc > top) { top = sc; best = a; }
    }
    return { ang: best, how: pts.length ? top / (sum / n) : 0 };
  }
  // How crisp the edges are: near 1 for sharp print, well below for a blurred or shaken photo.
  function crisp(im) {
    const f = new Uint32Array(256), c = new Uint32Array(256); let n = 0;
    for (let y = 3; y < im.h - 3; y += 2) for (let x = 3, o = y * im.w; x < im.w - 3; x += 2) {
      f[Math.max(Math.abs(im.g[o + x + 1] - im.g[o + x - 1]), Math.abs(im.g[o + x + im.w] - im.g[o + x - im.w]))]++;
      c[Math.max(Math.abs(im.g[o + x + 3] - im.g[o + x - 3]), Math.abs(im.g[o + x + 3 * im.w] - im.g[o + x - 3 * im.w]))]++; n++;
    }
    const top = h => { let acc = 0, v = 255; while (v > 0 && (acc += h[v]) < n * 0.01) v--; return v; };
    return top(c) > 30 ? top(f) / top(c) : 1;
  }

  // The thick bars of a chart: solid dark strokes far heavier than print. Returns their boxes, top to bottom.
  function findBars(im, box, dH) {
    const { x0, y0, x1, y1 } = clampBox(im, box), ww = x1 - x0, hh = y1 - y0; if (ww < 4 * dH || hh < dH) return [];
    const p = level(im, x0, y0, x1, y1, 0.8), d = level(im, x0, y0, x1, y1, 0.01), T = d + 0.52 * (p - d), k = Math.max(4, Math.round(dH * 0.23)), W1 = ww + 1;
    const I = new Int32Array(W1 * (hh + 1));
    for (let y = 0; y < hh; y++) { let s = 0; for (let x = 0, o = (y0 + y) * im.w + x0; x < ww; x++) { s += im.g[o + x] < T ? 1 : 0; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; } }
    const solid = (x, y) => I[(y + k) * W1 + x + k] - I[y * W1 + x + k] - I[(y + k) * W1 + x] + I[y * W1 + x] === k * k;
    const gap = Math.round(dH * 0.7), minLen = Math.round(dH * 0.3), rows = [];
    for (let y = 0; y + k <= hh; y++) { // the longest solid run on each row; the thin gaps between a bar's segments do not break it
      let best = null, s = -1, e = -1;
      for (let x = 0; x + k <= ww; x++) if (solid(x, y)) { if (s < 0 || x - e > gap) { if (s >= 0 && (!best || e - s > best[1] - best[0])) best = [s, e]; s = x; } e = x; }
      if (s >= 0 && (!best || e - s > best[1] - best[0])) best = [s, e];
      rows.push(best && best[1] - best[0] + 1 >= minLen ? best : null);
    }
    const cand = []; let cur = null;
    rows.forEach((r, y) => {
      if (r && cur && r[0] <= cur.xe + gap && r[1] >= cur.xs - gap) { cur.y1 = y; cur.xs = Math.min(cur.xs, r[0]); cur.xe = Math.max(cur.xe, r[1]); }
      else { if (cur) cand.push(cur); cur = r ? { y0: y, y1: y, xs: r[0], xe: r[1] } : null; }
    });
    if (cur) cand.push(cur);
    const dark = (x, y) => x >= 0 && x < im.w && y >= 0 && y < im.h && im.g[y * im.w + x] < T, out = [];
    cand.forEach(b => {
      // Thickness, measured down the columns so a slightly sloping bar is not taken for a thick one.
      const ts = []; for (let x = b.xs; x <= b.xe; x += Math.max(1, Math.round((b.xe - b.xs) / 24))) { let n = 0; for (let y = b.y0; y <= b.y1; y++) n += solid(x, y) ? 1 : 0; if (n) ts.push(n + k - 1); }
      ts.sort((a, c) => a - c); const t = ts[Math.floor(ts.length / 2)] || 0, len = b.xe - b.xs + k;
      if (t < dH * 0.25 || t > dH * 0.8 || len < t) return;
      // The right-hand end is where the number sits. Find the bar's middle there.
      let sy = 0, n = 0; for (let x = Math.max(b.xs, b.xe - Math.round(dH * 0.6)); x <= b.xe; x++) for (let y = b.y0; y <= b.y1; y++) if (solid(x, y)) { sy += y; n++; }
      const yc = y0 + sy / n + (k - 1) / 2, o = { x0: x0 + b.xs, x1: x0 + b.xe + k, yc, t, y0: Math.round(yc - t / 2), y1: Math.round(yc + t / 2) };
      // A bar is drawn in segments, some of them pale grey, and can end in a sliver too thin to count as solid. Follow it both ways:
      // a column belongs to the bar when it is darker than paper for the bar's full height and no further, which a digit's stem never is.
      const off = Math.round(dH * 0.3), px = (x, y) => im.g[Math.max(0, Math.min(im.h - 1, y)) * im.w + x];
      const part = x => { if (x < 0 || x >= im.w) return false; const ref = Math.min(px(x, o.y0 - off), px(x, o.y1 + off)); if (ref < T) return false; let c = 0; for (let y = o.y0 + 1; y < o.y1 - 1; y++) c += px(x, y) < ref - 24 ? 1 : 0; return c >= (o.y1 - o.y0 - 2) * 0.85; };
      for (let x = o.x1, miss = 0; x < im.w && miss <= dH * 0.25; x++) { if (part(x)) { o.x1 = x + 1; miss = 0; } else miss++; }
      for (let x = o.x0 - 1, miss = 0; x >= 0 && miss <= dH * 0.25; x--) { if (part(x)) { o.x0 = x; miss = 0; } else miss++; }
      out.push(o);
    });
    return out;
  }
  // A cut-out of the picture with ruled lines taken out, so a line through or under a number is not read as part of it.
  function patch(im, box, dH) {
    const { x0, y0, x1, y1 } = clampBox(im, box), w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return null;
    const g = new Uint8ClampedArray(w * h), m = new Uint8Array(w * h), ln = new Uint8Array(w * h), col = new Float32Array(w), one = { w: 1, h, g: new Uint8ClampedArray(h) };
    // What shading is left varies along a row. Take each column's own paper level, smoothed, and bring it to the same white.
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) one.g[y] = im.g[(y0 + y) * im.w + x0 + x]; col[x] = level(one, 0, 0, 1, h, 0.8); }
    const r = Math.max(2, Math.round(dH * 0.6));
    for (let x = 0; x < w; x++) { let a = 0, n = 0; for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) { a += col[i]; n++; } const pv = Math.max(60, a / n); for (let y = 0; y < h; y++) g[y * w + x] = im.g[(y0 + y) * im.w + x0 + x] * 235 / pv; }
    const whole = { w, h, g }, p = level(whole, 0, 0, w, h, 0.8), d = Math.min(level(whole, 0, 0, w, h, 0.01), p - 90), T = d + 0.64 * (p - d);
    for (let i = 0; i < w * h; i++) m[i] = g[i] < T ? 1 : 0;
    const L = Math.round(dH * 1.3), V = Math.round(dH * 1.6), hist = new Uint16Array(256);
    for (let y = 0; y < h; y++) {
      // A ruled line darkens most of its row, even a faint or broken one. Print never covers half a row.
      hist.fill(0); for (let x = 0; x < w; x++) hist[g[y * w + x]]++;
      let acc = 0, med = 0; while (med < 255 && (acc += hist[med]) < w / 2) med++;
      if (med < p - 14) { for (let x = 0; x < w; x++) ln[y * w + x] = 1; continue; }
      for (let x = 0, s = -1; x <= w; x++) { const on = x < w && m[y * w + x]; if (on && s < 0) s = x; if (!on && s >= 0) { if (x - s >= L) for (let i = s; i < x; i++) ln[y * w + i] = 1; s = -1; } }
    }
    for (let x = 0; x < w; x++) for (let y = 0, s = -1; y <= h; y++) { // take the line out, except where a stroke of a digit runs into it or through it
      const on = y < h && ln[y * w + x]; if (on && s < 0) s = y;
      if (!on && s >= 0) { const held = ((s > 0 && m[(s - 1) * w + x]) || (y < h && m[y * w + x])) && y - s <= dH * 0.3; if (!held) for (let i = s; i < y; i++) { m[i * w + x] = 0; g[i * w + x] = p; } s = -1; }
    }
    if (h >= V) for (let x = 0; x < w; x++) for (let y = 0, s = -1; y <= h; y++) { const on = y < h && m[y * w + x]; if (on && s < 0) s = y; if (!on && s >= 0) { if (y - s >= V) for (let i = s; i < y; i++) { m[i * w + x] = 0; g[i * w + x] = p; } s = -1; } }
    return { x0, y0, w, h, g, m, p, d };
  }
  // Runs of inked columns within rows ya..yb of a patch; a blank stretch wider than `gap` separates two groups.
  function groups(P, ya, yb, gap) {
    ya = Math.max(0, Math.round(ya)); yb = Math.min(P.h, Math.round(yb));
    const out = []; let s = -1, e = -1;
    for (let x = 0; x < P.w; x++) { let n = 0; for (let y = ya; y < yb; y++) n += P.m[y * P.w + x]; if (n) { if (s < 0 || x - e > gap) { if (s >= 0) out.push([s, e + 1]); s = x; } e = x; } }
    if (s >= 0) out.push([s, e + 1]);
    return out;
  }
  // Top and bottom of the print in columns xa..xb, near row yc: cut at the emptiest rows around one line of digits.
  function rowsOf(P, xa, xb, yc, dH) {
    const ink = y => { let n = 0; if (y < 0 || y >= P.h) return 0; for (let x = xa; x < xb; x++) n += P.m[y * P.w + x]; return n; };
    const cut = (from, to, step) => { let best = from, bv = Infinity; for (let y = from; step > 0 ? y <= to : y >= to; y += step) { const v = ink(y); if (v < bv) { bv = v; best = y; } if (v === 0) break; } return best; };
    const c = Math.round(yc), top = cut(c - Math.round(dH * 0.3), c - Math.round(dH * 0.95), -1), bot = cut(c + Math.round(dH * 0.3), c + Math.round(dH * 0.95), 1);
    return [Math.max(0, top), Math.min(P.h, bot + 1)];
  }
  // The row a group of print is centred on.
  function middle(P, g) { let sy = 0, n = 0; for (let y = 0; y < P.h; y++) for (let x = g[0]; x < g[1]; x++) if (P.m[y * P.w + x]) { sy += y; n++; } return { y: n ? sy / n : P.h / 2, n }; }
  // Connected blobs of ink in a patch, each with its box.
  function blobs(P) {
    const { w, h, m } = P, seen = new Uint8Array(w * h), out = [], st = [];
    for (let i = 0; i < w * h; i++) if (m[i] && !seen[i]) {
      const b = { x0: w, y0: h, x1: 0, y1: 0, n: 0 }; seen[i] = 1; st.push(i);
      while (st.length) {
        const j = st.pop(), x = j % w, y = (j - x) / w; b.n++;
        if (x < b.x0) b.x0 = x; if (x + 1 > b.x1) b.x1 = x + 1; if (y < b.y0) b.y0 = y; if (y + 1 > b.y1) b.y1 = y + 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, q = yy * w + xx; if (xx >= 0 && xx < w && yy >= 0 && yy < h && m[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
      }
      out.push(b);
    }
    return out;
  }
  // One number, cut out tight and set on clean white at a given print height, ready for the reader.
  function chip(P, xa, xb, ya, yb, tall) {
    const w = xb - xa, h = yb - ya, k = tall / h, pad = Math.round(tall * 0.45), src = mk(w, h), sx = src.getContext('2d'), id = sx.createImageData(w, h);
    let lo = 255; for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) lo = Math.min(lo, P.g[y * P.w + x]);
    const span = Math.max(40, P.p - 12 - lo);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = Math.max(0, Math.min(255, (P.g[(ya + y) * P.w + xa + x] - lo) / span * 255)), o = (y * w + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255; }
    sx.putImageData(id, 0, 0);
    const c = mk(w * k + 2 * pad, tall + 2 * pad), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(src, pad, pad, Math.round(w * k), tall);
    return c;
  }

  /* ---------- the text reader ---------- */
  let engineP = null, restT = null;
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error('load')); }; document.head.appendChild(s); });
  function engine() {
    clearTimeout(restT);
    if (!engineP) engineP = (async () => {
      if (!window.Tesseract) await script(OCR + 'tesseract.min.js');
      return window.Tesseract.createWorker('eng', 1, { workerPath: OCR + 'worker.min.js', corePath: OCR, langPath: OCR, workerBlobURL: false, cacheMethod: 'none' });
    })().catch(e => { engineP = null; throw e; });
    return engineP;
  }
  // The reader holds a lot of memory. Let it go a little while after the last photo.
  function rest() { clearTimeout(restT); restT = setTimeout(() => { const p = engineP; engineP = null; if (p) p.then(w => w.terminate()).catch(() => { /* never started */ }); }, 90000); }
  // Every word on a page, with its box: [{ t, x0, y0, x1, y1 }]
  async function words(canvas) {
    const w = await engine();
    await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '', tessedit_do_invert: '0', thresholding_method: '2' });
    const r = await w.recognize(canvas, {}, { text: false, tsv: true });
    return r.data.tsv.split('\n').map(l => l.split('\t')).filter(c => c[0] === '5' && c[11] && c[11].trim()).map(c => ({ t: c[11].trim(), x0: +c[6], y0: +c[7], x1: +c[6] + +c[8], y1: +c[7] + +c[9] }));
  }
  // One short line of digits.
  async function digits(canvas, extra) {
    const w = await engine();
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.' + (extra || ''), tessedit_do_invert: '0', thresholding_method: '0' });
    const r = await w.recognize(canvas, {}, { text: true });
    return { t: (r.data.text || '').replace(/\s+/g, ''), c: r.data.confidence || 0 };
  }

  /* ---------- finding the sheet ---------- */
  const norm = t => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cyOf = b => (b.y0 + b.y1) / 2;
  function lev(a, b) { // how many single-letter edits turn a into b
    const d = []; for (let j = 0; j <= b.length; j++) d[j] = j;
    for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
    return d[b.length];
  }
  // Words gathered into lines, left to right. Columns far apart stay separate lines.
  function linesOf(ws) {
    const L = [];
    ws.slice().sort((a, b) => a.x0 - b.x0).forEach(w => {
      const h = w.y1 - w.y0, l = L.filter(l => Math.abs(l.cy - cyOf(w)) < Math.max(h, l.h) * 0.5 && w.x0 - l.x1 < Math.max(h, l.h) * 3).sort((a, b) => Math.abs(a.cy - cyOf(w)) - Math.abs(b.cy - cyOf(w)))[0];
      if (l) { l.ws.push(w); l.x1 = Math.max(l.x1, w.x1); l.cy = cyOf(w); l.h = Math.max(l.h, h); } else L.push({ cy: cyOf(w), h, x1: w.x1, ws: [w] });
    });
    return L;
  }
  // Every place some print starts with the letters of `want`, give or take a misread letter. Each hit: { x0, x1, y0, y1, first, s }.
  function starts(L, want) {
    const out = [], tol = want.length > 10 ? 2 : 1;
    L.forEach(l => { for (let i = 0; i < l.ws.length; i++) {
      let s = '', j = i; for (; j < l.ws.length && j < i + 5 && s.length < want.length + 8; j++) s += norm(l.ws[j].t);
      if (s.length >= want.length - 1 && lev(s.slice(0, want.length), want) <= tol) { const g = l.ws.slice(i, j); out.push({ x0: g[0].x0, x1: g[g.length - 1].x1, y0: g[0].y0, y1: g[0].y1, first: i === 0, s }); }
    } });
    return out;
  }
  const LEAD = { mfa: 'musclefat', ob: 'obesity', seg: 'segmental', bc: 'bodycomposition' }, ORDER = ['bca', 'mfa', 'ob', 'seg', 'his'];
  const REF = { bca: 377, mfa: 712, ob: 1022, seg: 1261, his: 1754 }; // where the headings sit on a reference sheet: used to judge size and to place a heading that was not read
  // The section headings of the left column. The right column repeats the titles in its notes; where those start comes back in `right`.
  function heads(ws) {
    const L = linesOf(ws), hits = []; Object.keys(LEAD).forEach(k => starts(L, LEAD[k]).forEach(m => { m.k = k; hits.push(m); }));
    const H = { n: 0, right: [] }, lead = hits.filter(m => m.first); if (!lead.length) return H;
    const left = Math.min.apply(null, lead.map(m => m.x0)), hs = lead.map(m => m.y1 - m.y0).sort((a, b) => a - b), h = hs[Math.floor(hs.length / 2)];
    const mine = hits.filter(m => m.x0 < left + 12 * h).sort((a, b) => a.y0 - b.y0); H.right = lead.filter(m => m.x0 >= left + 12 * h).map(m => m.x0);
    ['mfa', 'ob', 'seg'].forEach(k => { const m = mine.filter(v => v.k === k)[0]; if (m) { H[k] = m; H.n++; } });
    const bc = mine.filter(v => v.k === 'bc'), mid = H.mfa || H.ob || H.seg;
    if (bc.length > 1) { H.bca = bc[0]; H.his = bc[bc.length - 1]; H.n += 2; }
    else if (bc.length) { H[(mid ? bc[0].y0 < mid.y0 : !/hist/.test(bc[0].s)) ? 'bca' : 'his'] = bc[0]; H.n++; }
    return H;
  }

  /* ---------- deciding ---------- */
  // Each number is printed in two or three places on the sheet: beside its bar in the charts, as the newest entry in the history,
  // and (weight and fat mass) in the table at the top. The bars are the cleanest print, so they lead. The history backs a bar up
  // or contradicts it. The table often sits on a ruled line and is misread, so it can only add its agreement.
  // f: name -> { t } as read. Returns weight, muscle and fat as { v, from, st, others }. st is 'ok' (two places agree, or the
  // arithmetic confirms it), 'one' (the bar alone), 'mixed' (the bar and the history disagree, or the number makes no sense) or 'calc' (worked out).
  function settle(f, metric) {
    const K = metric ? 1 / 2.2046226 : 1; // the limits are in pounds
    const val = (k, lo, hi) => { const t = f[k] && f[k].t; if (!t || !/^\d{1,3}\.\d$/.test(t)) return null; const v = parseFloat(t); return v >= lo * K && v <= hi * K ? v : null; };
    const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.051;
    const pick = (bn, bar, hn, his, tab) => {
      if (bar == null) return same(his, tab) ? { v: his, from: hn, st: 'ok', others: [] } : null; // no bar: only what two other places agree on
      if (his == null) return { v: bar, from: bn, st: same(bar, tab) ? 'ok' : 'one', others: [] };
      if (same(bar, his)) return { v: bar, from: bn, st: 'ok', others: [] };
      return same(his, tab) ? { v: his, from: hn, st: 'mixed', others: [bar] } : { v: bar, from: bn, st: 'mixed', others: [his] };
    };
    const W = pick('wBar', val('wBar', 50, 700), 'wHis', val('wHis', 50, 700), val('wTab', 50, 700));
    const F = pick('fBar', val('fBar', 1, 450), null, null, val('fTab', 1, 450));
    const M = pick('sBar', val('sBar', 15, 300), 'sHis', val('sHis', 15, 300), null);
    let P = pick('pBar', val('pBar', 2 / K, 75 / K), 'pHis', val('pHis', 2 / K, 75 / K), null);
    // The table adds up: water + dry lean mass + fat mass = weight. That can confirm a weight read in one place only.
    const tbw = val('tbw', 20, 500), dlm = val('dlm', 5, 200);
    if (W && W.st === 'one' && F && tbw != null && dlm != null && Math.abs(tbw + dlm + F.v - W.v) < 0.36) W.st = 'ok';
    // Body fat percent is fat mass over weight. That can confirm a percentage read in one place, or supply one that was not read.
    const pc = W && F ? F.v / W.v * 100 : null;
    if (P && P.st === 'one' && pc != null && Math.abs(P.v - pc) < 0.13) P.st = 'ok';
    if (!P && pc != null && W.st === 'ok' && F.st === 'ok' && pc >= 2 && pc <= 75) P = { v: Math.round(pc * 10) / 10, from: null, st: 'calc', others: [] };
    // Muscle is roughly half to two thirds of what is not fat. Far outside that, a digit was misread.
    if (M && W) { const lean = W.v - (F ? F.v : P ? W.v * P.v / 100 : W.v * 0.2), r = M.v / lean; if (r < 0.42 || r > 0.7) M.st = 'mixed'; }
    const lb = o => { if (o && metric) { o.v = Math.round(o.v * 22.046226) / 10; o.others = o.others.map(v => Math.round(v * 22.046226) / 10); } return o; };
    return { weight: lb(W), muscle: lb(M), fat: P };
  }

  /* ---------- reading a photo ---------- */
  // Returns { ok, weight, muscle, fat, date, metric } or { ok: false, why }. `why` and `hint` name what was wrong with the photo:
  // dark, small, blurry, glare, faint, far, angle, cut, nosheet (no result sheet found), nonums (sheet found, numbers unreadable).
  // `step` is called before each pass of the reader, with 'find' or 'read'. It may throw to stop a reading that is no longer wanted.
  async function readSheet(src, sw, sh, step) {
    // A reading goes through a few dozen canvases. Phones cap the memory those may hold, and an iPhone is slow to take it back, so give it up the moment the reading ends.
    try { return await reading(src, sw, sh, step); } finally { made.splice(0).forEach(c => { c.width = c.height = 0; }); }
  }
  async function reading(src, sw, sh, step) {
    const base = shrink(src, sw, sh, 3600), bw = base.width, bh = base.height;
    // A view of the photo: turned by `rot`, then the rectangle r of that turned picture drawn at scale k.
    const frame = rot => { const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)); return { rot, w: bw * c + bh * s, h: bw * s + bh * c }; };
    const tone = (() => { const t = grayOf(shrink(base, bw, bh, 300)), v = level(t, 0, 0, t.w, t.h, 0.8); return 'rgb(' + v + ',' + v + ',' + v + ')'; })(); // what shows past the photo's edge once it is turned: about as bright as the page, so it adds no edges
    const view = (f, r, k) => { const c = mk((r.x1 - r.x0) * k, (r.y1 - r.y0) * k), x = c.getContext('2d'); x.fillStyle = tone; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.translate(-r.x0 * k, -r.y0 * k); x.scale(k, k); x.translate(f.w / 2, f.h / 2); x.rotate(f.rot); x.translate(-bw / 2, -bh / 2); x.drawImage(base, 0, 0); return c; };
    const whole = f => ({ x0: 0, y0: 0, x1: f.w, y1: f.h });
    /* 1. Probe: a small copy of the photo, to find the page, straighten it, and read the section headings off it. */
    const Q = { hot: 0 }; // what kind of photo this is: paper brightness, print strength, sharpness, glare, how much of it the page fills
    { const t = grayOf(shrink(base, bw, bh, 500)); let n = 0; for (let i = 0; i < t.g.length; i++) n += t.g[i] >= 250 ? 1 : 0; Q.hot = n / t.g.length; }
    // The page within a view: where it is bright and edges crowd together. Returns its box, and the edge points that fall on it.
    const pageIn = f => {
      const ks = 700 / Math.max(f.w, f.h), raw = grayOf(view(f, whole(f), ks)), lo = flatten(raw), pts = edges(lo, 0, lo.h), cs = 24, gw = Math.ceil(lo.w / cs), gh = Math.ceil(lo.h / cs), den = new Uint16Array(gw * gh), lit = new Float32Array(gw * gh), cn = Math.cos(f.rot), sn = Math.sin(f.rot), keep = [];
      for (let i = 0; i < pts.length; i += 2) { // leave out the photo's own border, which shows as a sharp line once the photo is turned
        const dx = pts[i] / ks - f.w / 2, dy = pts[i + 1] / ks - f.h / 2, bx = bw / 2 + dx * cn + dy * sn, by = bh / 2 - dx * sn + dy * cn, m = Math.max(bw, bh) * 0.012;
        if (bx > m && bx < bw - m && by > m && by < bh - m) { den[Math.floor(pts[i + 1] / cs) * gw + Math.floor(pts[i] / cs)]++; keep.push(pts[i], pts[i + 1]); }
      }
      for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) lit[cy * gw + cx] = level(raw, cx * cs, cy * cs, Math.min(raw.w, cx * cs + cs), Math.min(raw.h, cy * cs + cs), 0.8);
      const top = (a, p) => { const v = Array.from(a).sort((x, y) => x - y); return v[Math.floor(v.length * p)]; }, busy = Math.max(5, top(den, 0.97) * 0.3), paper = top(lit, 0.95), xs = [], ys = [], on = new Uint8Array(gw * gh);
      for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) if (den[cy * gw + cx] >= busy && lit[cy * gw + cx] >= paper * 0.4) { xs.push(cx); ys.push(cy); on[cy * gw + cx] = 1; }
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const at = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))], r = xs.length > 12 ? { x0: at(xs, 0.02) * cs / ks, x1: (at(xs, 0.98) + 1) * cs / ks, y0: at(ys, 0.02) * cs / ks, y1: (at(ys, 0.98) + 1) * cs / ks } : whole(f), mx = (r.x1 - r.x0) * 0.08, my = (r.y1 - r.y0) * 0.08;
      r.x0 = Math.max(0, r.x0 - mx); r.x1 = Math.min(f.w, r.x1 + mx); r.y0 = Math.max(0, r.y0 - my); r.y1 = Math.min(f.h, r.y1 + my);
      const mine = []; for (let i = 0; i < keep.length; i += 2) if (on[Math.floor(keep[i + 1] / cs) * gw + Math.floor(keep[i] / cs)]) mine.push(keep[i], keep[i + 1]);
      mine.step = pts.step;
      return { r, pts: mine, paper, fill: (r.x1 - r.x0) * (r.y1 - r.y0) / (f.w * f.h) };
    };
    let P = null;
    for (const q of [0, 1, 3, 2]) { // upright first, then on either side, then upside down
      const ang = tilt(pageIn(frame(q * Math.PI / 2)).pts, 20, 0.5).ang * Math.PI / 180, f = frame(q * Math.PI / 2 - ang), pg = pageIn(f), r = pg.r;
      const k = Math.min(1, 1400 / Math.max(r.x1 - r.x0, r.y1 - r.y0)), pim = flatten(grayOf(view(f, r, k)));
      if (Q.crisp == null) { Q.crisp = crisp(pim); Q.ink = pim.ink; Q.fill = pg.fill; Q.paper = pg.paper; }
      step('find'); const ws = await words(canvasOf(pim)), H = heads(ws);
      if (H.n >= 2) { P = { f, k, r, H }; break; }
      if (Q.paper < 60 || Q.crisp < 0.5) break; // too dark or too blurred to be worth turning round and trying again
    }
    const bad = () => Q.paper < 130 ? 'dark' : Math.max(bw, bh) < 1300 ? 'small' : Q.crisp < 0.6 ? 'blurry' : Q.hot > 0.06 ? 'glare' : Q.ink > 0 && Q.ink < 60 ? 'faint' : null;
    if (!P) return { ok: false, why: bad() || (Q.fill < 0.3 ? 'far' : 'nosheet') };
    /* 2. Where the headings are. One that was not read is placed from the others. Then crop to the left column at a standard print size. */
    const F = P.f, keys = ORDER.filter(k => P.H[k]), at = {}; keys.forEach(k => { at[k] = [P.r.x0 + P.H[k].x0 / P.k, P.r.y0 + cyOf(P.H[k]) / P.k]; });
    const first = keys[0], last = keys[keys.length - 1], u = (at[last][1] - at[first][1]) / (REF[last] - REF[first]); // photo pixels per reference pixel
    if (!(u > 0.15)) return { ok: false, why: bad() || 'nosheet' };
    if (u < 0.45) return { ok: false, why: bad() || 'far' };
    ORDER.forEach(k => { if (!at[k]) { const a = keys.slice().sort((p, q) => Math.abs(REF[p] - REF[k]) - Math.abs(REF[q] - REF[k]))[0]; at[k] = [at[a][0], at[a][1] + (REF[k] - REF[a]) * u]; } });
    const x0 = Math.min.apply(null, keys.map(k => at[k][0])), rights = P.H.right.map(x => P.r.x0 + x / P.k).filter(x => x > x0 + 500 * u);
    const R = { x0: x0 - 70 * u, x1: rights.length ? Math.min.apply(null, rights) - 30 * u : x0 + 900 * u, y0: at.bca[1] - 190 * u, y1: at.his[1] + 400 * u };
    Q.u = u; Q.cut = at.mfa[1] - 40 * u < 0 ? 'top' : at.ob[1] + 250 * u > F.h ? 'bottom' : x0 - 30 * u < 0 ? 'left' : x0 + 860 * u > F.w ? 'right' : null;
    R.x0 = Math.max(0, R.x0); R.y0 = Math.max(0, R.y0); R.x1 = Math.min(F.w, R.x1); R.y1 = Math.min(F.h, R.y1);
    const k = Math.min(1.6, 1.1 / u), N = flatten(grayOf(view(F, R, k))), Nc = canvasOf(N), xN = {}, yN = {}; ORDER.forEach(h => { xN[h] = (at[h][0] - R.x0) * k; yN[h] = (at[h][1] - R.y0) * k; });
    const D = yN.ob - yN.mfa, dH = D * 0.074; // D: the distance between two headings, the yardstick for everything below. dH: the height of a printed digit
    const leans = [], found = {}; // leans: how far each band had to be turned. found: name -> { t, s, box, c }: the text read, how sure, and where on which band
    // A band of the page, turned so that its own rows run level. A photo taken at an angle leaves each part of the page sloping a little differently.
    const band = (ya, yb) => {
      ya = Math.max(0, Math.round(ya)); yb = Math.min(N.h, Math.round(yb)); if (yb - ya < dH * 3) return null;
      const lean = tilt(edges(N, ya, yb), 9, 0.25), a = lean.how > 1.3 ? lean.ang * Math.PI / 180 : 0, h = yb - ya, c = mk(N.w, h), x = c.getContext('2d');
      x.fillStyle = 'rgb(235,235,235)'; x.fillRect(0, 0, N.w, h); x.imageSmoothingQuality = 'high'; x.translate(N.w / 2, h / 2); x.rotate(-a); x.translate(-N.w / 2, -h / 2); x.drawImage(Nc, 0, -ya);
      const cs = Math.cos(a), sn = Math.sin(a);
      leans.push(lean.how > 1.3 ? lean.ang : 0);
      return { im: grayOf(c), c, y: (px, py) => h / 2 - (px - N.w / 2) * sn + (py - ya - h / 2) * cs }; // y: where a point of the page lands in the band, top to bottom
    };
    // Read one cut-out number at a few sizes and keep the reading the reader is surest of.
    async function number(name, B, Pp, xa, xb, ya, yb, extra) {
      const votes = {}; let best = null, n = 0; step('read');
      for (const tall of [30, 40, 52]) {
        const c = chip(Pp, xa, xb, ya, yb, tall), r = await digits(c, extra);
        if (r.t) { votes[r.t] = (votes[r.t] || 0) + 20 + r.c; if (!best || votes[r.t] > votes[best]) best = r.t; }
        if (++n === 2 && best && votes[best] > 180) break; // two sure readings that agree: no need for a third
      }
      found[name] = { t: best, s: best ? Math.round(votes[best]) : 0, box: { x0: Pp.x0 + xa, y0: Pp.y0 + ya, x1: Pp.x0 + xb, y1: Pp.y0 + yb }, c: B.c };
    }
    // The line of print in a region: [left, right, top, bottom] within the patch, or null.
    const lineIn = (Pp, gap, pickLast) => {
      const gs = groups(Pp, 0, Pp.h, gap).filter(g => g[1] - g[0] >= dH * 0.6);
      for (let i = pickLast ? gs.length - 1 : 0; i >= 0 && i < gs.length; i += pickLast ? -1 : 1) { const g = gs[i], m = middle(Pp, g); if (m.n < dH * dH * 0.2 || g[1] - g[0] > dH * 12) continue; const r = rowsOf(Pp, g[0], g[1], m.y, dH); return [g[0], g[1], r[0], r[1]]; }
      return null;
    };
    step('read');
    const B1 = band(yN.mfa - 0.1 * D, yN.ob + 0.8 * D), B2 = band(yN.bca - 0.62 * D, yN.mfa - 0.03 * D), B3 = band(yN.his - 0.08 * D, yN.his + 1.05 * D);
    // Shot from well off to one side, the rows fan out: level in one part of the page, sloping in another. Numbers read off that are not to be trusted.
    Q.fan = Math.max.apply(null, leans) - Math.min.apply(null, leans); Q.squash = P.H.bca && P.H.mfa && P.H.seg && P.H.his ? ((at.mfa[1] - at.bca[1]) / 335) / ((at.his[1] - at.seg[1]) / 493) : 1;
    if (Q.fan > 9 || leans.some(a => Math.abs(a) > 8) || Q.squash < 0.7 || Q.squash > 1.42) return { ok: false, why: bad() || 'angle' };
    /* 3. The bar charts: Weight, SMM and Body Fat Mass under Muscle-Fat Analysis; BMI and PBF under Obesity Analysis. */
    if (B1) {
      const my = B1.y(xN.mfa, yN.mfa), oy = B1.y(xN.ob, yN.ob);
      const chart = async (names, y, fr, top, bottom) => {
        const bars = findBars(B1.im, { x0: N.w * 0.18, y0: top, x1: N.w, y1: bottom }, dH);
        const left = bars.map(b => b.x0).sort((a, b) => a - b)[Math.floor(bars.length / 2)], ok = bars.filter(b => Math.abs(b.x0 - left) < dH * 0.8);
        for (let i = 0; i < names.length; i++) {
          if (!names[i]) continue;
          const b = ok.length === names.length ? ok[i] : ok.filter(v => Math.abs(v.yc - y - fr[i] * D) < 0.07 * D)[0]; if (!b) continue;
          const Pp = patch(B1.im, { x0: b.x1 + 2, y0: b.yc - dH * 1.6, x1: b.x1 + dH * 9, y1: b.yc + dH * 1.6 }, dH); if (!Pp) continue;
          const c = Pp.h / 2, g = groups(Pp, c - dH * 0.25, c + dH * 0.45, dH * 0.85)[0];
          if (!g || g[0] > dH * 1.6 || g[1] - g[0] > dH * 6.5) continue;
          const r = rowsOf(Pp, g[0], g[1], c + dH * 0.1, dH);
          await number(names[i], B1, Pp, g[0], g[1], r[0], r[1]);
        }
      };
      await chart(['wBar', 'sBar', 'fBar'], my, [0.38, 0.577, 0.768], my + 0.16 * D, oy - 0.07 * D);
      await chart([null, 'pBar'], oy, [0.38, 0.565], oy + 0.16 * D, Math.min(B1.im.h, oy + 0.72 * D));
    }
    /* 4. The top of the page: the test date under the logo, and the table that prints weight and fat mass a second time. */
    let metric = false, when = null, when2 = null;
    const DATE = /(20\d\d)\s?[.,]\s?(\d\d)\s?[.,]\s?(\d\d)(?:\s?[.,])?(?:\s+(\d\d)\s?[:;.]\s?(\d\d))?/;
    const day = m => { const mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] && +m[4] < 24 && +m[5] < 60 ? m[4] + ':' + m[5] : null }; };
    if (B2) {
      step('read'); const ws = await words(B2.c), L = linesOf(ws), hb = starts(L, LEAD.bc)[0], hy = hb ? cyOf(hb) : B2.y(xN.bca, yN.bca);
      // the date, as the layout pass saw it; then the same spot read again as digits only
      let spot = null;
      for (const l of L) {
        if (l.cy > hy - dH * 0.8) continue;
        let str = ''; const spans = []; l.ws.forEach(w => { spans.push([str.length, w]); str += w.t + ' '; });
        const m = str.match(DATE); if (!m || !day(m)) continue;
        const hit = spans.filter(sp => sp[0] < m.index + m[0].length && sp[0] + sp[1].t.length > m.index).map(sp => sp[1]);
        when = day(m); spot = { x0: hit[0].x0 - dH * 0.5, y0: Math.min.apply(null, hit.map(w => w.y0)) - dH * 0.5, x1: hit[0].x0 + dH * 11, y1: Math.max.apply(null, hit.map(w => w.y1)) + dH * 0.5 }; break;
      }
      if (!spot) { const lab = starts(L, 'testdate').filter(m => cyOf(m) < hy)[0]; if (lab) spot = { x0: lab.x0 - dH * 1.5, y0: cyOf(lab) + dH * 1.2, x1: lab.x0 + dH * 10.5, y1: cyOf(lab) + dH * 3.6 }; }
      const Pd = spot && patch(B2.im, spot, dH), ld = Pd && lineIn(Pd, dH * 1.2, false);
      if (ld) { await number('date', B2, Pd, ld[0], ld[1], ld[2], ld[3], ':'); const m2 = found.date.t && found.date.t.replace(/^(\d{4}\.\d\d\.\d\d)\.?(\d\d:\d\d)$/, '$1. $2').match(DATE); when2 = m2 && day(m2); }
      // the table: the last number on each row, right of its label
      const inT = w => cyOf(w) > hy + dH * 0.8, tw = ws.filter(w => norm(w.t) === 'weight' && inT(w)).pop(), rowsT = { fTab: starts(L, 'bodyfatmass').filter(inT)[0], tbw: starts(L, 'totalbodywater').filter(inT)[0], dlm: starts(L, 'dryleanmass').filter(inT)[0] };
      const tableNumber = async (name, lab) => { const cy = cyOf(lab), Pp = patch(B2.im, { x0: lab.x1 + dH * 0.5, y0: cy - 0.06 * D, x1: N.w - 2, y1: cy + 0.17 * D }, dH), l = Pp && lineIn(Pp, dH, true); if (l) await number(name, B2, Pp, l[0], l[1], l[2], l[3]); };
      if (tw) { await tableNumber('wTab', tw); for (const n of Object.keys(rowsT)) if (rowsT[n] && Math.abs(rowsT[n].x0 - tw.x0) < dH * 1.5) await tableNumber(n, rowsT[n]); }
      // pounds or kilograms, from the units printed beside the rows
      let lb = 0, kg = 0; ws.forEach(w => { if (!/[()]/.test(w.t)) return; const n = norm(w.t); if (/^([il1t]b[s5]?|15)$/.test(n)) lb++; else if (/^k[g9e]$/.test(n)) kg++; });
      if (!lb && !kg && ws.some(w => cyOf(w) < hy && /\dcm|^cm$/i.test(w.t))) kg = 1;
      metric = kg > lb;
    }
    /* 5. Body Composition History: the newest entry on each row is this scan again. */
    if (B3) {
      step('read'); const ws = await words(B3.c), L = linesOf(ws), hb = starts(L, LEAD.bc)[0], hy = hb ? cyOf(hb) : B3.y(xN.his, yN.his), ph = 0.225 * D;
      const inH = w => cyOf(w) > hy + dH * 0.8 && cyOf(w) < hy + 0.95 * D, hw = ws.filter(w => norm(w.t) === 'weight' && inH(w))[0];
      const main = (t, sub) => { const a = ws.filter(w => norm(w.t) === t && inH(w))[0]; if (a) return cyOf(a); const b = starts(L, sub).filter(inH)[0]; return b ? cyOf(b) - 0.06 * D : null; };
      const yW = hw ? cyOf(hw) : null, yS = main('smm', 'skeletalmuscle'), yP = main('pbf', 'percentbody');
      const y0 = yW != null ? yW : yS != null ? yS - ph : yP != null ? yP - 2 * ph : null, xl = hw ? hw.x1 : N.w * 0.2;
      const newest = async (name, cy) => {
        const Pp = patch(B3.im, { x0: xl, y0: cy - ph * 0.3, x1: N.w - 2, y1: cy + ph * 0.72 }, dH); if (!Pp) return;
        const ds = blobs(Pp).filter(b => { const h = b.y1 - b.y0, w = b.x1 - b.x0; return h >= dH * 0.7 && h <= dH * 1.35 && w >= dH * 0.1 && w <= dH * 0.9; }).sort((a, b) => b.x1 - a.x1);
        if (!ds.length) return;
        const got = [ds[0]]; let cur = ds[0];
        for (;;) { const nx = ds.filter(b => got.indexOf(b) < 0 && cur.x0 - b.x1 > -3 && cur.x0 - b.x1 < dH * 0.8 && Math.abs(cyOf(b) - cyOf(cur)) < dH * 0.3).sort((a, b) => b.x1 - a.x1)[0]; if (!nx) break; got.push(nx); cur = nx; }
        if (got.length < 2) return;
        await number(name, B3, Pp, Math.min.apply(null, got.map(b => b.x0)), Math.max.apply(null, got.map(b => b.x1)), Math.min.apply(null, got.map(b => b.y0)), Math.max.apply(null, got.map(b => b.y1)));
      };
      if (y0 != null) { await newest('wHis', y0); await newest('sHis', yS != null ? yS : y0 + ph); await newest('pHis', yP != null ? yP : y0 + 2 * ph); }
    }
    /* 6. Settle each number, and keep a small picture of where it was read so it can be checked at a glance. */
    const out = settle(found, metric), latest = ymd(addDays(new Date(), 1)), poor = bad();
    if (poor) ['weight', 'muscle', 'fat'].forEach(n => { if (out[n] && out[n].st !== 'ok') out[n] = null; }); // on a poor photo, a number read in one place only is not kept
    const shot = n => { const f = found[n], b = f && f.box; if (!b) return null; const sx = Math.max(0, Math.round(b.x0 - dH * 0.5)), sy = Math.max(0, Math.round(b.y0 - dH * 0.22)), c = mk(Math.min(f.c.width, b.x1 + dH * 0.5) - sx, Math.min(f.c.height, b.y1 + dH * 0.22) - sy); c.getContext('2d').drawImage(f.c, -sx, -sy); return c.toDataURL('image/png'); };
    ['weight', 'muscle', 'fat'].forEach(n => { if (out[n]) out[n].shot = out[n].from ? shot(out[n].from) : null; });
    const pair = [when2, when].filter(d => d && d.date <= latest && d.date >= '2005-01-01');
    if (pair.length && !(poor && !(pair.length > 1 && pair[1].date === pair[0].date))) out.date = { v: pair[0].date, st: pair.length > 1 && pair[1].date === pair[0].date ? 'ok' : pair.length > 1 ? 'mixed' : 'one', shot: shot('date'), time: pair[0].time || (pair[1] && pair[1].date === pair[0].date && pair[1].time) || null };
    out.metric = metric; out.ok = !!(out.weight || out.muscle || out.fat);
    // What to say about the photo when something could not be read.
    if (!out.ok || !out.weight || !out.muscle || !out.fat) out.hint = poor || (Q.cut ? 'cut' : u < 0.55 ? 'far' : null);
    if (!out.ok) out.why = out.hint || 'nonums';
    out.cut = Q.cut;
    return out;
  }

  /* ---------- the form ---------- */
  const WHY = {
    dark: 'Too dark to read. Turn on a light or move near a window, then try again.',
    blurry: 'The photo is blurry. Hold the phone still, let it focus on the sheet, and try again.',
    glare: 'Glare is hiding part of the sheet. Tilt it away from the light and try again.',
    faint: 'The print is too faint in this photo. Try again in even light.',
    far: 'The sheet is too small in the photo. Move closer until it fills the screen.',
    small: 'This picture is too small to read. Use a full-size photo straight from the camera.',
    angle: 'The sheet is at too steep an angle. Hold the phone flat above it and try again.',
    cut: 'Part of the sheet is cut off. Get the whole page in the photo.',
    nosheet: 'Could not find an InBody result sheet in that photo. Get the whole page in, the right way up. Printouts from other machines need typing in.',
    nonums: 'Found the sheet but could not read the numbers. Lay it flat in even light and try again.',
    open: 'Could not open that photo. Try another one.',
    reader: 'Could not load the reader. It needs a connection the first time. Type the numbers in for now.',
    crash: 'Something went wrong reading the photo. Try again, or type the numbers in.',
  };
  const CUT = { top: 'The top of the sheet is cut off.', bottom: 'The bottom of the sheet is cut off.', left: 'The left side of the sheet is cut off.', right: 'The right side of the sheet is cut off.' };
  const NAME = { weight: 'weight', muscle: 'muscle mass', fat: 'body fat' }, FIELDS = ['weight', 'muscle', 'fat'];
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const css = document.createElement('style');
  css.textContent = '.scan{display:grid;gap:8px}.scan-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.frm .scan-row .btn{margin-top:0;min-height:48px;font-size:16px;padding:0 8px}.scan-row .btn[disabled]{opacity:.5}' +
    '.scan-msg{margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);font-size:15px}.scan-msg[hidden]{display:none}.scan-msg.bad{border-color:var(--alert)}' +
    '.scan-shot{display:block;height:32px;max-width:100%;margin-top:6px;border:1px solid var(--line);border-radius:6px;background:#fff}.frm label .scan-flag{display:block;margin:3px 0 0;font-size:13px;color:var(--alert)}.input.scan-check{border-color:var(--alert)}.scan-on .two{align-items:start}';
  document.head.appendChild(css);

  let job = 0; // a newer photo, or a form opened afresh, makes an older reading stale
  const drawn = scanSheet;
  scanSheet = function (id) {
    drawn(id); job++;
    const frm = $('#sheet .frm'); if (!frm || P().measure !== 'body') return;
    const box = document.createElement('div'); box.className = 'scan';
    box.innerHTML = '<div class="scan-row"><button class="btn quiet" data-act="scanShoot">Take a photo</button><button class="btn quiet" data-act="scanPick">Choose a photo</button></div>' +
      '<p class="small muted">Reads an InBody result sheet and fills in the numbers. Or type them in below.</p><p class="scan-msg" id="scan-msg" role="status" hidden></p>' +
      '<input type="file" id="scan-shoot" accept="image/*" capture="environment" hidden><input type="file" id="scan-pick" accept="image/*" hidden>';
    frm.prepend(box);
  };
  const say = (text, bad) => { const el = $('#scan-msg'); if (!el) return; el.hidden = false; if (el.textContent !== text) el.textContent = text; el.classList.toggle('bad', !!bad); };
  const busy = on => document.querySelectorAll('.scan-row .btn').forEach(b => { b.disabled = on; });
  const clock = t => { const h = +t.slice(0, 2); return (h % 12 || 12) + t.slice(2) + (h < 12 ? ' AM' : ' PM'); };

  // Put what was read into the form, each number with the picture it came from, and say what to check.
  function fill(r) {
    document.querySelectorAll('#sheet .scan-shot, #sheet .scan-flag').forEach(el => el.remove());
    document.querySelectorAll('#sheet .scan-check').forEach(el => el.classList.remove('scan-check'));
    const show = (input, o, alt) => {
      if (o.shot) { const im = document.createElement('img'); im.className = 'scan-shot'; im.src = o.shot; im.alt = alt + ' as printed on the sheet'; input.after(im); }
      if (o.st === 'mixed') { input.classList.add('scan-check'); const f = document.createElement('span'); f.className = 'scan-flag'; f.textContent = o.others && o.others.length ? 'Another place on the sheet reads ' + o.others.map(trim).join(' or ') + '. Check this one.' : 'Check this one.'; (input.nextElementSibling || input).after(f); }
    };
    const got = FIELDS.filter(n => r[n]), not = FIELDS.filter(n => !r[n]);
    got.forEach(n => { const input = $('#sc-' + n); input.value = trim(r[n].v); show(input, r[n], cap(NAME[n])); });
    if (r.date) { const input = $('#sc-date'); input.value = r.date.v; show(input, r.date, 'Test date'); const note = $('#sc-note'); if (r.date.time && note && !note.value.trim()) note.value = 'InBody at ' + clock(r.date.time); }
    const all = got.map(n => NAME[n]).concat(r.date ? ['the date'] : []); $('#sheet .frm').classList.add('scan-on');
    let t = 'Filled in ' + list(all) + ' from the photo. Check ' + (all.length > 1 ? 'each against its picture' : 'it against its picture') + ', then save.';
    if (r.metric) t += ' The sheet is in kilograms, so weight and muscle are converted to pounds.';
    if (r.fat && r.fat.st === 'calc') t += ' Body fat is worked out from fat mass and weight.';
    if (not.length) t += ' Could not read ' + list(not.map(n => NAME[n])) + '. ' + (r.hint ? (r.hint === 'cut' && CUT[r.cut] ? CUT[r.cut] : WHY[r.hint]) + ' Or type ' + (not.length > 1 ? 'them' : 'it') + ' in.' : 'Type ' + (not.length > 1 ? 'them' : 'it') + ' in.');
    if (!r.date) t += ' The date was not read, so check it.';
    say(t, false);
  }
  let line = Promise.resolve(); // one photo at a time: two readings at once would trip over each other's reader settings
  async function read(file) {
    const me = ++job, live = () => me === job && $('#scan-msg'), url = URL.createObjectURL(file), before = line; let free; line = new Promise(ok => { free = ok; });
    busy(true); say('Opening the photo…');
    try {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch (e) { if (live()) say(WHY.open, true); return; }
      if (!live()) return;
      say('Getting the reader ready…'); const slow = setTimeout(() => { if (live()) say('Getting the reader ready. The first time, it downloads about 5 MB.'); }, 3500);
      try { await engine(); } catch (e) { if (live()) say(WHY.reader, true); return; } finally { clearTimeout(slow); }
      await before; if (!live()) return; // a reading that was dropped for this one gets to stop first
      const r = await readSheet(img, img.naturalWidth, img.naturalHeight, stage => { if (!live()) throw new Error('stale'); say(stage === 'find' ? 'Finding the sheet…' : 'Reading the numbers…'); });
      if (!live()) return;
      if (r.ok) fill(r); else say(r.why === 'cut' && CUT[r.cut] ? CUT[r.cut] + ' Get the whole page in the photo.' : WHY[r.why] || WHY.nonums, true);
    } catch (e) { if (live()) { console.error('Reading the photo failed', e); say(WHY.crash, true); } }
    finally { URL.revokeObjectURL(url); if (me === job) busy(false); rest(); free(); }
  }
  // Start loading the reader while the photo is being taken. If no photo comes back, it is let go again.
  const pick = id => { engine().catch(() => { /* reported when a photo comes back */ }); rest(); const el = $('#' + id); if (el) el.click(); };
  ACT.scanShoot = () => pick('scan-shoot');
  ACT.scanPick = () => pick('scan-pick');
  document.addEventListener('change', e => { const el = e.target; if ((el.id === 'scan-shoot' || el.id === 'scan-pick') && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; read(f); } });
})();
