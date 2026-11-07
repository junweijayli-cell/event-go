'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SeField, SeFieldType } from '@/db/se/form';

type Props = {
  initial: {
    title: string;
    summary: string;
    startAt: string;
    endAt: string;
    timeNote: string;
    locationName: string;
    locationAddress: string;
    locationLat: string;
    locationLng: string;
    locationNote: string;
    capacity: string;
    deadlineAt: string;
    needReview: boolean;
    status: string;
    coverKey: string;
    fields: SeField[];
  };
};

const TYPE_LABELS: { value: SeFieldType; label: string }[] = [
  { value: 'text', label: '单行文字' },
  { value: 'textarea', label: '多行文字' },
  { value: 'number', label: '数字' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'date', label: '日期' },
];

export function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [fields, setFields] = useState<SeField[]>(initial.fields);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function set<K extends keyof Props['initial']>(key: K, value: Props['initial'][K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function patchField(index: number, patch: Partial<SeField>) {
    setFields((previous) => previous.map((field, position) => (position === index ? { ...field, ...patch } : field)));
  }

  function addField() {
    setFields((previous) => [
      ...previous,
      {
        key: `f${Date.now().toString(36).slice(-4)}`,
        label: '',
        type: 'text',
        required: false,
        options: [],
        min: 0,
        max: 60,
        placeholder: '',
      },
    ]);
  }

  async function save(extra: Record<string, unknown> = {}) {
    setBusy('save');
    setError('');
    setSaved('');
    try {
      const response = await fetch('/api/se/events', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          capacity: form.capacity === '' ? null : form.capacity,
          formSchema: fields.filter((field) => field.label.trim()),
          ...extra,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; status?: string };
      if (!response.ok || !payload.ok) setError(payload.error || '保存失败。');
      else {
        setSaved('已保存');
        if (payload.status) set('status', payload.status);
        router.refresh();
      }
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setBusy('');
  }

  async function uploadCover(file: File | null) {
    if (!file) return;
    setBusy('cover');
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob) throw new Error('图片压缩失败');
      const response = await fetch('/api/se/uploads', {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        body: blob,
      });
      const payload = (await response.json()) as { ok?: boolean; key?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.key) setError(payload.error || '封面上传失败。');
      else {
        set('coverKey', payload.key);
        await save({ coverKey: payload.key });
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '封面处理失败。');
    }
    setBusy('');
  }

  return (
    <>
      <div className="se-card">
        <h2 className="se-h2">报名状态</h2>
        <p className="se-muted" style={{ marginTop: -4 }}>
          当前：{form.status === 'open' ? '报名中' : form.status === 'draft' ? '未发布（只有管理员能看）' : '已关闭'}
        </p>
        <div className="se-btn-row" style={{ marginTop: 10 }}>
          <button
            className={`se-btn se-btn--sm ${form.status === 'open' ? '' : 'se-btn--primary'}`}
            type="button"
            disabled={busy !== '' || form.status === 'open'}
            onClick={() => save({ status: 'open' })}
          >
            开放报名
          </button>
          <button
            className="se-btn se-btn--sm se-btn--ghost"
            type="button"
            disabled={busy !== '' || form.status === 'closed'}
            onClick={() => save({ status: 'closed' })}
          >
            关闭报名
          </button>
          {form.status !== 'draft' ? (
            <button
              className="se-btn se-btn--sm se-btn--ghost"
              type="button"
              disabled={busy !== ''}
              onClick={() => save({ status: 'draft' })}
            >
              转为未发布
            </button>
          ) : null}
        </div>
      </div>

      <div className="se-card">
        <h2 className="se-h2">活动信息</h2>
        <label className="se-field">
          <span>活动名称 <em>*</em></span>
          <input className="se-input" maxLength={60} value={form.title} onChange={(event) => set('title', event.target.value)} />
        </label>
        <label className="se-field">
          <span>活动介绍</span>
          <textarea className="se-textarea" rows={5} maxLength={2000} value={form.summary} onChange={(event) => set('summary', event.target.value)} />
        </label>
        <div className="se-field">
          <span>封面图</span>
          {form.coverKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="se-cover" src={`/f/${form.coverKey}`} alt="活动封面" style={{ marginBottom: 8 }} />
          ) : null}
          <input className="se-input" type="file" accept="image/*" disabled={busy === 'cover'} onChange={(event) => uploadCover(event.target.files?.[0] ?? null)} />
          <p className="se-hint">微信转发卡片会取这张图，建议 16:9。</p>
        </div>
        <label className="se-field">
          <span>开始时间</span>
          <input className="se-input" type="datetime-local" value={form.startAt} onChange={(event) => set('startAt', event.target.value)} />
        </label>
        <label className="se-field">
          <span>结束时间</span>
          <input className="se-input" type="datetime-local" value={form.endAt} onChange={(event) => set('endAt', event.target.value)} />
        </label>
        <label className="se-field">
          <span>时间说明</span>
          <input
            className="se-input"
            maxLength={120}
            placeholder="例如：具体时间活动前 3 天在本页公布"
            value={form.timeNote}
            onChange={(event) => set('timeNote', event.target.value)}
          />
          <p className="se-hint">时间还没定时就留这句话，定了再填上面的开始时间，或者直接发一条「同步更新」。</p>
        </label>
      </div>

      <div className="se-card">
        <h2 className="se-h2">地点</h2>
        <label className="se-field">
          <span>地点名称</span>
          <input className="se-input" maxLength={80} value={form.locationName} onChange={(event) => set('locationName', event.target.value)} />
        </label>
        <label className="se-field">
          <span>详细地址</span>
          <input className="se-input" maxLength={200} value={form.locationAddress} onChange={(event) => set('locationAddress', event.target.value)} />
        </label>
        <div className="se-field">
          <span>经纬度（可选，填了报名者能一键导航）</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="se-input" placeholder="纬度" value={form.locationLat} onChange={(event) => set('locationLat', event.target.value)} />
            <input className="se-input" placeholder="经度" value={form.locationLng} onChange={(event) => set('locationLng', event.target.value)} />
          </div>
        </div>
        <label className="se-field">
          <span>到场提示</span>
          <input
            className="se-input"
            maxLength={200}
            placeholder="例如：地铁 2 号线 A 口出，步行 300 米"
            value={form.locationNote}
            onChange={(event) => set('locationNote', event.target.value)}
          />
        </label>
      </div>

      <div className="se-card">
        <h2 className="se-h2">名额与审核</h2>
        <label className="se-field">
          <span>名额上限</span>
          <input
            className="se-input"
            inputMode="numeric"
            placeholder="留空＝不限"
            value={form.capacity}
            onChange={(event) => set('capacity', event.target.value.replace(/\D/g, ''))}
          />
          <p className="se-hint">满额后仍可报名，但会进候补队列，报名者看到的是「已满额，可报候补」，看不到具体人数。</p>
        </label>
        <label className="se-field">
          <span>报名截止</span>
          <input className="se-input" type="datetime-local" value={form.deadlineAt} onChange={(event) => set('deadlineAt', event.target.value)} />
        </label>
        <label className="se-option">
          <input type="checkbox" checked={form.needReview} onChange={(event) => set('needReview', event.target.checked)} />
          <span>报名需审核，通过后才出门票二维码</span>
        </label>
      </div>

      <div className="se-card">
        <h2 className="se-h2">报名表单</h2>
        <p className="se-muted" style={{ marginTop: -4 }}>
          姓名和手机号是固定字段（手机号用于同活动去重与找回门票）。下面是额外字段。
        </p>
        <ul className="se-list" style={{ margin: '12px 0' }}>
          <li className="se-row">
            <div>
              <b>姓名</b>
              <small>固定 · 必填</small>
            </div>
          </li>
          <li className="se-row">
            <div>
              <b>手机号</b>
              <small>固定 · 必填 · 校验 11 位</small>
            </div>
          </li>
        </ul>
        {fields.map((field, index) => (
          <div key={field.key} className="se-card se-card--tight se-card--flat">
            <label className="se-field">
              <span>字段名称</span>
              <input
                className="se-input"
                maxLength={40}
                value={field.label}
                onChange={(event) => patchField(index, { label: event.target.value })}
              />
            </label>
            <div className="se-field">
              <span>类型</span>
              <select
                className="se-select"
                value={field.type}
                onChange={(event) => patchField(index, { type: event.target.value as SeFieldType })}
              >
                {TYPE_LABELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            {field.type === 'radio' || field.type === 'checkbox' ? (
              <label className="se-field">
                <span>选项（用顿号或逗号分隔）</span>
                <input
                  className="se-input"
                  value={field.options.join('、')}
                  onChange={(event) =>
                    patchField(index, {
                      options: event.target.value
                        .split(/[、,，]/)
                        .map((option) => option.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            ) : null}
            <div className="se-btn-row">
              <label className="se-option" style={{ flex: 1 }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => patchField(index, { required: event.target.checked })}
                />
                <span>必填</span>
              </label>
              <button
                className="se-btn se-btn--sm se-btn--ghost"
                type="button"
                onClick={() => setFields((previous) => previous.filter((_, position) => position !== index))}
              >
                删除字段
              </button>
            </div>
          </div>
        ))}
        <button className="se-btn se-btn--sm" type="button" onClick={addField}>
          加一个字段
        </button>
        <p className="se-hint">
          改字段只影响之后的报名；已经提交的记录按当时的字段保存，导出时仍然看得到。
        </p>
      </div>

      {error ? (
        <div className="se-note se-note--danger">
          <span>{error}</span>
        </div>
      ) : null}
      {saved ? (
        <div className="se-note se-note--ok">
          <span>{saved}</span>
        </div>
      ) : null}

      <button className="se-btn se-btn--primary" type="button" onClick={() => save()} disabled={busy !== ''}>
        {busy === 'save' ? '保存中…' : '保存设置'}
      </button>
    </>
  );
}
