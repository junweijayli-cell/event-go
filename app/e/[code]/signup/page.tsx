import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '@/app/se.css';
import { resolveChannelCode } from '@/db/se/attribution';
import { readChannelTouch } from '@/db/se/auth';
import { getEventByCode, publicEvent } from '@/db/se/data';
import { STATE_LABELS } from '@/db/se/view';
import { SignupForm } from './SignupForm';

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const event = await getEventByCode(code);
  return { title: event ? `报名 · ${event.title}` : '活动不存在' };
}

export default async function SignupPage({ params, searchParams }: Props) {
  const { code } = await params;
  const query = await searchParams;
  const event = await getEventByCode(code);
  if (!event) notFound();

  const view = publicEvent(event);
  if (!view.canSignup) {
    return (
      <main className="se-page">
        <h1 className="se-title">{event.title}</h1>
        <div className="se-note se-note--warn">
          <b>{STATE_LABELS[view.state]}</b>
          <span>现在无法提交报名。</span>
        </div>
        <Link className="se-btn" href={`/e/${event.code}`}>
          返回活动详情
        </Link>
      </main>
    );
  }

  // 归因：URL 上的渠道码优先，没有才回落到上一次扫码写下的 cookie。
  const touch = await readChannelTouch(event.code);
  const channel = resolveChannelCode({ urlCode: typeof query.c === 'string' ? query.c : '', touch });

  return (
    <main className="se-page">
      <p className="se-eyebrow">填写报名信息</p>
      <h1 className="se-title">{event.title}</h1>
      {view.waitlistOnly ? (
        <div className="se-note se-note--warn" style={{ marginBottom: 14 }}>
          <b>已满额</b>
          <span>现在提交的是候补报名，有空位时主办方会按提交顺序联系你。</span>
        </div>
      ) : null}

      <div className="se-card">
        <SignupForm
          eventCode={event.code}
          channelCode={channel.code}
          fields={view.schema.fields}
          waitlistOnly={view.waitlistOnly}
          needReview={view.needReview}
        />
      </div>

      <p className="se-muted" style={{ textAlign: 'center' }}>
        报名信息只有主办方可见。你看不到其他报名者，其他报名者也看不到你。
      </p>
    </main>
  );
}
