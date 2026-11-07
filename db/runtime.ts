// 平台适配层 —— Cloudflare Workers 实现（默认，也是类型基准）。
//
// 为什么要这一层：活动报名要在国内稳定打开就得部署到国内云，而 D1 和
// `cloudflare:workers` 是 Cloudflare 独有的。把这三件事（数据库、环境变量、
// 对象存储）收到一个文件里之后，换平台只换这一个文件，业务代码一行不动。
//
// Node 版实现在 db/runtime.node.ts，由 vite.config.ts 在 SE_PLATFORM=node 时
// 按精确别名替换本文件。两边必须导出同样的三个函数。
import { env } from 'cloudflare:workers';

export const PLATFORM: string = 'cloudflare';

export function getSqlDatabase(): D1Database {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

export function getEnvValue(key: string): string | undefined {
  const fromBinding = (env as unknown as Record<string, unknown>)?.[key];
  if (typeof fromBinding === 'string' && fromBinding) return fromBinding;
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return fromProcess || undefined;
}

// 配了 SE_MEDIA 绑定就把图片存 R2，没配则返回 null，由调用方退回存 D1。
export function getMediaBucket(): R2Bucket | null {
  const bucket = (env as unknown as Record<string, unknown>)?.SE_MEDIA;
  return bucket && typeof (bucket as R2Bucket).put === 'function' ? (bucket as R2Bucket) : null;
}
