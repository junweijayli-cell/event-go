'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

type Created = { name: string; channelCode: string; signupLink: string; manageLink: string | null };

// 批量生成管理员（每人一条渠道链接 + 一条私有管理链接）或无主渠道（海报、合作方）。
// 管理令牌只在这一次响应里出现，所以生成结果要一直留在屏幕上直到人工关掉。
export function ShareTools({ eventTitle }: { eventTitle: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<'admin' | 'channel'>('admin');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created[]>([]);

  const count = raw
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  async function generate() {
    if (busy || count === 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/se/admins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names: raw, kind }),
      });
      const payload = (await response.json()) as { ok?: boolean; created?: Created[]; error?: string };
      if (!response.ok || !payload.ok || !payload.created) {
        setError(payload.error || '生成失败。');
      } else {
        setCreated(payload.created);
        setRaw('');
        router.refresh();
      }
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setBusy(false);
  }

  const allManageLinks = created
    .filter((item) => item.manageLink)
    .map((item) => `${item.name}：${item.manageLink}`)
    .join('\n');
  const allSignupLinks = created.map((item) => `${item.name}：${item.signupLink}`).join('\n');

  return (
    <div className="se-card">
      <h2 className="se-h2">批量生成渠道</h2>
      <div className="se-btn-row" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`se-btn se-btn--sm ${kind === 'admin' ? 'se-btn--primary' : ''}`}
          onClick={() => setKind('admin')}
        >
          管理员（可核销）
        </button>
        <button
          type="button"
          className={`se-btn se-btn--sm ${kind === 'channel' ? 'se-btn--primary' : ''}`}
          onClick={() => setKind('channel')}
        >
          无主渠道（海报/合作方）
        </button>
      </div>
      <label className="se-field">
        <span>一行一个名字</span>
        <textarea
          className="se-textarea"
          rows={6}
          placeholder={kind === 'admin' ? '张三\n李四\n王五' : '朋友圈海报\n地推物料\n合作方A'}
          value={raw}
          onChange={(changeEvent) => setRaw(changeEvent.target.value)}
        />
        <p className="se-hint">
          {kind === 'admin'
            ? '每人得到一条公开报名链接（扫码/点击即绑定邀请人）和一条私有管理链接（可看名单、可核销）。'
            : '只生成公开报名链接与二维码，没有管理权限，适合海报和合作方投放。'}
        </p>
      </label>
      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}
      <button className="se-btn se-btn--primary" type="button" onClick={generate} disabled={busy || count === 0}>
        {busy ? '生成中…' : count > 0 ? `生成 ${count} 条` : '生成'}
      </button>

      {created.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="se-note se-note--danger">
            <span>
              <b>管理链接只显示这一次。</b>
              先复制保存，再逐个私发给本人。它不能发到群里 —— 谁拿到谁就能管理这个活动。
            </span>
          </div>
          <div className="se-btn-row" style={{ margin: '10px 0' }}>
            {allManageLinks ? <CopyButton text={allManageLinks} label="复制全部管理链接" /> : null}
            <CopyButton text={allSignupLinks} label="复制全部报名链接" />
            <button className="se-btn se-btn--sm se-btn--ghost" type="button" onClick={() => setCreated([])}>
              我已保存，清除
            </button>
          </div>
          <ul className="se-list">
            {created.map((item) => (
              <li className="se-row" key={item.channelCode} style={{ display: 'block' }}>
                <b>
                  {item.name} · 渠道码 {item.channelCode}
                </b>
                <div className="se-linkbox" style={{ marginTop: 6 }}>
                  <span>报名链接：{item.signupLink}</span>
                </div>
                {item.manageLink ? (
                  <div className="se-linkbox" style={{ marginTop: 6, borderColor: 'var(--clay)' }}>
                    <span>管理链接（勿转发）：{item.manageLink}</span>
                  </div>
                ) : null}
                <div className="se-btn-row" style={{ marginTop: 6 }}>
                  <CopyButton
                    text={shareTemplate(eventTitle, item.name, item.signupLink)}
                    label="复制分享文案"
                  />
                  {item.manageLink ? <CopyButton text={item.manageLink} label="复制管理链接" /> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function shareTemplate(title: string, inviter: string, link: string) {
  return `【${title}】报名通道\n报名：${link}\n（由 ${inviter} 邀请，报名后具体安排会在同一个链接里更新）`;
}
