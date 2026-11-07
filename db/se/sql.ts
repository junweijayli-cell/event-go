// DDL for the event-signup module. This is the authoritative schema: the
// project creates tables at runtime from `initializeSchema()` in db/index.ts
// (drizzle migrations in ./drizzle are generated but never applied, there is no
// `migrations_dir` binding). Every statement must stay idempotent.
//
// Mirror of the drizzle definitions at the bottom of db/schema.ts, with two
// deliberate additions SQLite can express and drizzle's builder would only
// obscure: the partial unique indexes.
export const SE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS se_events (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    cover_key TEXT,
    start_at TEXT,
    end_at TEXT,
    time_note TEXT NOT NULL DEFAULT '',
    location_name TEXT NOT NULL DEFAULT '',
    location_address TEXT NOT NULL DEFAULT '',
    location_lat REAL,
    location_lng REAL,
    location_note TEXT NOT NULL DEFAULT '',
    capacity INTEGER,
    signup_count INTEGER NOT NULL DEFAULT 0,
    waitlist_count INTEGER NOT NULL DEFAULT 0,
    deadline_at TEXT,
    need_review INTEGER NOT NULL DEFAULT 0,
    allow_edit INTEGER NOT NULL DEFAULT 0,
    max_per_phone INTEGER NOT NULL DEFAULT 1,
    form_schema TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    owner_admin_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_events_code ON se_events(code)`,

  `CREATE TABLE IF NOT EXISTS se_admins (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'admin',
    token_hash TEXT NOT NULL,
    token_issued_at TEXT NOT NULL,
    token_revoked_at TEXT,
    channel_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_admins_token ON se_admins(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_se_admins_event ON se_admins(event_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS se_channels (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'admin',
    admin_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    visit_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_channels_code ON se_channels(event_id, code)`,
  `CREATE INDEX IF NOT EXISTS idx_se_channels_admin ON se_channels(event_id, admin_id)`,

  `CREATE TABLE IF NOT EXISTS se_registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    ticket_token_hash TEXT NOT NULL,
    checkin_code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    form_data TEXT NOT NULL DEFAULT '{}',
    channel_code TEXT NOT NULL DEFAULT '',
    channel_id TEXT,
    inviter_admin_id TEXT,
    inviter_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    review_note TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TEXT,
    checked_in_at TEXT,
    checked_in_by TEXT,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_reg_ticket ON se_registrations(ticket_token_hash)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_reg_checkin_code ON se_registrations(event_id, checkin_code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_reg_request ON se_registrations(request_id)`,
  // One signup per phone per event. Cancelled and rejected rows drop out of the
  // index so the same person can sign up again after withdrawing.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_se_reg_phone ON se_registrations(event_id, phone)
    WHERE phone <> '' AND status <> 'cancelled' AND status <> 'rejected'`,
  `CREATE INDEX IF NOT EXISTS idx_se_reg_event_status ON se_registrations(event_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_se_reg_inviter ON se_registrations(event_id, inviter_admin_id)`,

  `CREATE TABLE IF NOT EXISTS se_updates (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_keys TEXT NOT NULL DEFAULT '[]',
    location_name TEXT NOT NULL DEFAULT '',
    location_address TEXT NOT NULL DEFAULT '',
    location_lat REAL,
    location_lng REAL,
    starts_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_se_updates_event ON se_updates(event_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS se_files (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    storage TEXT NOT NULL DEFAULT 'd1',
    data BLOB,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_se_files_event ON se_files(event_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS se_checkin_logs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    registration_id TEXT,
    admin_id TEXT NOT NULL,
    result TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_se_checkin_event ON se_checkin_logs(event_id, at)`,

  `CREATE TABLE IF NOT EXISTS se_audit_logs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '{}',
    at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_se_audit_event ON se_audit_logs(event_id, at)`,

  `CREATE TABLE IF NOT EXISTS se_rate_limits (
    key TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  )`,
];
