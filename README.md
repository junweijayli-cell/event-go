# 活动报名 / event-go

一套报名表单，任意多个渠道二维码，扫哪个码进来就自动把邀请人记成谁。报名者看不到别人的信息，
也看不到已报名人数。活动时间地点还没定也能先开报名，定了再发同步更新。现场所有管理员都能用
微信扫一扫核销任意门票。

参照微信小程序「接龙管家」的活动报名，补上了它做不到的四件事：

| | 接龙管家 | 这套 |
|---|---|---|
| 报名者能看到已报名的人和人数 | 能看到 | **看不到** |
| 活动信息报名后再更新 | 不行 | **可以**（文字 / 地点定位 / 图片，随时补发） |
| 多个渠道码自动绑定邀请人 | 没有 | **有**，一套表单下发任意多个渠道码 |
| 谁能核销门票 | 只有创建者 | **所有管理员**都能核销所有人的票 |

## 三类链接，别发错

| 链接 | 形如 | 谁拿 | 能做什么 |
|---|---|---|---|
| 报名链接 | `/e/<活动码>?c=<渠道码>` | 随便转发 | 看活动、报名；进来即绑定这条渠道的邀请人 |
| 门票链接 | `/t/<门票令牌>` | 报名者本人 | 看自己的报名、入场二维码、活动最新信息 |
| 管理链接 | `/m/<管理令牌>` | **只能私发给本人** | 看全部名单、按邀请人筛选、发更新、核销 |

管理令牌等同于密码：谁拿到谁就能管理这个活动。误发到群里就去「分享与链接」页点「重发管理链接」，
旧链接当场失效。令牌在库里只存 `sha256(令牌 + SIGNUP_PEPPER)`，明文只在生成那一次显示，丢了只能重发。

## 办一场活动

1. `/manage/setup` 建活动（要输部署时设的 `SE_SETUP_TOKEN`）→ **立刻存好管理链接**。
2. 「设置」填时间地点名额。时间还没定就在「时间说明」里写「具体时间活动前 3 天在本页公布」，
   然后点「开放报名」。
3. 「分享与链接」→ 批量生成：一行一个名字，20 个管理员就粘 20 行。每人得到**一条公开报名链接
   + 二维码 + 现成分享文案**，外加**一条私有管理链接**。海报、合作方这类没有专人的渠道选
   「无主渠道」，只给报名链接不给管理权限。
4. 管理链接逐个私发给本人。各管理员进自己的后台，首页第一屏就是「我的专属报名链接」，只发这一条。
   要印海报就用「二维码总表」那页直接打印（A4 每行 4 个，码下面标着是谁的）。
5. 活动前 3 天，「同步更新」发一条：具体时间、地点（可以当场用「用我当前位置」取坐标）、图片。
   所有报名者打开自己那条门票链接就能看到最新的。
6. 现场核销：管理员用微信「扫一扫」扫报名者门票上的二维码就能核销，或在「核销」页手输 6 位核销码，
   或在名单里点「手动核销」。重复核销会提示首次核销时间和操作人。
7. 「名单」页按邀请人筛选、搜姓名手机号、导出 CSV（Excel 双击能开，中文不乱码）。

## 隐私是怎么保证的

- 报名者能看到的接口只返回活动展示字段和一个状态（报名中 / 已满额 / 已截止），
  **不返回任何计数、名单、渠道统计**。满额只表达为「已满额，可报候补」。
- 人数只存在 `se_events.signup_count`，只有管理端读得到。
- 门票号和 6 位核销码都是随机的、**不连号** —— 连号本身就能反推出已报名人数。
- 没有管理会话时打开核销页 `/v/<令牌>`，一个字的个人信息都不给。
- 全站 `noindex`：门票链接和管理链接不会被搜索引擎收录。
- 发链接、重发/收回管理权限、审核、改邀请人、重发门票、改设置，全部写入 `se_audit_logs`。

## 本地跑

```bash
npm install
cp .dev.vars.example .dev.vars    # 按里面的说明改掉两个密钥
npm run dev
```

打开 `http://localhost:3000/manage/setup`，用 `.dev.vars` 里的 `SE_SETUP_TOKEN` 建第一个活动。

## 部署

代码支持两种部署形态，业务代码一行不变 —— 平台差异全部关在 `db/runtime.ts`（Cloudflare）和
`db/runtime.node.ts`（Node）里，构建时二选一：

| | 构建 | 运行 | 存储 |
|---|---|---|---|
| Cloudflare Workers | `npm run build` | Workers | D1（+可选 R2） |
| 国内主机自托管 | `npm run build:node` | `node dist/standalone/server.js` | node:sqlite 文件 |

同一套 54 项验收脚本在两种部署上都是全过。

### Cloudflare Workers

```bash
npx wrangler login
npx wrangler d1 create event-go          # 把打印出的 database_id 填进 wrangler.jsonc
npx wrangler secret put SIGNUP_PEPPER    # 至少 32 位随机串
npx wrangler secret put SE_SETUP_TOKEN   # 你自己的初始化口令
npm run deploy
```

绑了自有域名后再设一个，否则二维码里印的会是 `workers.dev` 的地址：

```bash
npx wrangler secret put SE_PUBLIC_ORIGIN   # 例如 https://events.example.com
```

表会在第一次请求时自动建好（`db/index.ts` 的 `initializeSchema()`，权威 DDL 在 `db/se/sql.ts`），
不需要手动跑迁移。图片默认存 D1；在 Cloudflare 开通 R2 后把 `wrangler.jsonc` 里那段
`SE_MEDIA` 绑定取消注释就会自动改走 R2，已存在 D1 的旧图继续可读。

### 国内主机

**`workers.dev` 这个域名在国内经常打不开，正式活动不要用它。** 怎么选路、要不要备案、
国内主机怎么部署，写在 [docs/DEPLOY_CN.md](docs/DEPLOY_CN.md)。systemd 与 nginx 的配置样例在
[`deploy/`](deploy)，每日备份用 `npm run backup`（`VACUUM INTO` 快照，正在有人报名时也能安全备份）。

要点：选**有持久磁盘**的机器（轻量应用服务器这类），不要用无状态容器 —— SQLite 文件会随容器销毁。

## 两件要记住的事

1. **`SIGNUP_PEPPER` 定好就别改，迁数据时必须原样搬过去。** 管理链接和门票链接在库里只存加了
   pepper 的哈希，换 pepper 等于把所有管理员和所有报名者的链接一次性作废。
2. **域名要在印海报、发渠道码之前定死。** 二维码里是绝对地址，换域名等于全部作废。

## 关于「同步更新」的一句实话

网页版没有微信服务通知，**发更新不会主动推送**。报名者是靠打开自己的门票链接看到更新的。
所以重要变更建议同时在群里说一句「活动安排已更新，点你那条报名/门票链接看」。
报名成功页和门票页都在引导报名者保存这条链接。

## 验证

```bash
npm run test:se      # 38 项纯逻辑单元测试：归因、令牌与签名、表单校验、时间口径、CSV
npm run typecheck
npm run lint
```

全流程验收（先 `npm run dev`）：

```bash
node tests/se/flow.mjs http://localhost:3000 dev-setup-token
```

建活动 → 生成 20 条渠道 → 扫 A 码再扫 B 码验证邀请人记成 B → 名额与候补 →
14 个并发提交不超卖也不丢名额 → 发同步更新并在门票页查到 → 任意管理员核销与重复核销 →
按邀请人筛选导出 → 隐私红线（活动页、门票页、核销页、名单页都不泄露他人信息与人数）。

> 对着生产地址跑会**建一个测试活动并灌进二十多条假报名**，所以要么在正式对外之前跑，
> 要么跑完把那个测试活动归档。

## 代码在哪

```
db/runtime.ts      平台适配：Cloudflare（D1 / R2 / 绑定）
db/runtime.node.ts 平台适配：Node（node:sqlite / process.env），构建时二选一
db/index.ts        建表入口 ensureDatabase()
db/se/             sql.ts(权威 DDL) schema.ts(drizzle 对齐) codes.ts form.ts attribution.ts
                   csv.ts view.ts qrcode.ts auth.ts guard.ts data.ts
app/e/[code]/      活动页、报名表单
app/t/[token]/     门票页（+ /ics 日历）
app/v/[token]/     扫码核销落地页
app/m/[token]/     管理链接入口（换 cookie 后 302）
app/manage/        后台：概览、名单、分享与链接、二维码总表、同步更新、核销、设置
app/api/se/        setup events admins registrations signups checkin updates uploads export qr track
app/_se/           客户端组件与共用展示块
```

更细的产品说明在 [docs/EVENT_SIGNUP.md](docs/EVENT_SIGNUP.md)。
