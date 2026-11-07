import { NextResponse } from 'next/server';
import { resolveChannelCode } from '@/db/se/attribution';
import { readChannelTouch, readTicketCookie, writeTicketCookie } from '@/db/se/auth';
import { getEventByCode, hitRateLimit, openState, parseFormSchemaFor, submitSignup } from '@/db/se/data';
import { validateSubmission } from '@/db/se/form';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const event = await getEventByCode(String(body.eventCode || ''));
    if (!event) return NextResponse.json({ error: '活动不存在或链接已失效。' }, { status: 404 });

    const state = openState(event);
    if (state !== 'open' && state !== 'full') {
      return NextResponse.json({ error: '这个活动现在无法报名。' }, { status: 400 });
    }

    // 同一 IP 十分钟内最多 60 次提交。放这么宽是因为一群人常常共用一个出口 IP
    // （办公室/场馆 WiFi、校园网），卡太紧会把真人当脚本挡掉；60 次足够拦住连刷。
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    if (await hitRateLimit(`signup:${event.id}:${ip}`, 60, 600_000)) {
      return NextResponse.json({ error: '提交太频繁，请过几分钟再试。' }, { status: 429 });
    }

    const schema = parseFormSchemaFor(event);
    const checked = validateSubmission(schema, body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    const touch = await readChannelTouch(event.code);
    const channel = resolveChannelCode({ urlCode: String(body.channelCode || ''), touch });

    const result = await submitSignup({
      event,
      name: checked.name,
      phone: checked.phone,
      formData: checked.formData,
      channelCode: channel.code,
      requestId: String(body.requestId || ''),
    });

    if (result.kind === 'duplicate') {
      return NextResponse.json(
        {
          error: '这个手机号已经报名过了。如果找不到自己的门票链接，请联系邀请你来的人帮你重发。',
          duplicate: true,
        },
        { status: 409 },
      );
    }

    if (result.kind === 'repeat') {
      // 同一 requestId 的重试：首次提交已经成功。门票令牌只在生成那一刻明文存在，
      // 这里拿不到，所以带回活动页，由门票 cookie 接上。
      const existing = await readTicketCookie(event.code);
      return NextResponse.json({ ok: true, path: existing ? `/t/${existing}` : `/e/${event.code}` });
    }

    await writeTicketCookie(event.code, result.ticketToken);
    return NextResponse.json({ ok: true, path: `/t/${result.ticketToken}`, status: result.registration.status });
  } catch (error) {
    console.error('se signup failed', error);
    return NextResponse.json({ error: '报名没有成功，请稍后重试。' }, { status: 500 });
  }
}
