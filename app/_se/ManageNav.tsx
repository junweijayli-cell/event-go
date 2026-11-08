import { STATE_LABELS } from '@/db/se/view';
import type { EventRow } from '@/db/se/data';
import { openState } from '@/db/se/data';

const TABS = [
  { key: 'home', suffix: '', label: '概览' },
  { key: 'roster', suffix: '/roster', label: '名单' },
  { key: 'share', suffix: '/share', label: '分享与链接' },
  { key: 'updates', suffix: '/updates', label: '同步更新' },
  { key: 'checkin', suffix: '/checkin', label: '核销' },
  { key: 'settings', suffix: '/settings', label: '设置' },
];

export function ManageHeader({
  event,
  adminName,
  role,
  active,
}: {
  event: EventRow;
  adminName: string;
  role: 'owner' | 'admin';
  active: string;
}) {
  const state = openState(event);
  return (
    <>
      <p className="se-eyebrow">
        {role === 'owner' ? '发起人' : '管理员'} · {adminName}
      </p>
      <h1 className="se-title">{event.title}</h1>
      <p style={{ marginTop: 0 }}>
        <span className={`se-chip ${state === 'open' ? 'se-chip--open' : state === 'full' ? 'se-chip--warn' : 'se-chip--off'}`}>
          {STATE_LABELS[state]}
        </span>
        <span className="se-chip" style={{ marginLeft: 6 }}>活动码 {event.code}</span>
      </p>
      <nav className="se-nav se-noprint">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/manage/${event.id}${tab.suffix}`}
            className={tab.key === active ? 'is-active' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </>
  );
}
