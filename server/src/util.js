// Small helpers: ids, tokens, hashing, JSON responses, CORS.

export const now = () => Date.now();
export const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7); // YYYY-MM in UTC

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function id(prefix = '') { const b = crypto.getRandomValues(new Uint8Array(10)); let s = ''; b.forEach(x => { s += ALPHABET[x % ALPHABET.length]; }); return prefix + Date.now().toString(36) + s; }

const B64 = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function token() { const b = crypto.getRandomValues(new Uint8Array(32)); return B64(String.fromCharCode.apply(null, b)); }
// Invite codes are typed by hand, so no 0/O/1/I and in two halves: ABCD-EFGH.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function inviteCode() { const b = crypto.getRandomValues(new Uint8Array(8)); let s = ''; b.forEach((x, i) => { s += CODE_CHARS[x % CODE_CHARS.length]; if (i === 3) s += '-'; }); return s; }
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');

export async function sha256(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join(''); }
export function sameString(a, b) { // constant time, for secrets
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; } }

export function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.some(a => origin === a || (a.startsWith('http://localhost') && origin.startsWith('http://localhost')) || (a.startsWith('http://127.0.0.1') && origin.startsWith('http://127.0.0.1')));
  const h = { 'Vary': 'Origin' };
  if (ok) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '86400' });
  return h;
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers) });
}
export async function readJson(req, max = 1_000_000) {
  const t = await req.text();
  if (t.length > max) throw new HttpError(413, 'Too much data in one request.');
  if (!t.trim()) return {};
  try { return JSON.parse(t); } catch (e) { throw new HttpError(400, 'The request is not valid JSON.'); }
}
export const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
