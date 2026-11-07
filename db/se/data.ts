// 活动报名的数据访问层。裸 D1 prepared statement，每个入口先 await ensureDatabase()。
//
// 隐私红线：任何会出现在报名者响应里的对象，一律经过 publicEvent() 过滤，
// 不带 signup_count / waitlist_count / 名单 / 渠道统计。满额只表达为布尔。
import { ensureDatabase, getD1 } from '../index';
import { getEnvValue, getMediaBucket } from '@/db/runtime';
import {
  hashToken,
  makeAdminToken,
  makeChannelCode,
  makeCheckinCode,
  makeEventCode,
  makeTicketToken,
  normalizeCode,
} from './codes';
import { DEFAULT_FORM_SCHEMA, normalizeFormSchema, parseFormSchema, type SeFormSchema } from './form';

// Beijing time (UTC+8) calendar date. Used for deadlines and day bucketing.
function chinaDate(daysFromToday = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + daysFromToday * 86400000);
  return date.toISOString().slice(0, 10);
}

export type EventRow = {
  id: string;
  code: string;
  title: string;
  summary: string;
  cover_key: string | null;
  start_at: string | null;
  end_at: string | null;
  time_note: string;
  location_name: string;
  location_address: string;
  location_lat: number | null;
  location_lng: number | null;
  location_note: string;
  capacity: number | null;
  signup_count: number;
  waitlist_count: number;
  deadline_at: string | null;
  need_review: number;
  allow_edit: number;
  max_per_phone: number;
  form_schema: string;
  status: 'draft' | 'open' | 'closed' | 'archived';
  owner_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminRow = {
  id: string;
  event_id: string;
  name: string;
  note: string;
  role: 'owner' | 'admin';
  token_hash: string;
  token_issued_at: string;
  token_revoked_at: string | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelRow = {
  id: string;
  event_id: string;
  code: string;
  name: string;
  type: 'admin' | 'poster' | 'partner';
  admin_id: string | null;
  enabled: number;
  visit_count: number;
  created_at: string;
};

export type RegistrationRow = {
  id: string;
  event_id: string;
  ticket_token_hash: string;
  checkin_code: string;
  name: string;
  phone: string;
  form_data: string;
  channel_code: string;
  channel_id: string | null;
  inviter_admin_id: string | null;
  inviter_name: string;
  status: 'pending' | 'confirmed' | 'waitlist' | 'rejected' | 'cancelled';
  review_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  request_id: string;
  created_at: string;
  updated_at: string;
};

export type UpdateRow = {
  id: string;
  event_id: string;
  body: string;
  image_keys: string;
  location_name: string;
  location_address: string;
  location_lat: number | null;
  location_lng: number | null;
  starts_at: string | null;
  pinned: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export class SeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value === '' || value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
}

// —— 活动 ————————————————————————————————————————————————————————

export async function getEventByCode(code: string): Promise<EventRow | null> {
  await ensureDatabase();
  const normalized = normalizeCode(code, 12);
  if (!normalized) return null;
  return getD1().prepare('SELECT * FROM se_events WHERE code = ?').bind(normalized).first<EventRow>();
}

export async function getEventById(id: string): Promise<EventRow | null> {
  await ensureDatabase();
  if (!id) return null;
  return getD1().prepare('SELECT * FROM se_events WHERE id = ?').bind(id).first<EventRow>();
}

export type OpenState = 'draft' | 'open' | 'full' | 'closed' | 'deadline';

// 报名者能看到的全部活动信息。**不含任何人数**：满额只表达为 state='full'。
export function publicEvent(event: EventRow) {
  const state = openState(event);
  return {
    code: event.code,
    title: event.title,
    summary: event.summary,
    coverKey: event.cover_key,
    startAt: event.start_at,
    endAt: event.end_at,
    timeNote: event.time_note,
    locationName: event.location_name,
    locationAddress: event.location_address,
    locationLat: event.location_lat,
    locationLng: event.location_lng,
    locationNote: event.location_note,
    deadlineAt: event.deadline_at,
    needReview: event.need_review === 1,
    state,
    canSignup: state === 'open' || state === 'full',
    waitlistOnly: state === 'full',
    schema: parseFormSchema(event.form_schema),
  };
}

export function openState(event: EventRow): OpenState {
  if (event.status === 'draft') return 'draft';
  if (event.status !== 'open') return 'closed';
  if (event.deadline_at && new Date(event.deadline_at).getTime() <= Date.now()) return 'deadline';
  if (event.capacity !== null && event.signup_count >= event.capacity) return 'full';
  return 'open';
}

export type EventInput = {
  title?: unknown;
  summary?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timeNote?: unknown;
  locationName?: unknown;
  locationAddress?: unknown;
  locationLat?: unknown;
  locationLng?: unknown;
  locationNote?: unknown;
  capacity?: unknown;
  deadlineAt?: unknown;
  needReview?: unknown;
  allowEdit?: unknown;
  coverKey?: unknown;
  status?: unknown;
  formSchema?: unknown;
};

function eventFields(input: EventInput) {
  const capacity = optionalNumber(input.capacity);
  return {
    title: text(input.title, 60),
    summary: text(input.summary, 2000),
    start_at: text(input.startAt, 40) || null,
    end_at: text(input.endAt, 40) || null,
    time_note: text(input.timeNote, 120),
    location_name: text(input.locationName, 80),
    location_address: text(input.locationAddress, 200),
    location_lat: optionalNumber(input.locationLat),
    location_lng: optionalNumber(input.locationLng),
    location_note: text(input.locationNote, 200),
    capacity: capacity === null ? null : Math.max(1, Math.min(100000, Math.round(capacity))),
    deadline_at: text(input.deadlineAt, 40) || null,
    need_review: input.needReview ? 1 : 0,
    allow_edit: input.allowEdit ? 1 : 0,
    cover_key: text(input.coverKey, 80) || null,
  };
}

async function uniqueEventCode(): Promise<string> {
  const db = getD1();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeEventCode();
    const clash = await db.prepare('SELECT id FROM se_events WHERE code = ?').bind(code).first();
    if (!clash) return code;
  }
  throw new SeError('CODE_EXHAUSTED', '活动码生成失败，请重试。');
}

// 建活动的同时建它的 owner 与 owner 渠道，并返回**只出现这一次**的管理链接令牌。
export async function createEvent(input: EventInput & { ownerName?: unknown }): Promise<{
  event: EventRow;
  ownerToken: string;
  ownerId: string;
}> {
  await ensureDatabase();
  const db = getD1();
  const fields = eventFields(input);
  if (!fields.title) throw new SeError('INVALID_INPUT', '请填写活动名称。');
  const stamp = nowIso();
  const id = uid('evt');
  const code = await uniqueEventCode();
  const schema: SeFormSchema = input.formSchema ? normalizeFormSchema(input.formSchema) : DEFAULT_FORM_SCHEMA;

  await db
    .prepare(
      `INSERT INTO se_events (id, code, title, summary, cover_key, start_at, end_at, time_note,
        location_name, location_address, location_lat, location_lng, location_note, capacity,
        signup_count, waitlist_count, deadline_at, need_review, allow_edit, max_per_phone,
        form_schema, status, owner_admin_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1, ?, 'draft', NULL, ?, ?)`,
    )
    .bind(
      id, code, fields.title, fields.summary, fields.cover_key, fields.start_at, fields.end_at, fields.time_note,
      fields.location_name, fields.location_address, fields.location_lat, fields.location_lng, fields.location_note,
      fields.capacity, fields.deadline_at, fields.need_review, fields.allow_edit,
      JSON.stringify(schema.fields), stamp, stamp,
    )
    .run();

  const owner = await createAdmin(id, { name: text(input.ownerName, 24) || '发起人', role: 'owner' });
  await db.prepare('UPDATE se_events SET owner_admin_id = ?, updated_at = ? WHERE id = ?').bind(owner.admin.id, stamp, id).run();
  const event = (await getEventById(id))!;
  return { event, ownerToken: owner.token, ownerId: owner.admin.id };
}

export async function updateEvent(eventId: string, input: EventInput): Promise<EventRow> {
  await ensureDatabase();
  const db = getD1();
  const current = await getEventById(eventId);
  if (!current) throw new SeError('NOT_FOUND', '活动不存在。');
  const fields = eventFields(input);
  if (!fields.title) throw new SeError('INVALID_INPUT', '请填写活动名称。');
  const status = ['draft', 'open', 'closed', 'archived'].includes(String(input.status))
    ? (String(input.status) as EventRow['status'])
    : current.status;
  const schema = input.formSchema === undefined ? null : normalizeFormSchema(input.formSchema);
  await db
    .prepare(
      `UPDATE se_events SET title=?, summary=?, cover_key=?, start_at=?, end_at=?, time_note=?,
        location_name=?, location_address=?, location_lat=?, location_lng=?, location_note=?,
        capacity=?, deadline_at=?, need_review=?, allow_edit=?, status=?,
        form_schema=COALESCE(?, form_schema), updated_at=? WHERE id=?`,
    )
    .bind(
      fields.title, fields.summary, fields.cover_key, fields.start_at, fields.end_at, fields.time_note,
      fields.location_name, fields.location_address, fields.location_lat, fields.location_lng, fields.location_note,
      fields.capacity, fields.deadline_at, fields.need_review, fields.allow_edit, status,
      schema ? JSON.stringify(schema.fields) : null, nowIso(), eventId,
    )
    .run();
  return (await getEventById(eventId))!;
}

export async function listEventsForOwner(adminId: string): Promise<EventRow[]> {
  await ensureDatabase();
  const response = await getD1()
    .prepare('SELECT * FROM se_events WHERE owner_admin_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(adminId)
    .all<EventRow>();
  return response.results ?? [];
}

// —— 管理员与渠道 ——————————————————————————————————————————————

async function uniqueChannelCode(eventId: string): Promise<string> {
  const db = getD1();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = makeChannelCode();
    const clash = await db.prepare('SELECT id FROM se_channels WHERE event_id = ? AND code = ?').bind(eventId, code).first();
    if (!clash) return code;
  }
  throw new SeError('CODE_EXHAUSTED', '渠道码生成失败，请重试。');
}

export async function createAdmin(
  eventId: string,
  input: { name: string; note?: string; role?: 'owner' | 'admin' },
): Promise<{ admin: AdminRow; channel: ChannelRow; token: string }> {
  await ensureDatabase();
  const db = getD1();
  const stamp = nowIso();
  const name = text(input.name, 24) || '管理员';
  const token = makeAdminToken();
  const adminId = uid('adm');
  const channelId = uid('ch');
  const code = await uniqueChannelCode(eventId);

  await db.batch([
    db
      .prepare(
        `INSERT INTO se_channels (id, event_id, code, name, type, admin_id, enabled, visit_count, created_at)
         VALUES (?, ?, ?, ?, 'admin', ?, 1, 0, ?)`,
      )
      .bind(channelId, eventId, code, name, adminId, stamp),
    db
      .prepare(
        `INSERT INTO se_admins (id, event_id, name, note, role, token_hash, token_issued_at,
          token_revoked_at, channel_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .bind(
        adminId, eventId, name, text(input.note, 60), input.role === 'owner' ? 'owner' : 'admin',
        hashToken(token, pepperFor()), stamp, channelId, stamp, stamp,
      ),
  ]);

  const admin = (await db.prepare('SELECT * FROM se_admins WHERE id = ?').bind(adminId).first<AdminRow>())!;
  const channel = (await db.prepare('SELECT * FROM se_channels WHERE id = ?').bind(channelId).first<ChannelRow>())!;
  return { admin, channel, token };
}

// data.ts 不直接 import auth.ts（auth 依赖 next/headers，批量脚本里用不了），
// 这里按同样的顺序读 env。
let cachedPepper: string | null = null;
function pepperFor(): string {
  if (cachedPepper) return cachedPepper;
  const value = getEnvValue('SIGNUP_PEPPER') || '';
  cachedPepper = value.length >= 16 ? value : 'se-dev-pepper-not-for-production';
  return cachedPepper;
}

export async function createChannel(
  eventId: string,
  input: { name: string; type?: 'poster' | 'partner' },
): Promise<ChannelRow> {
  await ensureDatabase();
  const db = getD1();
  const id = uid('ch');
  const code = await uniqueChannelCode(eventId);
  await db
    .prepare(
      `INSERT INTO se_channels (id, event_id, code, name, type, admin_id, enabled, visit_count, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 1, 0, ?)`,
    )
    .bind(id, eventId, code, text(input.name, 24) || '渠道', input.type === 'partner' ? 'partner' : 'poster', nowIso())
    .run();
  return (await db.prepare('SELECT * FROM se_channels WHERE id = ?').bind(id).first<ChannelRow>())!;
}

export async function findAdminByToken(token: string): Promise<AdminRow | null> {
  await ensureDatabase();
  const normalized = normalizeCode(token, 64);
  if (normalized.length < 16) return null;
  const row = await getD1()
    .prepare('SELECT * FROM se_admins WHERE token_hash = ?')
    .bind(hashToken(normalized, pepperFor()))
    .first<AdminRow>();
  if (!row || row.token_revoked_at) return null;
  return row;
}

export async function getAdmin(adminId: string): Promise<AdminRow | null> {
  await ensureDatabase();
  return getD1().prepare('SELECT * FROM se_admins WHERE id = ?').bind(adminId).first<AdminRow>();
}

export async function listAdmins(eventId: string): Promise<AdminRow[]> {
  await ensureDatabase();
  const response = await getD1()
    .prepare('SELECT * FROM se_admins WHERE event_id = ? ORDER BY role DESC, created_at ASC')
    .bind(eventId)
    .all<AdminRow>();
  return response.results ?? [];
}

export async function listChannels(eventId: string): Promise<ChannelRow[]> {
  await ensureDatabase();
  const response = await getD1()
    .prepare('SELECT * FROM se_channels WHERE event_id = ? ORDER BY created_at ASC')
    .bind(eventId)
    .all<ChannelRow>();
  return response.results ?? [];
}

export async function findChannel(eventId: string, code: string): Promise<ChannelRow | null> {
  await ensureDatabase();
  const normalized = normalizeCode(code, 8);
  if (!normalized) return null;
  return getD1()
    .prepare('SELECT * FROM se_channels WHERE event_id = ? AND code = ?')
    .bind(eventId, normalized)
    .first<ChannelRow>();
}

export async function bumpChannelVisit(eventId: string, code: string): Promise<void> {
  await ensureDatabase();
  await getD1()
    .prepare('UPDATE se_channels SET visit_count = visit_count + 1 WHERE event_id = ? AND code = ?')
    .bind(eventId, normalizeCode(code, 8))
    .run();
}

// 重发管理链接：旧链接立刻失效。误发到群里时就用这个。
export async function reissueAdminToken(adminId: string): Promise<string> {
  await ensureDatabase();
  const token = makeAdminToken();
  await getD1()
    .prepare('UPDATE se_admins SET token_hash = ?, token_issued_at = ?, token_revoked_at = NULL, updated_at = ? WHERE id = ?')
    .bind(hashToken(token, pepperFor()), nowIso(), nowIso(), adminId)
    .run();
  return token;
}

export async function revokeAdminToken(adminId: string): Promise<void> {
  await ensureDatabase();
  const stamp = nowIso();
  await getD1()
    .prepare('UPDATE se_admins SET token_revoked_at = ?, updated_at = ? WHERE id = ?')
    .bind(stamp, stamp, adminId)
    .run();
}

// —— 报名 ————————————————————————————————————————————————————————

export type SignupInput = {
  event: EventRow;
  name: string;
  phone: string;
  formData: Record<string, string>;
  channelCode: string;
  requestId: string;
};

export type SignupResult =
  | { kind: 'created'; registration: RegistrationRow; ticketToken: string }
  | { kind: 'repeat'; registration: RegistrationRow }
  | { kind: 'duplicate'; registration: RegistrationRow };

export async function submitSignup(input: SignupInput): Promise<SignupResult> {
  await ensureDatabase();
  const db = getD1();
  const { event } = input;
  const requestId = text(input.requestId, 80) || uid('req');

  // 幂等：双击提交 / 网络重试走同一个 requestId，直接回首次结果。
  const repeat = await db
    .prepare('SELECT * FROM se_registrations WHERE request_id = ?')
    .bind(requestId)
    .first<RegistrationRow>();
  if (repeat) return { kind: 'repeat', registration: repeat };

  // 同一活动同一手机号只报一次（取消/驳回后可再报）。
  const existing = await db
    .prepare(
      `SELECT * FROM se_registrations WHERE event_id = ? AND phone = ?
        AND status NOT IN ('cancelled', 'rejected') LIMIT 1`,
    )
    .bind(event.id, input.phone)
    .first<RegistrationRow>();
  if (existing) return { kind: 'duplicate', registration: existing };

  const channel = input.channelCode ? await findChannel(event.id, input.channelCode) : null;
  const inviter = channel?.admin_id ? await getAdmin(channel.admin_id) : null;

  // 名额：条件更新 + meta.changes 判定，D1 没有交互式事务。
  // 待审核也占位，否则审核通过时可能已经超额。
  let status: RegistrationRow['status'] = event.need_review === 1 ? 'pending' : 'confirmed';
  const stamp = nowIso();
  const seated = await db
    .prepare(
      `UPDATE se_events SET signup_count = signup_count + 1, updated_at = ?
        WHERE id = ? AND (capacity IS NULL OR signup_count < capacity)`,
    )
    .bind(stamp, event.id)
    .run();
  const tookSeat = (seated.meta?.changes ?? 0) === 1;
  if (!tookSeat) {
    status = 'waitlist';
    await db
      .prepare('UPDATE se_events SET waitlist_count = waitlist_count + 1, updated_at = ? WHERE id = ?')
      .bind(stamp, event.id)
      .run();
  }

  const id = uid('reg');
  const ticketToken = makeTicketToken();
  try {
    let inserted = false;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      try {
        await db
          .prepare(
            `INSERT INTO se_registrations (id, event_id, ticket_token_hash, checkin_code, name, phone,
              form_data, channel_code, channel_id, inviter_admin_id, inviter_name, status, review_note,
              reviewed_by, reviewed_at, checked_in_at, checked_in_by, request_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, NULL, NULL, ?, ?, ?)`,
          )
          .bind(
            id, event.id, hashToken(ticketToken, pepperFor()), makeCheckinCode(), input.name, input.phone,
            JSON.stringify(input.formData), channel?.code ?? '', channel?.id ?? null,
            inviter?.id ?? null, inviter?.name ?? '', status, requestId, stamp, stamp,
          )
          .run();
        inserted = true;
      } catch (error) {
        lastError = error;
        // 六位核销码撞号时换一个重试；其他唯一约束（手机号并发）直接抛出。
        if (!String((error as Error)?.message || '').includes('checkin_code')) throw error;
      }
    }
    if (!inserted) throw lastError ?? new SeError('INSERT_FAILED', '报名写入失败，请重试。');
  } catch (error) {
    // 补偿：座位已经占掉但人没进来，回退计数，不然名额会凭空少。
    if (tookSeat) {
      await db
        .prepare('UPDATE se_events SET signup_count = MAX(0, signup_count - 1), updated_at = ? WHERE id = ?')
        .bind(nowIso(), event.id)
        .run();
    } else {
      await db
        .prepare('UPDATE se_events SET waitlist_count = MAX(0, waitlist_count - 1), updated_at = ? WHERE id = ?')
        .bind(nowIso(), event.id)
        .run();
    }
    const message = String((error as Error)?.message || '');
    if (message.includes('idx_se_reg_phone')) {
      const row = await db
        .prepare(
          `SELECT * FROM se_registrations WHERE event_id = ? AND phone = ?
            AND status NOT IN ('cancelled', 'rejected') LIMIT 1`,
        )
        .bind(event.id, input.phone)
        .first<RegistrationRow>();
      if (row) return { kind: 'duplicate', registration: row };
    }
    throw error;
  }

  if (channel) await bumpChannelVisit(event.id, channel.code);
  const registration = (await db
    .prepare('SELECT * FROM se_registrations WHERE id = ?')
    .bind(id)
    .first<RegistrationRow>())!;
  return { kind: 'created', registration, ticketToken };
}

export async function findRegistrationByTicket(token: string): Promise<RegistrationRow | null> {
  await ensureDatabase();
  const normalized = normalizeCode(token, 64);
  if (normalized.length < 12) return null;
  return getD1()
    .prepare('SELECT * FROM se_registrations WHERE ticket_token_hash = ?')
    .bind(hashToken(normalized, pepperFor()))
    .first<RegistrationRow>();
}

export async function getRegistration(id: string): Promise<RegistrationRow | null> {
  await ensureDatabase();
  return getD1().prepare('SELECT * FROM se_registrations WHERE id = ?').bind(id).first<RegistrationRow>();
}

export type RosterFilter = {
  inviter?: string;
  status?: string;
  query?: string;
  checked?: 'in' | 'out';
  limit?: number;
  offset?: number;
};

export async function listRoster(eventId: string, filter: RosterFilter = {}) {
  await ensureDatabase();
  const where: string[] = ['event_id = ?'];
  const binds: unknown[] = [eventId];
  // 筛选键和 rosterStats 的 inviterId 对齐：管理员 id、'ch:<渠道码>'（没有专属
  // 管理员的海报/合作方渠道）、或 'none'（没带任何渠道码直接进来的）。
  if (filter.inviter === 'none') {
    where.push("inviter_admin_id IS NULL AND channel_code = ''");
  } else if (filter.inviter?.startsWith('ch:')) {
    where.push('channel_code = ? AND inviter_admin_id IS NULL');
    binds.push(filter.inviter.slice(3));
  } else if (filter.inviter) {
    where.push('inviter_admin_id = ?');
    binds.push(filter.inviter);
  }
  if (filter.status && filter.status !== 'all') {
    where.push('status = ?');
    binds.push(filter.status);
  }
  if (filter.checked === 'in') where.push('checked_in_at IS NOT NULL');
  if (filter.checked === 'out') where.push('checked_in_at IS NULL');
  if (filter.query) {
    where.push('(name LIKE ? OR phone LIKE ?)');
    const like = `%${filter.query.replace(/[%_]/g, '')}%`;
    binds.push(like, like);
  }
  const limit = Math.min(500, Math.max(1, filter.limit ?? 200));
  const offset = Math.max(0, filter.offset ?? 0);
  const response = await getD1()
    .prepare(`SELECT * FROM se_registrations WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<RegistrationRow>();
  return response.results ?? [];
}

export async function rosterStats(eventId: string) {
  await ensureDatabase();
  const db = getD1();
  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'waitlist' THEN 1 ELSE 0 END) AS waitlist,
        SUM(CASE WHEN status = 'cancelled' OR status = 'rejected' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checkedIn
       FROM se_registrations WHERE event_id = ?`,
    )
    .bind(eventId)
    .first<{ total: number; confirmed: number; pending: number; waitlist: number; dropped: number; checkedIn: number }>();
  // 分组键：有专属管理员的记管理员，没有的记渠道（海报/合作方），都没有才算直接进入。
  // 和 listRoster 的 inviter 筛选键一一对应。
  const byInviter = await db
    .prepare(
      `SELECT
        CASE
          WHEN r.inviter_admin_id IS NOT NULL THEN r.inviter_admin_id
          WHEN r.channel_code <> '' THEN 'ch:' || r.channel_code
          ELSE 'none'
        END AS inviterId,
        CASE
          WHEN r.inviter_admin_id IS NOT NULL THEN r.inviter_name
          WHEN r.channel_code <> '' THEN COALESCE(c.name, '渠道 ' || r.channel_code)
          ELSE '直接进入'
        END AS inviterName,
        COUNT(*) AS total,
        SUM(CASE WHEN r.status IN ('confirmed', 'pending') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN r.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checkedIn
       FROM se_registrations r
       LEFT JOIN se_channels c ON c.event_id = r.event_id AND c.code = r.channel_code
       WHERE r.event_id = ?
       GROUP BY inviterId, inviterName ORDER BY total DESC`,
    )
    .bind(eventId)
    .all<{ inviterId: string; inviterName: string; total: number; active: number; checkedIn: number }>();
  return {
    totals: totals ?? { total: 0, confirmed: 0, pending: 0, waitlist: 0, dropped: 0, checkedIn: 0 },
    byInviter: byInviter.results ?? [],
  };
}

// 按渠道码统计（含没有专属管理员的海报/合作方渠道），分享页用。
export async function channelStats(eventId: string) {
  await ensureDatabase();
  const response = await getD1()
    .prepare(
      `SELECT channel_code AS code,
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('confirmed', 'pending') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checkedIn
       FROM se_registrations WHERE event_id = ? GROUP BY channel_code`,
    )
    .bind(eventId)
    .all<{ code: string; total: number; active: number; checkedIn: number }>();
  const map = new Map<string, { total: number; active: number; checkedIn: number }>();
  for (const row of response.results ?? []) {
    map.set(row.code, { total: row.total, active: row.active, checkedIn: row.checkedIn });
  }
  return map;
}

export async function reviewRegistration(
  registrationId: string,
  action: 'approve' | 'reject',
  note: string,
  admin: AdminRow,
): Promise<RegistrationRow> {
  await ensureDatabase();
  const db = getD1();
  const row = await getRegistration(registrationId);
  if (!row || row.event_id !== admin.event_id) throw new SeError('NOT_FOUND', '报名记录不存在。');
  const stamp = nowIso();
  const status: RegistrationRow['status'] = action === 'approve' ? 'confirmed' : 'rejected';
  await db
    .prepare(
      `UPDATE se_registrations SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'waitlist', 'confirmed', 'rejected')`,
    )
    .bind(status, text(note, 200), admin.id, stamp, stamp, registrationId)
    .run();
  // 驳回把占位还回名额池；通过候补则补占一个位。
  if (action === 'reject' && (row.status === 'pending' || row.status === 'confirmed')) {
    await db
      .prepare('UPDATE se_events SET signup_count = MAX(0, signup_count - 1), updated_at = ? WHERE id = ?')
      .bind(stamp, row.event_id)
      .run();
  }
  if (action === 'approve' && row.status === 'waitlist') {
    await db
      .prepare(
        `UPDATE se_events SET signup_count = signup_count + 1,
          waitlist_count = MAX(0, waitlist_count - 1), updated_at = ? WHERE id = ?`,
      )
      .bind(stamp, row.event_id)
      .run();
  }
  await audit(admin, action === 'approve' ? 'registration.approve' : 'registration.reject', 'registration', registrationId, {
    from: row.status,
    note: text(note, 60),
  });
  return (await getRegistration(registrationId))!;
}

export async function reassignInviter(
  registrationId: string,
  inviterAdminId: string | null,
  admin: AdminRow,
): Promise<RegistrationRow> {
  await ensureDatabase();
  const db = getD1();
  const row = await getRegistration(registrationId);
  if (!row || row.event_id !== admin.event_id) throw new SeError('NOT_FOUND', '报名记录不存在。');
  const target = inviterAdminId ? await getAdmin(inviterAdminId) : null;
  if (inviterAdminId && (!target || target.event_id !== admin.event_id)) {
    throw new SeError('NOT_FOUND', '邀请人不存在。');
  }
  const stamp = nowIso();
  await db
    .prepare('UPDATE se_registrations SET inviter_admin_id = ?, inviter_name = ?, updated_at = ? WHERE id = ?')
    .bind(target?.id ?? null, target?.name ?? '', stamp, registrationId)
    .run();
  await audit(admin, 'registration.reassignInviter', 'registration', registrationId, {
    fromInviter: row.inviter_name || '直接进入',
    toInviter: target?.name ?? '直接进入',
  });
  return (await getRegistration(registrationId))!;
}

// —— 核销 ————————————————————————————————————————————————————————

export type CheckinOutcome = {
  result: 'ok' | 'duplicate' | 'invalid';
  message: string;
  registration: RegistrationRow | null;
  firstCheckedInBy?: string;
};

export async function checkIn(
  admin: AdminRow,
  lookup: { ticketToken?: string; checkinCode?: string; registrationId?: string },
): Promise<CheckinOutcome> {
  await ensureDatabase();
  const db = getD1();
  let row: RegistrationRow | null = null;
  if (lookup.ticketToken) row = await findRegistrationByTicket(lookup.ticketToken);
  else if (lookup.registrationId) row = await getRegistration(lookup.registrationId);
  else if (lookup.checkinCode) {
    row = await db
      .prepare('SELECT * FROM se_registrations WHERE event_id = ? AND checkin_code = ?')
      .bind(admin.event_id, normalizeCode(lookup.checkinCode, 8))
      .first<RegistrationRow>();
  }

  if (!row || row.event_id !== admin.event_id) {
    await logCheckin(admin, null, 'invalid', '票不存在或不属于本活动');
    return { result: 'invalid', message: '这张票不属于本活动，或链接已失效。', registration: null };
  }
  if (row.status !== 'confirmed') {
    const label = row.status === 'pending' ? '尚未通过审核' : row.status === 'waitlist' ? '仍在候补名单' : '报名已取消';
    await logCheckin(admin, row.id, 'invalid', label);
    return { result: 'invalid', message: `无法核销：${label}。`, registration: row };
  }

  const stamp = nowIso();
  const updated = await db
    .prepare(
      `UPDATE se_registrations SET checked_in_at = ?, checked_in_by = ?, updated_at = ?
        WHERE id = ? AND checked_in_at IS NULL`,
    )
    .bind(stamp, admin.id, stamp, row.id)
    .run();
  if ((updated.meta?.changes ?? 0) === 1) {
    await logCheckin(admin, row.id, 'ok', '');
    return { result: 'ok', message: '核销成功。', registration: (await getRegistration(row.id))! };
  }

  const operator = row.checked_in_by ? await getAdmin(row.checked_in_by) : null;
  await logCheckin(admin, row.id, 'duplicate', `首次核销 ${row.checked_in_at}`);
  return {
    result: 'duplicate',
    message: '这张票已经核销过了。',
    registration: row,
    firstCheckedInBy: operator?.name || '其他管理员',
  };
}

export async function listCheckinLogs(eventId: string, limit = 50) {
  await ensureDatabase();
  const response = await getD1()
    .prepare(
      `SELECT l.*, r.name AS registration_name, a.name AS admin_name
       FROM se_checkin_logs l
       LEFT JOIN se_registrations r ON r.id = l.registration_id
       LEFT JOIN se_admins a ON a.id = l.admin_id
       WHERE l.event_id = ? ORDER BY l.at DESC LIMIT ?`,
    )
    .bind(eventId, Math.min(200, limit))
    .all<{ id: string; result: string; detail: string; at: string; registration_name: string | null; admin_name: string | null }>();
  return response.results ?? [];
}

async function logCheckin(admin: AdminRow, registrationId: string | null, result: string, detail: string) {
  await getD1()
    .prepare(
      `INSERT INTO se_checkin_logs (id, event_id, registration_id, admin_id, result, detail, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(uid('ckl'), admin.event_id, registrationId, admin.id, result, text(detail, 120), nowIso())
    .run();
}

// —— 同步更新 ————————————————————————————————————————————————————

export async function listUpdates(eventId: string): Promise<UpdateRow[]> {
  await ensureDatabase();
  const response = await getD1()
    .prepare('SELECT * FROM se_updates WHERE event_id = ? ORDER BY pinned DESC, created_at DESC LIMIT 50')
    .bind(eventId)
    .all<UpdateRow>();
  return response.results ?? [];
}

export async function publishUpdate(
  admin: AdminRow,
  input: {
    body?: unknown;
    imageKeys?: unknown;
    locationName?: unknown;
    locationAddress?: unknown;
    locationLat?: unknown;
    locationLng?: unknown;
    startsAt?: unknown;
    pinned?: unknown;
  },
): Promise<UpdateRow> {
  await ensureDatabase();
  const db = getD1();
  const body = text(input.body, 2000);
  const images = (Array.isArray(input.imageKeys) ? input.imageKeys : [])
    .map((key) => text(key, 80))
    .filter(Boolean)
    .slice(0, 6);
  const locationName = text(input.locationName, 80);
  if (!body && images.length === 0 && !locationName) {
    throw new SeError('INVALID_INPUT', '更新内容不能为空。');
  }
  const id = uid('upd');
  await db
    .prepare(
      `INSERT INTO se_updates (id, event_id, body, image_keys, location_name, location_address,
        location_lat, location_lng, starts_at, pinned, created_by, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, admin.event_id, body, JSON.stringify(images), locationName, text(input.locationAddress, 200),
      optionalNumber(input.locationLat), optionalNumber(input.locationLng), text(input.startsAt, 40) || null,
      input.pinned ? 1 : 0, admin.id, admin.name, nowIso(),
    )
    .run();
  await audit(admin, 'update.publish', 'update', id, { hasImages: images.length, hasLocation: Boolean(locationName) });
  return (await db.prepare('SELECT * FROM se_updates WHERE id = ?').bind(id).first<UpdateRow>())!;
}

export async function deleteUpdate(admin: AdminRow, updateId: string): Promise<void> {
  await ensureDatabase();
  await getD1()
    .prepare('DELETE FROM se_updates WHERE id = ? AND event_id = ?')
    .bind(updateId, admin.event_id)
    .run();
  await audit(admin, 'update.delete', 'update', updateId, {});
}

// —— 图片 ————————————————————————————————————————————————————————

export const MAX_IMAGE_BYTES = 600 * 1024;

// Cloudflare 上有 SE_MEDIA 绑定就走 R2；Node 部署没有 R2，返回 null 走下面的 D1/SQLite 兜底。
const mediaBucket = getMediaBucket;

export async function putImage(
  admin: AdminRow,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<{ key: string }> {
  await ensureDatabase();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new SeError('TOO_LARGE', `图片请压缩到 ${Math.round(MAX_IMAGE_BYTES / 1024)}KB 以内。`);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    throw new SeError('BAD_TYPE', '只支持 JPG / PNG / WebP 图片。');
  }
  const id = uid('img');
  const bucket = mediaBucket();
  if (bucket) {
    await bucket.put(`${admin.event_id}/${id}`, bytes, { httpMetadata: { contentType } });
    await getD1()
      .prepare(
        `INSERT INTO se_files (id, event_id, content_type, size, storage, data, created_by, created_at)
         VALUES (?, ?, ?, ?, 'r2', NULL, ?, ?)`,
      )
      .bind(id, admin.event_id, contentType, bytes.byteLength, admin.id, nowIso())
      .run();
    return { key: id };
  }
  // 没开 R2 时的兜底：压缩后的图片直接进 D1。
  await getD1()
    .prepare(
      `INSERT INTO se_files (id, event_id, content_type, size, storage, data, created_by, created_at)
       VALUES (?, ?, ?, ?, 'd1', ?, ?, ?)`,
    )
    .bind(id, admin.event_id, contentType, bytes.byteLength, bytes, admin.id, nowIso())
    .run();
  return { key: id };
}

export async function readImage(
  key: string,
): Promise<{ body: ArrayBuffer | ReadableStream; contentType: string } | null> {
  await ensureDatabase();
  const row = await getD1()
    .prepare('SELECT * FROM se_files WHERE id = ?')
    .bind(text(key, 80))
    .first<{ id: string; event_id: string; content_type: string; storage: string; data: ArrayBuffer | null }>();
  if (!row) return null;
  if (row.storage === 'r2') {
    const bucket = mediaBucket();
    const object = bucket ? await bucket.get(`${row.event_id}/${row.id}`) : null;
    if (!object) return null;
    return { body: object.body, contentType: row.content_type };
  }
  if (!row.data) return null;
  return { body: row.data, contentType: row.content_type };
}

// —— 审计与限流 ————————————————————————————————————————————————

export async function audit(
  admin: AdminRow,
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await getD1()
    .prepare(
      `INSERT INTO se_audit_logs (id, event_id, admin_id, action, target_type, target_id, meta, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(uid('aud'), admin.event_id, admin.id, action, targetType, targetId, JSON.stringify(meta ?? {}), nowIso())
    .run();
}

export async function listAuditLogs(eventId: string, limit = 50) {
  await ensureDatabase();
  const response = await getD1()
    .prepare(
      `SELECT l.*, a.name AS admin_name FROM se_audit_logs l
       LEFT JOIN se_admins a ON a.id = l.admin_id
       WHERE l.event_id = ? ORDER BY l.at DESC LIMIT ?`,
    )
    .bind(eventId, Math.min(200, limit))
    .all<{ id: string; action: string; target_type: string; meta: string; at: string; admin_name: string | null }>();
  return response.results ?? [];
}

// 公开提交的限流。固定窗口足够挡住脚本连刷，不需要上 KV。
export async function hitRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  await ensureDatabase();
  const db = getD1();
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM se_rate_limits WHERE key = ?')
    .bind(key)
    .first<{ key: string; window_start: string; count: number }>();
  const windowStart = row ? new Date(row.window_start).getTime() : 0;
  if (!row || now - windowStart > windowMs) {
    await db
      .prepare(
        `INSERT INTO se_rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
      )
      .bind(key, new Date(now).toISOString())
      .run();
    return false;
  }
  if (row.count >= limit) return true;
  await db.prepare('UPDATE se_rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return false;
}

// 报名者换了手机、cookie 没了、门票链接丢了 —— 只能由管理员按手机号找到人，
// 重新签一张票。旧链接当场失效，所以这个动作要留痕。
export async function reissueTicketToken(registrationId: string, admin: AdminRow): Promise<string> {
  await ensureDatabase();
  const row = await getRegistration(registrationId);
  if (!row || row.event_id !== admin.event_id) throw new SeError('NOT_FOUND', '报名记录不存在。');
  const token = makeTicketToken();
  await getD1()
    .prepare('UPDATE se_registrations SET ticket_token_hash = ?, updated_at = ? WHERE id = ?')
    .bind(hashToken(token, pepperFor()), nowIso(), registrationId)
    .run();
  await audit(admin, 'registration.reissueTicket', 'registration', registrationId, { name: row.name });
  return token;
}

export function parseFormSchemaFor(event: EventRow): SeFormSchema {
  return parseFormSchema(event.form_schema);
}

export { chinaDate };
