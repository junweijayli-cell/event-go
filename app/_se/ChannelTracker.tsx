'use client';

import { useEffect } from 'react';

// 把 URL 上的渠道码落成 HttpOnly 签名 cookie。
//
// 为什么不在服务端渲染时直接写 cookie：Next 的服务端组件渲染期间禁止 set-cookie，
// 只有 route handler 能写。所以进页面后打一发请求，由 /api/se/track 落 cookie 并
// 给渠道计一次访问。
//
// 归因不依赖这发请求成功：报名表单会把 URL 上的渠道码一起提交，cookie 只是为了
// 「下次不带参数直接打开也还记得是谁邀请的」。
export function ChannelTracker({ eventCode, channelCode }: { eventCode: string; channelCode: string }) {
  useEffect(() => {
    if (!channelCode) return;
    const controller = new AbortController();
    fetch('/api/se/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventCode, channelCode }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {});
    return () => controller.abort();
  }, [eventCode, channelCode]);
  return null;
}
