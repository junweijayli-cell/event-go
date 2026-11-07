import { getOrigin } from '@/db/se/auth';
import { findChannel, getEventByCode } from '@/db/se/data';
import { signupUrl } from '@/db/se/codes';
import { qrSvg } from '@/db/se/qrcode';

// 渠道二维码。只接受「活动码 + 渠道码」，URL 由服务端拼 —— 不做通用生码接口，
// 否则这个域名就能被人用来生成指向任意网址的二维码。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const event = await getEventByCode(url.searchParams.get('e') || '');
  if (!event) return new Response('not found', { status: 404 });
  const channelCode = url.searchParams.get('c') || '';
  if (channelCode) {
    const channel = await findChannel(event.id, channelCode);
    if (!channel) return new Response('not found', { status: 404 });
  }
  const origin = await getOrigin();
  const size = Math.min(12, Math.max(2, Number(url.searchParams.get('s')) || 6));
  const svg = qrSvg(signupUrl(origin, event.code, channelCode || undefined), { cellSize: size, margin: 2 });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // 渠道码内容固定，可以长期缓存；换了渠道码就是另一个 URL。
      'cache-control': 'public, max-age=86400, immutable',
    },
  });
}
