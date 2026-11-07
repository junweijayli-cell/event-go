// 本地试跑 standalone 产物，用来验证「国内主机那一套」确实能跑。
//
// 生产环境不要用这个脚本：密钥应该由 systemd / 云托管的环境变量注入，
// 而不是写在仓库里。这里只是给本地验收一个固定的、可重复的启动方式。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// standalone server 按 cwd 找静态资源，所以先切到工程根目录下。
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(appRoot);

process.env.SIGNUP_PEPPER ??= 'local-dev-pepper-change-before-production';
process.env.SE_SETUP_TOKEN ??= 'dev-setup-token';
process.env.SE_SQLITE_PATH ??= './data/signup-local.sqlite';
process.env.PORT ??= '3100';
process.env.HOST ??= '127.0.0.1';

console.log(`[node 版] 端口 ${process.env.PORT}，数据库 ${process.env.SE_SQLITE_PATH}`);
await import('../dist/standalone/server.js');
