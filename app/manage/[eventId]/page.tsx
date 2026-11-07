import type { Metadata } from 'next';
import Link from 'next/link';
import '@/app/se.css';
import { CopyButton } from '@/app/_se/CopyButton';
import { ManageHeader } from '@/app/_se/ManageNav';
import { getOrigin } from '@/db/se/auth';
import { listChannels, listUpdates, rosterStats } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';
import { signupUrl } from '@/db/se/codes';
import { formatRange, formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '活动后台' };

export default async function ManageHome({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const [stats, channels, updates, origin] = await Promise.all([
    rosterStats(event.id),
    listChannels(event.id),
    listUpdates(event.id),
    getOrigin(),
  ]);
  const mine = channels.find((channel) => channel.admin_id === admin.id);
  const myLink = mine ? signupUrl(origin, event.code, mine.code) : signupUrl(origin, event.code);
  const myCount = stats.byInviter.find((row) => row.inviterId === admin.id);

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="home" />

      <div className="se-grid">
        <div className="se-stat">
          <b>{stats.totals.confirmed}</b>
          <span>已确认</span>
        </div>
        {event.need_review === 1 ? (
          <div className="se-stat">
            <b>{stats.totals.pending}</b>
            <span>待审核</span>
          </div>
        ) : null}
        <div className="se-stat">
          <b>{stats.totals.waitlist}</b>
          <span>候补</span>
        </div>
        <div className="se-stat">
          <b>{stats.totals.checkedIn}</b>
          <span>已核销</span>
        </div>
        <div className="se-stat">
          <b>{event.capacity ?? '不限'}</b>
          <span>名额上限</span>
        </div>
      </div>

      <div className="se-card">
        <h2 className="se-h2">我的专属报名链接</h2>
        <p className="se-muted" style={{ marginTop: -4 }}>
          只发这一条。凡是从你这条链接进来报名的人，后台的邀请人都会记成你
          {myCount ? `（目前 ${myCount.total} 人）` : ''}。
        </p>
        <div className="se-linkbox" style={{ marginTop: 10 }}>
          <span>{myLink}</span>
        </div>
        <div className="se-btn-row" style={{ marginTop: 10 }}>
          <CopyButton text={myLink} label="复制我的链接" />
          <Link className="se-btn se-btn--sm se-btn--primary" href={`/manage/${event.id}/share`}>
            二维码与分享文案
          </Link>
        </div>
      </div>

      <div className="se-card">
        <h2 className="se-h2">各邀请人带来的报名</h2>
        {stats.byInviter.length === 0 ? (
          <p className="se-muted">还没有人报名。</p>
        ) : (
          <ul className="se-list">
            {stats.byInviter.map((row) => (
              <li className="se-row" key={row.inviterId}>
                <div>
                  <b>{row.inviterName}</b>
                  <small>
                    有效 {row.active} 人 · 已核销 {row.checkedIn} 人
                  </small>
                </div>
                <div className="se-row-actions">
                  <Link className="se-btn se-btn--sm" href={`/manage/${event.id}/roster?inviter=${row.inviterId}`}>
                    看名单
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="se-card">
        <h2 className="se-h2">活动信息</h2>
        <dl className="se-meta">
          <div>
            <dt>时间</dt>
            <dd>{formatRange(event.start_at, event.end_at, event.time_note || '待公布')}</dd>
          </div>
          <div>
            <dt>地点</dt>
            <dd>{event.location_name || event.location_address || '待公布'}</dd>
          </div>
          <div>
            <dt>更新</dt>
            <dd>
              {updates.length > 0 ? `${updates.length} 条，最近 ${formatStamp(updates[0].created_at)}` : '还没发过'}
            </dd>
          </div>
        </dl>
        <div className="se-btn-row" style={{ marginTop: 12 }}>
          <Link className="se-btn se-btn--sm" href={`/e/${event.code}`}>
            看报名者视角
          </Link>
          {admin.role === 'owner' ? (
            <Link className="se-btn se-btn--sm se-btn--ghost" href="/manage/new">
              新建活动
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
