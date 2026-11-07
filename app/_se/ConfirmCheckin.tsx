'use client';

import { useState } from 'react';

type Outcome = {
  result?: string;
  message?: string;
  name?: string;
  inviterName?: string;
  checkedInAt?: string;
  firstCheckedInBy?: string;
  error?: string;
};

// 扫码落地页上的确认按钮。先让管理员看清是谁，再点一下才核销 ——
// 扫错一张票就把人核掉，现场没法解释。
export function ConfirmCheckin({ ticketToken, name }: { ticketToken: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/se/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticketToken }),
      });
      setOutcome((await response.json()) as Outcome);
    } catch {
      setOutcome({ error: '网络不稳，请重试。' });
    }
    setBusy(false);
  }

  if (outcome) {
    const ok = outcome.result === 'ok';
    const duplicate = outcome.result === 'duplicate';
    return (
      <div className={`se-note ${ok ? 'se-note--ok' : duplicate ? 'se-note--warn' : 'se-note--danger'}`} style={{ marginTop: 14 }}>
        <span>
          <b>{ok ? '核销成功' : duplicate ? '这张票已经核销过' : '无法核销'}</b>
          <br />
          {outcome.error || outcome.message}
          {duplicate && outcome.checkedInAt ? (
            <>
              <br />
              首次核销：{outcome.checkedInAt}
              {outcome.firstCheckedInBy ? ` · 操作人 ${outcome.firstCheckedInBy}` : ''}
            </>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <button className="se-btn se-btn--primary" type="button" onClick={confirm} disabled={busy} style={{ marginTop: 14 }}>
      {busy ? '核销中…' : `确认 ${name} 入场`}
    </button>
  );
}
