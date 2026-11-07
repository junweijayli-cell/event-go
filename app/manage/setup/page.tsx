import type { Metadata } from 'next';
import '@/app/se.css';
import { SetupForm } from '@/app/_se/SetupForm';

export const metadata: Metadata = { title: '创建活动' };

export default function SetupPage() {
  return (
    <main className="se-page">
      <p className="se-eyebrow">初始化</p>
      <h1 className="se-title">创建第一个活动</h1>
      <p className="se-muted">
        这套工具没有账号体系：活动的管理权限就是一条私有管理链接。创建后请立刻把链接存好。
      </p>
      <SetupForm needToken />
    </main>
  );
}
