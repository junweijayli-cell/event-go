import { NextResponse } from 'next/server';
import { getOrigin } from '@/db/se/auth';
import {
  SeError,
  checkIn,
  reassignInviter,
  reissueTicketToken,
  reviewRegistration,
} from '@/db/se/data';
import { requireApiAdmin, requireOwner } from '@/db/se/guard';

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const id = String(body.id || '');

    if (action === 'approve' || action === 'reject') {
      const admin = await requireApiAdmin();
      const row = await reviewRegistration(id, action, String(body.note || ''), admin);
      return NextResponse.json({ ok: true, status: row.status });
    }

    if (action === 'inviter') {
      // 改邀请人等于改业绩归属，只有发起人能动，且写审计日志。
      const owner = await requireOwner();
      const row = await reassignInviter(id, body.inviterAdminId ? String(body.inviterAdminId) : null, owner);
      return NextResponse.json({ ok: true, inviterName: row.inviter_name || '直接进入' });
    }

    if (action === 'reissueTicket') {
      const admin = await requireApiAdmin();
      const token = await reissueTicketToken(id, admin);
      const origin = await getOrigin();
      return NextResponse.json({ ok: true, ticketLink: `${origin}/t/${token}` });
    }

    if (action === 'checkin') {
      const admin = await requireApiAdmin();
      const outcome = await checkIn(admin, { registrationId: id });
      return NextResponse.json({ ok: outcome.result === 'ok', result: outcome.result, message: outcome.message });
    }

    throw new SeError('INVALID_INPUT', '不支持的操作。');
  } catch (error) {
    const message = error instanceof SeError ? error.message : '操作失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se registrations failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
