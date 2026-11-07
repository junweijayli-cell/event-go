# 活动报名（H5 网页版）

参照接龙管家的「活动报名」，但补上了它做不到的四件事：报名者看不到他人信息与已报名人数；
活动信息可持续同步更新（文字 / 地点定位 / 图片）；一套报名表单下发任意多个渠道码并自动绑定邀请人；
所有管理员都能扫码核销任意门票。

工程是 Next.js 16 + vinext，默认部署到 Cloudflare Workers + D1，也能构建成独立的 Node 服务
（存储换成 node:sqlite）自托管。数据表统一 `se_` 前缀，接口在 `/api/se/*`，页面在 `/e /t /v /m /manage`。

## 三类链接，别发错

| 链接 | 形如 | 谁拿 | 能做什么 |
|---|---|---|---|
| 报名链接 | `/e/<活动码>?c=<渠道码>` | 随便转发 | 看活动、报名；进来即绑定这条渠道的邀请人 |
| 门票链接 | `/t/<门票令牌>` | 报名者本人 | 看自己的报名、入场二维码、活动最新信息 |
| 管理链接 | `/m/<管理令牌>` | **只能私发给本人** | 看全部名单、按邀请人筛选、发更新、核销 |

管理令牌等同于密码：谁拿到谁就能管理这个活动。误发到群里就去「分享与链接」页点「重发管理链接」，旧链接当场失效。
令牌在库里只存 `sha256(令牌 + SIGNUP_PEPPER)`，明文只在生成那一次显示，丢了只能重发。

## 本地跑

```bash
npm run dev
```

首次使用打开 `http://localhost:3000/manage/setup`，用 `.dev.vars` 里的 `SE_SETUP_TOKEN` 建第一个活动。
建完立刻把管理链接存下来。

## 部署

国内访问是这套东西上线前最大的坎，单独写在 [DEPLOY_CN.md](./DEPLOY_CN.md)：
为什么 `workers.dev` 不能用、备案要多久、国内主机怎么部署。
代码已经支持两种部署形态：

| | 构建 | 运行 | 存储 |
|---|---|---|---|
| Cloudflare Workers | `npm run build` | Workers | D1（+可选 R2） |
| 国内主机自托管 | `npm run build:node` | `node dist/standalone/server.js` | node:sqlite 文件 |

平台差异全部关在 `db/runtime.ts`（Cloudflare）和 `db/runtime.node.ts`（Node）里，
业务代码一行不变，验收脚本在两边都是 54 项全过。

### Cloudflare

1. 设两个 secret（**`SIGNUP_PEPPER` 一旦更换，所有管理链接、门票链接、会话全部失效**，上线前定好就别再动）：
   ```bash
   npx wrangler secret put SIGNUP_PEPPER
   npx wrangler secret put SE_SETUP_TOKEN
   ```
2. 绑了自有域名后再设一个，否则二维码里印的会是 `workers.dev` 的地址：
   ```bash
   npx wrangler secret put SE_PUBLIC_ORIGIN   # 例如 https://events.example.com
   ```
3. 表会在第一次请求时由 `db/index.ts` 的 `initializeSchema()` 自动建好，不需要手动跑迁移。
4. 图片（活动封面、更新配图）默认存 D1。要走 R2 就在 `wrangler.jsonc` 加一个叫 `SE_MEDIA` 的 bucket 绑定，
   代码会自动改走 R2，已存在 D1 的旧图继续可读。

### 国内主机

详见 [DEPLOY_CN.md](./DEPLOY_CN.md)。要点：选有持久磁盘的机器（轻量应用服务器这类），
不要用无状态容器 —— SQLite 文件会随容器销毁。systemd 与 nginx 的配置样例在
`deploy/`，每日备份用 `node scripts/backup-sqlite.mjs`。

## 办一场活动的流程

1. `/manage/setup` 建活动 → 存好管理链接。
2. 「设置」里填时间地点名额；时间还没定就在「时间说明」里写「具体时间活动前 3 天在本页公布」，然后点「开放报名」。
3. 「分享与链接」→ 批量生成：一行一个名字，20 个管理员就粘 20 行。每人得到
   **一条公开报名链接 + 二维码 + 现成分享文案**，外加**一条私有管理链接**。
   海报、合作方这类没有专人的渠道选「无主渠道」，只给报名链接不给管理权限。
4. 把管理链接逐个私发给本人。各管理员进自己的后台，首页第一屏就是「我的专属报名链接」，只发这一条。
   要印海报就用「二维码总表」那页直接打印（A4 每行 4 个，码下面标着是谁的）。
5. 活动前 3 天，「同步更新」发一条：具体时间、地点（可以当场用「用我当前位置」取坐标）、图片。
   所有报名者打开自己那条门票链接就能看到最新的。
6. 现场核销：管理员用微信「扫一扫」扫报名者门票上的二维码就能核销，或在「核销」页手输 6 位核销码，
   或在名单里点「手动核销」。重复核销会提示首次核销时间和操作人。
7. 「名单」页按邀请人筛选、搜姓名手机号、导出 CSV（Excel 双击能开，中文不乱码）。

## 关于「同步更新」的一句实话

网页版没有微信服务通知，**发更新不会主动推送**。报名者是靠打开自己的门票链接看到更新的。
所以重要变更建议同时在群里说一句「活动安排已更新，点你那条报名/门票链接看」。
报名成功页和门票页都在引导报名者保存这条链接。

## 隐私是怎么保证的

- 报名者能看到的接口只返回活动展示字段和一个状态（报名中 / 已满额 / 已截止），
  **不返回任何计数、名单、渠道统计**。满额只表达为「已满额，可报候补」。
- 人数只存在 `se_events.signup_count`，只有管理端读得到。
- 门票号和 6 位核销码都是随机的、**不连号** —— 连号本身就能反推出已报名人数。
- 没有管理会话时打开核销页 `/v/<令牌>`，一个字的个人信息都不给。
- 发链接、重发/收回管理权限、审核、改邀请人、重发门票、改设置，全部写入 `se_audit_logs`。

## 几个说明

- **邀请人归因**：最后一次扫码为准，提交那一刻生效，之后锁定。URL 上的 `?c=` 优先，没有才回落到
  上一次扫码写下的 cookie（7 天窗口）。发起人可以在名单里手动改邀请人，会留痕。
- **名额**：待审核也占名额，驳回会把名额还回去。满额后仍可提交，但进候补；发起人可在名单里把候补转正式。
- **一个手机号一场活动只能报一次**（取消或驳回后可再报）。这也是找回门票的依据。
- **门票链接丢了**：同一浏览器有 cookie 能自动回到；换了设备只能请管理员在名单里按手机号找到人，
  点「重发门票链接」拿一条新的（旧的当场失效）。
- **iOS 微信里调不了摄像头**，所以核销的主路径是「微信扫一扫打开核销网址」，不是页面内扫码。
  页面内的连续扫码只在支持 BarcodeDetector 的浏览器（Android Chrome、桌面 Chrome）上可用。

## 验证

```bash
npm run test:se
```

纯逻辑单元测试：归因规则、令牌与签名、表单校验、时间口径、CSV 导出。

```bash
node tests/se/flow.mjs http://localhost:3000 dev-setup-token
```

全流程验收（需要先 `npm run dev`）：建活动 → 生成 20 条渠道 → 扫 A 码再扫 B 码验证邀请人记成 B →
名额与候补 → 14 个并发提交不超卖也不丢名额 → 发同步更新并在门票页查到 → 任意管理员核销与重复核销 →
按邀请人筛选导出 → 隐私红线（活动页、门票页、核销页、名单页都不泄露他人信息与人数）。

## 代码在哪

```
db/runtime.ts     平台适配：Cloudflare（D1 / R2 / 绑定）
db/runtime.node.ts 平台适配：Node（node:sqlite / process.env），构建时二选一
db/se/            sql.ts(权威 DDL) schema.ts(drizzle 对齐) codes.ts form.ts attribution.ts
                  csv.ts view.ts qrcode.ts auth.ts guard.ts data.ts
app/e/[code]/     活动页、报名表单
app/t/[token]/    门票页（+ /ics 日历）
app/v/[token]/    扫码核销落地页
app/m/[token]/    管理链接入口（换 cookie 后 302）
app/manage/       后台：概览、名单、分享与链接、二维码总表、同步更新、核销、设置
app/api/se/       setup events admins registrations signups checkin updates uploads export qr track
app/_se/          客户端组件与共用展示块
```

纯函数（`codes / form / attribution / csv / view`）不依赖 Workers 运行时，可以直接用 `node --test` 跑。
