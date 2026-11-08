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
    invited_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'admin',
    token_hash TEXT NOT NULL,
    token_issued_at TEXT NOT NULL,
    token_revoked_at TEXT,
    claimed_at TEXT,
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

// 给「已经存在」的表补列。
//
// 上面那批语句全是 CREATE TABLE IF NOT EXISTS：新库会直接带上新列，但线上那张
// 已经有数据的表它一个字都不会改。而 SQLite 的 ALTER TABLE ADD COLUMN 不是幂等的
// —— 列已存在就直接报错，没有 IF NOT EXISTS 可用。所以 db/index.ts 先查
// PRAGMA table_info，缺哪列补哪列。
//
// 只能往里加列，不能改列也不能删列：那会要求重建表，线上数据担不起。
// 新列必须可空，或者带 DEFAULT —— 老行要靠它填上。
// backfill 只在「这一列刚刚被加上」的那一次跑，不是每次启动都跑 —— 否则会把
// 真正还没认领的人误标成已认领。
export const SE_ADDED_COLUMNS: { table: string; column: string; ddl: string; backfill?: string }[] = [
  // 管理员认领：生成链接时发起人先替他起个名（invited_name），本人第一次打开
  // 链接时自己填真名和联系方式，claimed_at 落下那一刻的时间。
  {
    table: 'se_admins',
    column: 'invited_name',
    ddl: "invited_name TEXT NOT NULL DEFAULT ''",
    backfill: "UPDATE se_admins SET invited_name = name WHERE invited_name = ''",
  },
  { table: 'se_admins', column: 'phone', ddl: "phone TEXT NOT NULL DEFAULT ''" },
  {
    table: 'se_admins',
    column: 'claimed_at',
    ddl: 'claimed_at TEXT',
    // 这一列加上去的那一刻，库里已有的管理员全是「认领」这个功能上线之前建的。
    // 不回填的话他们下次打开后台会被莫名其妙拦去填姓名 —— 包括发起人自己。
    // 加列和回填只发生一次，之后新建的管理员才会真的带着 NULL 去走认领。
    backfill: 'UPDATE se_admins SET claimed_at = created_at WHERE claimed_at IS NULL',
  },
];

// 给定某张表「现在有哪些列」，算出该跑哪些语句。拆出来是为了能脱开 D1 直接测：
// 建一张老结构的表、塞几行老数据、跑这些语句、看列补上了没、老行有没有被回填。
// 返回空数组表示这张表已经是最新的（绝大多数启动都是这种情况）。
export function pendingColumnStatements(table: string, existingColumns: Iterable<string>): string[] {
  const present = new Set(existingColumns);
  const statements: string[] = [];
  for (const item of SE_ADDED_COLUMNS) {
    if (item.table !== table || present.has(item.column)) continue;
    statements.push(`ALTER TABLE ${item.table} ADD COLUMN ${item.ddl}`);
    if (item.backfill) statements.push(item.backfill);
  }
  return statements;
}

export const SE_MIGRATED_TABLES = [...new Set(SE_ADDED_COLUMNS.map((item) => item.table))];
