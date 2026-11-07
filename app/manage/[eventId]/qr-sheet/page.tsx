import type { Metadata } from 'next';
import Link from 'next/link';
import '@/app/se.css';
import { PrintButton } from '@/app/_se/PrintButton';
import { getOrigin } from '@/db/se/auth';
import { signupUrl } from '@/db/se/codes';
import { listAdmins, listChannels } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';

export const metadata: Metadata = { title: '二维码总表' };

// 一页出全部渠道码，每个码下面写清是谁的 —— 直接打印或截图发给各管理员，
// 不用一个个点进去存图。
export default async function QrSheetPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const [channels, admins, origin] = await Promise.all([listChannels(event.id), listAdmins(event.id), getOrigin()]);
  const adminById = new Map(admins.map((row) => [row.id, row]));
  const visible = channels.filter((channel) => channel.enabled === 1);

  return (
    <main className="se-page se-page--wide">
      <div className="se-noprint">
        <p className="se-eyebrow">二维码总表</p>
        <h1 className="se-title">{event.title}</h1>
        <p className="se-muted">
          共 {visible.length} 个渠道码，扫任意一个都进同一张报名表，区别只在后台记下的邀请人。
          打印成 A4 时每行 4 个。
        </p>
        <div className="se-btn-row" style={{ margin: '12px 0 18px' }}>
          <PrintButton />
          <Link className="se-btn se-btn--sm se-btn--ghost" href={`/manage/${event.id}/share`}>
            返回分享页
          </Link>
        </div>
      </div>

      <div className="se-sheet">
        {visible.map((channel) => {
          const owner = channel.admin_id ? adminById.get(channel.admin_id) : null;
          return (
            <figure key={channel.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/se/qr?e=${event.code}&c=${channel.code}&s=6`}
                alt={`${channel.name} 的报名二维码`}
                width={150}
                height={150}
                style={{ width: '100%', height: 'auto' }}
              />
              <figcaption>
                {channel.name}
                <small>
                  {owner ? (owner.role === 'owner' ? '发起人' : '管理员') : channel.type === 'partner' ? '合作方' : '海报'} ·{' '}
                  {channel.code}
                </small>
                <small style={{ wordBreak: 'break-all' }}>{signupUrl(origin, event.code, channel.code)}</small>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <p className="se-muted" style={{ marginTop: 18 }}>
        {admin.name} · {event.title} · 活动码 {event.code}
      </p>
    </main>
  );
}
