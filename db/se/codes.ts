// 码与令牌：纯函数，不引用 cloudflare:workers，可直接用 node --test 跑。
// pepper 一律由调用方传入（Workers 侧见 db/se/auth.ts），测试里用固定值。
//
// 做法沿用 wechat-miniapp/cloudfunctions/api/core/domain.js 的邀请码口径：
// 无歧义码表、明文只在生成那一次返回、库里只存 sha256(token|pepper)。
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// 去掉 0/O/1/I/L，避免管理员手抄或电话转述时认错。
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DIGIT_ALPHABET = '0123456789';

export function randomCode(length: number, alphabet: string = CODE_ALPHABET): string {
  // 拒绝采样：只接受 < limit 的字节，避免取模偏置（32 字符码表本来就整除，
  // 但 10 位数字码表不整除，统一处理省得以后换码表时忘了）。
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const makeEventCode = () => randomCode(6);
export const makeChannelCode = () => randomCode(4);
export const makeCheckinCode = () => randomCode(6, DIGIT_ALPHABET);
// 32 字符 × 5 bit = 160 bit，管理令牌；门票 24 字符 = 120 bit。
export const makeAdminToken = () => randomCode(32);
export const makeTicketToken = () => randomCode(24);

export function normalizeCode(value: unknown, max = 64): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max) : '';
}

export function hashToken(token: string, pepper: string): string {
  return createHash('sha256').update(`${normalizeCode(token)}|${pepper}`).digest('hex');
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Buffer {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

// 签名值：payload.mac，payload 为 base64url 的 UTF-8 文本。
// 用在管理会话 cookie 和渠道归因 cookie 上，后者如果不签，报名者就能自己
// 伪造一个"邀请人"把人情记到别人头上。
export function signValue(payload: string, pepper: string): string {
  const mac = toBase64Url(createHmac('sha256', pepper).update(payload).digest());
  return `${toBase64Url(Buffer.from(payload, 'utf8'))}.${mac}`;
}

export function readSignedValue(signed: unknown, pepper: string): string | null {
  if (typeof signed !== 'string' || !signed.includes('.')) return null;
  const [body, mac] = signed.split('.');
  if (!body || !mac) return null;
  let payload: string;
  try {
    payload = fromBase64Url(body).toString('utf8');
  } catch {
    return null;
  }
  const expected = toBase64Url(createHmac('sha256', pepper).update(payload).digest());
  if (expected.length !== mac.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(mac, 'utf8'))) return null;
  } catch {
    return null;
  }
  return payload;
}

export type SeSession = { adminId: string; eventId: string; issuedAt: number };

export function encodeSession(session: SeSession, pepper: string): string {
  return signValue(JSON.stringify([session.adminId, session.eventId, session.issuedAt]), pepper);
}

export function decodeSession(
  raw: unknown,
  pepper: string,
  maxAgeMs: number,
  nowMs: number = Date.now(),
): SeSession | null {
  const payload = readSignedValue(raw, pepper);
  if (!payload) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [adminId, eventId, issuedAt] = parsed as [unknown, unknown, unknown];
  if (typeof adminId !== 'string' || typeof eventId !== 'string' || typeof issuedAt !== 'number') return null;
  if (!adminId || !eventId || !Number.isFinite(issuedAt)) return null;
  if (nowMs - issuedAt > maxAgeMs || issuedAt - nowMs > 60_000) return null;
  return { adminId, eventId, issuedAt };
}

export function ticketUrl(origin: string, ticketToken: string): string {
  return `${origin.replace(/\/+$/, '')}/v/${ticketToken}`;
}

export function signupUrl(origin: string, eventCode: string, channelCode?: string): string {
  const base = `${origin.replace(/\/+$/, '')}/e/${eventCode}`;
  return channelCode ? `${base}?c=${channelCode}` : base;
}

export function adminUrl(origin: string, adminToken: string): string {
  return `${origin.replace(/\/+$/, '')}/m/${adminToken}`;
}

export function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : digits;
}
