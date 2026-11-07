import type { Metadata } from 'next';
import './globals.css';

// 分享卡片里的绝对地址。部署后设 SE_PUBLIC_ORIGIN（例如 https://events.example.com），
// 没设就退回相对地址，卡片依然能出，只是封面图要靠页面自己给。
function metadataBase(): URL | undefined {
  const origin = process.env.SE_PUBLIC_ORIGIN;
  if (!origin) return undefined;
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: '活动报名', template: '%s · 活动报名' },
  description: '扫码报名，自动记录邀请人；活动信息可随时同步更新；现场扫码核销。',
  openGraph: { type: 'website', locale: 'zh_CN', siteName: '活动报名' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
