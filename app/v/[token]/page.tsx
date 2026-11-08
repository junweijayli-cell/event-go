import type { Metadata } from 'next';
import '@/app/se.css';
import { ConfirmCheckin } from '@/app/_se/ConfirmCheckin';
import { findRegistrationByTicket, getEventById } from '@/db/se/data';
import { currentAdmin } from '@/db/se/guard';
import { STATUS_LABELS, formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '核销' };

// 门票二维码指向这里。管理员用微信「扫一扫」或系统相机扫一下就到这页
// —— 不需要在微信里调摄像头（iOS 上那条路基本走不通）。
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = await currentAdmin();

  // 没有管理员身份时一个字的个人信息都不给，只说明怎么办。
  if (!admin) {
    return (
      <main className="se-page">
        <p className="se-eyebrow">核销</p>
        <h1 className="se-title">需要管理员身份</h1>
        <div className="se-note se-note--warn">
          <span>
            请先在这个浏览器里打开你的管理链接（<code>/m/…</code>），再重新扫这张票。
            会话会保留 30 天，现场只需要做一次。
          </span>
        </div>
        <p className="se-muted">如果你是报名者，这是你的入场二维码，给工作人员扫即可，不用自己点开。</p>
      </main>
    );
  }

  const registration = await findRegistrationByTicket(token);
  if (!registration || registration.event_id !== admin.event_id) {
    return (
      <main className="se-page">
        <p className="se-eyebrow">核销</p>
        <h1 className="se-title">这张票无效</h1>
        <div className="se-note se-note--danger">
          <span>票不存在、已被重发，或者不属于你管理的这个活动。</span>
        </div>
        <a className="se-btn" href={`/manage/${admin.event_id}/checkin`}>
          回到核销台
        </a>
      </main>
    );
  }

  const event = (await getEventById(registration.event_id))!;
  const checkedIn = Boolean(registration.checked_in_at);

  return (
    <main className="se-page">
      <p className="se-eyebrow">{event.title} · 核销</p>
      <h1 className="se-title">{registration.name}</h1>
      <p style={{ marginTop: 0 }}>
        <span className={`se-chip ${checkedIn ? 'se-chip--done' : registration.status === 'confirmed' ? 'se-chip--open' : 'se-chip--warn'}`}>
          {checkedIn ? '已入场' : STATUS_LABELS[registration.status]}
        </span>
        <span className="se-chip" style={{ marginLeft: 6 }}>手机尾号 {registration.phone.slice(-4)}</span>
      </p>

      <div className="se-card se-card--tight">
        <dl className="se-meta">
          <div>
            <dt>邀请人</dt>
            <dd>{registration.inviter_name || (registration.channel_code ? `渠道 ${registration.channel_code}` : '直接进入')}</dd>
          </div>
          <div>
            <dt>核销码</dt>
            <dd>{registration.checkin_code}</dd>
          </div>
          <div>
            <dt>报名于</dt>
            <dd>{formatStamp(registration.created_at)}</dd>
          </div>
        </dl>
      </div>

      {checkedIn ? (
        <div className="se-note se-note--warn">
          <span>
            <b>这张票已经核销过了。</b>
            <br />
            核销时间 {formatStamp(registration.checked_in_at)}。
          </span>
        </div>
      ) : registration.status === 'confirmed' ? (
        <ConfirmCheckin ticketToken={token} name={registration.name} />
      ) : (
        <div className="se-note se-note--danger">
          <span>
            当前状态是「{STATUS_LABELS[registration.status]}」，不能核销。
            需要的话先去名单里把它改成正式报名。
          </span>
        </div>
      )}

      <div className="se-btn-row" style={{ marginTop: 14 }}>
        <a className="se-btn se-btn--sm" href={`/manage/${admin.event_id}/checkin`}>
          核销台
        </a>
        <a className="se-btn se-btn--sm se-btn--ghost" href={`/manage/${admin.event_id}/roster`}>
          名单
        </a>
      </div>
    </main>
  );
}
