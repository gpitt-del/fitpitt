// FitPitt offline support. Own files load from the network first so updates arrive, and from the cache when offline.
const CACHE = 'fitpitt-v28';
// The photo reader's files (the ocr7 folder) are large and never change. They are fetched the first time a photo is read, then kept through app updates.
const READER = 'fitpitt-ocr7';
// The exercise pictures (img/, about 0.7 MB in all) are part of the shell so the how-to sheet works offline. Keep this list equal to the files in img/ and to q.js PICS.
const PICS = ['abductor', 'adductor', 'back_toss', 'balance', 'bear', 'bench', 'boxjump', 'bridge', 'broad', 'bulg', 'calf', 'chest', 'cmj', 'crab', 'crunch', 'curl', 'curl_bayes', 'curl_cable', 'curl_incline', 'curl_preacher', 'deadbug', 'dip', 'drop', 'facepull', 'fly', 'hack', 'hangraise', 'hipthrust', 'hk_press', 'incline', 'landmine', 'lateral', 'latlunge', 'legext', 'legpress', 'linehop', 'oh_throw', 'ohp', 'ohp_seat', 'pallof', 'pogo', 'pulldown', 'pullthrough', 'pullup', 'pushdown', 'pushup', 'rdl', 'reach', 'rfly', 'row_1a', 'row_cs', 'sa_pulldown', 'scoop', 'side_throw', 'sideplank', 'skater', 'skull', 'slam', 'snap', 'snap1', 'squat', 'squat_bb', 'squat_box', 'stepup', 'tri_oh'];
const SHELL = ['./', 'index.html', 'app.css', 'a.js', 'b.js', 'c.js', 'd.js', 'n.js', 'e.js', 'f.js', 'g.js', 'h.js', 'i.js', 'j.js', 'k.js?v=2', 'l.js', 'm.js', 'o.js', 'p.js', 'q.js', 's.js', 't.js', 'manifest.webmanifest', 'icon.svg'].concat(PICS.map(p => 'img/' + p + '.webp'));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== READER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  if (!fonts && url.pathname.indexOf('/ocr7/') >= 0) { e.respondWith(caches.open(READER).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })))); return; }
  const keep = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (fonts) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep))); return; }
  e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
