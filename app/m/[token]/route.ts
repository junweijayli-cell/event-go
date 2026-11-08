import { NextResponse } from 'next/server';
import { adminCookieSpec } from '@/db/se/auth';
import { findAdminByToken } from '@/db/se/data';

// 管理员专属入口。令牌只在这里出现一次，立刻换成签名 cookie 并 302 走，
// 地址栏和浏览器历史里不留令牌。
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = await findAdminByToken(token);
  if (!admin) {
    return NextResponse.redirect(new URL('/manage/locked?reason=bad-token', request.url));
  }
  const cookie = await adminCookieSpec(admin.id, admin.event_id);
  // 还没认领过的，先去填自己的姓名，填完才进后台。发起人在建活动时已经填过，
  // 创建时就带上了 claimed_at，不会被挡在这里。
  const landing = admin.claimed_at ? `/manage/${admin.event_id}` : `/manage/${admin.event_id}/welcome`;
  const response = NextResponse.redirect(new URL(landing, request.url));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
