'use client';

export function PrintButton({ label = '打印这一页' }: { label?: string }) {
  return (
    <button className="se-btn se-btn--sm se-btn--primary" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
