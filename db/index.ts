import { drizzle } from 'drizzle-orm/d1';
import { getSqlDatabase } from '@/db/runtime';
import * as schema from './schema';
import { SE_MIGRATED_TABLES, SE_STATEMENTS, pendingColumnStatements } from './se/sql';

let schemaReady: Promise<void> | null = null;

// 哪个平台由 db/runtime.ts（Cloudflare D1）或 db/runtime.node.ts（node:sqlite）决定，
// 构建时二选一。调用方看到的始终是 D1 的调用形状。
export function getD1(): D1Database {
  return getSqlDatabase();
}

// drizzle 的 d1 驱动只在 Cloudflare 上有意义；本工程的读写走上面的裸 prepare，
// 这里保留是为了 drizzle-kit 能按 db/schema.ts 生成迁移。
export function getDb() {
  return drizzle(getD1(), { schema });
}

export async function ensureDatabase() {
  if (!schemaReady) schemaReady = initializeSchema().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

// 建表的权威 DDL 在 db/se/sql.ts。第一次请求时自动建好，不需要手动跑迁移。
async function initializeSchema() {
  const db = getD1();
  await db.batch(SE_STATEMENTS.map((statement) => db.prepare(statement)));
  await addMissingColumns(db);
  await db.prepare('PRAGMA optimize').run();
}

// CREATE TABLE IF NOT EXISTS 碰到已经存在的表什么都不做，所以线上那张有数据的表
// 不会自己长出新列；而 ALTER TABLE ADD COLUMN 没有 IF NOT EXISTS，重复跑会报错。
// 先问一次 PRAGMA table_info，缺哪列补哪列，这样新库和老库都走得通。
// ensureDatabase() 每个 isolate 只跑一次，多这几次查询不心疼。
// 表名和列定义都来自 SE_ADDED_COLUMNS 这个常量，不来自用户输入。
async function addMissingColumns(db: D1Database) {
  for (const table of SE_MIGRATED_TABLES) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const statements = pendingColumnStatements(table, (info.results ?? []).map((row) => row.name));
    // 该跑的语句里，回填紧跟在它那条加列后面，而且只有这一次会跑到：
    // 此刻表里的行全是新功能上线之前的老数据，该给它们什么默认值，只有这一刻分得清。
    for (const statement of statements) await db.prepare(statement).run();
  }
}
