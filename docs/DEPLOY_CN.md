# 国内访问方案

活动报名的链接要在微信里被几百号人点开。现在部署在 Cloudflare Workers 的
`*.workers.dev` 上，这个域名在国内经常解析不到或被重置 —— 正式活动用它会出事。

代码这边已经做完了：`npm run build:node` 能产出一份不依赖 Cloudflare 的
standalone Node 服务（存储用 Node 内置的 SQLite），**同一套验收脚本在两种部署上都是
54 项全过**。剩下的是选路和备案，那部分需要你决定。

## 三条路

| | 现在（workers.dev） | Cloudflare + 自有域名 | 国内主机 + 备案域名 |
|---|---|---|---|
| 国内可达性 | 差，经常打不开 | 中等，能开但偶尔慢/抖 | 好，和普通国内网站一样 |
| 要备案吗 | 不要 | **不要**（服务器在境外） | **要**，没有就上不了 |
| 多久能用 | 已经在用 | 半小时 | 域名备案 2–4 周 |
| 成本 | 免费 | 域名年费 | 域名年费 + 轻量服务器（百元/月量级，以控制台为准） |
| 代码改动 | — | 无，设个 `SE_PUBLIC_ORIGIN` | 无，`npm run build:node` |

## 建议：两步走，别等

**第一步，今天就做（半小时）。** 买个域名挂到 Cloudflare，把活动链接换成自有域名。
`workers.dev` 这个后缀本身在国内被污染得最厉害，换成自有域名立刻好一截，而且**不需要备案**
（服务器在境外）。做完记得设 `SE_PUBLIC_ORIGIN=https://你的域名`，否则二维码里印的还是旧地址。

**第二步，同时去备案（2–4 周）。** 备案下来之前第一步先顶着；下来之后切到国内主机，
那才是正式活动该用的状态。备案要国内主体 + 在哪家云买服务器就在哪家备案，个人主体可以办
非经营性网站。各省审核时长不一样，提前一个月启动。

## 为什么不是别的方案

- **腾讯云 CloudBase 默认域名**（`*.app.tcloudbase.com`）：官方明确只给开发测试用，有访问
  频率限制，浏览器直接打开还会先过一个安全提示中间页。正式入口不能用它，生产仍要求绑
  已备案的自定义域名 —— 所以它绕不开备案。
- **Cloudflare 中国网络**：要企业版套餐 + 国内合作伙伴接入，而且照样要备案，对这个规模不现实。
- **境内境外双线同时跑**：两边各一个数据库，名单会分裂成两份，核销时现场对不上。真要双线，
  必须共用一个数据库，那数据库放哪边，另一边就慢。**不建议**，老老实实以国内那套为唯一生产环境，
  Cloudflare 那套留作开发预览。

## 国内主机怎么部署

机器选**轻量应用服务器这类有持久磁盘的**，不要用无状态容器平台（云托管、函数计算）：
报名数据存在 SQLite 文件里，容器重建就没了。要用容器就得额外挂 CFS 文件存储，不值当。
这套东西的数据量是几千条报名，一台 2核2G 绰绰有余。

两种构建共用 `dist/`，后跑的那次会清掉前一次的产物，所以部署前跟哪边就先跑哪个 build。

```bash
# 1. 本地打包
npm run build:node                      # 产出 dist/standalone/

# 2. 传到服务器（dist/standalone 整个目录）
rsync -av dist/standalone/ root@你的服务器:/opt/signup/

# 3. 服务器上装 Node 24（node:sqlite 是内置的，不需要编译任何原生模块）
curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && yum install -y nodejs
#   Debian/Ubuntu: curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt install -y nodejs

# 4. 建用户和数据目录
useradd -r -s /sbin/nologin signup
mkdir -p /var/lib/signup && chown signup:signup /var/lib/signup

# 5. 写密钥（权限 600）
cat > /etc/signup.env <<'EOF'
SIGNUP_PEPPER=换成至少32位的随机串
SE_SETUP_TOKEN=换成你自己的初始化口令
SE_PUBLIC_ORIGIN=https://events.你的域名
SE_SQLITE_PATH=/var/lib/signup/signup.sqlite
EOF
chmod 600 /etc/signup.env

# 6. 开机自启
cp deploy/signup.service /etc/systemd/system/ && systemctl enable --now signup

# 7. nginx + 证书（配置样例在 deploy/nginx-signup.conf）
cp deploy/nginx-signup.conf /etc/nginx/conf.d/signup.conf && nginx -t && systemctl reload nginx

# 8. 每天备份（VACUUM INTO 快照，正在报名时也能安全备份）
echo '0 3 * * * cd /opt/signup && SE_SQLITE_PATH=/var/lib/signup/signup.sqlite /usr/bin/node scripts/backup-sqlite.mjs /var/lib/signup/backups' | crontab -u signup -
```

部署完先用一个测试活动走一遍：建活动 → 生成两条渠道链接 → 用手机在微信里分别扫 → 报名 →
发一条同步更新 → 用微信扫一扫核销。这一圈跑通了再对外发。

## 迁数据时最容易踩的坑

如果 Cloudflare 那边已经有真实报名数据要搬到国内：

1. **`SIGNUP_PEPPER` 必须原样搬过去。** 管理链接令牌和门票令牌在库里只存
   `sha256(令牌 + pepper)`，换了 pepper 等于把所有管理员的管理链接和所有报名者的门票链接
   一次性作废，只能挨个重发。
2. 导出导入：
   ```bash
   npx wrangler d1 export event-go --remote --output=d1.sql
   sqlite3 /var/lib/signup/signup.sqlite < d1.sql     # 只导 se_ 开头的表即可
   ```
3. 切域名之后，**旧域名上已经发出去的二维码和链接会失效**。所以域名要在印海报、发链接之前定死。
   没定之前先别大批量发码。

## 微信里的几个注意点

- **必须 https**：会话 cookie 带 `Secure`，http 下管理链接会反复掉线。
- 分享卡片取页面 title 和首图，所以活动一定要设封面图。
- 链接被微信拦了多半不是因为没备案，而是被投诉或命中诱导分享词。文案里别写"转发领取""助力"之类。
- 已备案 + https + 自有域名，是出问题时唯一能申诉的组合。

## 验收

生产地址部署完可以跑脚本冒烟，但注意**它会建一个测试活动并灌进二十多条假报名**，
所以要么在正式对外之前跑，要么跑完把那个测试活动归档：

```bash
node tests/se/flow.mjs https://events.你的域名 你的初始化口令
```
