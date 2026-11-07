'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

// 建活动表单。/manage/setup（凭初始化口令，开第一个活动）和 /manage/new
// （凭现有发起人会话，再开一个）共用。
export function SetupForm({ needToken }: { needToken: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ setupToken: '', title: '', ownerName: '', summary: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ path: string; manageLink: string } | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/se/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { ok?: boolean; path?: string; manageLink?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.path || !payload.manageLink) {
        setError(payload.error || '创建失败，请稍后重试。');
        setSaving(false);
        return;
      }
      setDone({ path: payload.path, manageLink: payload.manageLink });
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setSaving(false);
  }

  if (done) {
    return (
      <div className="se-card">
        <h2 className="se-h2">活动已创建</h2>
        <div className="se-note se-note--danger">
          <span>
            <b>下面这条是你的管理链接，只出现这一次。</b>
            先存到自己的聊天收藏里。谁拿到它就能管理这个活动，所以不要发到群里。
          </span>
        </div>
        <div className="se-linkbox" style={{ marginTop: 10 }}>
          <span>{done.manageLink}</span>
        </div>
        <div className="se-btn-row" style={{ marginTop: 10 }}>
          <CopyButton text={done.manageLink} label="复制管理链接" />
          <button className="se-btn se-btn--sm se-btn--primary" type="button" onClick={() => router.replace(done.path)}>
            进入活动后台
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="se-card" onSubmit={submit}>
      {needToken ? (
        <label className="se-field">
          <span>
            初始化口令 <em>*</em>
          </span>
          <input
            className="se-input"
            type="password"
            required
            value={form.setupToken}
            onChange={(changeEvent) => set('setupToken', changeEvent.target.value)}
          />
          <p className="se-hint">部署时设置的 SE_SETUP_TOKEN。</p>
        </label>
      ) : null}

      <label className="se-field">
        <span>
          活动名称 <em>*</em>
        </span>
        <input
          className="se-input"
          required
          maxLength={60}
          value={form.title}
          onChange={(changeEvent) => set('title', changeEvent.target.value)}
        />
      </label>

      <label className="se-field">
        <span>发起人（显示给报名者）</span>
        <input
          className="se-input"
          maxLength={24}
          placeholder="例如：张老师"
          value={form.ownerName}
          onChange={(changeEvent) => set('ownerName', changeEvent.target.value)}
        />
      </label>

      <label className="se-field">
        <span>活动介绍</span>
        <textarea
          className="se-textarea"
          maxLength={2000}
          value={form.summary}
          onChange={(changeEvent) => set('summary', changeEvent.target.value)}
        />
        <p className="se-hint">时间地点先留空也行，之后在设置里补，或者用「同步更新」公布。</p>
      </label>

      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      ) : null}

      <button className="se-btn se-btn--primary" type="submit" disabled={saving}>
        {saving ? '创建中…' : '创建活动'}
      </button>
    </form>
  );
}
