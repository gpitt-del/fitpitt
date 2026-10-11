import { DEFAULT_SETTINGS } from './schema.js';

// Settings live in one table as JSON values, with defaults filled in for anything unset.
export async function getSettings(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const r of rows.results || []) {
    try {
      const v = JSON.parse(r.value);
      if (r.key === 'tasks' || r.key === 'prices') out[r.key] = Object.assign(out[r.key], v && typeof v === 'object' ? v : {});
      else out[r.key] = v;
    } catch (e) { /* a bad row is ignored */ }
  }
  return out;
}

// Accepts a partial object; only known keys are stored, after a sanity check.
export async function putSettings(env, patch) {
  const cur = await getSettings(env), writes = [];
  const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : null;
  for (const k of ['flag_usd', 'stop_usd', 'ceiling_usd']) if (k in patch) { const v = num(patch[k]); if (v === null) throw new Error(k + ' must be a number of dollars, 0 or more.'); cur[k] = v; writes.push([k, v]); }
  if (patch.tasks && typeof patch.tasks === 'object') {
    for (const [task, t] of Object.entries(patch.tasks)) {
      if (!cur.tasks[task] || !t || typeof t !== 'object') continue;
      const o = Object.assign({}, cur.tasks[task]);
      if (typeof t.model === 'string' && /^[a-z0-9.-]{3,64}$/.test(t.model)) o.model = t.model;
      if (['low', 'medium', 'high', 'xhigh', 'max'].includes(t.effort)) o.effort = t.effort;
      if (Number.isInteger(t.max_tokens) && t.max_tokens >= 500 && t.max_tokens <= 64000) o.max_tokens = t.max_tokens;
      cur.tasks[task] = o;
    }
    writes.push(['tasks', cur.tasks]);
  }
  if (patch.prices && typeof patch.prices === 'object') {
    for (const [model, p] of Object.entries(patch.prices)) {
      if (!p || typeof p !== 'object' || !/^[a-z0-9.-]{3,64}$/.test(model)) continue;
      const o = {}; for (const k of ['in', 'out', 'cache_read', 'cache_write']) { const v = num(p[k]); if (v === null) throw new Error('Price ' + k + ' for ' + model + ' must be a number.'); o[k] = v; }
      cur.prices[model] = o;
    }
    writes.push(['prices', cur.prices]);
  }
  if (writes.length) await env.DB.batch(writes.map(([k, v]) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v))));
  return cur;
}

// Dollars for one call, from the response's usage and the price table. Prices are per million tokens.
export function costOf(prices, model, usage) {
  const p = prices[model]; if (!p || !usage) return 0;
  const n = k => +usage[k] || 0;
  return (n('input_tokens') * p.in + n('output_tokens') * p.out + n('cache_read_input_tokens') * p.cache_read + n('cache_creation_input_tokens') * p.cache_write) / 1e6;
}
