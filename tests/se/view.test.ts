import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIcs,
  formatDeadline,
  formatRange,
  formatStamp,
  mapLinks,
  parseNaive,
  shareText,
} from '../../db/se/view.ts';

test('活动时间按字面值当北京时间，不走时区转换', () => {
  const parsed = parseNaive('2026-11-15T14:00');
  assert.deepEqual(parsed, { year: 2026, month: 11, day: 15, hour: 14, minute: 0, hasTime: true });
  assert.equal(parseNaive('2026-11-15')?.hasTime, false);
  assert.equal(parseNaive('乱码'), null);
  assert.equal(parseNaive(null), null);
});

test('时间区间格式', () => {
  // 2026-11-15 是周日
  assert.equal(formatRange('2026-11-15T14:00', '2026-11-15T17:00'), '11月15日（周日）14:00–17:00');
  assert.equal(formatRange('2026-11-15T14:00', null), '11月15日（周日）14:00');
  assert.equal(formatRange('2026-11-15', null), '11月15日（周日）');
  assert.equal(formatRange('2026-11-15T20:00', '2026-11-16T09:00'), '11月15日（周日）20:00 至 11月16日 09:00');
  assert.equal(formatRange(null, null), '时间待公布');
  assert.equal(formatRange(null, null, '活动前 3 天公布'), '活动前 3 天公布');
  assert.equal(formatDeadline('2026-11-12T23:59'), '11月12日 23:59');
  assert.equal(formatDeadline(null), '');
});

test('ISO 时间戳按 +08:00 显示', () => {
  // UTC 06:30 == 北京 14:30
  assert.equal(formatStamp('2026-11-15T06:30:00.000Z'), '11月15日 14:30');
  // 跨日：UTC 16:30 == 次日北京 00:30
  assert.equal(formatStamp('2026-11-15T16:30:00.000Z'), '11月16日 00:30');
  assert.equal(formatStamp(null), '');
  assert.equal(formatStamp('坏数据'), '');
});

test('地图链接：有坐标给三家，没坐标按地址搜', () => {
  const withPoint = mapLinks({
    locationName: '市图书馆',
    locationAddress: '中山路 1 号',
    locationLat: 31.23,
    locationLng: 121.47,
  });
  assert.deepEqual(withPoint.map((link) => link.label), ['高德地图', '腾讯地图', '苹果地图']);
  // 高德的 position 是「经度,纬度」，顺序写反就会落到别的城市
  assert.ok(withPoint[0].href.includes('position=121.47,31.23'));
  assert.ok(withPoint[1].href.includes('coord:31.23,121.47'));

  const noPoint = mapLinks({ locationName: '', locationAddress: '中山路 1 号', locationLat: null, locationLng: null });
  assert.deepEqual(noPoint.map((link) => link.label), ['高德地图', '腾讯地图']);
  assert.ok(noPoint[0].href.includes(encodeURIComponent('中山路 1 号')));

  assert.deepEqual(
    mapLinks({ locationName: '', locationAddress: '', locationLat: null, locationLng: null }),
    [],
  );
});

test('日历文件把北京时间转成 UTC', () => {
  const ics = buildIcs({
    uid: 'reg-1@se',
    title: '秋季开放日',
    startAt: '2026-11-15T14:00',
    endAt: '2026-11-15T17:00',
    location: '市图书馆',
    description: '带上身份证',
    url: 'https://a.com/t/TOKEN',
  });
  assert.ok(ics);
  assert.ok(ics!.includes('DTSTART:20261115T060000Z'), ics!);
  assert.ok(ics!.includes('DTEND:20261115T090000Z'));
  assert.ok(ics!.includes('SUMMARY:秋季开放日'));
  assert.equal(buildIcs({ uid: 'x', title: 'x', startAt: null, endAt: null, location: '', description: '', url: '' }), null);
});

test('没填结束时间时默认两小时', () => {
  const ics = buildIcs({
    uid: 'reg-1@se',
    title: '活动',
    startAt: '2026-11-15T14:00',
    endAt: null,
    location: '',
    description: '',
    url: '',
  });
  assert.ok(ics!.includes('DTEND:20261115T080000Z'));
});

test('分享文案带上邀请人', () => {
  const text = shareText({
    title: '秋季开放日',
    when: '11月15日（周日）14:00',
    where: '市图书馆',
    url: 'https://a.com/e/ABC123?c=WXYZ',
    inviterName: '张三',
  });
  assert.ok(text.includes('【秋季开放日】报名通道'));
  assert.ok(text.includes('https://a.com/e/ABC123?c=WXYZ'));
  assert.ok(text.includes('由 张三 邀请'));
  // 时间地点还没定时不出现空行标签
  const bare = shareText({ title: '活动', when: '', where: '', url: 'https://a.com/e/X', inviterName: '' });
  assert.equal(bare.includes('时间：'), false);
  assert.equal(bare.includes('地点：'), false);
});
