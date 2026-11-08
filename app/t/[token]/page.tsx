import type { Metadata } from 'next';
import '@/app/se.css';
import { CopyButton } from '@/app/_se/CopyButton';
import { EventFactsCard, UpdateTimeline } from '@/app/_se/parts';
import { getOrigin } from '@/db/se/auth';
import { findRegistrationByTicket, getEventById, listUpdates, parseFormSchemaFor, publicEvent } from '@/db/se/data';
import { describeSubmission } from '@/db/se/form';
import { qrSvg } from '@/db/se/qrcode';
import { STATUS_LABELS, formatStamp } from '@/db/se/view';

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: '我的报名' };

function parseFormData(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default async function TicketPage({ params }: Props) {
  const { token } = await params;
  const registration = await findRegistrationByTicket(token);
  if (!registration) {
    return (
      <main className="se-page">
        <h1 className="se-title">门票链接无效</h1>
        <p className="se-muted">
          这个链接可能已经被主办方重发过了。请找邀请你来的人要一次新的门票链接，报名记录不会丢。
        </p>
      </main>
    );
  }

  const event = (await getEventById(registration.event_id))!;
  const view = publicEvent(event);
  const updates = await listUpdates(event.id);
  const origin = await getOrigin();
  const ticketLink = `${origin}/t/${token}`;
  const answers = describeSubmission(parseFormSchemaFor(event), parseFormData(registration.form_data));
  const confirmed = registration.status === 'confirmed';
  const checkedIn = Boolean(registration.checked_in_at);

  return (
    <main className="se-page">
      <p className="se-eyebrow">我的报名</p>
      <h1 className="se-title">{event.title}</h1>
      <p>
        <span
          className={`se-chip ${
            checkedIn ? 'se-chip--done' : confirmed ? 'se-chip--open' : registration.status === 'pending' ? 'se-chip--warn' : 'se-chip--off'
          }`}
        >
          {checkedIn ? '已入场' : STATUS_LABELS[registration.status]}
        </span>
        <span className="se-chip" style={{ marginLeft: 6 }}>{registration.name}</span>
      </p>

      {confirmed && !checkedIn ? (
        <div className="se-ticket">
          <p className="se-eyebrow" style={{ marginBottom: 12 }}>入场凭证</p>
          {/* 二维码里是核销网址：管理员用微信「扫一扫」直接打开即可核销 */}
          <div className="se-qr" dangerouslySetInnerHTML={{ __html: qrSvg(`${origin}/v/${token}`) }} />
          <p className="se-code">{registration.checkin_code}</p>
          <p className="se-hint">扫码或报这 6 位核销码都能入场。请勿把这张图转发给别人。</p>
        </div>
      ) : null}

      {checkedIn ? (
        <div className="se-note se-note--ok">
          <b>已入场</b>
          <span>核销时间 {formatStamp(registration.checked_in_at)}。</span>
        </div>
      ) : registration.status === 'pending' ? (
        <div className="se-note se-note--warn">
          <b>等待主办方审核</b>
          <span>通过后这个页面就会出现入场二维码，不用重新报名。</span>
        </div>
      ) : registration.status === 'waitlist' ? (
        <div className="se-note se-note--warn">
          <b>候补中</b>
          <span>名额已满。有空位时主办方会按提交顺序联系你，届时这里会出现入场二维码。</span>
        </div>
      ) : registration.status === 'rejected' || registration.status === 'cancelled' ? (
        <div className="se-note se-note--danger">
          <b>{STATUS_LABELS[registration.status]}</b>
          <span>{registration.review_note || '如有疑问请联系邀请你来的人。'}</span>
        </div>
      ) : null}

      <EventFactsCard facts={view} />
      <UpdateTimeline updates={updates} />

      <div className="se-card se-card--tight">
        <h2 className="se-h2">我填写的信息</h2>
        <dl className="se-meta">
          <div>
            <dt>姓名</dt>
            <dd>{registration.name}</dd>
          </div>
          <div>
            <dt>手机</dt>
            <dd>{registration.phone}</dd>
          </div>
          {answers.map((answer) => (
            <div key={answer.label}>
              <dt>{answer.label}</dt>
              <dd>{answer.value}</dd>
            </div>
          ))}
          <div>
            <dt>报名于</dt>
            <dd>{formatStamp(registration.created_at)}</dd>
          </div>
        </dl>
      </div>

      <div className="se-note">
        <span>
          <b>把这个链接存好。</b>
          活动的具体时间、地点、变更都会更新在这里，随时打开都是最新的。
        </span>
      </div>
      <div className="se-btn-row" style={{ marginTop: 10, justifyContent: 'center' }}>
        <CopyButton text={ticketLink} label="复制我的门票链接" />
        {event.start_at ? (
          <a className="se-btn se-btn--sm" href={`/t/${token}/ics`}>
            加入日历
          </a>
        ) : null}
        <a className="se-btn se-btn--sm se-btn--ghost" href={`/e/${event.code}`}>
          活动详情
        </a>
      </div>
    </main>
  );
}
