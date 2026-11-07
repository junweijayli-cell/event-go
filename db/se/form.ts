// 报名表单引擎：schema 定义、清洗与提交校验。纯函数，可 node --test 直接跑。
//
// 姓名与手机号是内置字段（单列存储，手机号还要做同活动去重与找回门票），
// schema 只描述额外字段。

export type SeFieldType = 'text' | 'textarea' | 'number' | 'radio' | 'checkbox' | 'date';

export type SeField = {
  key: string;
  label: string;
  type: SeFieldType;
  required: boolean;
  options: string[];
  max: number;
  min: number;
  placeholder: string;
};

export type SeFormSchema = { fields: SeField[] };

export const FIELD_TYPES: SeFieldType[] = ['text', 'textarea', 'number', 'radio', 'checkbox', 'date'];
export const RESERVED_FIELD_KEYS = ['name', 'phone'];
export const MAX_FIELDS = 20;
export const MAX_OPTIONS = 20;
// 国内手机号。活动面向国内社群，宽松到"7 位以上数字"只会让名单里混进打不通的号码。
export const PHONE_PATTERN = /^1[3-9]\d{9}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FORM_SCHEMA: SeFormSchema = {
  fields: [
    { key: 'companions', label: '同行人数（含自己）', type: 'number', required: false, options: [], min: 1, max: 10, placeholder: '' },
    { key: 'note', label: '备注', type: 'textarea', required: false, options: [], min: 0, max: 200, placeholder: '想对主办方说的话' },
  ],
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function fieldKey(value: unknown): string {
  return text(value, 24).toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function normalizeFormSchema(raw: unknown): SeFormSchema {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { fields?: unknown })?.fields) ? (raw as { fields: unknown[] }).fields : [];
  const seen = new Set<string>(RESERVED_FIELD_KEYS);
  const fields: SeField[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const key = fieldKey(source.key);
    const label = text(source.label, 40);
    if (!key || !label || seen.has(key)) continue;
    const type = FIELD_TYPES.includes(source.type as SeFieldType) ? (source.type as SeFieldType) : 'text';
    const options = (Array.isArray(source.options) ? source.options : [])
      .map((option) => text(option, 40))
      .filter((option, index, all) => option && all.indexOf(option) === index)
      .slice(0, MAX_OPTIONS);
    if ((type === 'radio' || type === 'checkbox') && options.length < 1) continue;
    const maxRaw = Number(source.max);
    const minRaw = Number(source.min);
    const fallbackMax = type === 'textarea' ? 300 : type === 'number' ? 1000 : 60;
    fields.push({
      key,
      label,
      type,
      required: source.required === true,
      options,
      min: Number.isFinite(minRaw) ? minRaw : 0,
      max: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : fallbackMax,
      placeholder: text(source.placeholder, 40),
    });
    seen.add(key);
    if (fields.length >= MAX_FIELDS) break;
  }
  return { fields };
}

export function parseFormSchema(json: unknown): SeFormSchema {
  if (typeof json !== 'string' || !json.trim()) return { fields: [] };
  try {
    return normalizeFormSchema(JSON.parse(json));
  } catch {
    return { fields: [] };
  }
}

export function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\s\-()]/g, '').trim() : '';
}

export type SubmissionOk = {
  ok: true;
  name: string;
  phone: string;
  formData: Record<string, string>;
};
export type SubmissionError = { ok: false; error: string };

export function validateSubmission(schema: SeFormSchema, raw: unknown): SubmissionOk | SubmissionError {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = text(body.name, 24);
  if (name.length < 1) return { ok: false, error: '请填写姓名。' };
  const phone = normalizePhone(body.phone);
  if (!PHONE_PATTERN.test(phone)) return { ok: false, error: '请填写正确的 11 位手机号。' };

  const source = (body.formData && typeof body.formData === 'object' ? body.formData : body) as Record<string, unknown>;
  const formData: Record<string, string> = {};
  for (const field of schema.fields) {
    const value = source[field.key];
    if (field.type === 'checkbox') {
      const picked = (Array.isArray(value) ? value : typeof value === 'string' ? value.split('、') : [])
        .map((item) => text(item, 40))
        .filter((item) => field.options.includes(item));
      if (field.required && picked.length === 0) return { ok: false, error: `请选择${field.label}。` };
      if (picked.length) formData[field.key] = picked.join('、');
      continue;
    }
    const entered = text(value, field.max + 1);
    if (!entered) {
      if (field.required) {
        const verb = field.type === 'radio' || field.type === 'date' ? '请选择' : '请填写';
        return { ok: false, error: `${verb}${field.label}。` };
      }
      continue;
    }
    if (field.type === 'radio') {
      if (!field.options.includes(entered)) return { ok: false, error: `${field.label}的选项不正确。` };
      formData[field.key] = entered;
      continue;
    }
    if (field.type === 'number') {
      const parsed = Number(entered);
      if (!Number.isFinite(parsed)) return { ok: false, error: `${field.label}请填数字。` };
      if (parsed < field.min || parsed > field.max) {
        return { ok: false, error: `${field.label}请填 ${field.min}–${field.max} 之间的数字。` };
      }
      formData[field.key] = String(parsed);
      continue;
    }
    if (field.type === 'date') {
      if (!DATE_PATTERN.test(entered)) return { ok: false, error: `${field.label}请选择日期。` };
      formData[field.key] = entered;
      continue;
    }
    if (entered.length > field.max) return { ok: false, error: `${field.label}最多 ${field.max} 个字。` };
    formData[field.key] = entered;
  }
  return { ok: true, name, phone, formData };
}

export function describeSubmission(schema: SeFormSchema, formData: Record<string, string>) {
  return schema.fields
    .filter((field) => formData[field.key])
    .map((field) => ({ label: field.label, value: formData[field.key] }));
}
