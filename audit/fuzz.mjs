// 对抗式模糊测试执行器：
//   R0 基线健康检查
//   R1 /api/v1/search 随机极端 body（递归变参数生成）＋ 病态上游响应混沌
//   R2 /api/v1/shares* 随机极端 body ＋ 病态头（Origin/Content-Type/Authorization）
//   R3 mapItems() 单元级模糊（上游 URL 消毒不变量）
//   R4 定向混沌场景（并发、悬挂上游、容量耗尽、原型污染、超限流式体）
// 上游全部用注入的 mock fetchImpl 模拟，无真实外联；客户端流量仅指向本进程临时监听的 127.0.0.1 端口。

import { createApp, mapItems } from '../backend/server.mjs';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  mulberry32, pick, int, leaf, deepValue, adversarialString, adversarialItem,
  nearMissSearch, nearMissShare, UUID_RE,
} from './gen.mjs';

// ---------- 记账 ----------
const findings = [];
let checks = 0, passed = 0;
const expect = (cond, kind, detail) => {
  checks++; if (cond) { passed++; return true; }
  findings.push({ kind, detail }); return false;
};
const fmt = (v) => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };

// ---------- 服务器启动 ----------
const goodItem = (i = 1) => ({
  ContentText: `第${i}条真实经历的正文，包含细节。`,
  AuthorName: `作者${i}`, Title: `标题${i}`,
  Url: `https://www.zhihu.com/question/1/answer/${i}`,
  EditTime: 1700000000,
});
const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// 病态上游画廊：每个条目是 [名称, (url, init) => Response|Promise]
const UPSTREAM_GALLERY = {
  ok: () => jsonResponse({ Code: 0, Data: { Items: [goodItem(1), goodItem(2)] } }),
  okUnicode: () => jsonResponse({ Code: 0, Data: { Items: [goodItem(1), { ...goodItem(2), ContentText: '再次遇到 👨‍👩‍👧‍👦 \ud800 零宽\u200b', Url: 'https://zhuanlan.zhihu.com/p/9?utm=x#f' }] } }),
  code30001: () => jsonResponse({ Code: 30001 }),
  http429: () => new Response('too many', { status: 429 }),
  http500: () => new Response('boom', { status: 500 }),
  garbage: () => new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  redirect: () => new Response(null, { status: 302, headers: { location: 'https://evil.com' } }),
  reject: () => Promise.reject(new Error('ECONNRESET')),
  emptyItems: () => jsonResponse({ Code: 0, Data: { Items: [] } }),
  itemsNotArray: () => jsonResponse({ Code: 0, Data: { Items: {} } }),
  huge: () => new Response('x'.repeat(3 * 1024 * 1024), { status: 200 }),
  poisoned: () => jsonResponse({ Code: 0, Data: { Items: [goodItem(1), { ...goodItem(2), Url: 'https://zhihu.com.evil.com/x' }] } }),
  slowBody: () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"Code":0')); setTimeout(() => { c.enqueue(new TextEncoder().encode(',"Data":{"Items":[]}}')); c.close(); }, 300); },
  }), { status: 200 }),
};

async function boot(opts = {}) {
  const shareFile = opts.shareFile ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zp-audit-')), 'shares.json');
  const app = createApp({
    secret: 'audit-secret-value',
    timeoutMs: opts.timeoutMs ?? 1200,
    minIntervalMs: opts.minIntervalMs ?? 150,
    cacheTtlMs: opts.cacheTtlMs ?? 5000,
    shareFile,
    fetchImpl: opts.fetchImpl ?? UPSTREAM_GALLERY.ok,
  });
  await new Promise(res => app.listen(0, '127.0.0.1', res));
  const port = app.address().port;
  return { app, port, base: `http://127.0.0.1:${port}`, shareFile };
}
async function shutdown(srv) {
  try { srv.app.closeAllConnections?.(); await new Promise(r => srv.app.close(r)); } catch {}
}

// ---------- 客户端 ----------
// fetch 客户端自身会拒收含控制字符的头值/URL，先剥离以免把工具问题误报为服务端发现
// （undici 头值仅接受 Latin-1，超出码位直接在客户端抛 TypeError，到不了服务端）
const safeHeader = (v) => typeof v === 'string' ? v.replace(/[^\u0020-\u00ff]/g, '?') : v;
const safePathSegment = (v) => { try { return encodeURIComponent(v); } catch { return 'enc-fallback'; } };

async function hit(base, reqPath, { method = 'GET', headers = {}, body, timeoutMs = 4000 } = {}) {
  headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, safeHeader(v)]));
  try {
    const res = await fetch(base + reqPath, {
      method, headers,
      body: body === undefined ? undefined : body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { transport: 'ok', status: res.status, headers: Object.fromEntries(res.headers), text, json };
  } catch (e) {
    return { transport: 'error', error: String(e?.cause ?? e) };
  }
}

// 裸套接字：发送任意畸形请求行/头，读回原始响应
function rawRequest(port, payload, waitMs = 1500) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    let buf = Buffer.alloc(0);
    let settled = false;
    const done = (label) => { if (settled) return; settled = true; try { s.destroy(); } catch {} resolve({ label, raw: buf.toString('utf8') }); };
    s.on('connect', () => s.write(payload));
    s.on('data', d => { buf = Buffer.concat([buf, d]); setTimeout(() => done('read'), 60); });
    s.on('error', e => done('socket-error:' + e.code));
    setTimeout(() => done('timeout'), waitMs);
  });
}

// ---------- 通用不变量 ----------
function checkCommon(tag, r, allowedStatuses) {
  if (r.transport === 'error') { expect(false, tag + '/transport', r.error); return false; }
  expect(allowedStatuses.has(r.status), tag + '/status-out-of-contract', `status=${r.status} body=${fmt(r.text)}`);
  expect(r.json !== null, tag + '/non-json', fmt(r.text));
  if (r.json) expect(!!(r.json.data || r.json.error), tag + '/envelope', fmt(r.json));
  expect(!/node:internal|at async|at process|\n\s+at /.test(r.text), tag + '/stack-leak', fmt(r.text).slice(0, 200));
  expect(!r.text.includes('audit-secret-value'), tag + '/secret-leak', fmt(r.text).slice(0, 200));
  return r.json != null;
}
const SEARCH_STATUS = new Set([200, 400, 404, 429, 502, 504]);
const SHARES_STATUS = new Set([200, 201, 400, 401, 403, 404, 405, 413, 429, 503]);
const HEALTH_STATUS = new Set([200]);

// 200 响应必须过前端 validSearch 的镜像校验（前后端契约一致性）
function validSearchMirror(v) {
  const obj = x => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!obj(v) || !obj(v.meta) || typeof v.meta.requestId !== 'string') return false;
  if (!['live', 'cached'].includes(String(v.meta.mode))) return false;
  if (!Number.isFinite(Date.parse(v.meta.fetchedAt))) return false;
  if (!obj(v.data) || typeof v.data.query !== 'string' || v.data.hasMore !== false) return false;
  if (!Array.isArray(v.data.candidates)) return false;
  return v.data.candidates.every(c => obj(c) && typeof c.id === 'string' && c.reviewStatus === 'unreviewed' &&
    typeof c.source?.url === 'string' && c.source.url.startsWith('https://') &&
    (c.source.url.includes('zhihu.com')) && typeof c.possibleMultipleEvents === 'boolean');
}

// =====================================================================
async function main() {
  // ---------- R0 基线（/healthz 契约形态是 {status,contractVersion}，无 data/error 信封） ----------
  {
    const srv = await boot();
    const r = await hit(srv.base, '/healthz');
    expect(r.transport === 'ok' && r.status === 200 && r.json?.status === 'ok', 'R0-healthz/body', fmt(r.json));
    expect(r.json !== null && !/node:internal|\n\s+at /.test(r.text), 'R0-healthz/clean', '');
    await shutdown(srv);
  }

  // ---------- R1 搜索模糊 ----------
  {
    const seed = 0xC0FFEE;
    const r = mulberry32(seed);
    // 上游模式按请求轮换（混沌注入）
    const modes = ['ok', 'ok', 'okUnicode', 'emptyItems', 'code30001', 'http429', 'http500', 'garbage', 'redirect', 'reject', 'itemsNotArray', 'huge', 'poisoned', 'slowBody'];
    let i = 0;
    const fetchImpl = (url, init) => { const m = modes[i++ % modes.length]; return UPSTREAM_GALLERY[m](url, init); };
    const srv = await boot({ fetchImpl });
    const validQueries = ['抑郁', '裸辞', '再次遇到', 'x'.repeat(120), '👨‍👩‍👧‍👦'];
    for (let c = 0; c < 300; c++) {
      const roll = r();
      let bodyObj;
      if (roll < 0.35) bodyObj = deepValue(r, 0, 5);
      else if (roll < 0.75) bodyObj = nearMissSearch(r, pick(r, validQueries));
      else bodyObj = { query: adversarialString(r, 400) };
      const res = await hit(srv.base, '/api/v1/search', {
        method: 'POST',
        headers: { 'content-type': r() < 0.85 ? 'application/json' : pick(r, ['application/json ', 'Application/JSON', 'text/plain', 'application/json;charset=utf-8', '']) },
        body: JSON.stringify(bodyObj),
      });
      const tag = `R1-search/case${c}`;
      if (checkCommon(tag, res, SEARCH_STATUS) && res.status === 200) {
        expect(validSearchMirror(res.json), tag + '/validSearch-mirror', fmt(res.json));
      }
      // 原型污染探针
      expect(!('polluted' in ({})), tag + '/proto-polluted', fmt(bodyObj));
    }
    await shutdown(srv);
  }

  // ---------- R2 分享模糊 ----------
  {
    const seed = 0xBADC0DE;
    const r = mulberry32(seed);
    const srv = await boot();
    let origin503 = 0;
    const originPool = [undefined, 'null', '::1', 'http://[', 'https://example.evil', `https://127.0.0.1:${srv.port}`, `http://127.0.0.1:${srv.port}`, 'https://zhihu.com', 'HTTPS://EXAMPLE.COM'];
    const ctypePool = ['application/json', 'Application/JSON', 'application/json ', 'application/json;charset=utf-8', 'text/plain', undefined];
    const paths = ['/api/v1/shares', '/api/v1/shares/', '/api/v1/shares/' + crypto.randomUUID(), '/api/v1/sharesX', '/api/v1/shares/' + safePathSegment(adversarialString(r, 20))];
    for (let c = 0; c < 300; c++) {
      const method = pick(r, ['GET', 'GET', 'POST', 'POST', 'DELETE', 'PATCH']);
      const { body, token } = nearMissShare(r);
      const headers = {};
      const ct = pick(r, ctypePool); if (ct !== undefined) headers['content-type'] = ct;
      const origin = pick(r, originPool); if (origin !== undefined) headers['origin'] = origin;
      if (method !== 'GET' && r() < 0.8) headers['authorization'] = 'Bearer ' + token;
      const p = pick(r, paths);
      const res = await hit(srv.base, p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
      const tag = `R2-shares/case${c}(${method})`;
      if (checkCommon(tag, res, SHARES_STATUS)) {
        // 管理凭据哈希绝不能出现在任何响应里
        expect(!JSON.stringify(res.json).includes('tokenHash'), tag + '/tokenhash-leak', fmt(res.json));
        // 503 只允许在存储真实不可用时出现；Origin 相关的 503 = F1 缺陷复发，计数归零断言
        if (res.status === 503 && origin !== undefined) origin503++;
      }
      expect(!('polluted' in ({})), tag + '/proto-polluted', '');
    }
    // 存储文件若已生成，必须是合法 JSON 且不含明文 token
    try {
      const raw = fs.readFileSync(srv.shareFile, 'utf8');
      const arr = JSON.parse(raw);
      expect(Array.isArray(arr), 'R2-shares/store-json', fmt(arr).slice(0, 100));
      expect(!raw.includes('Bearer '), 'R2-shares/store-plaintext-token', '');
    } catch { /* 文件可能尚未创建 */ }
    expect(origin503 === 0, 'R2-shares/origin-503-count', `畸形 Origin 触发 503 共 ${origin503} 次（F1 缺陷复发）`);
    await shutdown(srv);
  }

  // ---------- R3 mapItems 单元模糊 ----------
  {
    const r = mulberry32(0xF00D);
    for (let c = 0; c < 400; c++) {
      const items = Array.from({ length: int(r, 0, 14) }, () => (r() < 0.75 ? adversarialItem(r) : leaf(r)));
      try {
        const out = mapItems(items, '2026-09-14T00:00:00.000Z');
        expect(Array.isArray(out) && out.length <= 10, `R3-mapItems/case${c}/len`, `len=${out?.length}`);
        const urls = new Set();
        for (const cand of out) {
          const u = new URL(cand.source.url); // 能解析
          const ok = u.protocol === 'https:' && !u.username && !u.password &&
            (u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com')) && !u.search && !u.hash;
          expect(ok, `R3-mapItems/case${c}/sanitized`, cand.source.url);
          expect(UUID_RE.test(cand.id.slice('candidate-'.length)) || /^[a-f0-9]{20}$/.test(cand.id.slice('candidate-'.length)), `R3-mapItems/case${c}/id`, cand.id);
          expect(!urls.has(cand.source.url), `R3-mapItems/case${c}/dedup`, cand.source.url);
          urls.add(cand.source.url);
          expect(typeof cand.possibleMultipleEvents === 'boolean', `R3-mapItems/case${c}/pmg-type`, typeof cand.possibleMultipleEvents);
        }
      } catch (e) {
        // 只允许抛 502 UPSTREAM_UNAVAILABLE（fail-closed），其他任何异常都是缺陷
        expect(e?.status === 502 && e?.code === 'UPSTREAM_UNAVAILABLE', `R3-mapItems/case${c}/throw`, `${e?.constructor?.name}:${e?.message}`);
      }
    }
  }

  // ---------- R4 定向混沌场景 ----------
  // C1 缓存不变量：节流期间同查询必须命中缓存（缓存的价值所在）
  {
    const srv = await boot({ minIntervalMs: 10_000_000, fetchImpl: UPSTREAM_GALLERY.ok }); // 节流拉满
    const q1 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '缓存不变量' }) });
    expect(q1.json?.meta?.mode === 'live', 'C1-cache/first-live', fmt(q1.json?.meta));
    const q2 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '缓存不变量' }) });
    expect(q2.status === 200 && q2.json?.meta?.mode === 'cached', 'C1-cache/second-cached-under-throttle', `status=${q2.status} mode=${q2.json?.meta?.mode}`);
    const q3 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '不同查询' }) });
    expect(q3.status === 429, 'C1-cache/different-query-throttled', `status=${q3.status}`);
    await shutdown(srv);
  }

  // C2 并发洪泛：minInterval 窗口内并发 25 个不同查询，至多 1 个 live、其余 429，进程存活
  {
    const calls = [];
    const fetchImpl = (u, i) => { calls.push(u); return UPSTREAM_GALLERY.ok(u, i); };
    const srv = await boot({ minIntervalMs: 60_000, fetchImpl });
    const rs = await Promise.all(Array.from({ length: 25 }, (_, k) =>
      hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'q' + k }) })));
    expect(rs.every(x => x.transport === 'ok'), 'C2-burst/transport', '');
    const codes = rs.map(x => x.status);
    expect(codes.filter(s => s === 200).length === 1 && codes.filter(s => s === 429).length === 24, 'C2-burst/exactly-one-live', fmt(codes));
    expect(calls.length === 1, 'C2-burst/upstream-called-once', `calls=${calls.length}`);
    const h = await hit(srv.base, '/healthz');
    expect(h.status === 200, 'C2-burst/server-alive', '');
    await shutdown(srv);
  }

  // C3 悬挂上游（无视 abort 信号的 fetch 实现）→ 看门狗强制 504 收尾，active 释放，无全局锁死
  {
    const srv = await boot({ timeoutMs: 300, fetchImpl: () => new Promise(() => {}) });
    const hung = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '悬挂' }), timeoutMs: 2500 });
    expect(hung.status === 504 && hung.json?.error?.code === 'UPSTREAM_TIMEOUT', 'C3-hang/watchdog-504', `status=${hung.status} body=${fmt(hung.json)}`);
    await new Promise(res => setTimeout(res, 500)); // 越过 minInterval 窗口
    const after = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '新查询' }), timeoutMs: 2500 });
    expect(after.status === 504, 'C3-hang/active-released', `status=${after.status} —— 第二次仍走到上游再 504，而非 429 锁死`);
    await shutdown(srv);
  }

  // C4 同 id 并发创建（单进程原子性验证）：恰好一个 201，其余 403（节流归零，避免与搜索节流串扰）
  {
    const srv = await boot({ minIntervalMs: 0 });
    const id = crypto.randomUUID(), tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
    const mk = (token) => hit(srv.base, '/api/v1/shares', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ id, situation: '处境', text: '内容', demo: false, consent: true, sourceUrl: null, sourceExcerpt: null }),
    });
    // 先串行创建，再并发混合“同 token 幂等重试”与“异 token 冒充”，断言完全确定
    const first = await mk(tokenA);
    expect(first.status === 201, 'C4-same-id/first-created', `status=${first.status}`);
    const rs = await Promise.all([mk(tokenA), mk(tokenA), mk(tokenB), mk(tokenB), mk(tokenB)]);
    for (let k = 0; k < rs.length; k++) {
      const want = k < 2 ? 200 : 403; // 契约：同 token 同内容重试幂等 200；他人 token 一律 403
      expect(rs[k].status === want, `C4-same-id/req${k}`, `want=${want} got=${rs[k].status}`);
      expect(!JSON.stringify(rs[k].json ?? {}).includes('tokenHash'), `C4-same-id/req${k}/no-tokenhash`, fmt(rs[k].json));
    }
    const one = await hit(srv.base, '/api/v1/shares/' + id);
    expect(one.status === 200 && one.json?.data?.id === id && !('tokenHash' in one.json.data), 'C4-same-id/readback', fmt(one.json));
    await shutdown(srv);
  }

  // C5 撤回墓碑永久占用 500 容量（容量耗尽 DoS）
  {
    const srv = await boot();
    const mk = (id, token) => hit(srv.base, '/api/v1/shares', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ id, situation: 's', text: 't', demo: true, consent: true, sourceUrl: null, sourceExcerpt: null }),
    });
    const del = (id, token) => hit(srv.base, '/api/v1/shares/' + id, {
      method: 'DELETE', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: '{}',
    });
    const N = 500;
    let created = 0;
    for (let k = 0; k < N; k++) {
      const id = crypto.randomUUID(), token = Array.from({ length: 64 }, (_, j) => ((k + j) % 16).toString(16)).join('');
      const res = await mk(id, token);
      if (res.status === 201) created++;
      const d = await del(id, token);
      if (d.status !== 200) findings.push({ kind: 'C5-capacity/revoke-failed', detail: `k=${k} status=${d.status}` });
    }
    expect(created === N, 'C5-capacity/all-created', `created=${created}`);
    const fresh = await mk(crypto.randomUUID(), 'c'.repeat(64));
    // 修复后：撤回墓碑不占容量，全部撤回后新分享必须成功
    expect(fresh.status === 201, 'C5-capacity/tombstones-freed', `status=${fresh.status} body=${fmt(fresh.json)}`);
    await shutdown(srv);
  }

  // C6 超限流式请求体：8KB 限制中途抛错时，客户端必须仍能收到完整 400 JSON（已实测成立）
  {
    const srv = await boot();
    const payload = 'POST /api/v1/search HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 20000\r\nConnection: close\r\n\r\n'
      + '{"query":"' + 'a'.repeat(19988) + '"}';
    const r = await rawRequest(srv.port, payload);
    expect(r.label !== 'timeout', 'C6-oversize/responded', r.label);
    const code = (r.raw.match(/HTTP\/1\.1 (\d+)/) || [])[1];
    expect(code === '400' && r.raw.includes('INVALID_QUERY'), 'C6-oversize/json-delivered', `code=${code}`);
    await shutdown(srv);
  }

  // C7 畸形请求目标：llhttp 层拦截或安全落 404，绝不能变成 5xx（实测 ：x 被解析器 400，其余 404）
  {
    const srv = await boot();
    for (const target of [':x', '*', '//evil.com/path', '/%zz', '/api/v1/stories/..%2f..%2fetc']) {
      const r = await rawRequest(srv.port, `GET ${target} HTTP/1.1\r\nHost: h\r\nConnection: close\r\n\r\n`);
      const code = (r.raw.match(/HTTP\/1\.1 (\d+)/) || [])[1];
      expect(['400', '404'].includes(code), 'C7-rawurl/client-error-only', `${JSON.stringify(target)} → ${code ?? r.label}`);
    }
    await shutdown(srv);
  }

  // C8 Origin: null（沙箱 iframe / 隐私模式跳转的合法浏览器形态）→ 403 来源不匹配（修复后行为）
  {
    const srv = await boot();
    const res = await hit(srv.base, '/api/v1/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'null', authorization: 'Bearer ' + 'd'.repeat(64) },
      body: JSON.stringify({ id: crypto.randomUUID(), situation: '处境', text: '内容', demo: false, consent: true, sourceUrl: null, sourceExcerpt: null }),
    });
    expect(res.status === 403 && /来源不匹配/.test(res.json?.error?.message ?? ''), 'C8-origin/null-403', `status=${res.status} body=${fmt(res.json)}`);
    await shutdown(srv);
  }

  // C9 上游单条投毒 → 整个查询 fail-closed 502；且失败不缓存，立刻重试撞上节流
  {
    const srv = await boot({ minIntervalMs: 60_000, fetchImpl: UPSTREAM_GALLERY.poisoned });
    const q1 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '投毒' }) });
    expect(q1.status === 502 && q1.json?.error?.code === 'UPSTREAM_UNAVAILABLE', 'C9-poison/fail-closed', fmt(q1.json));
    const q2 = await hit(srv.base, '/api/v1/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '投毒' }) });
    expect(q2.status === 429, 'C9-poison/retry-throttled', `status=${q2.status}`);
    expect(q2.json?.error?.retryAfterSeconds >= 1, 'C9-poison/retry-after-body', fmt(q2.json?.error));
    expect(q2.headers['retry-after'], 'C9-poison/retry-after-header', fmt(q2.headers));
    await shutdown(srv);
  }

  // ---------- 汇总 ----------
  console.log('\n================ 审计汇总 ================');
  console.log(`不变量断言: ${passed}/${checks} 通过`);
  if (findings.length) {
    console.log(`\n发现 ${findings.length} 项（含已知缺陷复现与待分析项）:`);
    for (const f of findings) console.log(`  [${f.kind}] ${f.detail}`);
  } else {
    console.log('未发现不变量违例。');
  }
  process.exit(0);
}

main().catch(e => { console.error('FUZZ-HARNESS-CRASH:', e); process.exit(1); });
