// 管理端守卫。页面用 requireAdmin（会 redirect），接口用 requireApiAdmin（会抛错）。
//
// 一条会话只绑一个活动：管理链接是按「活动 × 人」签发的，换活动就换链接。
// 这样一个活动的管理员拿不到另一个活动的任何数据，也不需要账号体系。
import { redirect } from 'next/navigation';
import { readAdminSession } from './auth';
import { SeError, getAdmin, getEventById, type AdminRow, type EventRow } from './data';

export const LOCKED_PATH = '/manage/locked';

export async function currentAdmin(): Promise<AdminRow | null> {
  const session = await readAdminSession();
  if (!session) return null;
  const admin = await getAdmin(session.adminId);
  if (!admin || admin.token_revoked_at) return null;
  return admin;
}

export async function requireAdmin(eventId: string): Promise<{ admin: AdminRow; event: EventRow }> {
  const admin = await currentAdmin();
  if (!admin || admin.event_id !== eventId) redirect(LOCKED_PATH);
  const event = await getEventById(eventId);
  if (!event) redirect(LOCKED_PATH);
  return { admin, event };
}

export async function requireApiAdmin(eventId?: string): Promise<AdminRow> {
  const admin = await currentAdmin();
  if (!admin) throw new SeError('NEED_ADMIN', '请先用你的管理链接打开，再执行这个操作。');
  if (eventId && admin.event_id !== eventId) throw new SeError('NEED_ADMIN', '这个操作不属于你管理的活动。');
  return admin;
}

export async function requireOwner(eventId?: string): Promise<AdminRow> {
  const admin = await requireApiAdmin(eventId);
  if (admin.role !== 'owner') throw new SeError('NEED_OWNER', '只有活动发起人能做这个操作。');
  return admin;
}
