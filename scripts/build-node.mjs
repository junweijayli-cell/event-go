// 产出国内自托管用的 standalone Node 服务：dist/standalone/server.js
//
// 两件脏活关在这个脚本里，业务代码和原来的 Cloudflare 用法都不用改：
//
// 1. Windows 的 cmd 不认 `SE_PLATFORM=node vinext build` 这种内联环境变量写法，
//    所以显式 spawn 并传环境变量。
// 2. vinext 只要在项目根看到 wrangler 配置，就把这次构建判定为 Cloudflare 构建并
//    强制要求 cloudflare() 插件（见 node_modules/vinext/dist/index.js 里
//    `hasWranglerConfig(root)` 那个判断）；而 Node 构建里恰恰不能有这个插件。
//    构建期间把配置文件临时挪开，无论成败都挪回来；上次被强杀留下的备份在开头先还原。
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const WRANGLER_CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml', 'cloudflare.config.ts'];
const SUFFIX = '.nodebuild-bak';

function restore(names) {
  for (const name of names) {
    const backup = join(root, name + SUFFIX);
    if (existsSync(backup)) renameSync(backup, join(root, name));
  }
}

// 先清理上一次异常中断留下的备份，免得项目里永远少一个 wrangler.jsonc。
restore(WRANGLER_CONFIGS);

const stashed = [];
for (const name of WRANGLER_CONFIGS) {
  const from = join(root, name);
  if (existsSync(from)) {
    renameSync(from, from + SUFFIX);
    stashed.push(name);
  }
}

let status = 1;
try {
  const result = spawnSync('npx', ['vinext', 'build'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SE_PLATFORM: 'node' },
  });
  if (result.error) console.error(result.error);
  status = result.status ?? 1;
} finally {
  restore(stashed);
}

if (status === 0) {
  console.log('\n产物：dist/standalone/server.js');
  console.log('启动：SIGNUP_PEPPER=... SE_SETUP_TOKEN=... SE_PUBLIC_ORIGIN=https://你的域名 node dist/standalone/server.js');
  console.log('数据库：默认 ./data/signup.sqlite，用 SE_SQLITE_PATH 指到持久盘上。');
}
process.exit(status);
