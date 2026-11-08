'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

export type ChannelItem = {
  channelId: string;
  adminId: string | null;
  name: string;
  code: string;
  kind: 'owner' | 'admin' | 'poster' | 'partner';
  enabled: boolean;
  visits: number;
  signups: number;
  checkedIn: number;
  signupLink: string;
  qrSrc: string;
  shareText: string;
  isMe: boolean;
  // 只对有管理员的渠道有意义：本人是否已经打开过管理链接、填过自己的姓名。
  // null 表示这条渠道没有管理员（海报/合作方），不涉及认领。
  claimed: boolean | null;
};

const KIND_LABELS: Record<ChannelItem['kind'], string> = {
  owner: '发起人',
  admin: '管理员',
  poster: '海报渠道',
  partner: '合作方',
};

export function ChannelList({ items, canManage }: { items: ChannelItem[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reissued, setReissued] = useState<{ name: string; link: string } | null>(null);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError('');
    try {
      const response = await fetch('/api/se/admins', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; manageLink?: string; error?: string };
      if (!response.ok || !payload.ok) setError(payload.error || '操作失败。');
      else if (payload.manageLink) setReissued({ name: String(body.name || '管理员'), link: payload.manageLink });
      router.refresh();
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setBusy('');
  }

  return (
    <div className="se-card">
      <h2 className="se-h2">全部渠道（{items.length}）</h2>
      <p className="se-muted" style={{ marginTop: -4 }}>
        同一套报名表单，下面每条链接/二维码都指向它，区别只在于后台记下的邀请人不同。
      </p>
      {error ? (
        <div className="se-note se-note--danger" style={{ margin: '10px 0' }}>
          <span>{error}</span>
        </div>
      ) : null}
      {reissued ? (
        <div className="se-note se-note--danger" style={{ margin: '10px 0' }}>
          <span>
            <b>{reissued.name} 的新管理链接（只显示这一次，旧链接已失效）：</b>
            <br />
            {reissued.link}
          </span>
        </div>
      ) : null}

      <ul className="se-list" style={{ marginTop: 12 }}>
        {items.map((item) => (
          <li className="se-row" key={item.channelId} style={{ display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <b>
                {item.name}
                {item.isMe ? ' · 我' : ''}
              </b>
              <span style={{ flexShrink: 0 }}>
                {item.claimed === false ? (
                  <span className="se-chip se-chip--warn" style={{ marginRight: 6 }}>
                    未认领
                  </span>
                ) : null}
                <span className={`se-chip ${item.enabled ? '' : 'se-chip--off'}`}>
                  {item.enabled ? KIND_LABELS[item.kind] : '已停用'}
                </span>
              </span>
            </div>
            <small style={{ display: 'block', margin: '4px 0 8px', color: 'var(--muted)', fontSize: 11 }}>
              渠道码 {item.code} · 访问 {item.visits} · 报名 {item.signups} · 已核销 {item.checkedIn}
              {item.claimed === false ? ' · 他还没打开过管理链接' : ''}
            </small>
            <div className="se-linkbox">
              <span>{item.signupLink}</span>
            </div>
            <div className="se-btn-row" style={{ marginTop: 8 }}>
              <CopyButton text={item.signupLink} label="复制链接" />
              <CopyButton text={item.shareText} label="复制文案" />
              <a className="se-btn se-btn--sm se-btn--ghost" href={item.qrSrc} target="_blank" rel="noreferrer">
                看二维码
              </a>
              {canManage && item.adminId && item.kind !== 'owner' ? (
                <>
                  <button
                    className="se-btn se-btn--sm"
                    type="button"
                    disabled={busy === item.channelId}
                    onClick={() => act({ action: 'reissue', adminId: item.adminId, name: item.name }, item.channelId)}
                  >
                    重发管理链接
                  </button>
                  <button
                    className="se-btn se-btn--sm se-btn--ghost"
                    type="button"
                    disabled={busy === item.channelId}
                    onClick={() => act({ action: 'revoke', adminId: item.adminId }, item.channelId)}
                  >
                    收回权限
                  </button>
                </>
              ) : null}
              {canManage ? (
                <button
                  className="se-btn se-btn--sm se-btn--ghost"
                  type="button"
                  disabled={busy === item.channelId}
                  onClick={() => act({ action: 'toggleChannel', channelId: item.channelId, enabled: !item.enabled }, item.channelId)}
                >
                  {item.enabled ? '停用渠道' : '重新启用'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
