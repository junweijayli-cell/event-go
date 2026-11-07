import { getOrigin } from '@/db/se/auth';
import { findRegistrationByTicket, getEventById } from '@/db/se/data';
import { buildIcs } from '@/db/se/view';

// 加入日历。活动时间按北京时间理解后转成 UTC 写进 ics（见 db/se/view.ts 的时间口径）。
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const registration = await findRegistrationByTicket(token);
  if (!registration) return new Response('not found', { status: 404 });
  const event = await getEventById(registration.event_id);
  if (!event || !event.start_at) return new Response('no schedule yet', { status: 404 });
  const origin = await getOrigin();
  const ics = buildIcs({
    uid: `${registration.id}@se-signup`,
    title: event.title,
    startAt: event.start_at,
    endAt: event.end_at,
    location: [event.location_name, event.location_address].filter(Boolean).join(' '),
    description: event.summary.slice(0, 300),
    url: `${origin}/t/${token}`,
  });
  if (!ics) return new Response('no schedule yet', { status: 404 });
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="event.ics"',
      'cache-control': 'no-store',
    },
  });
}
