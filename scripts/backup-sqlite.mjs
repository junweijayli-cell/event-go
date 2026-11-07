// 备份报名数据库。用法：node scripts/backup-sqlite.mjs [备份目录]
//
// 用 SQLite 的 VACUUM INTO：即使正在有人报名、WAL 里还有未合并的事务，
// 导出的也是一个一致的快照，不会出现「备份到一半的库」。
// 直接 cp 那个 .sqlite 文件是不安全的（WAL 还没合并进去）。
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source = resolve(process.env.SE_SQLITE_PATH || './data/signup.sqlite');
const beijing = new Date(Date.now() + 8 * 3600000).toISOString();
const stamp = `${beijing.slice(0, 10)}-${beijing.slice(11, 13)}${beijing.slice(14, 16)}`;
const target = resolve(process.argv[2] || './backups', `signup-${stamp}.sqlite`);

mkdirSync(dirname(target), { recursive: true });

const db = new DatabaseSync(source);
try {
  db.exec(`VACUUM INTO '${target.split("'").join("''")}'`);
  console.log(`已备份：${target}`);
} finally {
  db.close();
}
