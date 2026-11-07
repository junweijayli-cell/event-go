import { readImage } from '@/db/se/data';

// 活动封面与更新配图。内容随机 id 寻址，内容不会变，可长期缓存。
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const file = await readImage(key);
  if (!file) return new Response('not found', { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
