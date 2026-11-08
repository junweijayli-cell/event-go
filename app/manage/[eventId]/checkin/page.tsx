import type { Metadata } from 'next';
import '@/app/se.css';
import { CheckinConsole } from '@/app/_se/CheckinConsole';
import { ManageHeader } from '@/app/_se/ManageNav';
import { listCheckinLogs, rosterStats } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';
import { formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '核销' };

const RESULT_LABELS: Record<string, string> = { ok: '核销成功', duplicate: '重复核销', invalid: '无效票' };

export default async function CheckinPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const [stats, logs] = await Promise.all([rosterStats(event.id), listCheckinLogs(event.id, 30)]);

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="checkin" />

      <div className="se-grid">
        <div className="se-stat">
          <b>{stats.totals.checkedIn}</b>
          <span>已入场</span>
        </div>
        <div className="se-stat">
          <b>{Math.max(0, stats.totals.confirmed - stats.totals.checkedIn)}</b>
          <span>待入场</span>
        </div>
        <div className="se-stat">
          <b>{stats.totals.confirmed}</b>
          <span>已确认报名</span>
        </div>
      </div>

      <CheckinConsole />

      <div className="se-card">
        <h2 className="se-h2">最近核销记录</h2>
        {logs.length === 0 ? (
          <p className="se-muted">还没有核销记录。</p>
        ) : (
          <ul className="se-list">
            {logs.map((log) => (
              <li className="se-row" key={log.id}>
                <div>
                  <b>{log.registration_name || '未知票'}</b>
                  <small>
                    {formatStamp(log.at)} · {log.admin_name || '管理员'} · {RESULT_LABELS[log.result] ?? log.result}
                    {log.detail ? ` · ${log.detail}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="se-btn-row" style={{ marginTop: 12 }}>
          <a className="se-btn se-btn--sm" href={`/manage/${event.id}/roster?checked=out&status=confirmed`}>
            看还没入场的人
          </a>
        </div>
      </div>
    </main>
  );
}
