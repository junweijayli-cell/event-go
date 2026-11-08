import type { Metadata } from 'next';
import '@/app/se.css';
import { ClaimForm } from '@/app/_se/ClaimForm';
import { getOrigin } from '@/db/se/auth';
import { signupUrl } from '@/db/se/codes';
import { getAdmin, listChannels } from '@/db/se/data';
import { requireAdmin } from '@/db/se/guard';

export const metadata: Metadata = { title: '认领管理员身份' };

// 管理员第一次打开自己那条管理链接时落在这里：先确认自己是谁，再进后台。
// 认领过之后再进来就是「改我的显示名」。
export default async function WelcomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { admin, event } = await requireAdmin(eventId, { allowUnclaimed: true });
  const claimed = Boolean(admin.claimed_at);

  const [channels, origin, owner] = await Promise.all([
    listChannels(event.id),
    getOrigin(),
    event.owner_admin_id ? getAdmin(event.owner_admin_id) : Promise.resolve(null),
  ]);
  const mine = channels.find((channel) => channel.admin_id === admin.id);
  const myLink = mine ? signupUrl(origin, event.code, mine.code) : '';

  return (
    <main className="se-page">
      <p className="se-eyebrow">{claimed ? '我的资料' : '认领管理员身份'}</p>
      <h1 className="se-title">{event.title}</h1>

      {claimed ? (
        <p className="se-muted">
          改了名字之后，你的分享文案、二维码总表上的署名，以及名单里你邀请来的人，都会一起跟着改。
        </p>
      ) : admin.role === 'owner' ? (
        <div className="se-note">
          <span>
            这个活动是你建的。<b>先确认一下你的名字</b>，报名的人会在分享文案里看到它，名单上你邀请来的人也挂这个名字。填完就进后台 —— 这一步只做一次。
          </span>
        </div>
      ) : (
        <div className="se-note">
          <span>
            {owner ? <b>{owner.name}</b> : <b>活动发起人</b>}
            {' 邀请你来当这个活动的管理员。先确认一下你是谁，填完就进后台 —— 这一步只做一次。'}
          </span>
        </div>
      )}

      <ClaimForm
        eventId={event.id}
        claimed={claimed}
        currentName={admin.name}
        currentPhone={admin.phone}
        invitedName={admin.invited_name}
      />

      {claimed ? null : (
        <div className="se-card">
          <h2 className="se-h2">进去之后你能做什么</h2>
          <ul className="se-list">
            <li className="se-row" style={{ display: 'block' }}>
              <b>有一条只属于你的报名链接和二维码</b>
              <p className="se-muted" style={{ margin: '4px 0 0' }}>
                {myLink ? (
                  <>
                    就是 <code>{myLink}</code> 这条。从它进来报名的人，后台的邀请人都记成你。
                  </>
                ) : (
                  '从它进来报名的人，后台的邀请人都记成你。'
                )}
              </p>
            </li>
            <li className="se-row" style={{ display: 'block' }}>
              <b>看得到全部名单</b>
              <p className="se-muted" style={{ margin: '4px 0 0' }}>
                不只是你邀请的那些，也能按邀请人筛选、导出。
              </p>
            </li>
            <li className="se-row" style={{ display: 'block' }}>
              <b>能核销任何人的门票</b>
              <p className="se-muted" style={{ margin: '4px 0 0' }}>
                微信扫一扫扫对方门票上的二维码，或者手输他门票页上那 6 位核销码。不限于你邀请的人。
              </p>
            </li>
          </ul>
          <div className="se-note se-note--warn" style={{ marginTop: 10 }}>
            <span>
              <b>你打开的这条管理链接就是你的钥匙</b>，别转发给别人 —— 拿到它的人就能看全部名单、核销所有票。
              报名链接（<code>/e/…</code>）才是拿去转发的那条。
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
