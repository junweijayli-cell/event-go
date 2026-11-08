import type { Metadata } from 'next';
import '@/app/se.css';
import { ChannelList, type ChannelItem } from '@/app/_se/ChannelList';
import { CopyButton } from '@/app/_se/CopyButton';
import { ManageHeader } from '@/app/_se/ManageNav';
import { ShareTools } from '@/app/_se/ShareTools';
import { getOrigin } from '@/db/se/auth';
import { signupUrl } from '@/db/se/codes';
import { channelStats, listAdmins, listChannels } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';
import { formatRange, shareText } from '@/db/se/view';

export const metadata: Metadata = { title: '分享与邀请链接' };

export default async function SharePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId);
  const [channels, admins, stats, origin] = await Promise.all([
    listChannels(event.id),
    listAdmins(event.id),
    channelStats(event.id),
    getOrigin(),
  ]);

  const adminById = new Map(admins.map((row) => [row.id, row]));
  const when = formatRange(event.start_at, event.end_at, event.time_note || '');
  const where = event.location_name || event.location_address || '';

  const items: ChannelItem[] = channels.map((channel) => {
    const owner = channel.admin_id ? adminById.get(channel.admin_id) : null;
    const counts = stats.get(channel.code) ?? { total: 0, active: 0, checkedIn: 0 };
    const link = signupUrl(origin, event.code, channel.code);
    return {
      channelId: channel.id,
      adminId: channel.admin_id,
      name: channel.name,
      code: channel.code,
      kind: owner ? owner.role : (channel.type as 'poster' | 'partner'),
      enabled: channel.enabled === 1,
      visits: channel.visit_count,
      signups: counts.active,
      checkedIn: counts.checkedIn,
      signupLink: link,
      qrSrc: `/api/se/qr?e=${event.code}&c=${channel.code}&s=8`,
      shareText: shareText({ title: event.title, when, where, url: link, inviterName: channel.name }),
      isMe: channel.admin_id === admin.id,
    };
  });

  const mine = items.find((item) => item.isMe);

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="share" />

      {mine ? (
        <div className="se-card">
          <h2 className="se-h2">我的专属二维码与链接</h2>
          <p className="se-muted" style={{ marginTop: -4 }}>
            你只需要发这一条。从它进来报名的人，后台邀请人都会记成「{mine.name}」。
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mine.qrSrc} alt="我的报名二维码" width={160} height={160} style={{ borderRadius: 12, border: '1px solid var(--line)', background: '#fff' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="se-linkbox">
                <span>{mine.signupLink}</span>
              </div>
              <div className="se-btn-row" style={{ marginTop: 8 }}>
                <CopyButton text={mine.signupLink} label="复制链接" />
                <CopyButton text={mine.shareText} label="复制分享文案" />
                <a className="se-btn se-btn--sm se-btn--ghost" href={mine.qrSrc} target="_blank" rel="noreferrer">
                  单独打开二维码
                </a>
              </div>
              <p className="se-hint">
                二维码在微信里长按可以保存或直接转发；要印海报就用「二维码总表」那页打印。
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="se-note se-note--warn">
        <span>
          <b>两种链接别发错。</b>
          <code>/e/…</code> 是报名链接，随便转发；<code>/m/…</code> 是管理链接，只能私发给本人，
          拿到它的人可以看全部名单并核销。
        </span>
      </div>

      {admin.role === 'owner' ? <ShareTools eventTitle={event.title} /> : null}

      <ChannelList items={items} canManage={admin.role === 'owner'} />

      <div className="se-btn-row">
        <a className="se-btn se-btn--sm" href={`/manage/${event.id}/qr-sheet`}>
          二维码总表（可打印）
        </a>
      </div>
    </main>
  );
}
