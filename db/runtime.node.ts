// 平台适配层 —— 普通 Node 实现（腾讯云轻量 / 云托管 / 任何能跑 Node 的国内主机）。
//
// 由 vite.config.ts 在 SE_PLATFORM=node 时替换掉 db/runtime.ts，所以这个文件
// 不会进 Cloudflare 构建，db/runtime.ts 也不会进 Node 构建。
//
// 存储用 Node 24 内置的 node:sqlite（不需要任何原生依赖，装完 Node 就能跑）。
// 下面这层外观把它包成 D1 的调用形状，业务代码里的 prepare/bind/first/all/run/batch
// 全部照旧，一行不用改。
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const PLATFORM: string = 'node';

type Bindable = string | number | bigint | null | Uint8Array;

// D1 接受 boolean / undefined / ArrayBuffer，node:sqlite 不接受，在这里抹平。
function normalize(value: unknown): Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  return String(value);
}

class NodeStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly args: Bindable[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new NodeStatement(this.db, this.sql, args.map(normalize));
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args);
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, number> }> {
    const results = this.db.prepare(this.sql).all(...this.args) as T[];
    return { results, success: true, meta: { rows_read: results.length } };
  }

  async run(): Promise<{ success: true; results: never[]; meta: { changes: number; last_row_id: number } }> {
    const outcome = this.db.prepare(this.sql).run(...this.args);
    return {
      success: true,
      results: [],
      meta: { changes: Number(outcome.changes), last_row_id: Number(outcome.lastInsertRowid) },
    };
  }
}

class NodeDatabase {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string) {
    return new NodeStatement(this.db, sql);
  }

  // D1 的 batch 是原子的，这里用事务对齐。建表语句和「生成渠道 + 生成管理员」
  // 都走它，半途失败必须整条回滚。
  async batch<T = unknown>(statements: NodeStatement[]): Promise<T[]> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const output: unknown[] = [];
      for (const statement of statements) output.push(await statement.run());
      this.db.exec('COMMIT');
      return output as T[];
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* 回滚本身失败时保留原始错误 */
      }
      throw error;
    }
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

let database: NodeDatabase | null = null;

export function getSqlDatabase(): D1Database {
  if (database) return database as unknown as D1Database;
  const file = resolve(process.env.SE_SQLITE_PATH || './data/signup.sqlite');
  mkdirSync(dirname(file), { recursive: true });
  const handle = new DatabaseSync(file);
  // WAL：读写不互相阻塞，断电后也能恢复。busy_timeout 兜住偶发锁冲突。
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA busy_timeout = 5000');
  handle.exec('PRAGMA synchronous = NORMAL');
  database = new NodeDatabase(handle);
  // 这里的 cast 是刻意的：NodeDatabase 只实现了本项目用到的 D1 子集
  // （prepare/bind/first/all/run/batch/exec），不假装自己是完整的 D1Database。
  return database as unknown as D1Database;
}

export function getEnvValue(key: string): string | undefined {
  const value = process.env?.[key];
  return value || undefined;
}

// Node 部署没有 R2，图片直接存 SQLite（见 db/se/data.ts 的 putImage 兜底分支）。
export function getMediaBucket(): R2Bucket | null {
  return null;
}

// 两套实现必须导出同样的东西。签名漂了这里会在 tsc 阶段就报错，而不是等国内那台
// 机器跑起来才发现少了个函数。import type 会被编译期擦掉，不会把 cloudflare:workers
// 带进 Node 构建。
import type * as CloudflareRuntime from './runtime';
const conformance: typeof CloudflareRuntime = { PLATFORM, getSqlDatabase, getEnvValue, getMediaBucket };
void conformance;
