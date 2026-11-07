import type { Metadata } from 'next';
import Link from 'next/link';
import '@/app/se.css';
import { CopyButton } from '@/app/_se/CopyButton';
import { ManageHeader } from '@/app/_se/ManageNav';
import { SettingsForm } from '@/app/_se/SettingsForm';
import { getOrigin } from '@/db/se/auth';
import { signupUrl } from '@/db/se/codes';
import { listAuditLogs, parseFormSchemaFor } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';
import { formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '活动设置' };

export default async function SettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const origin = await getOrigin();
  const publicLink = signupUrl(origin, event.code);

  if (admin.role !== 'owner') {
    return (
      <main className="se-page se-page--wide">
        <ManageHeader event={event} adminName={admin.name} role={admin.role} active="settings" />
        <div className="se-note se-note--warn">
          <span>活动设置只有发起人能改。你可以发布同步更新、看名单、核销。</span>
        </div>
        <Link className="se-btn" href={`/manage/${event.id}/share`}>
          去拿我的专属链接
        </Link>
      </main>
    );
  }

  const logs = await listAuditLogs(event.id, 20);

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="settings" />

      <div className="se-card se-card--tight">
        <h2 className="se-h2">活动主链接</h2>
        <div className="se-linkbox">
          <span>{publicLink}</span>
        </div>
        <div className="se-btn-row" style={{ marginTop: 8 }}>
          <CopyButton text={publicLink} label="复制主链接" />
          <a className="se-btn se-btn--sm se-btn--ghost" href={`/api/se/qr?e=${event.code}&s=8`} target="_blank" rel="noreferrer">
            主二维码
          </a>
        </div>
        <p className="se-hint">主链接不带渠道码，从它进来的人在后台记为「直接进入」。</p>
      </div>

      <SettingsForm
        initial={{
          title: event.title,
          summary: event.summary,
          startAt: (event.start_at ?? '').slice(0, 16),
          endAt: (event.end_at ?? '').slice(0, 16),
          timeNote: event.time_note,
          locationName: event.location_name,
          locationAddress: event.location_address,
          locationLat: event.location_lat === null ? '' : String(event.location_lat),
          locationLng: event.location_lng === null ? '' : String(event.location_lng),
          locationNote: event.location_note,
          capacity: event.capacity === null ? '' : String(event.capacity),
          deadlineAt: (event.deadline_at ?? '').slice(0, 16),
          needReview: event.need_review === 1,
          status: event.status,
          coverKey: event.cover_key ?? '',
          fields: parseFormSchemaFor(event).fields,
        }}
      />

      <div className="se-card">
        <h2 className="se-h2">操作日志</h2>
        {logs.length === 0 ? (
          <p className="se-muted">还没有记录。</p>
        ) : (
          <ul className="se-list">
            {logs.map((log) => (
              <li className="se-row" key={log.id}>
                <div>
                  <b>{log.action}</b>
                  <small>
                    {formatStamp(log.at)} · {log.admin_name || '管理员'} · {log.meta}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="se-hint">发链接、重发/收回管理权限、审核、改邀请人、重发门票、改设置都会留痕。</p>
      </div>
    </main>
  );
}
