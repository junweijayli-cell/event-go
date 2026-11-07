// 会话与权限（Workers 侧）。纯逻辑都在 codes.ts / attribution.ts 里，这里只负责
// 和 Next 的 cookies()/headers() 以及 Workers env 打交道。
//
// 三类身份：
//   报名者   —— 无账号，门票链接 + se_tk_<活动码> cookie
//   管理员   —— /m/<token> 一次性换成签名 cookie se_admin，地址栏不留 token
//   owner    —— 同上，role='owner'，可建活动、管管理员、改邀请人
import { cookies, headers } from 'next/headers';
import { getEnvValue } from '@/db/runtime';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE_DAYS,
  ATTRIBUTION_WINDOW_DAYS,
  channelCookieName,
  decodeChannelTouch,
  encodeChannelTouch,
  ticketCookieName,
  type ChannelTouch,
} from './attribution';
import { decodeSession, encodeSession, readSignedValue, signValue, type SeSession } from './codes';

const DEV_PEPPER = 'se-dev-pepper-not-for-production';
const ADMIN_SESSION_MAX_AGE_MS = ADMIN_SESSION_MAX_AGE_DAYS * 86400000;

// 环境变量从哪来由平台决定（Workers 的绑定 / Node 的 process.env），见 db/runtime.ts。
const envValue = getEnvValue;

let warnedAboutPepper = false;

// 换 pepper 等于吊销所有管理链接、门票链接和会话 cookie —— 上线前设好就别再改。
// 生产用 `wrangler secret put SIGNUP_PEPPER`。
export function pepper(): string {
  const value = envValue('SIGNUP_PEPPER');
  if (value && value.length >= 16) return value;
  if (!warnedAboutPepper) {
    warnedAboutPepper = true;
    console.warn('[se] SIGNUP_PEPPER 未设置或过短，正在使用开发用 pepper，请勿用于生产。');
  }
  return DEV_PEPPER;
}

export function setupToken(): string {
  return envValue('SE_SETUP_TOKEN') || '';
}

// 二维码和分享链接里写的是这个地址，所以必须是最终对外可访问的域名。
// 绑了自有域名后设 SE_PUBLIC_ORIGIN，不然二维码会印着 workers.dev 的地址。
export async function getOrigin(): Promise<string> {
  const configured = envValue('SE_PUBLIC_ORIGIN');
  if (configured) return configured.replace(/\/+$/, '');
  const store = await headers();
  const host = store.get('x-forwarded-host') || store.get('host') || 'localhost:5173';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const proto = store.get('x-forwarded-proto') || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function isSecureRequest(): Promise<boolean> {
  const store = await headers();
  const host = store.get('x-forwarded-host') || store.get('host') || '';
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)) return false;
  return (store.get('x-forwarded-proto') || 'https') === 'https';
}

export async function readAdminSession(): Promise<SeSession | null> {
  const store = await cookies();
  return decodeSession(store.get(ADMIN_COOKIE)?.value, pepper(), ADMIN_SESSION_MAX_AGE_MS);
}

export async function writeAdminSession(adminId: string, eventId: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, encodeSession({ adminId, eventId, issuedAt: Date.now() }, pepper()), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_DAYS * 86400,
  });
}

// 重定向响应上的 cookie 要直接挂在 NextResponse 上才稳（route handler 里
// cookies().set() 配 redirect 不保证带出去），/m/<token> 入口用这个。
export async function adminCookieSpec(adminId: string, eventId: string) {
  return {
    name: ADMIN_COOKIE,
    value: encodeSession({ adminId, eventId, issuedAt: Date.now() }, pepper()),
    options: {
      httpOnly: true,
      secure: await isSecureRequest(),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_DAYS * 86400,
    },
  };
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

// —— 渠道归因 cookie ——————————————————————————————————————————————

export async function readChannelTouch(eventCode: string): Promise<ChannelTouch | null> {
  const store = await cookies();
  const raw = store.get(channelCookieName(eventCode))?.value;
  return decodeChannelTouch(readSignedValue(raw, pepper()));
}

export async function writeChannelTouch(eventCode: string, code: string): Promise<void> {
  const store = await cookies();
  store.set(channelCookieName(eventCode), signValue(encodeChannelTouch({ code, at: Date.now() }), pepper()), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: 'lax',
    path: '/',
    maxAge: ATTRIBUTION_WINDOW_DAYS * 86400,
  });
}

// —— 门票 cookie（换手机也能回到自己的报名，同浏览器内） ——————————————

export async function readTicketCookie(eventCode: string): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ticketCookieName(eventCode))?.value;
  const payload = readSignedValue(raw, pepper());
  return payload || null;
}

export async function writeTicketCookie(eventCode: string, ticketToken: string): Promise<void> {
  const store = await cookies();
  store.set(ticketCookieName(eventCode), signValue(ticketToken, pepper()), {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: 'lax',
    path: '/',
    maxAge: 180 * 86400,
  });
}
