'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { SeField } from '@/db/se/form';

type Props = {
  eventCode: string;
  channelCode: string;
  fields: SeField[];
  waitlistOnly: boolean;
  needReview: boolean;
};

export function SignupForm({ eventCode, channelCode, fields, waitlistOnly, needReview }: Props) {
  const router = useRouter();
  // 一次报名动作一个 requestId：双击、断网重试都走同一个，服务端据此去重。
  const requestId = useRef<string>(`sg-${crypto.randomUUID()}`);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(key: string, value: string | string[]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function toggle(key: string, option: string) {
    const current = Array.isArray(values[key]) ? (values[key] as string[]) : [];
    set(key, current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/se/signups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventCode,
          channelCode,
          requestId: requestId.current,
          name: values.name ?? '',
          phone: values.phone ?? '',
          formData: Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ''])),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; path?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.path) {
        setError(payload.error || '提交失败，请稍后重试。');
        setSaving(false);
        return;
      }
      router.replace(payload.path);
    } catch {
      setError('网络不稳，请检查连接后重试。');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="se-field">
        <span>
          姓名 <em>*</em>
        </span>
        <input
          className="se-input"
          name="name"
          autoComplete="name"
          maxLength={24}
          required
          value={(values.name as string) ?? ''}
          onChange={(changeEvent) => set('name', changeEvent.target.value)}
        />
      </label>

      <label className="se-field">
        <span>
          手机号 <em>*</em>
        </span>
        <input
          className="se-input"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={11}
          required
          value={(values.phone as string) ?? ''}
          onChange={(changeEvent) => set('phone', changeEvent.target.value.replace(/\D/g, ''))}
        />
        <p className="se-hint">用于主办方联系你，也是找回门票的唯一凭证。</p>
      </label>

      {fields.map((field) => {
        const value = values[field.key];
        if (field.type === 'radio' || field.type === 'checkbox') {
          const picked = Array.isArray(value) ? value : value ? [String(value)] : [];
          return (
            <div className="se-field" key={field.key}>
              <span>
                {field.label} {field.required ? <em>*</em> : null}
              </span>
              <div className="se-options">
                {field.options.map((option) => (
                  <label className="se-option" key={option}>
                    <input
                      type={field.type === 'radio' ? 'radio' : 'checkbox'}
                      name={field.key}
                      checked={picked.includes(option)}
                      onChange={() => (field.type === 'radio' ? set(field.key, option) : toggle(field.key, option))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        }
        return (
          <label className="se-field" key={field.key}>
            <span>
              {field.label} {field.required ? <em>*</em> : null}
            </span>
            {field.type === 'textarea' ? (
              <textarea
                className="se-textarea"
                maxLength={field.max}
                placeholder={field.placeholder}
                required={field.required}
                value={(value as string) ?? ''}
                onChange={(changeEvent) => set(field.key, changeEvent.target.value)}
              />
            ) : (
              <input
                className="se-input"
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                min={field.type === 'number' ? field.min : undefined}
                max={field.type === 'number' ? field.max : undefined}
                maxLength={field.type === 'text' ? field.max : undefined}
                placeholder={field.placeholder}
                required={field.required}
                value={(value as string) ?? ''}
                onChange={(changeEvent) => set(field.key, changeEvent.target.value)}
              />
            )}
          </label>
        );
      })}

      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      ) : null}

      <button className="se-btn se-btn--primary" type="submit" disabled={saving}>
        {saving ? '提交中…' : waitlistOnly ? '提交候补报名' : '提交报名'}
      </button>
      <p className="se-hint" style={{ textAlign: 'center' }}>
        {needReview ? '提交后由主办方审核，通过后才会生成入场二维码。' : '提交后立即生成入场二维码。'}
      </p>
    </form>
  );
}
