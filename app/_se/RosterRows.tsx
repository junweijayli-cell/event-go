'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

export type RosterRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  statusLabel: string;
  inviterId: string;
  inviterName: string;
  channelCode: string;
  createdLabel: string;
  checkedInLabel: string;
  reviewNote: string;
  answers: { label: string; value: string }[];
};

export function RosterRows({
  rows,
  admins,
  canReassign,
}: {
  rows: RosterRow[];
  admins: { id: string; name: string }[];
  canReassign: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [ticketLink, setTicketLink] = useState<{ id: string; link: string } | null>(null);

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError('');
    try {
      const response = await fetch('/api/se/registrations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string; ticketLink?: string };
      if (payload.ticketLink) setTicketLink({ id, link: payload.ticketLink });
      if (!response.ok || (!payload.ok && !payload.ticketLink)) setError(payload.error || payload.message || '操作失败。');
      router.refresh();
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setBusy('');
  }

  if (rows.length === 0) {
    return <p className="se-muted">这个筛选条件下还没有报名记录。</p>;
  }

  return (
    <>
      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}
      <ul className="se-list">
        {rows.map((row) => (
          <li className="se-row" key={row.id} style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <b>
                  {row.name}
                  <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>{row.phone}</span>
                </b>
                <small>
                  邀请人 {row.inviterName} · {row.createdLabel}
                  {row.checkedInLabel ? ` · 已核销 ${row.checkedInLabel}` : ''}
                </small>
              </div>
              <span
                className={`se-chip ${
                  row.checkedInLabel
                    ? 'se-chip--done'
                    : row.status === 'confirmed'
                      ? 'se-chip--open'
                      : row.status === 'pending' || row.status === 'waitlist'
                        ? 'se-chip--warn'
                        : 'se-chip--off'
                }`}
                style={{ flex: '0 0 auto' }}
              >
                {row.checkedInLabel ? '已入场' : row.statusLabel}
              </span>
            </div>

            <div className="se-btn-row" style={{ marginTop: 8 }}>
              {row.status === 'pending' || row.status === 'waitlist' ? (
                <button
                  className="se-btn se-btn--sm se-btn--primary"
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => act(row.id, { action: 'approve' })}
                >
                  {row.status === 'waitlist' ? '转为正式' : '通过'}
                </button>
              ) : null}
              {row.status !== 'rejected' && row.status !== 'cancelled' ? (
                <button
                  className="se-btn se-btn--sm se-btn--ghost"
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => {
                    const note = window.prompt('驳回原因（会显示给报名者）', row.reviewNote || '');
                    if (note === null) return;
                    act(row.id, { action: 'reject', note });
                  }}
                >
                  驳回
                </button>
              ) : null}
              {row.status === 'confirmed' && !row.checkedInLabel ? (
                <button
                  className="se-btn se-btn--sm"
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => act(row.id, { action: 'checkin' })}
                >
                  手动核销
                </button>
              ) : null}
              <button
                className="se-btn se-btn--sm se-btn--ghost"
                type="button"
                onClick={() => setOpen(open === row.id ? '' : row.id)}
              >
                {open === row.id ? '收起' : '详情'}
              </button>
            </div>

            {open === row.id ? (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <dl className="se-meta">
                  {row.answers.map((answer) => (
                    <div key={answer.label}>
                      <dt>{answer.label}</dt>
                      <dd>{answer.value}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>渠道码</dt>
                    <dd>{row.channelCode || '无'}</dd>
                  </div>
                  {row.reviewNote ? (
                    <div>
                      <dt>备注</dt>
                      <dd>{row.reviewNote}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="se-btn-row" style={{ marginTop: 10 }}>
                  <button
                    className="se-btn se-btn--sm se-btn--ghost"
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => {
                      if (!window.confirm('重发后旧的门票链接立即失效，确定吗？')) return;
                      act(row.id, { action: 'reissueTicket' });
                    }}
                  >
                    重发门票链接
                  </button>
                  <CopyButton text={row.phone} label="复制手机号" />
                </div>

                {ticketLink?.id === row.id ? (
                  <div className="se-note se-note--warn" style={{ marginTop: 10 }}>
                    <span>
                      <b>新的门票链接（只显示这一次）：</b>
                      <br />
                      {ticketLink.link}
                      <br />
                      <CopyButton text={ticketLink.link} label="复制门票链接" />
                    </span>
                  </div>
                ) : null}

                {canReassign ? (
                  <div style={{ marginTop: 10 }}>
                    <label className="se-field" style={{ marginBottom: 0 }}>
                      <span>改邀请人（会记入审计日志）</span>
                      <select
                        className="se-select"
                        defaultValue={row.inviterId.startsWith('ch:') || row.inviterId === 'none' ? '' : row.inviterId}
                        onChange={(changeEvent) =>
                          act(row.id, { action: 'inviter', inviterAdminId: changeEvent.target.value || null })
                        }
                      >
                        <option value="">直接进入 / 无邀请人</option>
                        {admins.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
