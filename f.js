'use strict';
/* ================= Spotify remote: previous, play/pause, next (standalone site only) =================
   Uses Spotify's Authorization Code with PKCE flow and the Web API player endpoints.
   Needs Spotify Premium and the person's own Spotify developer app (Client ID pasted in Settings). */
(() => {
  if (typeof STANDALONE === 'undefined' || !STANDALONE) return;
  const KEY = 'fitpitt.spotify', AUTH = 'https://accounts.spotify.com/authorize', TOKEN = 'https://accounts.spotify.com/api/token', API = 'https://api.spotify.com/v1/me/player';
  const SCOPE = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';
  const redirectUri = location.origin + location.pathname.replace(/index\.html$/, '');
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  let sp = {}; try { sp = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { sp = {}; }
  let playing = { title: '', on: false }, pollT = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sp)); } catch (e) { /* ignore */ } };
  const connected = () => !!(sp.clientId && sp.refresh);

  const rand = n => { const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', v = crypto.getRandomValues(new Uint8Array(n)); let s = ''; v.forEach(x => { s += p[x % p.length]; }); return s; };
  const challenge = async v => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)); return btoa(String.fromCharCode.apply(null, new Uint8Array(d))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };

  async function connect() {
    const id = ($('#sp-id') ? $('#sp-id').value : '').trim();
    if (!/^[A-Za-z0-9]{20,64}$/.test(id)) { toast('Paste the Client ID from your Spotify app.'); return; }
    const verifier = rand(64), state = rand(16);
    sp = { clientId: id, verifier, state }; save();
    const u = new URL(AUTH);
    u.search = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPE, code_challenge_method: 'S256', code_challenge: await challenge(verifier), redirect_uri: redirectUri, state }).toString();
    location.href = u.toString();
  }
  async function finishLogin() {
    const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error');
    if (!code && !err) return;
    const ok = !err && sp.verifier && q.get('state') === sp.state;
    history.replaceState(null, '', redirectUri);
    if (!ok) { toast(err ? 'Spotify did not connect: ' + err + '.' : 'Spotify sign-in did not match. Try again.'); return; }
    try {
      const r = await fetch(TOKEN, { method: 'POST', headers: form, body: new URLSearchParams({ client_id: sp.clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: sp.verifier }) });
      const j = await r.json();
      if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || 'no token');
      sp = { clientId: sp.clientId, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000 }; save();
      toast('Spotify connected.'); requestRender(); paint(); poll();
    } catch (e) { toast('Spotify did not connect: ' + (e.message || 'try again') + '.'); }
  }
  let refreshing = null; // one refresh at a time: Spotify replaces the refresh token on each use
  function token() {
    if (sp.access && Date.now() < (sp.exp || 0)) return Promise.resolve(sp.access);
    if (!sp.refresh) return Promise.resolve(null);
    if (!refreshing) refreshing = renew().catch(() => null).then(t => { refreshing = null; return t; });
    return refreshing;
  }
  async function renew() {
    const r = await fetch(TOKEN, { method: 'POST', headers: form, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sp.refresh, client_id: sp.clientId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      if (j.error === 'invalid_grant') { sp = { clientId: sp.clientId }; save(); paint(); toast('Spotify needs reconnecting in Settings.'); }
      return null;
    }
    sp.access = j.access_token; sp.exp = Date.now() + (j.expires_in || 3600) * 1000 - 60000; if (j.refresh_token) sp.refresh = j.refresh_token; save();
    return sp.access;
  }
  async function call(method, path) {
    let t = await token(); if (!t) return { status: 0, ok: false };
    let r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401) { sp.exp = 0; t = await token(); if (!t) return { status: 401, ok: false }; r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + t } }); }
    return r;
  }
  async function cmd(kind) {
    const map = { next: ['POST', '/next'], prev: ['POST', '/previous'], pause: ['PUT', '/pause'], play: ['PUT', '/play'] }, m = map[kind][0], p = map[kind][1];
    try {
      let r = await call(m, p);
      if (r.status === 404) { // no active device: aim at the phone, or the first device Spotify lists
        const d = await call('GET', '/devices'), j = d.ok ? await d.json() : {}, list = j.devices || [], dev = list.find(x => x.type === 'Smartphone') || list[0];
        if (!dev) { toast('Open Spotify and start something playing first.'); return; }
        r = await call(m, p + '?device_id=' + encodeURIComponent(dev.id));
      }
      if (r.status === 0) { toast('Connect Spotify in Settings first.'); return; }
      if (r.status === 429) { toast('Spotify is busy. Try again in a moment.'); return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); toast('Spotify: ' + ((j.error && j.error.message) || 'refused (' + r.status + ')') + '.'); return; }
      if (kind === 'pause' || kind === 'play') { playing.on = kind === 'play'; paint(); }
      setTimeout(poll, 900);
    } catch (e) { toast('Could not reach Spotify.'); }
  }
  async function poll() {
    if (!connected() || !S.active || document.visibilityState !== 'visible') return;
    try {
      const r = await call('GET', '/currently-playing');
      if (r.status === 200) { const j = await r.json(); playing = { title: j.item ? j.item.name + (j.item.artists && j.item.artists[0] ? ', ' + j.item.artists[0].name : '') : '', on: !!j.is_playing }; }
      else if (r.status === 204) playing = { title: '', on: false };
    } catch (e) { /* keep the last known title */ }
    paint();
  }

  /* ---------- the bar and the Settings section ---------- */
  const I = d => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + d + '</svg>';
  const css = document.createElement('style');
  css.textContent = '#music{position:fixed;left:0;right:0;z-index:19;bottom:calc(var(--tabs-h) + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--line)}#music[hidden]{display:none}' +
    'body.resting #music{bottom:calc(var(--tabs-h) + env(safe-area-inset-bottom,0px) + var(--rest-h,67px))}' +
    '.mu-row{max-width:560px;margin:0 auto;display:flex;align-items:center;gap:4px;padding:5px 10px 5px 16px}.mu-title{flex:1;min-width:0;font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#music button{flex:none;width:52px;height:44px;border:0;background:none;display:grid;place-items:center;padding:0;color:var(--ink)}#music button svg{width:26px;height:26px}' +
    'body.music #app{padding-bottom:calc(var(--tabs-h) + 90px)}body.music.resting #app{padding-bottom:calc(var(--tabs-h) + 172px)}';
  document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'music'; bar.hidden = true;
  bar.innerHTML = '<div class="mu-row"><span class="mu-title" id="mu-title"></span>' +
    '<button data-act="spPrev" aria-label="Previous track">' + I('<rect x="5" y="6" width="2.6" height="12" rx="1"/><path d="M19 6v12l-9.5-6z"/>') + '</button>' +
    '<button data-act="spToggle" id="mu-toggle" aria-label="Play or pause"></button>' +
    '<button data-act="spNext" aria-label="Next track">' + I('<rect x="16.4" y="6" width="2.6" height="12" rx="1"/><path d="M5 6v12l9.5-6z"/>') + '</button></div>';
  document.body.appendChild(bar);
  function paint() {
    const show = connected() && !!S.active, was = !bar.hidden;
    bar.hidden = !show; document.body.classList.toggle('music', show);
    if (!show) return;
    if (!was) poll();
    const rest = $('#rest'); if (rest && !rest.hidden) document.body.style.setProperty('--rest-h', rest.offsetHeight + 'px');
    $('#mu-title').textContent = playing.title || 'Spotify';
    $('#mu-toggle').innerHTML = playing.on ? I('<rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/>') : I('<path d="M8 5.5v13l11-6.5z"/>');
    if (!pollT) pollT = setInterval(poll, 15000);
  }
  function settingsCard() {
    if (tab !== 'settings' || !S.meta.program || $('#sp-set')) return;
    const all = app.querySelectorAll('.setting'); if (!all.length) return;
    const el = document.createElement('div'); el.className = 'setting'; el.id = 'sp-set';
    el.innerHTML = '<span class="s-l">Spotify buttons</span><p>Puts previous, play/pause and next on the workout screen. It needs Spotify Premium and your own free Spotify developer app, with this exact redirect URI: <b>' + esc(redirectUri) + '</b></p>' +
      (connected() ? '<p>Connected. The buttons show during a workout.</p><button class="btn small quiet" data-act="spOff">Disconnect</button>'
        : '<input class="input" id="sp-id" type="text" aria-label="Spotify Client ID" placeholder="Client ID" value="' + esc(sp.clientId || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small" data-act="spOn" style="margin-top:10px">Connect Spotify</button>');
    all[all.length - 1].before(el);
  }
  ACT.spOn = connect;
  ACT.spOff = () => { sp = { clientId: sp.clientId }; save(); const el = $('#sp-set'); if (el) el.remove(); settingsCard(); paint(); toast('Spotify disconnected.'); };
  ACT.spNext = () => cmd('next'); ACT.spPrev = () => cmd('prev'); ACT.spToggle = () => cmd(playing.on ? 'pause' : 'play');
  new MutationObserver(() => { settingsCard(); paint(); }).observe(app, { childList: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
  settingsCard(); paint(); finishLogin().then(poll);
})();
