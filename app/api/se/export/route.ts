import { contentDisposition, csvFilename, toCsv } from '@/db/se/csv';
import { chinaDate, getEventById, listRoster, parseFormSchemaFor } from '@/db/se/data';
import { requireApiAdmin } from '@/db/se/guard';
import { STATUS_LABELS, formatStamp } from '@/db/se/view';

// 名单导出。CSV + BOM，Excel 双击打开中文不乱码。
export async function GET(request: Request) {
  try {
    const admin = await requireApiAdmin();
    const event = (await getEventById(admin.event_id))!;
    const url = new URL(request.url);
    const rows = await listRoster(event.id, {
      inviter: url.searchParams.get('inviter') || undefined,
      status: url.searchParams.get('status') || undefined,
      query: url.searchParams.get('q') || undefined,
      checked: (url.searchParams.get('checked') as 'in' | 'out' | null) || undefined,
      limit: 500,
    });
    const schema = parseFormSchemaFor(event);
    const headers = [
      '序号',
      '姓名',
      '手机号',
      '状态',
      '邀请人',
      '渠道码',
      '报名时间',
      '核销时间',
      ...schema.fields.map((field) => field.label),
      '审核备注',
    ];
    const body = rows.map((row, index) => {
      let formData: Record<string, string> = {};
      try {
        formData = JSON.parse(row.form_data) as Record<string, string>;
      } catch {
        formData = {};
      }
      return [
        index + 1,
        row.name,
        row.phone,
        STATUS_LABELS[row.status] ?? row.status,
        row.inviter_name || (row.channel_code ? `渠道 ${row.channel_code}` : '直接进入'),
        row.channel_code,
        formatStamp(row.created_at),
        row.checked_in_at ? formatStamp(row.checked_in_at) : '',
        ...schema.fields.map((field) => formData[field.key] ?? ''),
        row.review_note,
      ];
    });
    const filename = csvFilename(event.title, chinaDate());
    return new Response(toCsv(headers, body), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': contentDisposition(filename),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('se export failed', error);
    return new Response('需要管理员身份。', { status: 403 });
  }
}
