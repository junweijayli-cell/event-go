// 活动报名全流程验收脚本（跑在真实运行的服务上，不是单元测试）。
//
// 用法：
//   1) 另开一个终端：npm run dev
//   2) node tests/se/flow.mjs [baseUrl] [setupToken]
//      默认 http://localhost:3000 和 .dev.vars 里的 dev-setup-token
//
// 它按需求逐条验：隐私（看不到他人信息与人数）、最后一次扫码归因、名额与候补、
// 并发不超卖、审核出票、同步更新可查阅、全员可核销与重复核销、按邀请人筛选、导出。

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const SETUP_TOKEN = process.argv[3] || 'dev-setup-token';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n== ${title}`);
}

// 极简 cookie jar：fetch 自己不管 cookie，而这套系统的身份全在 cookie 上。
function jar() {
  const store = new Map();
  return {
    header() {
      return [...store.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    absorb(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const index = pair.indexOf('=');
        const name = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (!name) continue;
        if (value === '') store.delete(name);
        else store.set(name, value);
      }
      return response;
    },
    has(name) {
      return store.has(name);
    },
  };
}

async function call(cookies, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookieHeader = cookies.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(`${BASE}${path}`, { ...options, headers, redirect: 'manual' });
  cookies.absorb(response);
  return response;
}

async function callJson(cookies, path, options = {}) {
  const response = await call(cookies, path, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, response };
}

async function callText(cookies, path, options = {}) {
  const response = await call(cookies, path, options);
  return { status: response.status, text: await response.text(), response };
}

const phoneSeed = Date.now() % 100000000;
let phoneCounter = 0;
function nextPhone() {
  phoneCounter += 1;
  return `13${String(phoneSeed + phoneCounter).padStart(9, '0')}`.slice(0, 11);
}

async function main() {
  console.log(`活动报名全流程验收：${BASE}`);

  // ---------------------------------------------------------------- 建活动
  section('建活动与管理员身份');
  const ownerJar = jar();
  const setup = await callJson(ownerJar, '/api/se/setup', {
    method: 'POST',
    json: { setupToken: SETUP_TOKEN, title: `验收活动 ${new Date().toISOString().slice(11, 19)}`, ownerName: '发起人老王' },
  });
  check('初始化口令可建活动', setup.status === 200 && setup.body?.ok === true, JSON.stringify(setup.body));
  if (!setup.body?.ok) {
    console.log('\n无法继续：请确认 dev 服务已启动且 SE_SETUP_TOKEN 与参数一致。');
    process.exit(1);
  }
  const eventId = setup.body.eventId;
  const eventCode = setup.body.eventCode;
  check('拿到管理链接且只出现一次', typeof setup.body.manageLink === 'string' && setup.body.manageLink.includes('/m/'));
  check('建完即持有管理会话 cookie', ownerJar.has('se_admin'));

  const noAuth = jar();
  const blocked = await callJson(noAuth, '/api/se/events', { method: 'PATCH', json: { title: '想改别人的活动' } });
  check('没有管理会话改不了活动设置', blocked.status >= 400, `status=${blocked.status}`);
  const blockedExport = await callText(noAuth, '/api/se/export');
  check('没有管理会话导不出名单', blockedExport.status === 403, `status=${blockedExport.status}`);

  // ---------------------------------------------------------- 发布 + 表单
  section('发布活动与表单设置');
  const publish = await callJson(ownerJar, '/api/se/events', {
    method: 'PATCH',
    json: {
      title: '验收活动',
      summary: '这是验收用的活动介绍。',
      status: 'open',
      capacity: 2,
      needReview: false,
      timeNote: '具体时间活动前 3 天在本页公布',
      locationName: '',
      formSchema: [{ key: 'meal', label: '餐食', type: 'radio', required: true, options: ['荤', '素'] }],
    },
  });
  check('发布为报名中', publish.status === 200 && publish.body?.status === 'open', JSON.stringify(publish.body));

  const page = await callText(jar(), `/e/${eventCode}`);
  check('活动页公开可访问', page.status === 200);
  check('活动页出现时间待公布说明', page.text.includes('具体时间活动前 3 天在本页公布'));
  check('活动页不泄露人数字段', !/signup_?[Cc]ount/.test(page.text));

  // ------------------------------------------------------- 批量生成渠道码
  section('一套表单，多个渠道码');
  const made = await callJson(ownerJar, '/api/se/admins', {
    method: 'POST',
    json: { names: Array.from({ length: 20 }, (_, index) => `管理员${index + 1}`), kind: 'admin' },
  });
  check('一次生成 20 条渠道 + 管理链接', made.status === 200 && made.body?.created?.length === 20, JSON.stringify(made.body).slice(0, 160));
  const channelA = made.body.created[0];
  const channelB = made.body.created[1];
  check('每条渠道链接各不相同', channelA.signupLink !== channelB.signupLink);
  check('每人各有一条私有管理链接', channelA.manageLink?.includes('/m/') && channelB.manageLink !== channelA.manageLink);

  const poster = await callJson(ownerJar, '/api/se/admins', {
    method: 'POST',
    json: { names: ['朋友圈海报'], kind: 'channel' },
  });
  check('无主渠道只给报名链接、不给管理权限', poster.body?.created?.[0]?.manageLink === null);

  const qr = await call(jar(), `/api/se/qr?e=${eventCode}&c=${channelA.channelCode}`);
  check('渠道二维码是 SVG', qr.status === 200 && (qr.headers.get('content-type') || '').includes('image/svg'));
  const qrBad = await call(jar(), `/api/se/qr?e=${eventCode}&c=ZZZZ`);
  check('不存在的渠道码不给生码', qrBad.status === 404);

  // ------------------------------------------------- 归因：最后一次扫码为准
  section('邀请人归因（最后一次扫码为准）');
  const visitor1 = jar();
  await call(visitor1, `/e/${eventCode}?c=${channelA.channelCode}`);
  await callJson(visitor1, '/api/se/track', { method: 'POST', json: { eventCode, channelCode: channelA.channelCode } });
  await callJson(visitor1, '/api/se/track', { method: 'POST', json: { eventCode, channelCode: channelB.channelCode } });
  const signup1 = await callJson(visitor1, '/api/se/signups', {
    method: 'POST',
    json: {
      eventCode,
      channelCode: '',
      requestId: `flow-${Date.now()}-1`,
      name: '扫了两次的人',
      phone: nextPhone(),
      formData: { meal: '荤' },
    },
  });
  check('报名成功并拿到门票链接', signup1.status === 200 && signup1.body?.path?.startsWith('/t/'), JSON.stringify(signup1.body));
  const ticket1 = signup1.body.path.slice(3);

  const visitor2 = jar();
  await callJson(visitor2, '/api/se/track', { method: 'POST', json: { eventCode, channelCode: channelB.channelCode } });
  const signup2 = await callJson(visitor2, '/api/se/signups', {
    method: 'POST',
    json: {
      eventCode,
      channelCode: channelA.channelCode,
      requestId: `flow-${Date.now()}-2`,
      name: 'URL优先的人',
      phone: nextPhone(),
      formData: { meal: '素' },
    },
  });
  check('第二个人也报上了', signup2.body?.path?.startsWith('/t/'), JSON.stringify(signup2.body));

  const csvRaw = await call(ownerJar, '/api/se/export');
  const csvBytes = new Uint8Array(await csvRaw.arrayBuffer());
  // Response.text() 按规范会把开头的 BOM 吃掉，所以这里看原始字节
  check(
    '导出带 BOM，Excel 能直接开',
    csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
    [...csvBytes.slice(0, 3)].join(','),
  );
  const csv = { text: new TextDecoder().decode(csvBytes) };
  const rowOne = csv.text.split('\r\n').find((line) => line.includes('扫了两次的人')) || '';
  const rowTwo = csv.text.split('\r\n').find((line) => line.includes('URL优先的人')) || '';
  check('cookie 回落：邀请人记成最后扫的那个（管理员2）', rowOne.includes('管理员2'), rowOne);
  check('URL 压过 cookie：邀请人记成管理员1', rowTwo.includes('管理员1'), rowTwo);
  check('导出含表单字段值', rowOne.includes('荤'));

  // --------------------------------------------------------- 表单校验与去重
  section('表单校验与手机号去重');
  const badPhone = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-bad-${Date.now()}`, name: '手机号不对', phone: '12345', formData: { meal: '荤' } },
  });
  check('手机号格式错被拒', badPhone.status === 400, JSON.stringify(badPhone.body));
  const missingRequired = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-req-${Date.now()}`, name: '没选餐食', phone: nextPhone(), formData: {} },
  });
  check('必填项没填被拒', missingRequired.status === 400 && String(missingRequired.body?.error).includes('餐食'));

  const dupPhone = nextPhone();
  const firstOfDup = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-d1-${Date.now()}`, name: '重复测试', phone: dupPhone, formData: { meal: '荤' } },
  });
  const secondOfDup = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-d2-${Date.now()}`, name: '重复测试换设备', phone: dupPhone, formData: { meal: '荤' } },
  });
  check('同手机号重复报名被拦', firstOfDup.status === 200 && secondOfDup.status === 409, `${firstOfDup.status}/${secondOfDup.status}`);

  const sameRequest = `flow-idem-${Date.now()}`;
  const idemJar = jar();
  const idem1 = await callJson(idemJar, '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: sameRequest, name: '双击提交', phone: nextPhone(), formData: { meal: '素' } },
  });
  const idem2 = await callJson(idemJar, '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: sameRequest, name: '双击提交', phone: nextPhone(), formData: { meal: '素' } },
  });
  check('同一 requestId 重复提交只算一次', idem1.status === 200 && idem2.status === 200 && idem2.body?.path !== undefined);

  // ------------------------------------------------------------ 名额与候补
  section('名额上限与候补');
  const statusOfTicket = async (token) => (await callText(jar(), `/t/${token}`)).text;
  const overflow = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-over-${Date.now()}`, name: '候补的人', phone: nextPhone(), formData: { meal: '荤' } },
  });
  check('满额后仍可提交', overflow.status === 200, JSON.stringify(overflow.body));
  check('满额后进候补', overflow.body?.status === 'waitlist', String(overflow.body?.status));
  if (!overflow.body?.path) {
    console.log('无法继续：候补报名没有返回门票链接。');
    process.exit(1);
  }
  const waitlistPage = await statusOfTicket(overflow.body.path.slice(3));
  check('候补者门票页说明候补状态且无二维码', waitlistPage.includes('候补') && !waitlistPage.includes('入场凭证'));
  const fullPage = (await callText(jar(), `/e/${eventCode}`)).text;
  check('活动页只说已满额，不说具体人数', fullPage.includes('已满额') && !/已报名\s*\d+/.test(fullPage));

  // ------------------------------------------------------- 并发不超卖
  section('并发提交不超卖');
  const raceSetup = await callJson(ownerJar, '/api/se/events', {
    method: 'PATCH',
    json: { title: '验收活动', status: 'open', capacity: 5, needReview: false, formSchema: [] },
  });
  check('把名额改成 5', raceSetup.status === 200);
  const before = await callText(ownerJar, '/api/se/export');
  const confirmedBefore = (before.text.match(/已确认/g) || []).length;
  const burst = await Promise.all(
    Array.from({ length: 14 }, (_, index) =>
      callJson(jar(), '/api/se/signups', {
        method: 'POST',
        json: {
          eventCode,
          requestId: `flow-race-${Date.now()}-${index}`,
          name: `并发${index}`,
          phone: nextPhone(),
          formData: {},
        },
      }),
    ),
  );
  const okCount = burst.filter((item) => item.status === 200).length;
  const confirmedInBurst = burst.filter((item) => item.body?.status === 'confirmed').length;
  check('14 个并发请求都有确定结果', okCount === 14, `ok=${okCount}`);
  const after = await callText(ownerJar, '/api/se/export');
  const confirmedAfter = (after.text.match(/已确认/g) || []).length;
  check(
    '恰好卖出 3 个空位：既不超卖，也不丢名额',
    confirmedAfter - confirmedBefore === 3,
    `before=${confirmedBefore} after=${confirmedAfter} burstConfirmed=${confirmedInBurst}`,
  );

  // --------------------------------------------------------- 同步更新可查阅
  section('同步更新（报名者凭同一链接查阅）');
  const update = await callJson(ownerJar, '/api/se/updates', {
    method: 'POST',
    json: {
      body: '活动具体时间定了：11月15日 14:00 签到。',
      locationName: '市图书馆 3 楼',
      locationAddress: '中山路 1 号',
      locationLat: '31.230000',
      locationLng: '121.470000',
    },
  });
  check('管理员可发同步更新', update.status === 200 && update.body?.ok === true, JSON.stringify(update.body));
  const ticketAfterUpdate = (await callText(jar(), `/t/${ticket1}`)).text;
  check('报名者在自己的门票页看到更新', ticketAfterUpdate.includes('11月15日 14:00 签到'));
  check('更新里的地点带一键导航', ticketAfterUpdate.includes('uri.amap.com'));
  const eventAfterUpdate = (await callText(jar(), `/e/${eventCode}`)).text;
  check('活动页也同步显示更新', eventAfterUpdate.includes('11月15日 14:00 签到'));

  // -------------------------------------------------------------- 隐私红线
  section('隐私：报名者看不到他人信息与人数');
  check('活动页不含其他报名者姓名', !eventAfterUpdate.includes('URL优先的人'));
  const otherTicket = (await callText(jar(), `/t/${ticket1}`)).text;
  check('自己的门票页只有自己', otherTicket.includes('扫了两次的人') && !otherTicket.includes('URL优先的人'));
  const verifyAsVisitor = (await callText(jar(), `/v/${ticket1}`)).text;
  check('非管理员打开核销页看不到任何报名信息', !verifyAsVisitor.includes('扫了两次的人'), '核销页泄露了姓名');
  check('非管理员打开核销页提示需要管理员身份', verifyAsVisitor.includes('需要管理员身份'));
  const rosterAsVisitor = await callText(jar(), `/manage/${eventId}/roster`);
  check(
    '非管理员看不到名单页（跳回需要管理链接）',
    !rosterAsVisitor.text.includes('URL优先的人') && rosterAsVisitor.status >= 300 && rosterAsVisitor.status < 400,
    `status=${rosterAsVisitor.status}`,
  );

  // ------------------------------------------------------------------ 核销
  section('核销：任意管理员都能核销任意门票');
  const adminJar = jar();
  const enter = await call(adminJar, new URL(channelB.manageLink).pathname);
  check('管理链接可换会话并跳转', enter.status === 307 || enter.status === 302, `status=${enter.status}`);
  check('换到了管理会话 cookie', adminJar.has('se_admin'));
  const verifyPage = await callText(adminJar, `/v/${ticket1}`);
  check('管理员扫码落地页看到票主姓名', verifyPage.text.includes('扫了两次的人'));
  const checkin1 = await callJson(adminJar, '/api/se/checkin', { method: 'POST', json: { ticketToken: ticket1 } });
  check('第 20 号管理员能核销第 1 个人的票', checkin1.body?.ok === true, JSON.stringify(checkin1.body));
  const checkin2 = await callJson(adminJar, '/api/se/checkin', { method: 'POST', json: { ticketToken: ticket1 } });
  check('重复核销被识别', checkin2.body?.result === 'duplicate', JSON.stringify(checkin2.body));
  check('重复核销给出首次核销时间', Boolean(checkin2.body?.checkedInAt), JSON.stringify(checkin2.body));
  const checkinBad = await callJson(adminJar, '/api/se/checkin', { method: 'POST', json: { ticketToken: 'NOSUCHTOKEN1234567890AB' } });
  check('无效票被拒', checkinBad.body?.result === 'invalid');
  const checkinNoAuth = await callJson(jar(), '/api/se/checkin', { method: 'POST', json: { ticketToken: ticket1 } });
  check('没有管理身份不能核销', checkinNoAuth.status >= 400);

  // --------------------------------------------------- 按邀请人筛选与审核
  section('按邀请人筛选');
  const inviterCsv = await callText(ownerJar, '/api/se/export?inviter=' + encodeURIComponent(await inviterIdOf(ownerJar, eventId, '管理员1')));
  check('按邀请人导出只含该邀请人的报名', inviterCsv.text.includes('URL优先的人') && !inviterCsv.text.includes('扫了两次的人'), inviterCsv.text.slice(0, 200));
  const rosterFiltered = await callText(ownerJar, `/manage/${eventId}/roster?inviter=none`);
  check('名单页可按「直接进入」筛选', rosterFiltered.status === 200 && !rosterFiltered.text.includes('URL优先的人'));

  section('报名需审核时不出票');
  const reviewOn = await callJson(ownerJar, '/api/se/events', {
    method: 'PATCH',
    json: { title: '验收活动', status: 'open', capacity: '', needReview: true, formSchema: [] },
  });
  check('打开审核开关', reviewOn.status === 200);
  const pending = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode, requestId: `flow-rev-${Date.now()}`, name: '待审核的人', phone: nextPhone(), formData: {} },
  });
  check('提交后状态为待审核', pending.body?.status === 'pending', JSON.stringify(pending.body));
  const pendingTicket = await callText(jar(), pending.body.path);
  check('待审核时不出二维码', pendingTicket.text.includes('等待主办方审核') && !pendingTicket.text.includes('入场凭证'));

  console.log(`\n结果：${passed} 项通过，${failed} 项失败。`);
  process.exit(failed === 0 ? 0 : 1);
}

// 从名单页上抓某个邀请人的筛选 id（页面里就是按这个 id 做筛选的）。
async function inviterIdOf(cookies, eventId, inviterName) {
  const page = await callText(cookies, `/manage/${eventId}/roster`);
  // RSC 会在相邻文本节点之间插 <!-- -->，先去掉再匹配链接文字
  const clean = page.text.replace(/<!--[\s\S]*?-->/g, '');
  const pattern = new RegExp(`inviter=([^"&]+)"[^>]*>\\s*${inviterName}(?![0-9])`, 'u');
  const match = pattern.exec(clean);
  return match ? decodeURIComponent(match[1]) : 'none';
}

main().catch((error) => {
  console.error('\n脚本自身出错：', error);
  process.exit(1);
});
