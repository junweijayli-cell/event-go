// 活动报名模块的 drizzle 表定义（se_ 前缀），由 db/schema.ts re-export。
//
// 权威 DDL 在 db/se/sql.ts —— 本工程靠 db/index.ts 的 initializeSchema() 在运行期
// 建表，drizzle 迁移不会自动 apply。这里的定义用于类型与 drizzle-kit 的对齐，两处
// 必须同步修改。se_registrations 还有一个「同一活动同一手机号只报一次、取消或驳回
// 后可再报」的部分唯一索引，drizzle builder 表达不便，只写在 sql.ts。
import { blob, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const seEvents = sqliteTable('se_events', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  coverKey: text('cover_key'),
  startAt: text('start_at'),
  endAt: text('end_at'),
  timeNote: text('time_note').notNull().default(''),
  locationName: text('location_name').notNull().default(''),
  locationAddress: text('location_address').notNull().default(''),
  locationLat: real('location_lat'),
  locationLng: real('location_lng'),
  locationNote: text('location_note').notNull().default(''),
  capacity: integer('capacity'),
  signupCount: integer('signup_count').notNull().default(0),
  waitlistCount: integer('waitlist_count').notNull().default(0),
  deadlineAt: text('deadline_at'),
  needReview: integer('need_review', { mode: 'boolean' }).notNull().default(false),
  allowEdit: integer('allow_edit', { mode: 'boolean' }).notNull().default(false),
  maxPerPhone: integer('max_per_phone').notNull().default(1),
  formSchema: text('form_schema').notNull(),
  status: text('status', { enum: ['draft', 'open', 'closed', 'archived'] }).notNull().default('draft'),
  ownerAdminId: text('owner_admin_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_se_events_code').on(table.code),
]);

export const seAdmins = sqliteTable('se_admins', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  name: text('name').notNull(),
  // 发起人生成链接时替他起的名；本人认领后 name 换成自己填的，这个留着好对账。
  invitedName: text('invited_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  note: text('note').notNull().default(''),
  role: text('role', { enum: ['owner', 'admin'] }).notNull().default('admin'),
  tokenHash: text('token_hash').notNull(),
  tokenIssuedAt: text('token_issued_at').notNull(),
  tokenRevokedAt: text('token_revoked_at'),
  // 本人第一次打开管理链接、填完自己信息的时间。为空表示链接还没被人认领。
  claimedAt: text('claimed_at'),
  channelId: text('channel_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_se_admins_token').on(table.tokenHash),
  index('idx_se_admins_event').on(table.eventId, table.createdAt),
]);

export const seChannels = sqliteTable('se_channels', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['admin', 'poster', 'partner'] }).notNull().default('admin'),
  adminId: text('admin_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  visitCount: integer('visit_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_se_channels_code').on(table.eventId, table.code),
  index('idx_se_channels_admin').on(table.eventId, table.adminId),
]);

export const seRegistrations = sqliteTable('se_registrations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  ticketTokenHash: text('ticket_token_hash').notNull(),
  checkinCode: text('checkin_code').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  formData: text('form_data').notNull().default('{}'),
  channelCode: text('channel_code').notNull().default(''),
  channelId: text('channel_id'),
  inviterAdminId: text('inviter_admin_id'),
  inviterName: text('inviter_name').notNull().default(''),
  status: text('status', {
    enum: ['pending', 'confirmed', 'waitlist', 'rejected', 'cancelled'],
  }).notNull().default('confirmed'),
  reviewNote: text('review_note').notNull().default(''),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  checkedInAt: text('checked_in_at'),
  checkedInBy: text('checked_in_by'),
  requestId: text('request_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_se_reg_ticket').on(table.ticketTokenHash),
  uniqueIndex('idx_se_reg_checkin_code').on(table.eventId, table.checkinCode),
  uniqueIndex('idx_se_reg_request').on(table.requestId),
  index('idx_se_reg_event_status').on(table.eventId, table.status, table.createdAt),
  index('idx_se_reg_inviter').on(table.eventId, table.inviterAdminId),
]);

export const seUpdates = sqliteTable('se_updates', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  body: text('body').notNull().default(''),
  imageKeys: text('image_keys').notNull().default('[]'),
  locationName: text('location_name').notNull().default(''),
  locationAddress: text('location_address').notNull().default(''),
  locationLat: real('location_lat'),
  locationLng: real('location_lng'),
  startsAt: text('starts_at'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdByName: text('created_by_name').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_se_updates_event').on(table.eventId, table.createdAt),
]);

export const seFiles = sqliteTable('se_files', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull().default(0),
  storage: text('storage', { enum: ['d1', 'r2'] }).notNull().default('d1'),
  data: blob('data'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_se_files_event').on(table.eventId, table.createdAt),
]);

export const seCheckinLogs = sqliteTable('se_checkin_logs', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  registrationId: text('registration_id'),
  adminId: text('admin_id').notNull(),
  result: text('result', { enum: ['ok', 'duplicate', 'invalid'] }).notNull(),
  detail: text('detail').notNull().default(''),
  at: text('at').notNull(),
}, (table) => [
  index('idx_se_checkin_event').on(table.eventId, table.at),
]);

export const seAuditLogs = sqliteTable('se_audit_logs', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull(),
  adminId: text('admin_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull().default(''),
  targetId: text('target_id').notNull().default(''),
  meta: text('meta').notNull().default('{}'),
  at: text('at').notNull(),
}, (table) => [
  index('idx_se_audit_event').on(table.eventId, table.at),
]);

export const seRateLimits = sqliteTable('se_rate_limits', {
  key: text('key').primaryKey(),
  windowStart: text('window_start').notNull(),
  count: integer('count').notNull().default(0),
});
