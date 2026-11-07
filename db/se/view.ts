// 展示层纯函数：时间格式、状态文案、地图链接、日历文件、分享文案。
// 可 node --test 直接跑。
//
// 时间口径：活动时间按发起人填写的「本地时间」原样存成 YYYY-MM-DDTHH:mm，
// 一律当北京时间理解。不走 Date 解析再格式化 —— 那条路在 Workers（UTC）和
// 手机（+08:00）上会算出两个结果，活动时间这种事上错一小时就是事故。

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export type NaiveTime = { year: number; month: number; day: number; hour: number; minute: number; hasTime: boolean };

export function parseNaive(value: string | null | undefined): NaiveTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value || ''));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    hasTime: match[4] !== undefined,
  };
}

export function weekdayOf(time: NaiveTime): string {
  return WEEKDAYS[new Date(Date.UTC(time.year, time.month - 1, time.day)).getUTCDay()];
}

function clock(time: NaiveTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function formatRange(startAt: string | null, endAt: string | null, fallback = '时间待公布'): string {
  const start = parseNaive(startAt);
  if (!start) return fallback;
  const head = `${start.month}月${start.day}日（周${weekdayOf(start)}）${start.hasTime ? clock(start) : ''}`;
  const end = parseNaive(endAt);
  if (!end) return head;
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day;
  if (sameDay) return `${head}–${clock(end)}`;
  return `${head} 至 ${end.month}月${end.day}日 ${end.hasTime ? clock(end) : ''}`.trim();
}

export function formatDeadline(deadlineAt: string | null): string {
  const time = parseNaive(deadlineAt);
  if (!time) return '';
  return `${time.month}月${time.day}日${time.hasTime ? ` ${clock(time)}` : ''}`;
}

// ISO 时间戳（created_at 等）转北京时间显示。
export function formatStamp(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  const beijing = new Date(ms + 8 * 3600000);
  const month = beijing.getUTCMonth() + 1;
  const day = beijing.getUTCDate();
  const hour = String(beijing.getUTCHours()).padStart(2, '0');
  const minute = String(beijing.getUTCMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  confirmed: '已确认',
  waitlist: '候补中',
  rejected: '已驳回',
  cancelled: '已取消',
};

export const STATE_LABELS: Record<string, string> = {
  draft: '未发布',
  open: '报名中',
  full: '已满额 · 可报候补',
  closed: '报名已关闭',
  deadline: '报名已截止',
};

export type Place = {
  locationName: string;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
};

// 不嵌静态地图（要第三方 key），只给一键跳转。高德/腾讯在国内最稳，
// 苹果地图兜 iOS。没有经纬度就退化成按地址搜索。
export function mapLinks(place: Place): { label: string; href: string }[] {
  const name = encodeURIComponent(place.locationName || place.locationAddress || '活动地点');
  const address = place.locationAddress || place.locationName;
  const hasPoint = typeof place.locationLat === 'number' && typeof place.locationLng === 'number';
  if (!hasPoint) {
    if (!address) return [];
    const keyword = encodeURIComponent(address);
    return [
      { label: '高德地图', href: `https://uri.amap.com/search?keyword=${keyword}` },
      { label: '腾讯地图', href: `https://apis.map.qq.com/uri/v1/search?keyword=${keyword}&referer=se-signup` },
    ];
  }
  const lat = place.locationLat as number;
  const lng = place.locationLng as number;
  return [
    { label: '高德地图', href: `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}&src=se-signup&coordinate=gaode` },
    { label: '腾讯地图', href: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${name}&referer=se-signup` },
    { label: '苹果地图', href: `https://maps.apple.com/?q=${name}&ll=${lat},${lng}` },
  ];
}

function icsEscape(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (match) => `\\${match}`);
}

function icsStamp(naive: NaiveTime | null): string | null {
  if (!naive) return null;
  const ms = Date.parse(
    `${naive.year}-${String(naive.month).padStart(2, '0')}-${String(naive.day).padStart(2, '0')}` +
      `T${String(naive.hour).padStart(2, '0')}:${String(naive.minute).padStart(2, '0')}:00+08:00`,
  );
  if (!Number.isFinite(ms)) return null;
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

export function buildIcs(input: {
  uid: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  location: string;
  description: string;
  url: string;
}): string | null {
  const start = icsStamp(parseNaive(input.startAt));
  if (!start) return null;
  const endNaive = parseNaive(input.endAt);
  const end = endNaive
    ? icsStamp(endNaive)
    : icsStamp({ ...parseNaive(input.startAt)!, hour: (parseNaive(input.startAt)!.hour + 2) % 24 });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//se-signup//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${start}`,
    end ? `DTEND:${end}` : '',
    `SUMMARY:${icsEscape(input.title)}`,
    input.location ? `LOCATION:${icsEscape(input.location)}` : '',
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : '',
    input.url ? `URL:${input.url}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

// 管理员一键复制的分享文案。写成「谁邀请的」是为了让收到的人知道找谁。
export function shareText(input: {
  title: string;
  when: string;
  where: string;
  url: string;
  inviterName: string;
}): string {
  const lines = [`【${input.title}】报名通道`];
  if (input.when) lines.push(`时间：${input.when}`);
  if (input.where) lines.push(`地点：${input.where}`);
  lines.push(`报名：${input.url}`);
  if (input.inviterName) lines.push(`（由 ${input.inviterName} 邀请，报名后有具体安排会在同一个链接里更新）`);
  return lines.join('\n');
}
