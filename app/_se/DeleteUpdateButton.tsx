'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteUpdateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    if (!window.confirm('删掉这条更新？报名者那边会同时消失。')) return;
    setBusy(true);
    try {
      await fetch(`/api/se/updates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="se-btn se-btn--sm se-btn--ghost" type="button" onClick={remove} disabled={busy}>
      删除
    </button>
  );
}
