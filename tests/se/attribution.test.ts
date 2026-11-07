import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTRIBUTION_WINDOW_MS,
  channelCookieName,
  decodeChannelTouch,
  encodeChannelTouch,
  resolveChannelCode,
  ticketCookieName,
} from '../../db/se/attribution.ts';

const NOW = Date.UTC(2026, 10, 7, 4, 0, 0);

test('最后一次扫码为准：URL 上的渠道码压过 cookie', () => {
  const resolved = resolveChannelCode({
    urlCode: 'BBBB',
    touch: { code: 'AAAA', at: NOW - 1000 },
    nowMs: NOW,
  });
  assert.deepEqual(resolved, { code: 'BBBB', source: 'url' });
});

test('不带参数直接打开时回落到上一次扫码的 cookie', () => {
  const resolved = resolveChannelCode({ urlCode: '', touch: { code: 'AAAA', at: NOW - 86400000 }, nowMs: NOW });
  assert.deepEqual(resolved, { code: 'AAAA', source: 'cookie' });
});

test('超出归因窗口的 cookie 不再算', () => {
  const stale = resolveChannelCode({
    urlCode: '',
    touch: { code: 'AAAA', at: NOW - ATTRIBUTION_WINDOW_MS - 1 },
    nowMs: NOW,
  });
  assert.deepEqual(stale, { code: '', source: 'none' });
  const edge = resolveChannelCode({
    urlCode: '',
    touch: { code: 'AAAA', at: NOW - ATTRIBUTION_WINDOW_MS },
    nowMs: NOW,
  });
  assert.equal(edge.code, 'AAAA');
});

test('没有任何渠道信息时记为直接进入', () => {
  assert.deepEqual(resolveChannelCode({ nowMs: NOW }), { code: '', source: 'none' });
  assert.deepEqual(resolveChannelCode({ urlCode: '   ', touch: null, nowMs: NOW }), { code: '', source: 'none' });
});

test('伪造成未来时间的 cookie 不生效', () => {
  const resolved = resolveChannelCode({ urlCode: '', touch: { code: 'AAAA', at: NOW + 600_000 }, nowMs: NOW });
  assert.equal(resolved.code, '');
});

test('归因 cookie 可往返，坏数据不炸', () => {
  const payload = encodeChannelTouch({ code: 'WXYZ', at: NOW });
  assert.deepEqual(decodeChannelTouch(payload), { code: 'WXYZ', at: NOW });
  assert.equal(decodeChannelTouch(null), null);
  assert.equal(decodeChannelTouch('not json'), null);
  assert.equal(decodeChannelTouch('{"a":1}'), null);
  assert.equal(decodeChannelTouch('["WXYZ"]'), null);
  assert.equal(decodeChannelTouch('["WXYZ","not-a-number"]'), null);
});

test('cookie 名按活动隔离，一个人可以同时参与多个活动', () => {
  assert.equal(channelCookieName('ABC123'), 'se_ch_abc123');
  assert.equal(ticketCookieName('ABC123'), 'se_tk_abc123');
  assert.notEqual(channelCookieName('ABC123'), channelCookieName('XYZ789'));
});
