import { NextResponse } from 'next/server';
import { SeError, audit, updateEvent } from '@/db/se/data';
import { requireOwner } from '@/db/se/guard';

// 改活动设置（含发布/关闭报名、名额、截止时间、是否审核、表单字段）。
// 只有发起人能动：名额和状态会直接影响所有渠道的报名结果。
export async function PATCH(request: Request) {
  try {
    const owner = await requireOwner();
    const body = (await request.json()) as Record<string, unknown>;
    const event = await updateEvent(owner.event_id, body);
    await audit(owner, 'event.update', 'event', event.id, {
      status: event.status,
      capacity: event.capacity,
      needReview: event.need_review === 1,
    });
    return NextResponse.json({ ok: true, status: event.status, code: event.code });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '保存失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se event update failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
