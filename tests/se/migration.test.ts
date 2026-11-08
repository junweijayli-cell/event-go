// 加列迁移的回归测试。
//
// 线上那张 se_admins 已经有数据了，CREATE TABLE IF NOT EXISTS 碰都不会碰它，
// 而 ALTER TABLE ADD COLUMN 又没有 IF NOT EXISTS。这里拿真的 SQLite 建一张
// 「老结构」的表，塞几行老数据，跑一遍 pendingColumnStatements 吐出来的语句，
// 验三件事：列补上了、老行被回填了、再跑一次不会炸。
//
// 最后一条最要紧：回填把老管理员标成「已认领」，不然他们下次打开后台会被拦去
// 填姓名 —— 包括发起人自己。而「只跑一次」保证了之后新建的管理员仍然要走认领。
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SE_MIGRATED_TABLES, pendingColumnStatements } from '../../db/se/sql.ts';

// 这个功能上线之前的 se_admins
const OLD_ADMINS_TABLE = `CREATE TABLE se_admins (
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
)`;

function oldDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(OLD_ADMINS_TABLE);
  db.exec(`INSERT INTO se_admins (id, event_id, name, note, role, token_hash, token_issued_at,
      token_revoked_at, channel_id, created_at, updated_at)
    VALUES ('adm-1', 'evt-1', '老发起人', '', 'owner', 'h1', '2026-01-01T00:00:00.000Z', NULL,
      'ch-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`);
  db.exec(`INSERT INTO se_admins (id, event_id, name, note, role, token_hash, token_issued_at,
      token_revoked_at, channel_id, created_at, updated_at)
    VALUES ('adm-2', 'evt-1', '老管理员', '', 'admin', 'h2', '2026-01-02T00:00:00.000Z', NULL,
      'ch-2', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z')`);
  return db;
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String((row as { name: unknown }).name));
}

function migrate(db: DatabaseSync, table: string): number {
  const statements = pendingColumnStatements(table, columnsOf(db, table));
  for (const statement of statements) db.exec(statement);
  return statements.length;
}

test('老表补得上新列，一次跑完', () => {
  const db = oldDatabase();
  const before = columnsOf(db, 'se_admins');
  assert.ok(!before.includes('claimed_at'), '前提：老表本来没有 claimed_at');

  const ran = migrate(db, 'se_admins');
  assert.ok(ran > 0, '应该有语句要跑');

  const after = columnsOf(db, 'se_admins');
  for (const column of ['invited_name', 'phone', 'claimed_at']) {
    assert.ok(after.includes(column), `${column} 应该被补上了`);
  }
  db.close();
});

test('老管理员被回填成已认领，不会被拦去填姓名', () => {
  const db = oldDatabase();
  migrate(db, 'se_admins');

  const rows = db.prepare('SELECT id, name, invited_name, phone, claimed_at, created_at FROM se_admins ORDER BY id').all() as {
    id: string;
    name: string;
    invited_name: string;
    phone: string;
    claimed_at: string | null;
    created_at: string;
  }[];

  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.claimed_at, row.created_at, `${row.id} 应该按建号时间标成已认领`);
    assert.equal(row.invited_name, row.name, `${row.id} 的 invited_name 应该回填成当时的名字`);
    assert.equal(row.phone, '', `${row.id} 没填过手机号，应该是空串而不是 NULL`);
  }
  db.close();
});

test('迁移幂等：第二次跑不动手也不报错', () => {
  const db = oldDatabase();
  migrate(db, 'se_admins');
  const second = pendingColumnStatements('se_admins', columnsOf(db, 'se_admins'));
  assert.deepEqual(second, [], '列齐了就不该再有语句');
  // 真去跑一遍（空数组），确认不会抛
  assert.equal(migrate(db, 'se_admins'), 0);
  db.close();
});

test('回填只在加列那一次发生：之后新建的管理员照样要认领', () => {
  const db = oldDatabase();
  migrate(db, 'se_admins');

  // 迁移之后新邀请一个管理员，claimed_at 是 NULL —— 他必须自己走认领
  db.exec(`INSERT INTO se_admins (id, event_id, name, invited_name, phone, note, role, token_hash,
      token_issued_at, token_revoked_at, claimed_at, channel_id, created_at, updated_at)
    VALUES ('adm-3', 'evt-1', '张三', '张三', '', '', 'admin', 'h3', '2026-02-01T00:00:00.000Z',
      NULL, NULL, 'ch-3', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')`);

  // 再跑一次迁移（模拟下一次冷启动），不该把他也标成已认领
  migrate(db, 'se_admins');
  const fresh = db.prepare("SELECT claimed_at FROM se_admins WHERE id = 'adm-3'").get() as { claimed_at: string | null };
  assert.equal(fresh.claimed_at, null, '新邀请的管理员必须保持未认领');
  db.close();
});

test('已经是新结构的表，不会被再动一次', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE se_admins (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL,
    invited_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'admin',
    token_hash TEXT NOT NULL, token_issued_at TEXT NOT NULL, token_revoked_at TEXT,
    claimed_at TEXT, channel_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  assert.deepEqual(pendingColumnStatements('se_admins', columnsOf(db, 'se_admins')), []);
  db.close();
});

test('迁移表清单里没有重复', () => {
  assert.deepEqual(SE_MIGRATED_TABLES, [...new Set(SE_MIGRATED_TABLES)]);
});
