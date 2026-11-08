import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 这个规则要求站内跳转用 next/link，但 vinext 1.0.0-beta.3 的 Link 在
      // 生产构建里会抛 "RSC prefetch setup error: TypeError: d is not a function"：
      // 点击被它拦下，客户端路由又走不通，结果就是全站链接点了没反应
      // （2026-11-08 线上实测，管理后台所有标签页都打不开）。
      // 所以全站改用原生 <a>。这些页面本来就全是服务端渲染的，整页跳转结果一样，
      // 在微信内置浏览器里反而更稳。等 vinext 升到 1.4.x（需要 React ≥19.3.1）
      // 再评估要不要换回 Link。
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores(['.next/**', '.vinext/**', 'dist/**', '.wrangler/**', 'out/**', 'next-env.d.ts']),
]);

export default eslintConfig;
