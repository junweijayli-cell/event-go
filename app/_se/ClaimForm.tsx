'use client';

import { useState } from 'react';

// 管理员认领自己的链接：本人填真名，填完才进后台。
// 认领过之后这个表单当「改我的显示名」用，所以文案按 claimed 分两套。
export function ClaimForm({
  eventId,
  claimed,
  currentName,
  currentPhone,
  invitedName,
}: {
  eventId: string;
  claimed: boolean;
  currentName: string;
  currentPhone: string;
  invitedName: string;
}) {
  // 还没认领时，发起人起的那个名只当预填，本人大概率要改掉。
  const [name, setName] = useState(currentName);
  const [phone, setPhone] = useState(currentPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/se/admins', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'profile', name, phone }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || '保存失败，请稍后重试。');
        setSaving(false);
        return;
      }
      if (claimed) {
        setSaved(true);
        setSaving(false);
        // 页眉、渠道名、名单里的邀请人都跟着改了，整页取一次新的最省事。
        window.location.reload();
        return;
      }
      window.location.href = `/manage/${eventId}`;
    } catch {
      setError('网络不稳，请稍后重试。');
      setSaving(false);
    }
  }

  return (
    <form className="se-card" onSubmit={submit}>
      <label className="se-field">
        <span>
          你的姓名 <em>*</em>
        </span>
        <input
          className="se-input"
          value={name}
          maxLength={24}
          placeholder="例如：张三"
          onChange={(changeEvent) => setName(changeEvent.target.value)}
        />
        <p className="se-hint">
          {invitedName && invitedName !== name
            ? `发起人邀请你时写的是「${invitedName}」。这里填你希望别人看到的名字。`
            : '报名的人会在分享文案里看到这个名字，名单上你邀请来的人也挂这个名字。'}
        </p>
      </label>

      <label className="se-field">
        <span>手机号（选填）</span>
        <input
          className="se-input"
          value={phone}
          inputMode="tel"
          maxLength={11}
          placeholder="方便发起人联系你"
          onChange={(changeEvent) => setPhone(changeEvent.target.value)}
        />
        <p className="se-hint">只有发起人看得到，报名的人看不到。不想留可以空着。</p>
      </label>

      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}

      <button className="se-btn se-btn--primary" type="submit" disabled={saving || !name.trim()}>
        {saving ? '保存中…' : claimed ? '保存' : '确认，进入活动后台'}
      </button>
      {saved ? <p className="se-hint">已保存。</p> : null}
    </form>
  );
}
