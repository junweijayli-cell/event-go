import { NextResponse } from 'next/server';
import { writeChannelTouch } from '@/db/se/auth';
import { bumpChannelVisit, findChannel, getEventByCode, hitRateLimit } from '@/db/se/data';

// 渠道访问打点：落归因 cookie + 给渠道计一次访问。
// 只有 route handler 能写 cookie，所以活动页用一发 fetch 调这里。
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { eventCode?: string; channelCode?: string };
    const event = await getEventByCode(String(body.eventCode || ''));
    if (!event) return NextResponse.json({ ok: true });
    const channel = await findChannel(event.id, String(body.channelCode || ''));
    if (!channel || channel.enabled !== 1) return NextResponse.json({ ok: true });

    await writeChannelTouch(event.code, channel.code);
    // 同一个 IP 对同一渠道每分钟最多计 20 次，刷新页面刷不出假数据。
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const flooded = await hitRateLimit(`visit:${channel.id}:${ip}`, 20, 60_000);
    if (!flooded) await bumpChannelVisit(event.id, channel.code);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('se track failed', error);
    return NextResponse.json({ ok: true });
  }
}
