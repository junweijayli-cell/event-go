import type { Metadata } from 'next';
import '@/app/se.css';
import { ManageHeader } from '@/app/_se/ManageNav';
import { RosterRows, type RosterRow } from '@/app/_se/RosterRows';
import { listAdmins, listRoster, parseFormSchemaFor, rosterStats } from '@/db/se/data';
import { describeSubmission } from '@/db/se/form';
import { requireAdmin } from '@/db/se/guard';
import { STATUS_LABELS, formatStamp } from '@/db/se/view';

export const metadata: Metadata = { title: '报名名单' };

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'confirmed', label: '已确认' },
  { key: 'pending', label: '待审核' },
  { key: 'waitlist', label: '候补' },
  { key: 'rejected', label: '已驳回' },
];

function parseFormData(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const query = await searchParams;
  const { admin, event } = await requireAdmin(eventId);

  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');
  const filter = {
    inviter: one('inviter'),
    status: one('status') || 'all',
    query: one('q'),
    checked: (one('checked') as 'in' | 'out') || undefined,
  };

  const [stats, rows, admins] = await Promise.all([
    rosterStats(event.id),
    listRoster(event.id, filter),
    listAdmins(event.id),
  ]);
  const schema = parseFormSchemaFor(event);

  const items: RosterRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    inviterId: row.inviter_admin_id ?? (row.channel_code ? `ch:${row.channel_code}` : 'none'),
    inviterName: row.inviter_name || (row.channel_code ? `渠道 ${row.channel_code}` : '直接进入'),
    channelCode: row.channel_code,
    createdLabel: formatStamp(row.created_at),
    checkedInLabel: row.checked_in_at ? formatStamp(row.checked_in_at) : '',
    reviewNote: row.review_note,
    answers: describeSubmission(schema, parseFormData(row.form_data)),
  }));

  const base = `/manage/${event.id}/roster`;
  const keep = (next: Record<string, string>) => {
    const search = new URLSearchParams();
    const merged = { inviter: filter.inviter, status: filter.status, q: filter.query, checked: filter.checked ?? '', ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== 'all') search.set(key, value);
    }
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };
  const exportSearch = new URLSearchParams();
  if (filter.inviter) exportSearch.set('inviter', filter.inviter);
  if (filter.status !== 'all') exportSearch.set('status', filter.status);
  if (filter.query) exportSearch.set('q', filter.query);
  if (filter.checked) exportSearch.set('checked', filter.checked);

  return (
    <main className="se-page se-page--wide">
      <ManageHeader event={event} adminName={admin.name} role={admin.role} active="roster" />

      <div className="se-grid">
        <div className="se-stat">
          <b>{stats.totals.confirmed}</b>
          <span>已确认</span>
        </div>
        <div className="se-stat">
          <b>{stats.totals.pending}</b>
          <span>待审核</span>
        </div>
        <div className="se-stat">
          <b>{stats.totals.waitlist}</b>
          <span>候补</span>
        </div>
        <div className="se-stat">
          <b>{stats.totals.checkedIn}</b>
          <span>已核销</span>
        </div>
      </div>

      <div className="se-card se-card--tight">
        <p className="se-eyebrow">按邀请人筛选</p>
        <div className="se-nav" style={{ margin: '0 0 10px' }}>
          <a href={keep({ inviter: '' })} className={!filter.inviter ? 'is-active' : undefined}>
            全部 {stats.totals.total}
          </a>
          {stats.byInviter.map((row) => (
            <a
              key={row.inviterId}
              href={keep({ inviter: row.inviterId })}
              className={filter.inviter === row.inviterId ? 'is-active' : undefined}
            >
              {row.inviterName} {row.total}
            </a>
          ))}
        </div>

        <p className="se-eyebrow">按状态</p>
        <div className="se-nav" style={{ margin: '0 0 10px' }}>
          {STATUS_TABS.map((tab) => (
            <a
              key={tab.key}
              href={keep({ status: tab.key })}
              className={filter.status === tab.key ? 'is-active' : undefined}
            >
              {tab.label}
            </a>
          ))}
          <a href={keep({ checked: filter.checked === 'out' ? '' : 'out' })} className={filter.checked === 'out' ? 'is-active' : undefined}>
            未核销
          </a>
          <a href={keep({ checked: filter.checked === 'in' ? '' : 'in' })} className={filter.checked === 'in' ? 'is-active' : undefined}>
            已核销
          </a>
        </div>

        {/* 搜索用普通 GET 表单，没有 JS 也能用 */}
        <form action={base} method="get" style={{ display: 'flex', gap: 8 }}>
          {filter.inviter ? <input type="hidden" name="inviter" value={filter.inviter} /> : null}
          {filter.status !== 'all' ? <input type="hidden" name="status" value={filter.status} /> : null}
          <input className="se-input" name="q" placeholder="搜姓名或手机号" defaultValue={filter.query} />
          <button className="se-btn se-btn--sm" type="submit">
            搜索
          </button>
        </form>

        <div className="se-btn-row" style={{ marginTop: 10 }}>
          <a className="se-btn se-btn--sm se-btn--gold" href={`/api/se/export?${exportSearch.toString()}`}>
            导出当前名单（Excel 可开）
          </a>
          {filter.query || filter.inviter || filter.status !== 'all' || filter.checked ? (
            <a className="se-btn se-btn--sm se-btn--ghost" href={base}>
              清除筛选
            </a>
          ) : null}
        </div>
      </div>

      <div className="se-card">
        <h2 className="se-h2">
          名单（{items.length}
          {items.length >= 200 ? '，仅显示最近 200 条，请用筛选或导出' : ''}）
        </h2>
        <RosterRows rows={items} admins={admins.map((row) => ({ id: row.id, name: row.name }))} canReassign={admin.role === 'owner'} />
      </div>
    </main>
  );
}
