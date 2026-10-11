// The database, created on first use. Every statement is safe to run again, so a new table or column can be added
// here and it appears on the next request. Money is kept in US dollars as a REAL; at friend scale that is plenty.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',      -- admin | member | kid
  parent_id TEXT,                            -- for kids: the person who answers for them
  created INTEGER NOT NULL,
  last_seen INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0,
  cap_usd REAL,                              -- a per-person monthly stop that overrides the setting; NULL = the setting
  note TEXT
);
CREATE TABLE IF NOT EXISTS invites (
  code_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 3
);
CREATE TABLE IF NOT EXISTS devices (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER,
  label TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS devices_person ON devices (person_id);
CREATE TABLE IF NOT EXISTS docs (
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- meta | active | session | scan | plan | intake
  id TEXT NOT NULL,
  u INTEGER NOT NULL,                        -- the app's update stamp; the newer stamp wins
  deleted INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,                        -- JSON
  PRIMARY KEY (person_id, kind, id)
);
CREATE INDEX IF NOT EXISTS docs_person_u ON docs (person_id, u);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- plan | review | ask
  status TEXT NOT NULL,                      -- queued | running | done | failed
  created INTEGER NOT NULL,
  started INTEGER,
  finished INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  effort TEXT,
  input TEXT NOT NULL,                       -- JSON, what the person sent
  output TEXT,                               -- JSON, what came back (a plan, or text)
  error TEXT,
  in_tokens INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jobs_person_created ON jobs (person_id, created);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                        -- JSON
);
`;

// Settings the admin can change from the app. Prices are dollars per million tokens, from claude.com/pricing on Oct 11 2026.
export const DEFAULT_SETTINGS = {
  flag_usd: 5,        // a person other than an admin whose month passes this is flagged on the admin screen
  stop_usd: 20,       // the server refuses more coach work for a person past this in a month (admins exempt unless capped)
  ceiling_usd: 150,   // the server refuses coach work for everyone once the month passes this
  tasks: {
    plan: { model: 'claude-fable-5-1', effort: 'high', max_tokens: 16000 },
    review: { model: 'claude-fable-5-1', effort: 'high', max_tokens: 6000 },
    ask: { model: 'claude-fable-5-1', effort: 'medium', max_tokens: 4000 },
  },
  prices: {
    'claude-fable-5-1': { in: 10, out: 50, cache_read: 0.25, cache_write: 12.5 },
    'claude-opus-5-5': { in: 4, out: 20, cache_read: 0.2, cache_write: 5 },
    'claude-sonnet-5-5': { in: 2, out: 10, cache_read: 0.1, cache_write: 2.5 },
    'claude-haiku-5-5': { in: 0.1, out: 0.5, cache_read: 0.01, cache_write: 0.125 },
  },
};

let ready = null;
export function ensureSchema(env) {
  if (!ready) ready = env.DB.exec(SCHEMA.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()).catch(e => { ready = null; throw e; });
  return ready;
}
