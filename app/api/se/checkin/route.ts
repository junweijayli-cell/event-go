import { NextResponse } from 'next/server';
import { SeError, checkIn } from '@/db/se/data';
import { requireApiAdmin } from '@/db/se/guard';
import { formatStamp } from '@/db/se/view';

// 核销。任何管理员都能核销本活动的任意一张票（需求如此：邀请人全是管理员）。
// 幂等：重复核销不会改时间，只会告诉你是谁、什么时候核过。
export async function POST(request: Request) {
  try {
    const admin = await requireApiAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const outcome = await checkIn(admin, {
      ticketToken: body.ticketToken ? String(body.ticketToken) : undefined,
      checkinCode: body.checkinCode ? String(body.checkinCode) : undefined,
    });
    return NextResponse.json({
      ok: outcome.result === 'ok',
      result: outcome.result,
      message: outcome.message,
      name: outcome.registration?.name ?? '',
      phoneTail: outcome.registration?.phone ? outcome.registration.phone.slice(-4) : '',
      inviterName: outcome.registration?.inviter_name ?? '',
      checkedInAt: outcome.registration?.checked_in_at ? formatStamp(outcome.registration.checked_in_at) : '',
      firstCheckedInBy: outcome.firstCheckedInBy ?? '',
    });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '核销失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se checkin failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 403 : 500 });
  }
}
