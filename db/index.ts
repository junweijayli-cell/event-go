import { drizzle } from 'drizzle-orm/d1';
import { getSqlDatabase } from '@/db/runtime';
import * as schema from './schema';
import { SE_STATEMENTS } from './se/sql';

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
  await db.prepare('PRAGMA optimize').run();
}
