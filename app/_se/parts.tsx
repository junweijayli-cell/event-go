// 公开侧共用的展示块（服务端组件，不带客户端 JS）。
// 活动页和门票页读同一份活动信息与同一条更新时间线 —— 单一真相源，
// 发起人改一处，两边同时变。
import { type UpdateRow } from '@/db/se/data';
import { formatRange, formatStamp, mapLinks, type Place } from '@/db/se/view';

export type EventFacts = Place & {
  title: string;
  summary: string;
  startAt: string | null;
  endAt: string | null;
  timeNote: string;
  locationNote: string;
  deadlineAt: string | null;
};

export function EventFactsCard({ facts }: { facts: EventFacts }) {
  const when = formatRange(facts.startAt, facts.endAt, facts.timeNote || '时间待公布');
  const where = facts.locationName || facts.locationAddress || facts.locationNote || '地点待公布';
  const links = mapLinks(facts);
  return (
    <div className="se-card">
      <dl className="se-meta">
        <div>
          <dt>时间</dt>
          <dd>
            {when}
            {facts.timeNote && facts.startAt ? <small className="se-hint">{facts.timeNote}</small> : null}
          </dd>
        </div>
        <div>
          <dt>地点</dt>
          <dd>
            {where}
            {facts.locationAddress && facts.locationName ? (
              <small className="se-hint">{facts.locationAddress}</small>
            ) : null}
            {facts.locationNote ? <small className="se-hint">{facts.locationNote}</small> : null}
          </dd>
        </div>
      </dl>
      {links.length > 0 ? (
        <div className="se-btn-row" style={{ marginTop: 12 }}>
          {links.map((link) => (
            <a key={link.label} className="se-btn se-btn--sm se-btn--ghost" href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpdateTimeline({ updates, latestReadAt }: { updates: UpdateRow[]; latestReadAt?: number }) {
  if (updates.length === 0) return null;
  return (
    <div className="se-card">
      <h2 className="se-h2">活动同步更新</h2>
      <p className="se-muted" style={{ marginTop: -4, marginBottom: 12 }}>
        具体时间、地点、注意事项都会发在这里，这个链接随时打开都是最新的。
      </p>
      <ul className="se-timeline">
        {updates.map((update) => {
          const images: string[] = safeJson(update.image_keys);
          const isNew = latestReadAt ? Date.parse(update.created_at) > latestReadAt : false;
          return (
            <li key={update.id} className={isNew ? 'is-new' : undefined}>
              <time>
                {formatStamp(update.created_at)}
                {update.created_by_name ? ` · ${update.created_by_name}` : ''}
                {update.pinned ? ' · 置顶' : ''}
              </time>
              {update.body ? <p>{update.body}</p> : null}
              {update.location_name || update.location_address ? (
                <>
                  <p className="se-muted" style={{ margin: '0 0 6px' }}>
                    📍 {update.location_name}
                    {update.location_address ? ` · ${update.location_address}` : ''}
                  </p>
                  {/* 改了地点就要能直接导航，不要让人回到活动页找老地址 */}
                  <div className="se-btn-row" style={{ margin: '0 0 8px' }}>
                    {mapLinks({
                      locationName: update.location_name,
                      locationAddress: update.location_address,
                      locationLat: update.location_lat,
                      locationLng: update.location_lng,
                    }).map((link) => (
                      <a key={link.label} className="se-btn se-btn--sm se-btn--ghost" href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </>
              ) : null}
              {update.starts_at ? (
                <p className="se-muted" style={{ margin: '0 0 6px' }}>
                  🕘 {formatRange(update.starts_at, null, '')}
                </p>
              ) : null}
              {images.length > 0 ? (
                <div className="se-shots">
                  {images.map((key) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={key} src={`/f/${key}`} alt="活动更新图片" loading="lazy" />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function safeJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
