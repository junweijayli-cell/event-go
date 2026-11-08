// 压力测试：跑在真实运行的服务上，专打 flow.mjs 不覆盖的地方 —— 规模、并发、
// 越权、脏输入、限流。
//
// 用法：
//   1) 另开一个终端：npm run dev        （默认 http://localhost:3000）
//   2) node tests/se/stress.mjs [baseUrl] [setupToken]
//
// 注意：每个模拟用户带自己的 X-Forwarded-For，否则 60 次/10 分钟的 IP 限流会
// 把并发测试本身挡掉（限流那一节才故意共用一个 IP）。线上有 Cloudflare 时
// cf-connecting-ip 优先，这个头伪造不了。

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const SETUP_TOKEN = process.argv[3] || 'dev-setup-token';

let passed = 0;
let failed = 0;
const failures = [];
const notes = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function note(label, detail = '') {
  notes.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  NOTE  ${label}${detail ? ` -- ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n== ${title}`);
}

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
    get(name) {
      return store.get(name);
    },
    set(name, value) {
      store.set(name, value);
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
  if (options.ip) headers['x-forwarded-for'] = options.ip;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.json);
  }
  if (options.raw !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = options.raw;
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

// ---------------------------------------------------------------- 测试数据生成
const PHONE_BASE = Math.floor(Math.random() * 1_000_000_000);
let phoneN = 0;
function nextPhone() {
  phoneN += 1;
  return `13${String((PHONE_BASE + phoneN) % 1_000_000_000).padStart(9, '0')}`;
}

let ipN = 0;
function nextIp() {
  ipN += 1;
  return `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN & 255}`;
}

async function newEvent(title) {
  const owner = jar();
  const setup = await callJson(owner, '/api/se/setup', {
    method: 'POST',
    json: { setupToken: SETUP_TOKEN, title, ownerName: '压测发起人' },
  });
  if (!setup.body?.ok) {
    console.log(`\n无法建活动（${title}）：${JSON.stringify(setup.body)}`);
    console.log('请确认 dev 服务已启动，且 setupToken 与 .dev.vars 里的 SE_SETUP_TOKEN 一致。');
    process.exit(1);
  }
  return { owner, id: setup.body.eventId, code: setup.body.eventCode, manageLink: setup.body.manageLink };
}

async function configure(owner, patch) {
  return callJson(owner, '/api/se/events', {
    method: 'PATCH',
    json: { title: '压测活动', status: 'open', needReview: false, formSchema: [], ...patch },
  });
}

function submit(cookies, eventCode, extra = {}) {
  return callJson(cookies, '/api/se/signups', {
    method: 'POST',
    ip: extra.ip ?? nextIp(),
    json: {
      eventCode,
      requestId: extra.requestId ?? `stress-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: extra.name ?? '压测报名者',
      phone: extra.phone ?? nextPhone(),
      formData: extra.formData ?? {},
      channelCode: extra.channelCode ?? '',
    },
  });
}

// CSV 解析（带引号转义），用来精确核对导出内容而不是 includes 猜。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      /* skip */
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((line) => line.length > 1 || line[0] !== '');
}

async function exportCsv(owner, query = '') {
  const response = await call(owner, `/api/se/export${query}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder().decode(hasBom ? bytes.slice(3) : bytes);
  return { status: response.status, hasBom, text, rows: parseCsv(text) };
}

async function main() {
  console.log(`活动报名压力测试：${BASE}`);
  const started = Date.now();

  // ======================================================= 1. 规模化渠道
  section('1. 规模化：一个活动挂很多渠道');
  const main1 = await newEvent('压测-主场');
  const open1 = await configure(main1.owner, { capacity: '', summary: '压测主场活动' });
  check('活动可发布为报名中', open1.status === 200 && open1.body?.status === 'open', JSON.stringify(open1.body));

  const over = await callJson(main1.owner, '/api/se/admins', {
    method: 'POST',
    json: { names: Array.from({ length: 60 }, (_, i) => `邀请人${String(i + 1).padStart(2, '0')}`), kind: 'admin' },
  });
  check('一次提交 60 个名字，按上限截成 50 条', over.body?.created?.length === 50, `created=${over.body?.created?.length}`);
  const admins = over.body?.created ?? [];

  const batch2 = await callJson(main1.owner, '/api/se/admins', {
    method: 'POST',
    json: { names: Array.from({ length: 50 }, (_, i) => `海报${i + 1}`), kind: 'channel' },
  });
  const batch3 = await callJson(main1.owner, '/api/se/admins', {
    method: 'POST',
    json: { names: Array.from({ length: 50 }, (_, i) => `合作方${i + 1}`), kind: 'channel', type: 'partner' },
  });
  check('无主渠道也能批量生成', batch2.body?.created?.length === 50 && batch3.body?.created?.length === 50);
  check('无主渠道不带管理链接', (batch2.body?.created ?? []).every((item) => item.manageLink === null));

  const allCodes = [...admins, ...(batch2.body?.created ?? []), ...(batch3.body?.created ?? [])].map(
    (item) => item.channelCode,
  );
  check('150 条渠道码全不重复', new Set(allCodes).size === allCodes.length, `unique=${new Set(allCodes).size}/${allCodes.length}`);
  check(
    '渠道码都是 4 位无歧义字符',
    allCodes.every((code) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code)),
    allCodes.filter((code) => !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code)).slice(0, 5).join(','),
  );
  check('管理链接两两不同', new Set(admins.map((item) => item.manageLink)).size === admins.length);

  const shareStart = Date.now();
  const sharePage = await callText(main1.owner, `/manage/${main1.id}/share`);
  const shareMs = Date.now() - shareStart;
  check('151 条渠道的分享页仍能渲染', sharePage.status === 200, `status=${sharePage.status}`);
  note('分享页渲染耗时', `${shareMs}ms（151 条渠道）`);

  const qrBurst = await Promise.all(
    allCodes.slice(0, 50).map((code) => call(jar(), `/api/se/qr?e=${main1.code}&c=${code}&s=8`)),
  );
  check(
    '50 个二维码并发生成全部成功且是 SVG',
    qrBurst.every((r) => r.status === 200 && (r.headers.get('content-type') || '').includes('image/svg')),
    qrBurst.filter((r) => r.status !== 200).map((r) => r.status).join(','),
  );

  // =================================================== 2. 批量报名与归因
  section('2. 批量报名：200 人分散到 20 个邀请人');
  const used = admins.slice(0, 20);
  const volumeStart = Date.now();
  const batchResults = [];
  for (let wave = 0; wave < 10; wave += 1) {
    // 20 人一波并发，共 10 波 = 200 人。每人独立 IP，模拟真实分散流量。
    const wavePack = await Promise.all(
      used.map((channel, index) =>
        submit(jar(), main1.code, {
          channelCode: channel.channelCode,
          name: `报名者${wave * 20 + index + 1}`,
        }),
      ),
    );
    batchResults.push(...wavePack);
  }
  const volumeMs = Date.now() - volumeStart;
  const okVolume = batchResults.filter((item) => item.status === 200).length;
  check('200 次报名全部成功', okVolume === 200, `ok=${okVolume}/200`);
  check('没有 5xx', batchResults.every((item) => item.status < 500), batchResults.filter((i) => i.status >= 500).length + ' 个 5xx');
  note('200 人报名耗时', `${volumeMs}ms（约 ${Math.round(200000 / volumeMs)} 次/秒）`);

  const csv1 = await exportCsv(main1.owner);
  check('导出带 UTF-8 BOM', csv1.hasBom);
  const header = csv1.rows[0] ?? [];
  const dataRows = csv1.rows.slice(1);
  check('导出行数等于报名人数', dataRows.length === 200, `rows=${dataRows.length}`);
  check('每行列数和表头一致', dataRows.every((row) => row.length === header.length), `header=${header.length}`);
  const inviterCol = header.findIndex((cell) => cell.includes('邀请人'));
  check('导出有邀请人列', inviterCol >= 0, header.join('|'));
  if (inviterCol >= 0) {
    const tally = new Map();
    for (const row of dataRows) tally.set(row[inviterCol], (tally.get(row[inviterCol]) ?? 0) + 1);
    const each = used.map((channel) => tally.get(channel.name) ?? 0);
    check(
      '20 个邀请人各记到 10 人，一个不差',
      each.every((count) => count === 10),
      each.join(','),
    );
  }

  // ===================================================== 3. 并发不超卖
  section('3. 并发：150 人抢 25 个名额');
  const race = await newEvent('压测-抢名额');
  const raceOpen = await configure(race.owner, { capacity: 25 });
  // PATCH 只回 { ok, status, code }，名额是否真的生效靠下面「恰好 25 个确认」来证。
  check('名额设置保存成功', raceOpen.status === 200 && raceOpen.body?.ok === true, JSON.stringify(raceOpen.body));
  const raceStart = Date.now();
  const burst = await Promise.all(Array.from({ length: 150 }, () => submit(jar(), race.code)));
  const raceMs = Date.now() - raceStart;
  const confirmed = burst.filter((item) => item.body?.status === 'confirmed');
  const waitlisted = burst.filter((item) => item.body?.status === 'waitlist');
  const errored = burst.filter((item) => item.status !== 200);
  check('150 个并发请求都有确定结果，没有 5xx', errored.filter((i) => i.status >= 500).length === 0, `5xx=${errored.filter((i) => i.status >= 500).length}`);
  check('确认名额恰好 25，不超卖', confirmed.length === 25, `confirmed=${confirmed.length}`);
  check('其余全部进候补，没有人凭空消失', confirmed.length + waitlisted.length + errored.length === 150, `${confirmed.length}+${waitlisted.length}+${errored.length}`);
  note('150 并发耗时', `${raceMs}ms`);
  const racePage = await callText(jar(), `/e/${race.code}`);
  check('满额后活动页只说已满额，不报人数', racePage.text.includes('已满额') && !/\b25\s*人/.test(racePage.text));
  const raceCsv = await exportCsv(race.owner);
  const raceConfirmedRows = raceCsv.rows.slice(1).filter((row) => row.includes('已确认')).length;
  check('库里也只有 25 个已确认', raceConfirmedRows === 25, `rows=${raceConfirmedRows}`);

  // ================================================= 4. 并发核销同一张票
  section('4. 并发：20 个管理员同时扫同一张票');
  const ticketPath = confirmed[0]?.body?.path ?? '';
  const ticketToken = ticketPath.slice(3);
  check('拿到一张已确认的票', ticketToken.length > 0, ticketPath);
  const scans = await Promise.all(
    Array.from({ length: 20 }, () => callJson(race.owner, '/api/se/checkin', { method: 'POST', json: { ticketToken } })),
  );
  const okScans = scans.filter((item) => item.body?.result === 'ok').length;
  const dupScans = scans.filter((item) => item.body?.result === 'duplicate').length;
  check('只有 1 次核销成功', okScans === 1, `ok=${okScans}`);
  check('其余 19 次全部判定为重复', dupScans === 19, `duplicate=${dupScans}`);
  check('重复核销带出首次核销时间', scans.some((item) => item.body?.checkedInAt), JSON.stringify(scans.find((i) => i.body?.result === 'duplicate')?.body));
  const waitlistTicket = waitlisted[0]?.body?.path?.slice(3);
  if (waitlistTicket) {
    const scanWaitlist = await callJson(race.owner, '/api/se/checkin', { method: 'POST', json: { ticketToken: waitlistTicket } });
    check('候补的票核销不了', scanWaitlist.body?.result === 'invalid', JSON.stringify(scanWaitlist.body));
  }

  // ============================================ 5. 并发重复提交与去重
  section('5. 并发：双击提交与同手机号抢注');
  const dedupe = await newEvent('压测-去重');
  await configure(dedupe.owner, { capacity: '' });

  const sameRequest = `stress-idem-${Date.now()}`;
  const idemJar = jar();
  const idemPhone = nextPhone();
  const idemBurst = await Promise.all(
    Array.from({ length: 10 }, () =>
      submit(idemJar, dedupe.code, { requestId: sameRequest, phone: idemPhone, name: '连点十次的人', ip: '10.9.9.9' }),
    ),
  );
  const idem5xx = idemBurst.filter((item) => item.status >= 500).length;
  const idemCsv = await exportCsv(dedupe.owner);
  const idemRows = idemCsv.rows.slice(1).filter((row) => row.includes('连点十次的人')).length;
  check('同一 requestId 并发 10 次只落 1 条记录', idemRows === 1, `rows=${idemRows}`);
  check('同一 requestId 并发不产生 5xx', idem5xx === 0, `5xx=${idem5xx}（${idemBurst.filter((i) => i.status >= 500).map((i) => i.status).join(',')}）`);
  check(
    '连点十次全部返回 200（把首次结果还给他，而不是报错）',
    idemBurst.filter((item) => item.status === 200).length === 10,
    idemBurst.map((item) => item.status).join(','),
  );

  const racePhone = nextPhone();
  const phoneBurst = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      submit(jar(), dedupe.code, { phone: racePhone, name: `同号抢注${i}`, requestId: `stress-phone-${Date.now()}-${i}` }),
    ),
  );
  const phone5xx = phoneBurst.filter((item) => item.status >= 500).length;
  const phone409 = phoneBurst.filter((item) => item.status === 409).length;
  const phoneCsv = await exportCsv(dedupe.owner);
  const phoneRows = phoneCsv.rows.slice(1).filter((row) => row.some((cell) => cell === racePhone)).length;
  check('同手机号并发 10 次只落 1 条记录', phoneRows === 1, `rows=${phoneRows}`);
  check('同手机号并发其余 9 次都以 409 被挡，没有 5xx', phone409 === 9 && phone5xx === 0, `409=${phone409} 5xx=${phone5xx} 全部=${phoneBurst.map((i) => i.status).join(',')}`);
  check(
    '同手机号被挡时给的是人能看懂的提示',
    phoneBurst.filter((item) => item.status === 409).every((item) => String(item.body?.error).includes('已经报名')),
    JSON.stringify(phoneBurst.find((i) => i.status === 409)?.body),
  );

  // ================================================== 6. 归因不可伪造
  section('6. 归因：伪造、脏码、多跳');
  const forge = jar();
  forge.set(`se_ch_${main1.code.toLowerCase()}`, encodeURIComponent(`["${used[0].channelCode}",${Date.now()}].bogus-signature`));
  const forged = await submit(forge, main1.code, { name: '伪造cookie的人' });
  check('伪造的归因 cookie 不生效', forged.status === 200, JSON.stringify(forged.body));
  const forgedCsv = await exportCsv(main1.owner);
  const forgedRow = forgedCsv.rows.find((row) => row.includes('伪造cookie的人')) ?? [];
  check(
    '伪造者记成直接进入，不算到别人头上',
    inviterCol >= 0 && (forgedRow[inviterCol] === '' || forgedRow[inviterCol] === '直接进入'),
    `inviter=${JSON.stringify(forgedRow[inviterCol])}`,
  );

  const ghost = await submit(jar(), main1.code, { channelCode: 'ZZZZ', name: '脏渠道码的人' });
  check('不存在的渠道码不报错、落为直接进入', ghost.status === 200, JSON.stringify(ghost.body));
  const sqlish = await submit(jar(), main1.code, { channelCode: "' OR 1=1 --", name: '注入渠道码的人' });
  check('渠道码里的 SQL 片段不造成错误', sqlish.status === 200, JSON.stringify(sqlish.body));

  const hopper = jar();
  for (const channel of used.slice(0, 20)) {
    await callJson(hopper, '/api/se/track', { method: 'POST', json: { eventCode: main1.code, channelCode: channel.channelCode } });
  }
  const hopped = await submit(hopper, main1.code, { name: '扫了二十次的人' });
  check('20 跳之后仍能报名', hopped.status === 200);
  const hopCsv = await exportCsv(main1.owner);
  const hopRow = hopCsv.rows.find((row) => row.includes('扫了二十次的人')) ?? [];
  check(
    '20 跳归因给最后一个（邀请人20）',
    inviterCol >= 0 && hopRow[inviterCol] === used[19].name,
    `inviter=${JSON.stringify(hopRow[inviterCol])} 期望=${used[19].name}`,
  );

  // 停用渠道：分享页上点「停用渠道」之后，这条链接到底还能不能用、还算不算归因。
  const ids = await shareIds(main1.owner, main1.id);
  const toggled = used[5];
  const toggledId = ids.get(toggled.name)?.channelId;
  check('能从分享页拿到渠道 id', Boolean(toggledId), `name=${toggled.name} 解析到 ${ids.size} 条渠道`);
  if (toggledId) {
    const off = await callJson(main1.owner, '/api/se/admins', {
      method: 'PATCH',
      json: { action: 'toggleChannel', channelId: toggledId, enabled: false },
    });
    check('发起人可以停用一条渠道', off.status === 200 && off.body?.ok === true, `status=${off.status} ${JSON.stringify(off.body)}`);

    const beacon = jar();
    await callJson(beacon, '/api/se/track', { method: 'POST', json: { eventCode: main1.code, channelCode: toggled.channelCode } });
    const viaBeacon = await submit(beacon, main1.code, { name: '停用后靠cookie的人' });
    const afterOffCsv = await exportCsv(main1.owner);
    const beaconRow = afterOffCsv.rows.find((row) => row.includes('停用后靠cookie的人')) ?? [];
    check(
      '停用后，扫码不再写归因 cookie',
      viaBeacon.status === 200 && inviterCol >= 0 && beaconRow[inviterCol] !== toggled.name,
      `inviter=${JSON.stringify(beaconRow[inviterCol])}`,
    );

    const viaUrl = await submit(jar(), main1.code, { channelCode: toggled.channelCode, name: '停用后带c参数的人' });
    const afterUrlCsv = await exportCsv(main1.owner);
    const urlRow = afterUrlCsv.rows.find((row) => row.includes('停用后带c参数的人')) ?? [];
    const stillAttributed = inviterCol >= 0 && urlRow[inviterCol] === toggled.name;
    check('停用后报名本身不受影响（海报已印出去，不该把人挡在门外）', viaUrl.status === 200, JSON.stringify(viaUrl.body));
    check(
      '停用后带 ?c= 也不再算到他名下（和扫码口径一致）',
      !stillAttributed,
      `${toggled.name} 已停用，但带 ?c=${toggled.channelCode} 提交仍记到他名下`,
    );
    await callJson(main1.owner, '/api/se/admins', {
      method: 'PATCH',
      json: { action: 'toggleChannel', channelId: toggledId, enabled: true },
    });
  }

  // ======================================================== 7. 越权
  section('7. 越权：跨活动、伪造会话、撤销后的链接');
  const crossRoster = await callText(race.owner, `/manage/${main1.id}/roster`);
  check(
    '甲活动管理员打不开乙活动的名单',
    crossRoster.status >= 300 && crossRoster.status < 400 && !crossRoster.text.includes('报名者1'),
    `status=${crossRoster.status}`,
  );
  const crossCheckin = await callJson(race.owner, '/api/se/checkin', { method: 'POST', json: { ticketToken: hopped.body.path.slice(3) } });
  check('甲活动管理员核销不了乙活动的票', crossCheckin.body?.result === 'invalid', JSON.stringify(crossCheckin.body));
  const crossCsv = await exportCsv(race.owner);
  check('导出只含自己活动的人', !crossCsv.text.includes('报名者1'), '导出里出现了别的活动的报名者');

  const tampered = jar();
  const good = main1.owner.get('se_admin');
  tampered.set('se_admin', good.slice(0, -4) + (good.slice(-4) === 'aaaa' ? 'bbbb' : 'aaaa'));
  const tamperedExport = await call(tampered, '/api/se/export');
  check('篡改过的管理 cookie 被拒', tamperedExport.status === 403, `status=${tamperedExport.status}`);

  const plainAdmin = jar();
  const entered = await call(plainAdmin, new URL(admins[0].manageLink).pathname);
  check('管理链接可换会话', (entered.status === 307 || entered.status === 302) && plainAdmin.has('se_admin'), `status=${entered.status}`);
  const adminMakesChannels = await callJson(plainAdmin, '/api/se/admins', { method: 'POST', json: { names: ['我想自己加人'], kind: 'admin' } });
  check(
    '普通管理员不能批量生成渠道（只有发起人能）',
    adminMakesChannels.status >= 400 && adminMakesChannels.status < 500 && String(adminMakesChannels.body?.error).includes('发起人'),
    `status=${adminMakesChannels.status} ${JSON.stringify(adminMakesChannels.body)}`,
  );
  if (adminMakesChannels.status !== 403) {
    note('越权被拦但状态码是 400 不是 403', `所有 SeError 都走 400（app/api/se/admins/route.ts 末尾），前端能认但不符合 HTTP 语义`);
  }
  const adminSeesRoster = await callText(plainAdmin, `/manage/${main1.id}/roster`);
  check('普通管理员能看全部名单（需求如此）', adminSeesRoster.status === 200 && adminSeesRoster.text.includes('报名者1'), `status=${adminSeesRoster.status}`);

  const victim = admins[1];
  const victimJar = jar();
  await call(victimJar, new URL(victim.manageLink).pathname);
  const victimBefore = await call(victimJar, '/api/se/export');
  check('被撤销前，该管理员可以导出', victimBefore.status === 200, `status=${victimBefore.status}`);
  const idsNow = await shareIds(main1.owner, main1.id);
  const victimId = idsNow.get(victim.name)?.adminId ?? '';
  check('能从分享页拿到管理员 id', Boolean(victimId), `name=${victim.name}`);
  const revoke = await callJson(main1.owner, '/api/se/admins', {
    method: 'PATCH',
    json: { action: 'revoke', adminId: victimId },
  });
  check('发起人可以撤销某个管理员', revoke.status === 200 && revoke.body?.ok === true, `status=${revoke.status} ${JSON.stringify(revoke.body)}`);
  if (revoke.body?.ok) {
    const victimAfter = await call(victimJar, '/api/se/export');
    check('撤销后，他手上那条已经生效的会话立刻失效', victimAfter.status === 403, `status=${victimAfter.status}`);
    const relink = await call(jar(), new URL(victim.manageLink).pathname);
    const relinkTarget = relink.headers.get('location') || '';
    check('撤销后，他那条管理链接也打不开', relinkTarget.includes('/manage/locked'), `location=${relinkTarget} status=${relink.status}`);
  }
  const ownerId = idsNow.get('压测发起人')?.adminId ?? '';
  const revokeOwner = await callJson(main1.owner, '/api/se/admins', {
    method: 'PATCH',
    json: { action: 'revoke', adminId: ownerId },
  });
  check('不能把发起人自己撤掉（否则活动变孤儿）', revokeOwner.status === 400, `status=${revokeOwner.status} ${JSON.stringify(revokeOwner.body)}`);

  // ===================================================== 8. 脏输入
  section('8. 脏输入：超长、emoji、CSV 注入、坏 JSON');
  const dirty = await newEvent('压测-脏输入');
  await configure(dirty.owner, {
    capacity: '',
    formSchema: [{ key: 'remark', label: '备注', type: 'textarea', required: false }],
  });

  const longName = 'あ'.repeat(5000);
  const longOne = await submit(jar(), dirty.code, { name: longName, formData: { remark: 'x'.repeat(20000) } });
  check('超长姓名/备注不造成 5xx', longOne.status < 500, `status=${longOne.status} ${JSON.stringify(longOne.body).slice(0, 120)}`);

  const emojiOne = await submit(jar(), dirty.code, { name: '小明👨‍👩‍👧‍👦🎉', formData: { remark: '带表情的备注 🏔️' } });
  check('emoji 姓名可以报名', emojiOne.status === 200, JSON.stringify(emojiOne.body));

  const nastyName = '=HYPERLINK("http://evil.example","点我")';
  const quoteName = '张"三",李\n四';
  await submit(jar(), dirty.code, { name: nastyName });
  await submit(jar(), dirty.code, { name: quoteName });
  const dirtyCsv = await exportCsv(dirty.owner);
  const nastyRow = dirtyCsv.rows.find((row) => row.some((cell) => cell.includes('HYPERLINK')));
  const quoteRow = dirtyCsv.rows.find((row) => row.some((cell) => cell.includes('李') && cell.includes('张')));
  check('含引号/逗号/换行的姓名导出后仍能正确解析回来', Boolean(quoteRow), '解析不回来，说明转义有问题');
  if (nastyRow) {
    const cell = nastyRow.find((item) => item.includes('HYPERLINK')) ?? '';
    const defused = /^['\t]/.test(cell);
    if (defused) check('CSV 公式注入被前置转义化解', true);
    else note('CSV 公式注入未做前置转义', `导出单元格原样是 ${JSON.stringify(cell.slice(0, 40))}，Excel 打开可能当公式执行`);
  }
  const emojiRow = dirtyCsv.rows.find((row) => row.some((cell) => cell.includes('小明')));
  check('emoji 在导出里没有被截断成乱码', Boolean(emojiRow && emojiRow.some((cell) => cell.includes('🎉'))), JSON.stringify(emojiRow?.slice(0, 3)));

  const badJson = await callJson(jar(), '/api/se/signups', { method: 'POST', raw: '{"eventCode": "' });
  check('坏 JSON 不把服务打崩，返回 4xx/5xx 的 JSON', badJson.status >= 400 && badJson.body !== null, `status=${badJson.status}`);
  const wrongTypes = await callJson(jar(), '/api/se/signups', {
    method: 'POST',
    json: { eventCode: 12345, requestId: {}, name: ['数组'], phone: null, formData: 'not-an-object' },
  });
  check('字段类型全错时按 4xx 拒掉', wrongTypes.status >= 400 && wrongTypes.status < 500, `status=${wrongTypes.status} ${JSON.stringify(wrongTypes.body)}`);
  const emptyBody = await callJson(jar(), '/api/se/signups', { method: 'POST', raw: '' });
  check('空 body 不造成未捕获异常', emptyBody.status >= 400, `status=${emptyBody.status}`);
  const stillAlive = await callText(jar(), `/e/${dirty.code}`);
  check('一通脏输入之后服务仍然正常', stillAlive.status === 200, `status=${stillAlive.status}`);

  // ================================================== 9. 生命周期闸门
  section('9. 生命周期：草稿、截止、已关闭');
  const gate = await newEvent('压测-闸门');
  const draftTry = await submit(jar(), gate.code, { name: '草稿期报名' });
  check('草稿状态不能报名', draftTry.status === 400, `status=${draftTry.status} ${JSON.stringify(draftTry.body)}`);
  const draftPage = await callText(jar(), `/e/${gate.code}`);
  check('草稿活动对外只显示尚未发布', draftPage.text.includes('尚未发布'), draftPage.status + '');

  await configure(gate.owner, { capacity: '', deadlineAt: '2020-01-01T10:00' });
  const lateTry = await submit(jar(), gate.code, { name: '过期报名' });
  check('过了截止时间不能报名', lateTry.status === 400, `status=${lateTry.status} ${JSON.stringify(lateTry.body)}`);

  await configure(gate.owner, { capacity: '', deadlineAt: '', status: 'closed' });
  const closedTry = await submit(jar(), gate.code, { name: '关闭后报名' });
  check('已关闭不能报名', closedTry.status === 400, `status=${closedTry.status}`);

  await configure(gate.owner, { capacity: '', deadlineAt: '', status: 'open' });
  const reopened = await submit(jar(), gate.code, { name: '重开后报名' });
  check('重新打开后可以报名', reopened.status === 200, JSON.stringify(reopened.body));

  // ======================================================= 10. 限流
  section('10. 限流：同一个 IP 连刷');
  const flood = await newEvent('压测-限流');
  await configure(flood.owner, { capacity: '' });
  const floodIp = '203.0.113.77';
  let firstBlockedAt = -1;
  let okBefore = 0;
  for (let i = 0; i < 70; i += 1) {
    const result = await submit(jar(), flood.code, { ip: floodIp, name: `连刷${i}` });
    if (result.status === 429) {
      if (firstBlockedAt < 0) firstBlockedAt = i;
    } else if (result.status === 200) okBefore += 1;
  }
  check('同一 IP 连刷会被限流拦住', firstBlockedAt >= 0, `70 次里没有一次 429`);
  check('限流阈值不早于 60 次（别把真人挡掉）', firstBlockedAt < 0 || firstBlockedAt >= 60, `第 ${firstBlockedAt + 1} 次就被拦了`);
  note('限流观测', `放过 ${okBefore} 次，第 ${firstBlockedAt + 1} 次开始 429`);
  const otherIpStillOk = await submit(jar(), flood.code, { ip: '203.0.113.78', name: '隔壁IP' });
  check('限流只针对那个 IP，不连坐别人', otherIpStillOk.status === 200, `status=${otherIpStillOk.status}`);

  // ======================================================= 11. 隐私复查
  section('11. 隐私：在有量的情况下再查一遍');
  const publicPage = await callText(jar(), `/e/${main1.code}`);
  check('活动页不含任何报名者姓名', !publicPage.text.includes('报名者1'), '活动页泄露了报名者');
  check('活动页不含人数字段', !/signup_?[Cc]ount|waitlist_?[Cc]ount/.test(publicPage.text));
  check('活动页不含渠道列表', !allCodes.some((code) => publicPage.text.includes(`?c=${code}`)), '活动页泄露了渠道码');
  const someTicket = hopped.body.path;
  const ticketPage = await callText(jar(), someTicket);
  check('门票页只显示自己', ticketPage.text.includes('扫了二十次的人') && !ticketPage.text.includes('报名者1'));
  const verifyAnon = await callText(jar(), `/v${someTicket.slice(2)}`);
  check('未登录打开核销页不泄露姓名', !verifyAnon.text.includes('扫了二十次的人'));

  // ============================================================ 收尾
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n结果：${passed} 项通过，${failed} 项失败，用时 ${seconds}s。`);
  if (notes.length) {
    console.log('\n观测（不计入通过/失败）：');
    for (const item of notes) console.log(`  - ${item}`);
  }
  if (failures.length) {
    console.log('\n失败清单：');
    for (const item of failures) console.log(`  - ${item}`);
  }
  console.log(`\n压测产生的活动（本地库，可忽略）：${[main1, race, dedupe, dirty, gate, flood].map((e) => e.code).join(' ')}`);
  process.exit(failed === 0 ? 0 : 1);
}

// 分享页把每条渠道的 id 序列化进了 RSC 负载（ChannelList 是客户端组件），
// 撤销/停用接口要用这些 id。按 { "channelId": ... } 切块逐个解析，不依赖键顺序。
async function shareIds(cookies, eventId) {
  const page = await callText(cookies, `/manage/${eventId}/share`);
  const flat = page.text.replace(/\\"/g, '"').replace(/&quot;/g, '"');
  const byName = new Map();
  for (const chunk of flat.split('"channelId":"').slice(1)) {
    const head = chunk.slice(0, 400);
    const channelId = (/^(ch-[0-9a-zA-Z-]+)/.exec(head) ?? [])[1];
    const name = (/"name":"([^"]*)"/.exec(head) ?? [])[1];
    const adminId = (/"adminId":"(adm-[0-9a-zA-Z-]+)"/.exec(head) ?? [])[1] ?? null;
    const code = (/"code":"([^"]*)"/.exec(head) ?? [])[1];
    if (channelId && name) byName.set(name, { channelId, adminId, code });
  }
  return byName;
}

main().catch((error) => {
  console.error('\n脚本自身出错：', error);
  process.exit(1);
});
