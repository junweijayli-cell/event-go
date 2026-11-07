import { NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES, SeError, putImage } from '@/db/se/data';
import { requireApiAdmin } from '@/db/se/guard';

// 图片上传。客户端先在 canvas 里压到 1280px / JPEG，这里只收裸 body。
// 有 R2 binding 就进 R2，没有就压缩后存 D1（见 db/se/data.ts 的 putImage）。
export async function POST(request: Request) {
  try {
    const admin = await requireApiAdmin();
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) throw new SeError('EMPTY', '没有收到图片内容。');
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new SeError('TOO_LARGE', `图片请压缩到 ${Math.round(MAX_IMAGE_BYTES / 1024)}KB 以内。`);
    }
    const saved = await putImage(admin, bytes, contentType);
    return NextResponse.json({ ok: true, key: saved.key, url: `/f/${saved.key}` });
  } catch (error) {
    const message = error instanceof SeError ? error.message : '上传失败，请稍后重试。';
    if (!(error instanceof SeError)) console.error('se upload failed', error);
    return NextResponse.json({ error: message }, { status: error instanceof SeError ? 400 : 500 });
  }
}
