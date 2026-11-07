import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '@/app/se.css';
import { ChannelTracker } from '@/app/_se/ChannelTracker';
import { EventFactsCard, UpdateTimeline } from '@/app/_se/parts';
import { resolveChannelCode } from '@/db/se/attribution';
import { getOrigin, readChannelTouch, readTicketCookie } from '@/db/se/auth';
import { getEventByCode, listUpdates, publicEvent } from '@/db/se/data';
import { currentAdmin } from '@/db/se/guard';
import { STATE_LABELS, formatDeadline } from '@/db/se/view';

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// 微信转发卡片主要吃 <title> 和页面里的首图，所以封面要放在最前面；
// og:* 是给其他平台看的。
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const event = await getEventByCode(code);
  if (!event) return { title: '活动不存在' };
  const origin = await getOrigin();
  const images = event.cover_key ? [`${origin}/f/${event.cover_key}`] : [];
  return {
    title: event.title,
    description: event.summary.slice(0, 80) || '点击查看活动详情并报名',
    openGraph: {
      title: event.title,
      description: event.summary.slice(0, 80) || '点击查看活动详情并报名',
      url: `${origin}/e/${event.code}`,
      type: 'website',
      locale: 'zh_CN',
      images,
    },
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { code } = await params;
  const query = await searchParams;
  const event = await getEventByCode(code);
  if (!event) notFound();

  const admin = await currentAdmin();
  const isPreview = admin?.event_id === event.id;
  if (event.status === 'draft' && !isPreview) {
    return (
      <main className="se-page">
        <h1 className="se-title">活动尚未发布</h1>
        <p className="se-muted">发起人还在准备这个活动，稍后再打开这个链接就能看到了。</p>
      </main>
    );
  }

  const view = publicEvent(event);
  const updates = await listUpdates(event.id);
  const rawChannel = typeof query.c === 'string' ? query.c : '';
  const touch = await readChannelTouch(event.code);
  const channel = resolveChannelCode({ urlCode: rawChannel, touch });
  const ticketToken = await readTicketCookie(event.code);
  const signupHref = channel.code ? `/e/${event.code}/signup?c=${channel.code}` : `/e/${event.code}/signup`;

  return (
    <main className="se-page">
      <ChannelTracker eventCode={event.code} channelCode={rawChannel} />
      {event.cover_key ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="se-cover" src={`/f/${event.cover_key}`} alt={event.title} />
      ) : null}

      <p className="se-eyebrow" style={{ marginTop: 16 }}>活动报名</p>
      <h1 className="se-title">{event.title}</h1>
      <p>
        <span className={`se-chip ${view.state === 'open' ? 'se-chip--open' : view.state === 'full' ? 'se-chip--warn' : 'se-chip--off'}`}>
          {STATE_LABELS[view.state]}
        </span>
        {view.needReview ? <span className="se-chip" style={{ marginLeft: 6 }}>需审核</span> : null}
        {isPreview && event.status === 'draft' ? (
          <span className="se-chip se-chip--warn" style={{ marginLeft: 6 }}>管理员预览</span>
        ) : null}
      </p>

      <EventFactsCard facts={view} />

      {event.summary ? (
        <div className="se-card">
          <h2 className="se-h2">活动介绍</h2>
          <p className="se-body">{event.summary}</p>
        </div>
      ) : null}

      <UpdateTimeline updates={updates} />

      {ticketToken ? (
        <>
          <Link className="se-btn se-btn--primary" href={`/t/${ticketToken}`}>
            查看我的报名与门票
          </Link>
          <p className="se-hint" style={{ textAlign: 'center' }}>这台手机已经报过名了。</p>
        </>
      ) : view.canSignup ? (
        <>
          <Link className="se-btn se-btn--primary" href={signupHref}>
            {view.waitlistOnly ? '报名候补' : '我要报名'}
          </Link>
          {view.waitlistOnly ? (
            <p className="se-hint" style={{ textAlign: 'center' }}>名额已满，报名后进入候补，有空位主办方会联系你。</p>
          ) : view.deadlineAt ? (
            <p className="se-hint" style={{ textAlign: 'center' }}>报名截止 {formatDeadline(view.deadlineAt)}</p>
          ) : null}
        </>
      ) : (
        <div className="se-note se-note--warn">
          <b>{STATE_LABELS[view.state]}</b>
          <span>如需补位请直接联系邀请你来的人。</span>
        </div>
      )}

      <p className="se-muted" style={{ marginTop: 18, textAlign: 'center' }}>
        你的报名信息只有主办方可见。其他报名者看不到任何人的信息，也看不到报名人数。
      </p>
    </main>
  );
}
