import { NextResponse } from 'next/server';
import { getOrigin } from '@/db/se/auth';
import { adminUrl, signupUrl } from '@/db/se/codes';
import {
  SeError,
  audit,
  createAdmin,
  createChannel,
  getAdmin,
  getEventById,
  reissueAdminToken,
  revokeAdminToken,
} from '@/db/se/data';
import { requireOwner } from '@/db/se/guard';
import { getD1 } from '@/db/index';

function names(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => String(item ?? ''))
    : String(raw ?? '').split(/[\n,，、]/);
  return list
    .map((item) => item.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 50);
}

// 批量生成：一行一个名字 → 每人一条公开渠道链接 + 一条私有管理链接。
// 管理令牌只在这次响应里出现一次，之后库里只有哈希。
export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = (await request.json()) as Record<string, unknown>;
    const list = names(body.names);
    if (list.length === 0) throw new SeError('INVALID_INPUT', '请至少填一个名字。');
    const kind = body.kind === 'channel' ? 'channel' : 'admin';
    const event = (await getEventById(owner.event_id))!;
    const origin = await getOrigin();

    const created: {
      name: string;
      channelCode: string;
      signupLink: string;
      manageLink: string | null;
    }[] = [];
    for (const name of list) {
      if (kind === 'admin') {
        const made = await createAdmin(event.id, { name, role: 'admin' });
        created.push({
          name,
          channelCode: made.channel.code,
          signupLink: signupUrl(origin, event.code, made.channel.code),
          manageLink: adminUrl(origin, made.token),
        });
      } else {
        const channel = await createChannel(event.id, {
          name,
          type: body.type === 'partner' ? 'partner' : 'poster',
        });
        created.push({
          name,
          channelCode: channel.code,
          signupLink: signupUrl(origin, event.code, channel.code),
          manageLink: null,
        });
      }
    }
    await audit(owner, kind === 'admin' ? 'admin.create' : 'channel.create', 'event', event.id, {
      count: created.length,
      names: list.join('、').slice(0, 200),
    });
    return NextResponse.json({ ok: true, created });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '生成失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se admins failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}

// 重发 / 撤销管理链接，以及渠道启停。管理链接误发到群里时就用这里。
export async function PATCH(request: Request) {
  try {
    const owner = await requireOwner();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '');

    if (action === 'reissue' || action === 'revoke') {
      const target = await getAdmin(String(body.adminId || ''));
      if (!target || target.event_id !== owner.event_id) throw new SeError('NOT_FOUND', '管理员不存在。');
      if (target.role === 'owner' && action === 'revoke') {
        throw new SeError('INVALID_INPUT', '不能撤销发起人自己的管理链接。');
      }
      if (action === 'revoke') {
        await revokeAdminToken(target.id);
        await audit(owner, 'admin.revoke', 'admin', target.id, { name: target.name });
        return NextResponse.json({ ok: true });
      }
      const token = await reissueAdminToken(target.id);
      await audit(owner, 'admin.reissue', 'admin', target.id, { name: target.name });
      const origin = await getOrigin();
      return NextResponse.json({ ok: true, manageLink: adminUrl(origin, token) });
    }

    if (action === 'toggleChannel') {
      const channelId = String(body.channelId || '');
      const enabled = body.enabled ? 1 : 0;
      const result = await getD1()
        .prepare('UPDATE se_channels SET enabled = ? WHERE id = ? AND event_id = ?')
        .bind(enabled, channelId, owner.event_id)
        .run();
      if ((result.meta?.changes ?? 0) === 0) throw new SeError('NOT_FOUND', '渠道不存在。');
      await audit(owner, 'channel.toggle', 'channel', channelId, { enabled: Boolean(enabled) });
      return NextResponse.json({ ok: true });
    }

    throw new SeError('INVALID_INPUT', '不支持的操作。');
  } catch (error) {
    const message = error instanceof SeError ? error.message : '操作失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se admins patch failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
