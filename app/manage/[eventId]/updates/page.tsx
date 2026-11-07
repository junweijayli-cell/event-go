import type { Metadata } from 'next';
import Link from 'next/link';
import '@/app/se.css';
import { DeleteUpdateButton } from '@/app/_se/DeleteUpdateButton';
import { ManageHeader } from '@/app/_se/ManageNav';
import { UpdateComposer } from '@/app/_se/UpdateComposer';
import { safeJson } from '@/app/_se/parts';
import { listUpdates, rosterStats } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';
import { formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '同步更新' };

export default async function UpdatesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const [updates, stats] = await Promise.all([listUpdates(event.id), rosterStats(event.id)]);
  const reach = stats.totals.confirmed + stats.totals.pending + stats.totals.waitlist;

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="updates" />

      <div className="se-note se-note--warn">
        <span>
          <b>这里发的内容不会主动推送。</b>
          网页版没有微信服务通知。{reach} 位报名者是靠打开自己的门票链接看到更新的，所以重要变更建议同时在群里吼一声
          「活动安排已更新，点你那条报名/门票链接看」。
        </span>
      </div>

      <UpdateComposer hasLocation={Boolean(event.location_name || event.location_address)} />

      <div className="se-card">
        <h2 className="se-h2">已发布（{updates.length}）</h2>
        {updates.length === 0 ? (
          <p className="se-muted">还没发过更新。</p>
        ) : (
          <ul className="se-list">
            {updates.map((update) => {
              const images = safeJson(update.image_keys);
              return (
                <li className="se-row" key={update.id} style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {formatStamp(update.created_at)} · {update.created_by_name}
                      {update.pinned ? ' · 置顶' : ''}
                    </small>
                    <DeleteUpdateButton id={update.id} />
                  </div>
                  {update.body ? <p className="se-body" style={{ margin: '6px 0' }}>{update.body}</p> : null}
                  {update.location_name || update.location_address ? (
                    <p className="se-muted" style={{ margin: '0 0 4px' }}>
                      📍 {update.location_name} {update.location_address}
                      {update.location_lat !== null ? ` (${update.location_lat}, ${update.location_lng})` : ''}
                    </p>
                  ) : null}
                  {images.length > 0 ? (
                    <div className="se-shots">
                      {images.map((key) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={key} src={`/f/${key}`} alt="更新配图" loading="lazy" />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="se-btn-row" style={{ marginTop: 12 }}>
          <Link className="se-btn se-btn--sm" href={`/e/${event.code}`}>
            看报名者视角
          </Link>
        </div>
      </div>
    </main>
  );
}
