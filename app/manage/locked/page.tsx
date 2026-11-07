import type { Metadata } from 'next';
import '@/app/se.css';

export const metadata: Metadata = { title: '需要管理链接' };

const REASONS: Record<string, string> = {
  'bad-token': '这条管理链接无效或已被撤销重发。请找活动发起人要一条新的。',
  'need-owner': '这个操作只有活动发起人能做。',
};

export default async function LockedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reason = typeof query.reason === 'string' ? REASONS[query.reason] : '';
  return (
    <main className="se-page">
      <p className="se-eyebrow">管理后台</p>
      <h1 className="se-title">需要管理链接</h1>
      <div className="se-note se-note--warn">
        <span>{reason || '管理后台只能从你的专属管理链接进入。会话有效期 30 天，过期后再打开一次链接即可。'}</span>
      </div>
      <p className="se-muted">
        管理链接形如 <code>/m/XXXXXXXX…</code>，由活动发起人在「分享与链接」里单独发给你。
        它和你对外发的报名链接不是同一条 —— 报名链接可以随便转发，管理链接不能。
      </p>
    </main>
  );
}
