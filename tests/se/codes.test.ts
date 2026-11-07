import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CODE_ALPHABET,
  adminUrl,
  decodeSession,
  encodeSession,
  hashToken,
  makeAdminToken,
  makeCheckinCode,
  makeChannelCode,
  makeEventCode,
  makeTicketToken,
  maskPhone,
  normalizeCode,
  randomCode,
  readSignedValue,
  signValue,
  signupUrl,
  ticketUrl,
} from '../../db/se/codes.ts';

const PEPPER = 'test-pepper-at-least-16-chars';

test('码表不含容易看错的字符', () => {
  // 沿用 wechat-miniapp 那套码表：排掉 0/1/I/O。
  // L 保留 —— 码表里没有 1，它无从混淆。
  for (const char of '01OI') assert.equal(CODE_ALPHABET.includes(char), false, char);
  assert.equal(CODE_ALPHABET.length, 32);
});

test('随机码长度与字符集正确', () => {
  for (let round = 0; round < 200; round += 1) {
    assert.match(makeEventCode(), /^[A-HJ-NP-Z2-9]{6}$/);
    assert.match(makeChannelCode(), /^[A-HJ-NP-Z2-9]{4}$/);
    assert.match(makeCheckinCode(), /^\d{6}$/);
    assert.equal(makeAdminToken().length, 32);
    assert.equal(makeTicketToken().length, 24);
  }
});

test('门票码不连号：随机取样基本不重复', () => {
  const seen = new Set<string>();
  for (let round = 0; round < 500; round += 1) seen.add(makeTicketToken());
  assert.equal(seen.size, 500);
  // 相邻两次不能只差一位，否则就能从自己的票推出别人的票、也能推出人数
  const first = makeCheckinCode();
  const second = makeCheckinCode();
  assert.notEqual(Number(second) - Number(first), 1);
});

test('randomCode 在数字码表下也不偏置到某几个数字', () => {
  const counts = new Map<string, number>();
  for (let round = 0; round < 3000; round += 1) {
    const char = randomCode(1, '0123456789');
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  assert.equal(counts.size, 10);
  for (const count of counts.values()) assert.ok(count > 150, `分布过于集中: ${count}`);
});

test('令牌只存哈希：同 pepper 稳定，换 pepper 即失效', () => {
  const token = makeAdminToken();
  assert.equal(hashToken(token, PEPPER), hashToken(token, PEPPER));
  assert.notEqual(hashToken(token, PEPPER), hashToken(token, 'another-pepper-16chars'));
  // 大小写与多余符号不影响：管理员手抄时容错
  assert.equal(hashToken(token.toLowerCase(), PEPPER), hashToken(token, PEPPER));
  assert.equal(hashToken(` ${token} `, PEPPER), hashToken(token, PEPPER));
});

test('normalizeCode 清掉非法字符并截断', () => {
  assert.equal(normalizeCode('ab-12 cd'), 'AB12CD');
  assert.equal(normalizeCode('x'.repeat(100), 8), 'XXXXXXXX');
  assert.equal(normalizeCode(42 as unknown as string), '');
});

test('签名值可往返，改一个字符就验不过', () => {
  const signed = signValue('hello-渠道码', PEPPER);
  assert.equal(readSignedValue(signed, PEPPER), 'hello-渠道码');
  assert.equal(readSignedValue(signed, 'wrong-pepper-16-chars'), null);
  const [body, mac] = signed.split('.');
  // 改动载荷第一位：解码后内容变了，MAC 对不上
  const flippedBody = `${body[0] === 'A' ? 'B' : 'A'}${body.slice(1)}`;
  assert.equal(readSignedValue(`${flippedBody}.${mac}`, PEPPER), null);
  // 签名覆盖的是解码后的文本，所以不影响解码结果的编码噪点仍然有效，
  // 这是预期行为：攻击者改不了内容。
  assert.equal(readSignedValue(`${body}.${mac}`, PEPPER), 'hello-渠道码');
  const flipped = `${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`;
  assert.equal(readSignedValue(`${body}.${flipped}`, PEPPER), null);
  assert.equal(readSignedValue('no-dot', PEPPER), null);
  assert.equal(readSignedValue(undefined, PEPPER), null);
});

test('管理会话 cookie：往返、过期、伪造', () => {
  const now = Date.now();
  const cookie = encodeSession({ adminId: 'adm-1', eventId: 'evt-1', issuedAt: now }, PEPPER);
  const session = decodeSession(cookie, PEPPER, 1000, now + 500);
  assert.deepEqual(session, { adminId: 'adm-1', eventId: 'evt-1', issuedAt: now });
  // 过期
  assert.equal(decodeSession(cookie, PEPPER, 1000, now + 2000), null);
  // 未来时间（有人把系统时间往前拨造一个长期 cookie）
  const future = encodeSession({ adminId: 'adm-1', eventId: 'evt-1', issuedAt: now + 600_000 }, PEPPER);
  assert.equal(decodeSession(future, PEPPER, 1_000_000, now), null);
  // 自己拼一个没有签名的 payload
  const forged = Buffer.from(JSON.stringify(['adm-9', 'evt-1', now]), 'utf8').toString('base64url');
  assert.equal(decodeSession(`${forged}.AAAA`, PEPPER, 1000, now), null);
  // 结构不对
  assert.equal(decodeSession(signValue(JSON.stringify(['only-one']), PEPPER), PEPPER, 1000, now), null);
  assert.equal(decodeSession(signValue('not-json', PEPPER), PEPPER, 1000, now), null);
});

test('链接拼装', () => {
  assert.equal(signupUrl('https://a.com/', 'ABC123'), 'https://a.com/e/ABC123');
  assert.equal(signupUrl('https://a.com', 'ABC123', 'WXYZ'), 'https://a.com/e/ABC123?c=WXYZ');
  assert.equal(ticketUrl('https://a.com//', 'TKN'), 'https://a.com/v/TKN');
  assert.equal(adminUrl('https://a.com', 'TOKEN'), 'https://a.com/m/TOKEN');
});

test('手机号脱敏', () => {
  assert.equal(maskPhone('13812345678'), '138****5678');
  assert.equal(maskPhone('123'), '123');
});
