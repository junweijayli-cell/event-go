import type { NextConfig } from 'next';

// SE_PLATFORM=node 时产出 dist/standalone/server.js，可直接 `node` 启动，
// 部署到国内主机（腾讯云轻量 / 云托管 / 任意 Node 环境）。
// Cloudflare 构建不需要 standalone，留空即可。
const nextConfig: NextConfig =
  process.env.SE_PLATFORM === 'node' ? { output: 'standalone' } : {};

export default nextConfig;
