'use client';

import { useState } from 'react';

// 微信内置浏览器里 navigator.clipboard 不总是可用（非 https、旧版 iOS），
// 所以留了 textarea + execCommand 的老路；两条都失败时把文本摆出来让用户长按复制。
export function CopyButton({
  text,
  label = '复制链接',
  className = 'se-btn se-btn--sm',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'done' | 'manual'>('idle');

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setState('done');
        setTimeout(() => setState('idle'), 1800);
        return;
      }
      throw new Error('no clipboard api');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand?.('copy');
      document.body.removeChild(area);
      setState(ok ? 'done' : 'manual');
      if (ok) setTimeout(() => setState('idle'), 1800);
    }
  }

  return (
    <>
      <button className={className} type="button" onClick={copy}>
        {state === 'done' ? '已复制' : label}
      </button>
      {state === 'manual' ? (
        <p className="se-hint" style={{ wordBreak: 'break-all' }}>
          复制失败，请长按选中下面这段自行复制：
          <br />
          {text}
        </p>
      ) : null}
    </>
  );
}
