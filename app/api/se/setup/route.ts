import { NextResponse } from 'next/server';
import { adminCookieSpec, getOrigin, setupToken } from '@/db/se/auth';
import { SeError, createEvent } from '@/db/se/data';
import { currentAdmin } from '@/db/se/guard';

// 建活动。两种授权方式：
//   1. 还没有任何活动时，用环境变量 SE_SETUP_TOKEN 开第一个（wrangler secret put）；
//   2. 已经是某个活动的发起人时，凭现有会话再开一个。
// 新活动自带一个 owner 和它的管理链接，令牌只在这次响应里出现一次。
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const owner = await currentAdmin();
    const configured = setupToken();
    const provided = String(body.setupToken || '');
    const authorized = (owner && owner.role === 'owner') || (configured.length >= 8 && provided === configured);
    if (!authorized) {
      throw new SeError('NEED_SETUP_TOKEN', '需要发起人身份或正确的初始化口令。');
    }

    const created = await createEvent({
      title: body.title,
      summary: body.summary,
      ownerName: body.ownerName,
    });
    const origin = await getOrigin();
    const cookie = await adminCookieSpec(created.ownerId, created.event.id);
    const response = NextResponse.json({
      ok: true,
      eventId: created.event.id,
      eventCode: created.event.code,
      path: `/manage/${created.event.id}`,
      manageLink: `${origin}/m/${created.ownerToken}`,
    });
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    const message = error instanceof SeError ? error.message : '创建失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se setup failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
