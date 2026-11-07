import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '@/app/se.css';
import { SetupForm } from '@/app/_se/SetupForm';
import { currentAdmin } from '@/db/se/guard';

export const metadata: Metadata = { title: '新建活动' };

export default async function NewEventPage() {
  const admin = await currentAdmin();
  if (!admin || admin.role !== 'owner') redirect('/manage/locked?reason=need-owner');
  return (
    <main className="se-page">
      <p className="se-eyebrow">新建</p>
      <h1 className="se-title">再开一个活动</h1>
      <p className="se-muted">
        每个活动独立：独立的报名表单、独立的管理员与渠道码、独立的名单。新活动会给你一条新的管理链接，
        当前这个活动的链接仍然有效。
      </p>
      <SetupForm needToken={false} />
    </main>
  );
}
