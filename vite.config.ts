import { fileURLToPath } from 'node:url';
import vinext from 'vinext';
import { defineConfig, type PluginOption } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

// 部署目标。默认 Cloudflare Workers + D1；SE_PLATFORM=node 时产出
// dist/standalone/server.js，可以在国内任何能跑 Node 的主机上自托管
// （活动报名要在微信里稳定打开就得走这条，见 docs/EVENT_SIGNUP.md）。
const platform = process.env.SE_PLATFORM === 'node' ? 'node' : 'cloudflare';

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // 平台适配层二选一。不能用 resolve.alias —— vinext 自己解析 tsconfig 的 @/* 路径，
  // 会抢在 alias 前面把 @/db/runtime 解析成 Cloudflare 版，于是 Node 构建里又出现
  // cloudflare:workers。用一个 enforce:'pre' 且排在最前的解析插件才稳。
  const nodeRuntimePlugin: PluginOption = {
    name: 'se-platform-runtime',
    enforce: 'pre',
    resolveId(id: string) {
      // 到这一步 @/db/runtime 已经被改写成不带后缀的绝对路径，所以两种形式都要认。
      // (\.ts)?$ 保证不会把 runtime.node.ts 自己又绕回来。
      const normalized = id.split('\\').join('/');
      if (normalized === '@/db/runtime' || /\/db\/runtime(\.ts)?$/.test(normalized)) {
        return fileURLToPath(new URL('./db/runtime.node.ts', import.meta.url));
      }
      return null;
    },
  };

  const plugins: PluginOption[] = platform === 'node' ? [nodeRuntimePlugin, vinext()] : [vinext()];
  if (platform === 'cloudflare') {
    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    plugins.push(
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
