import { createShares } from './shares.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const stories = JSON.parse(readFileSync(new URL('./data/stories.json', import.meta.url), 'utf8'))
  .sort((a, b) => a.displayOrder - b.displayOrder);
const messages = {
  INVALID_QUERY: '请输入1至120个字的查询，且仅提供query字段。',
  NOT_FOUND: '未找到这条经历。',
  RATE_LIMITED: '查询暂时受限，可以继续阅读首页经历。',
  UPSTREAM_UNAVAILABLE: '查询暂时不可用，请稍后手动重试。',
  UPSTREAM_TIMEOUT: '查询超时，请稍后手动重试。',
};
class Failure extends Error {
  constructor(status, code, retryAfterSeconds = null) {
    super(code); Object.assign(this, { status, code, retryAfterSeconds });
  }
}
const unavailable = () => new Failure(502, 'UPSTREAM_UNAVAILABLE');

export function mapItems(items, fetchedAt) {
  if (!Array.isArray(items)) throw unavailable();
  const seen = new Set();
  return items.slice(0, 10).map(item => {
    if (!item || typeof item.ContentText !== 'string' || !item.ContentText.trim() ||
        typeof item.AuthorName !== 'string' ||
        typeof item.Title !== 'string' || typeof item.Url !== 'string') throw unavailable();
    let url;
    try { url = new URL(item.Url); } catch { throw unavailable(); }
    if (url.protocol !== 'https:' || url.username || url.password ||
        !(url.hostname === 'zhihu.com' || url.hostname.endsWith('.zhihu.com'))) throw unavailable();
    url.search = ''; url.hash = '';
    const canonical = url.href;
    if (seen.has(canonical)) return null;
    seen.add(canonical);
    return {
      id: `candidate-${createHash('sha256').update(canonical).digest('hex').slice(0, 20)}`,
      reviewStatus: 'unreviewed',
      source: { url: canonical, authorName: item.AuthorName.trim() || '作者名未返回', title: item.Title,
        retrievedAt: fetchedAt, apiEditTime: Number.isSafeInteger(item.EditTime) ? item.EditTime : null,
        coverage: 'api_excerpt', rawText: item.ContentText },
      notice: '知乎API返回的原文片段，尚未核对前后变化；可能缺少后续，也可能包含多次经历。',
      possibleMultipleEvents: /再次|第二次|又一次|另一个|另一家/.test(item.ContentText),
    };
  }).filter(Boolean);
}

export function createApp({ fetchImpl = fetch, secret = '', timeoutMs = 20000,
  shareFile = process.env.SHARE_FILE || './runtime/shares.json', cacheTtlMs = 300000, maxCacheEntries = 100, minIntervalMs = 1000, now = Date.now } = {}) {
  const shares = createShares(shareFile);
  const cache = new Map();
  let active = false, lastStart = -Infinity, blockedUntil = 0;
  async function search(query, requestId) {
    const hit = cache.get(query);
    if (hit && now() - hit.savedAt < cacheTtlMs) {
      return { data: hit.data, meta: { requestId, mode: 'cached', fetchedAt: hit.fetchedAt } };
    }
    cache.delete(query);
    if (!secret) throw unavailable();
    if (now() < blockedUntil || active || now() - lastStart < minIntervalMs) {
      throw new Failure(429, 'RATE_LIMITED');
    }
    active = true; lastStart = now();
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const url = new URL('https://developer.zhihu.com/api/v1/content/zhihu_search');
      url.searchParams.set('Query', query); url.searchParams.set('Count', '10');
      const response = await fetchImpl(url, { signal, redirect: 'error', headers: {
        Authorization: `Bearer ${secret}`, 'X-Request-Timestamp': String(Math.floor(now() / 1000)),
        'Content-Type': 'application/json',
      } });
      if (response.status === 429) {
        blockedUntil = now() + 60000;
        throw new Failure(429, 'RATE_LIMITED');
      }
      if (!response.ok) throw unavailable();
      // Bound upstream body size; never forward raw error bodies or credentials.
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw unavailable();
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.Code === 30001) {
        blockedUntil = now() + 60000;
        throw new Failure(429, 'RATE_LIMITED');
      }
      if (body.Code !== 0) throw unavailable();
      const fetchedAt = new Date(now()).toISOString();
      const data = { query, candidates: mapItems(body.Data?.Items, fetchedAt), hasMore: false };
      if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value);
      cache.set(query, { data, fetchedAt, savedAt: now() });
      return { data, meta: { requestId, mode: 'live', fetchedAt } };
    } catch (error) {
      if (error instanceof Failure) throw error;
      if (signal.aborted) throw new Failure(504, 'UPSTREAM_TIMEOUT');
      throw unavailable();
    } finally { active = false; }
  }
  return http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if(await shares(req,res,path,reply)) return;
      if (req.method === 'GET' && path === '/healthz') {
        return reply(200, { status: 'ok', contractVersion: '0.1.0' });
      }
      const meta = { requestId, contentMode: 'curated_snapshot' };
      if (req.method === 'GET' && path === '/api/v1/stories') {
        return reply(200, { data: { stories }, meta });
      }
      if (req.method === 'GET' && path.startsWith('/api/v1/stories/')) {
        const story = stories.find(s => s.id === path.slice('/api/v1/stories/'.length));
        if (!story) throw new Failure(404, 'NOT_FOUND');
        return reply(200, { data: story, meta });
      }
      if (req.method === 'POST' && path === '/api/v1/search') {
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new Failure(400, 'INVALID_QUERY');
        }
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) throw new Failure(400, 'INVALID_QUERY');
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new Failure(400, 'INVALID_QUERY'); }
        if (!body || typeof body.query !== 'string' || Object.keys(body).length !== 1) {
          throw new Failure(400, 'INVALID_QUERY');
        }
        const query = body.query.trim();
        if ([...query].length < 1 || [...query].length > 120) throw new Failure(400, 'INVALID_QUERY');
        return reply(200, await search(query, requestId));
      }
      throw new Failure(404, 'NOT_FOUND');
    } catch (error) {
      const failure = error instanceof Failure ? error : unavailable();
      reply(failure.status, { error: { code: failure.code, message: messages[failure.code],
        retryAfterSeconds: failure.retryAfterSeconds }, meta: { requestId } });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let secret = process.env.ZHIHU_ACCESS_SECRET?.trim() || '';
  if (!secret && process.env.ZHIHU_ACCESS_SECRET_FILE) {
    try { secret = readFileSync(process.env.ZHIHU_ACCESS_SECRET_FILE, 'utf8').trim(); }
    catch { console.error('Cannot read ZHIHU_ACCESS_SECRET_FILE'); process.exit(1); }
  }
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  const app = createApp({ secret });
  app.requestTimeout = 30000;
  app.on('error', error => { console.error(`Server startup failed: ${error.code}`); process.exit(1); });
  app.listen(port, host, () => console.log(`Later API listening at http://${host}:${port}/api/v1 (search configured: ${Boolean(secret)})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => process.exit(0)));
}
