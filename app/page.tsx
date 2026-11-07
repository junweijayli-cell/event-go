import type { Metadata } from 'next';
import Link from 'next/link';
import './se.css';

export const metadata: Metadata = {
  title: { absolute: '活动报名' },
  description: '一套报名表单，多个渠道码，自动记录邀请人，现场扫码核销。',
};

// 首页只给办活动的人看。报名者永远是从 /e/<活动码> 那条链接进来的，不会经过这里。
export default function Home() {
  return (
    <main className="se-page">
      <p className="se-eyebrow">活动报名</p>
      <h1 className="se-title">一套表单，多个渠道码，自动记上邀请人</h1>
      <p className="se-muted">
        报名者看不到别人的信息，也看不到已报名人数。活动时间地点没定也能先开报名，
        定了再发同步更新，报名者打开自己那条链接就能看到最新的。现场用微信扫一扫核销门票。
      </p>

      <div className="se-card">
        <h2 className="se-h2">三类链接，别发错</h2>
        <ul className="se-list">
          <li>
            <b>报名链接</b> <code>/e/活动码?c=渠道码</code>
            <p className="se-hint">可以随便转发。扫不同的渠道码进来，邀请人自动记成不同的人。</p>
          </li>
          <li>
            <b>门票链接</b> <code>/t/门票令牌</code>
            <p className="se-hint">报名成功后发给报名者本人，里面是入场二维码和活动最新信息。</p>
          </li>
          <li>
            <b>管理链接</b> <code>/m/管理令牌</code>
            <p className="se-hint">
              等同于密码，<b>只能私发给本人</b>。拿到的人能看全部名单、发更新、核销。
            </p>
          </li>
        </ul>
      </div>

      <div className="se-btn-row">
        <Link className="se-btn se-btn--primary" href="/manage/setup">
          创建活动
        </Link>
      </div>
      <p className="se-hint">
        创建需要初始化口令（部署时设的 <code>SE_SETUP_TOKEN</code>）。
        已经建过活动的，直接打开自己那条管理链接。
      </p>
    </main>
  );
}
