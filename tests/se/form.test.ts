import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FORM_SCHEMA,
  MAX_FIELDS,
  describeSubmission,
  normalizeFormSchema,
  normalizePhone,
  parseFormSchema,
  validateSubmission,
  type SeFormSchema,
} from '../../db/se/form.ts';

function schema(fields: unknown): SeFormSchema {
  return normalizeFormSchema(fields);
}

test('清洗字段定义：丢掉没名字的、重名的、占用内置键的', () => {
  const result = schema([
    { key: 'city', label: '城市', type: 'text' },
    { key: 'city', label: '重复的城市', type: 'text' },
    { key: 'name', label: '想顶掉内置姓名', type: 'text' },
    { key: 'phone', label: '想顶掉内置手机', type: 'text' },
    { key: 'nolabel', label: '   ', type: 'text' },
    { key: '', label: '没有键', type: 'text' },
  ]);
  assert.deepEqual(result.fields.map((field) => field.key), ['city']);
});

test('单选多选必须带选项，类型不认识的退回单行文字', () => {
  const result = schema([
    { key: 'meal', label: '餐食', type: 'radio', options: [] },
    { key: 'meal2', label: '餐食', type: 'radio', options: ['荤', '素', '素'] },
    { key: 'weird', label: '奇怪类型', type: 'rocket' },
  ]);
  assert.deepEqual(result.fields.map((field) => field.key), ['meal2', 'weird']);
  assert.deepEqual(result.fields[0].options, ['荤', '素']);
  assert.equal(result.fields[1].type, 'text');
});

test('字段数量与键名格式有上限', () => {
  const many = Array.from({ length: MAX_FIELDS + 10 }, (_, index) => ({
    key: `f${index}`,
    label: `字段${index}`,
    type: 'text',
  }));
  assert.equal(schema(many).fields.length, MAX_FIELDS);
  assert.equal(schema([{ key: 'A b-c!', label: '清洗键', type: 'text' }]).fields[0].key, 'abc');
});

test('parseFormSchema 面对坏 JSON 不炸', () => {
  assert.deepEqual(parseFormSchema('[}').fields, []);
  assert.deepEqual(parseFormSchema('').fields, []);
  assert.deepEqual(parseFormSchema(null).fields, []);
  assert.equal(parseFormSchema(JSON.stringify(DEFAULT_FORM_SCHEMA.fields)).fields.length, 2);
});

test('姓名手机号是硬门槛', () => {
  const empty = schema([]);
  assert.deepEqual(validateSubmission(empty, { phone: '13812345678' }), { ok: false, error: '请填写姓名。' });
  assert.equal(validateSubmission(empty, { name: '张三', phone: '12345' }).ok, false);
  assert.equal(validateSubmission(empty, { name: '张三', phone: '23812345678' }).ok, false);
  assert.equal(validateSubmission(empty, { name: '张三', phone: '13812345678' }).ok, true);
});

test('手机号里的空格与横线会被吃掉', () => {
  assert.equal(normalizePhone(' 138-1234 5678 '), '13812345678');
  const result = validateSubmission(schema([]), { name: '张三', phone: '138 1234 5678' });
  assert.equal(result.ok && result.phone, '13812345678');
});

test('必填与选项校验', () => {
  const withFields = schema([
    { key: 'city', label: '城市', type: 'text', required: true, max: 10 },
    { key: 'meal', label: '餐食', type: 'radio', required: true, options: ['荤', '素'] },
    { key: 'tags', label: '兴趣', type: 'checkbox', required: false, options: ['读书', '运动'] },
    { key: 'num', label: '同行人数', type: 'number', required: false, min: 1, max: 5 },
    { key: 'day', label: '到达日期', type: 'date', required: false },
  ]);
  const base = { name: '张三', phone: '13812345678' };

  assert.deepEqual(validateSubmission(withFields, base), { ok: false, error: '请填写城市。' });
  assert.deepEqual(validateSubmission(withFields, { ...base, city: '上海' }), { ok: false, error: '请选择餐食。' });
  assert.equal(
    validateSubmission(withFields, { ...base, city: '上海', meal: '随便' }).ok,
    false,
    '不在选项里的单选值必须拒绝',
  );
  assert.equal(validateSubmission(withFields, { ...base, city: '上'.repeat(11), meal: '荤' }).ok, false);
  assert.equal(validateSubmission(withFields, { ...base, city: '上海', meal: '荤', num: '9' }).ok, false);
  assert.equal(validateSubmission(withFields, { ...base, city: '上海', meal: '荤', day: '11/15' }).ok, false);

  const good = validateSubmission(withFields, {
    ...base,
    city: '上海',
    meal: '荤',
    tags: ['读书', '不存在的选项'],
    num: '2',
    day: '2026-11-15',
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.deepEqual(good.formData, { city: '上海', meal: '荤', tags: '读书', num: '2', day: '2026-11-15' });
  }
});

test('describeSubmission 只列填过的字段，顺序跟表单一致', () => {
  const withFields = schema([
    { key: 'city', label: '城市', type: 'text' },
    { key: 'note', label: '备注', type: 'textarea' },
  ]);
  assert.deepEqual(describeSubmission(withFields, { note: '素食', city: '' }), [{ label: '备注', value: '素食' }]);
});
