import assert from 'node:assert/strict';
import test from 'node:test';
import { CSV_BOM, contentDisposition, csvFilename, toCsv } from '../../db/se/csv.ts';

test('带 BOM 与 CRLF，Excel 打开中文不乱码', () => {
  const csv = toCsv(['姓名', '手机号'], [['张三', '13812345678']]);
  assert.ok(csv.startsWith(CSV_BOM));
  assert.equal(csv.slice(1), '姓名,手机号\r\n张三,13812345678\r\n');
});

test('逗号、引号、换行都正确转义', () => {
  const csv = toCsv(['备注'], [['他说"要素食"，而且\n要靠窗']]);
  assert.ok(csv.includes('"他说""要素食""，而且\n要靠窗"'));
});

test('挡公式注入：以等号开头的单元格不会被 Excel 当公式执行', () => {
  const csv = toCsv(['姓名'], [['=1+1'], ['+86138'], ['-5'], ['@SUM(A1)']]);
  for (const cell of ['\'=1+1', "'+86138", "'-5", "'@SUM(A1)"]) {
    assert.ok(csv.includes(cell), cell);
  }
});

test('空值与数字', () => {
  const csv = toCsv(['a', 'b', 'c'], [[null, undefined, 3]]);
  assert.equal(csv.slice(1).split('\r\n')[1], ',,3');
});

test('文件名清掉非法字符', () => {
  assert.equal(csvFilename('秋季开放日/第一场', '2026-11-07'), '秋季开放日-第一场-报名名单-2026-11-07.csv');
  assert.equal(csvFilename('', '2026-11-07'), '活动-报名名单-2026-11-07.csv');
});

test('中文文件名同时给 ASCII 回退和 RFC 5987 形式', () => {
  const header = contentDisposition('秋季-报名名单.csv');
  assert.ok(header.includes('filename="'));
  assert.ok(header.includes("filename*=UTF-8''"));
  assert.ok(header.includes(encodeURIComponent('秋季-报名名单.csv')));
});
