import { NextResponse } from 'next/server';
import { SeError, deleteUpdate, publishUpdate } from '@/db/se/data';
import { requireApiAdmin } from '@/db/se/guard';

// 发布同步更新。所有管理员都能发 —— 活动当天临时变地点时，谁在现场谁发。
export async function POST(request: Request) {
  try {
    const admin = await requireApiAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const update = await publishUpdate(admin, body);
    return NextResponse.json({ ok: true, id: update.id });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '发布失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se update failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireApiAdmin();
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) throw new SeError('INVALID_INPUT', '缺少更新 id。');
    await deleteUpdate(admin, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '删除失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se update delete failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
