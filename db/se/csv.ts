// 名单导出：带 BOM 的 CSV，Excel 双击打开中文不乱码。纯函数，可 node --test 跑。
//
// 不用 xlsx 库：Workers 里再塞一个 Excel 写库只为换一个后缀名不值得；CSV+BOM
// 在 Windows Excel、WPS、Numbers 里都能正常打开。真需要 .xlsx 时再接 SheetJS。

export const CSV_BOM = '﻿';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // 防公式注入：以 = + - @ 开头的单元格在 Excel 里会被当公式执行。
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) lines.push(row.map(cell).join(','));
  // CRLF：Excel 对 LF-only 的多行单元格处理不稳。
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

export function csvFilename(title: string, date: string): string {
  const safe = String(title || '活动')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || '活动';
  return `${safe}-报名名单-${date}.csv`;
}

// 浏览器下载用：中文文件名要同时给 filename（ASCII 回退）和 filename*（RFC 5987）。
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
