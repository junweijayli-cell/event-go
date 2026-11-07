// 邀请人归因：最后一次扫码为准，提交后锁定。纯函数，可 node --test 直接跑。
//
// 口径（已和需求方确认）：
//   扫 A 码 → 扫 B 码 → 提交   ⇒ 邀请人 = B
// 实现上以"提交那一刻带着的渠道码"为准：报名页 URL 上的 ?c= 优先，没有才回落
// 到归因 cookie（上一次扫码写入，7 天窗口）。两者都没有记为直接进入。
//
// cookie 必须签名（见 db/se/codes.ts 的 signValue）：否则报名者可以自己造一个
// 渠道码，把人情记到别人头上。

export const ATTRIBUTION_WINDOW_DAYS = 7;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 86400000;
export const ADMIN_COOKIE = 'se_admin';
export const ADMIN_SESSION_MAX_AGE_DAYS = 30;

export function channelCookieName(eventCode: string): string {
  return `se_ch_${String(eventCode || '').toLowerCase()}`;
}

export function ticketCookieName(eventCode: string): string {
  return `se_tk_${String(eventCode || '').toLowerCase()}`;
}

export type ChannelTouch = { code: string; at: number };

export function encodeChannelTouch(touch: ChannelTouch): string {
  return JSON.stringify([touch.code, touch.at]);
}

export function decodeChannelTouch(payload: string | null): ChannelTouch | null {
  if (!payload) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [code, at] = parsed as [unknown, unknown];
  if (typeof code !== 'string' || typeof at !== 'number' || !Number.isFinite(at)) return null;
  return { code, at };
}

export type ResolvedChannel = { code: string; source: 'url' | 'cookie' | 'none' };

export function resolveChannelCode(input: {
  urlCode?: string | null;
  touch?: ChannelTouch | null;
  nowMs?: number;
}): ResolvedChannel {
  const urlCode = (input.urlCode || '').trim();
  if (urlCode) return { code: urlCode, source: 'url' };
  const touch = input.touch;
  const now = input.nowMs ?? Date.now();
  if (touch && touch.code && now - touch.at <= ATTRIBUTION_WINDOW_MS && touch.at - now <= 60_000) {
    return { code: touch.code, source: 'cookie' };
  }
  return { code: '', source: 'none' };
}
