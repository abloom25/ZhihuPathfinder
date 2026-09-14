// 定向对抗回归测试（node --test）：每条发现与每条关键不变量都有可执行证据。
// 标注 [BUG-现状] 的用例把当前缺陷行为钉住（修复后应改为期望行为并反转断言）；
// 标注 [不变量] 的用例是必须永远成立的正面防线。

import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, mapItems } from '../backend/server.mjs';

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const okUpstream = (items = []) => jsonResponse({ Code: 0, Data: { Items: items } });
const goodItem = (i = 1) => ({
  ContentText: `正文${i}`, AuthorName: `作者${i}`, Title: `标题${i}`,
  Url: `https://www.zhihu.com/question/1/answer/${i}`, EditTime: 1700000000,
});

const servers = new Set();
async function boot(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-test-'));
  const app = createApp({
    secret: 'test-secret', timeoutMs: opts.timeoutMs ?? 800, minIntervalMs: opts.minIntervalMs ?? 150,
    cacheTtlMs: 5000, shareFile: opts.shareFile ?? path.join(dir, 'shares.json'),
    fetchImpl: opts.fetchImpl ?? (() => okUpstream()),
  });
  await new Promise(res => app.listen(0, '127.0.0.1', res));
  servers.add(app);
  return { app, dir, base: `http://127.0.0.1:${app.address().port}`, shareFile: opts.shareFile ?? path.join(dir, 'shares.json') };
}
async function shutdown(srv) {
  servers.delete(srv.app);
  if(srv.dir)fs.rmSync(srv.dir,{recursive:true,force:true});
  try { srv.app.closeAllConnections?.(); await new Promise(r => srv.app.close(r)); } catch {}
}
async function hit(base, p, { method = 'GET', headers = {}, body, timeoutMs = 4000 } = {}) {
  try {
    const res = await fetch(base + p, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { transport: 'ok', status: res.status, headers: Object.fromEntries(res.headers), text, json };
  } catch (e) { return { transport: 'error', error: String(e?.cause ?? e) }; }
}
const postShare = (base, body, headers = {}) => hit(base, '/api/v1/shares', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const validShareBody = (id) => ({ id, situation: '处境', text: '内容', demo: false, consent: true, sourceUrl: null, sourceExcerpt: null });
const TOKEN = 'ab'.repeat(32);

test.after(async () => { for(const app of servers) { app.closeAllConnections(); await new Promise(r=>app.close(r)); } });

// ============ 发现 1（已修复）：畸形 Origin → 403 来源不匹配，不再误报存储故障 ============
test('[已修复] Origin: null / 不可解析 Origin 得到 403 而非 503 存储误报', async () => {
  const srv = await boot();
  for (const origin of ['null', '::1', 'http://[', 'not-a-url']) {
    const r = await postShare(srv.base, validShareBody(crypto.randomUUID()), { origin, authorization: 'Bearer ' + TOKEN });
    assert.equal(r.status, 403, `origin=${origin} 应按来源不匹配拒绝`);
    assert.match(r.json.error.message, /来源不匹配/);
  }
  // 对照：合法同源 Origin 正常工作
  const ok = await postShare(srv.base, validShareBody(crypto.randomUUID()), { origin: `http://127.0.0.1:${srv.app.address().port}`, authorization: 'Bearer ' + TOKEN });
  assert.equal(ok.status, 201);
  // 对照：跨源 Origin 被拒（CSRF 防线仍在）
  const cross = await postShare(srv.base, validShareBody(crypto.randomUUID()), { origin: 'https://evil.example', authorization: 'Bearer ' + TOKEN });
  assert.equal(cross.status, 403);
  await shutdown(srv);
});

// ============ 发现 2（已修复）：悬挂上游 → 看门狗 504 收尾，active 释放，无全局锁死 ============
test('[已修复] 无视 abort 的悬挂上游在 timeoutMs 后得 504，且不锁死后续查询', async () => {
  const srv = await boot({ timeoutMs: 400, fetchImpl: () => new Promise(() => {}) });
  const q = (query) => hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }), timeoutMs: 3000 });
  const first = await q('悬挂');
  assert.equal(first.status, 504, `看门狗应在 timeoutMs 后强制收尾，实际 ${first.status}`);
  assert.equal(first.json.error.code, 'UPSTREAM_TIMEOUT');
  await new Promise(r => setTimeout(r, 300)); // 越过 minInterval 节流窗口
  const second = await q('新查询');
  assert.equal(second.status, 504, `active 已释放：新查询应再次走到上游并再得 504，而非 429 锁死（实际 ${second.status}）`);
  await shutdown(srv);
});

// ============ 发现 3（已修复）：撤回墓碑不再占用容量；活行上限仍然生效 ============
test('[已修复] 500 条撤回墓碑后新分享可创建；500 条活行仍触发容量上限', async () => {
  const mk = (srv, token) => postShare(srv.base, validShareBody(crypto.randomUUID()), { authorization: 'Bearer ' + token });
  // 场景 A：全部撤回 → 空存储可继续分享
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-capA-'));
  const fileA = path.join(dirA, 'shares.json');
  fs.writeFileSync(fileA, JSON.stringify(
    Array.from({ length: 500 }, () => ({ id: crypto.randomUUID(), tokenHash: 'a'.repeat(64), revoked: true }))));
  const srvA = await boot({ shareFile: fileA });
  const listA = await hit(srvA.base, '/api/v1/shares');
  assert.deepEqual(listA.json.data, [], '用户视角：存储完全是空的');
  assert.equal((await mk(srvA, TOKEN)).status, 201, '墓碑不占容量');
  await shutdown(srvA);
  // 场景 B：500 条真实活行 → 上限照常拒绝（防线仍在）
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-capB-'));
  const fileB = path.join(dirB, 'shares.json');
  fs.writeFileSync(fileB, JSON.stringify(
    Array.from({ length: 500 }, () => (({consent,...row})=>({...row,tokenHash:'a'.repeat(64),createdAt:'2026-09-14T00:00:00.000Z'}))(validShareBody(crypto.randomUUID())))));
  const srvB = await boot({ shareFile: fileB });
  assert.equal((await mk(srvB, TOKEN)).status, 429, '500 条活行仍拒绝新分享');
  await shutdown(srvB);
});

// ============ 发现 4（已修复）：Content-Type 判别两侧语义一致（trim＋lowercase） ============
test('[已修复] shares 接受 Application/JSON 与带空格的 media type，与 search 一致', async () => {
  const srv = await boot({ minIntervalMs: 0 });
  const s1 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'Application/JSON' }, body: '{"query":"一致性"}' });
  assert.equal(s1.status, 200, 'search 侧接受大写');
  const s2 = await postShare(srv.base, validShareBody(crypto.randomUUID()), { 'content-type': 'Application/JSON', authorization: 'Bearer ' + TOKEN });
  assert.equal(s2.status, 201, 'shares 侧同样接受');
  const s3 = await postShare(srv.base, validShareBody(crypto.randomUUID()), { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + TOKEN });
  assert.equal(s3.status, 201);
  const s4 = await postShare(srv.base, validShareBody(crypto.randomUUID()), { 'content-type': 'text/plain', authorization: 'Bearer ' + TOKEN });
  assert.equal(s4.status, 400, '非 JSON 仍拒绝');
  await shutdown(srv);
});

// ============ 发现 5（已修复）：mapItems 拒绝非标准端口（与尾点域同取舍：fail-closed） ============
test('[已修复] zhihu.com:8443 被消毒层拒绝（502），标准 443 端口由 URL 解析自动剥除', async () => {
  assert.throws(() => mapItems([{ ...goodItem(1), Url: 'https://zhihu.com:8443/x?utm=1#f' }], 'x'), (e) => e.status === 502);
  const out = mapItems([{ ...goodItem(1), Url: 'https://www.zhihu.com:443/question/1/answer/2?utm=1#f' }], '2026-09-14T00:00:00Z');
  assert.equal(out[0].source.url, 'https://www.zhihu.com/question/1/answer/2', '默认端口剥除、query/hash 剥离');
});

// ============ 不变量：mapItems URL 消毒（对抗样本逐条钉住） ============
test('[不变量] 上游 URL 消毒：仅 https+zhihu.com 精确域，剥凭据/查询/锚点，fail-closed', async () => {
  const evil = [
    'http://zhihu.com/x',                       // 明文 http
    'https://zhihu.com.evil.com/x',             // 后缀伪装
    'https://evil-zhihu.com/x',                 // 连字符伪装
    'https://user:pass@zhihu.com/x',            // 内嵌凭据
    'https://xn--zhhu-woa.com/x',               // IDN 同形
    'https://zhihu.com./x',                     // 尾点 FQDN（fail-closed）
    'javascript:alert(1)', 'not a url', '', 'https://[::1]/x',
  ];
  for (const url of evil) {
    assert.throws(() => mapItems([{ ...goodItem(1), Url: url }], 'x'), (e) => e.status === 502, `Url=${url}`);
  }
  const good = mapItems([
    { ...goodItem(1), Url: 'https://zhuanlan.zhihu.com/p/9?utm=x#f' },
    { ...goodItem(1), Url: 'https://ZHIANLAN.zhihu.com/p/9'.replace('ZHIANLAN', 'zhuanlan') },
  ], '2026-09-14T00:00:00Z');
  assert.equal(good.length, 1, '剥 query/hash 后同链去重');
  assert.equal(good[0].source.url, 'https://zhuanlan.zhihu.com/p/9');
  // 字段类型混淆全部 fail-closed（502），绝不产出半消毒数据
  for (const bad of [null, 42, {}, { ContentText: 'x', AuthorName: 1, Title: 't', Url: 'https://zhihu.com/x' }]) {
    assert.throws(() => mapItems([bad], 'x'), (e) => e.status === 502, fmt(bad));
  }
});
function fmt(v) { return JSON.stringify(v); }

// ============ 不变量：管理凭据与 tokenHash 绝不外泄 ============
test('[不变量] 任何响应不含 tokenHash；无凭据 POST 一律 403', async () => {
  const srv = await boot();
  const created = await postShare(srv.base, validShareBody(crypto.randomUUID()), { authorization: 'Bearer ' + TOKEN });
  assert.equal(created.status, 201);
  const id = created.json.data.id;
  for (const p of ['/api/v1/shares', '/api/v1/shares/' + id]) {
    const r = await hit(srv.base, p);
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes('tokenHash'), 'tokenHash 不得出现在公开响应');
  }
  const anon = await postShare(srv.base, validShareBody(crypto.randomUUID()));
  assert.equal(anon.status, 403);
  const wrongLen = await postShare(srv.base, validShareBody(crypto.randomUUID()), { authorization: 'Bearer ' + 'a'.repeat(63) });
  assert.equal(wrongLen.status, 403, 'token 长度/字符集严格 64 位小写十六进制');
  await shutdown(srv);
});

// ============ 不变量：同 id 并发创建原子、幂等重试符合契约 ============
test('[不变量] 并发同 id：一个 201、同 token 幂等 200、异 token 403；存储恰好一条', async () => {
  const srv = await boot({ minIntervalMs: 0 });
  const id = crypto.randomUUID(), other = 'cd'.repeat(32);
  const first = await postShare(srv.base, validShareBody(id), { authorization: 'Bearer ' + TOKEN });
  assert.equal(first.status, 201);
  const rs = await Promise.all([
    postShare(srv.base, validShareBody(id), { authorization: 'Bearer ' + TOKEN }),
    postShare(srv.base, validShareBody(id), { authorization: 'Bearer ' + TOKEN }),
    postShare(srv.base, validShareBody(id), { authorization: 'Bearer ' + other }),
  ]);
  assert.deepEqual(rs.map(r => r.status), [200, 200, 403]);
  const rows = JSON.parse(fs.readFileSync(srv.shareFile, 'utf8'));
  assert.equal(rows.length, 1);
  // 内容被篡改的同 id 重放 → 409，不允许覆盖
  const tampered = await postShare(srv.base, { ...validShareBody(id), text: '篡改' }, { authorization: 'Bearer ' + TOKEN });
  assert.equal(tampered.status, 409);
  await shutdown(srv);
});

// ============ 不变量：缓存；429 携带可信等待时间（修复后新增） ============
test('[不变量] 缓存：同查询 TTL 内 cached 命中且绕过节流，不同查询 429 并带 retryAfterSeconds', async () => {
  const srv = await boot({ minIntervalMs: 600000, fetchImpl: () => okUpstream([goodItem(1)]) });
  const q = (query) => hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  assert.equal((await q('缓存')).json.meta.mode, 'live');
  const second = await q('缓存');
  assert.equal(second.status, 200);
  assert.equal(second.json.meta.mode, 'cached');
  const throttled = await q('别的');
  assert.equal(throttled.status, 429);
  assert.ok(throttled.json.error.retryAfterSeconds >= 1, '节流 429 给出至少 1 秒等待');
  assert.ok(throttled.headers['retry-after'], '响应带 Retry-After 头');
  await shutdown(srv);
});

// ============ 不变量：上游体积/重定向/错误体防护 ============
test('[不变量] 上游 3MB 响应被 2MB 上限拦截（502），302 重定向不跟随，错误体不透传', async () => {
  const srv = await boot({ minIntervalMs: 0, fetchImpl: () => new Response('x'.repeat(3 * 1024 * 1024), { status: 200 }) });
  const q = () => hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"query":"体积"}' });
  let r = await q();
  assert.equal(r.status, 502);
  assert.ok(!r.text.includes('xxxx'), '上游原始体不得透传');
  await shutdown(srv);
  const srv2 = await boot({ minIntervalMs: 0, fetchImpl: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }) });
  r = await (async () => hit(srv2.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"query":"重定向"}' }))();
  assert.equal(r.status, 502, 'redirect:error 生效');
  await shutdown(srv2);
});

// ============ 不变量：超限流式请求体仍能收到完整 400 JSON ============
test('[不变量] 20KB 流式请求体越过 8KB 上限时客户端收到 INVALID_QUERY', async () => {
  const srv = await boot();
  const result = await new Promise(resolve => {
    const s = net.connect(srv.app.address().port, '127.0.0.1');
    let buf = '';
    const done = () => { try { s.destroy(); } catch {} resolve(buf); };
    s.on('connect', () => s.write('POST /api/v1/search HTTP/1.1\r\nHost: h\r\nContent-Type: application/json\r\nContent-Length: 20000\r\nConnection: close\r\n\r\n{"query":"' + 'a'.repeat(19988) + '"}'));
    s.on('data', d => { buf += d; setTimeout(done, 80); });
    s.on('error', () => resolve('SOCK-ERR'));
    setTimeout(() => done('TIMEOUT'), 2000);
  });
  assert.match(result, /400/);
  assert.match(result, /INVALID_QUERY/);
  await shutdown(srv);
});

// ============ 不变量：畸形请求目标只产生 4xx ============
test('[不变量] :x/*//evil.com/%zz 等畸形目标不产生 5xx', async () => {
  const srv = await boot();
  for (const target of [':x', '*', '//evil.com/path', '/%zz']) {
    const result = await new Promise(resolve => {
      const s = net.connect(srv.app.address().port, '127.0.0.1');
      let buf = '';
      const done = () => { try { s.destroy(); } catch {} resolve(buf); };
      s.on('connect', () => s.write(`GET ${target} HTTP/1.1\r\nHost: h\r\nConnection: close\r\n\r\n`));
      s.on('data', d => { buf += d; setTimeout(done, 60); });
      s.on('error', () => resolve('SOCK-ERR'));
      setTimeout(() => done('TIMEOUT'), 1500);
    });
    assert.match(result, /HTTP\/1\.1 (400|404)/, `target=${target}`);
  }
  await shutdown(srv);
});

// ============ 不变量：上游 429/Code:30001 → 60s 退避且携带完整等待信息（修复后新增） ============
test('[不变量] 上游限流码触发全局退避，retryAfterSeconds=60 且响应带 Retry-After 头', async () => {
  const srv = await boot({ fetchImpl: () => jsonResponse({ Code: 30001 }) });
  const q = (query) => hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const first = await q('退避');
  assert.equal(first.status, 429);
  assert.equal(first.json.error.retryAfterSeconds, 60);
  assert.equal(first.headers['retry-after'], '60');
  const second = await q('任何');
  assert.equal(second.status, 429, '60 秒窗口内不同查询同样被拒');
  assert.ok(second.json.error.retryAfterSeconds >= 1 && second.json.error.retryAfterSeconds <= 60, 'blockedUntil 剩余秒数动态计算');
  await shutdown(srv);
});
