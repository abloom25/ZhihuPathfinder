import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createApp } from '../server.mjs';
import { assertResponse, assertSchema } from '../scripts/contract.mjs';

const evidence = [];
const item = { Title: '合成契约测试', AuthorName: '合成作者', ContentText: '测试原文，不是真实经历。',
  Url: 'https://www.zhihu.com/question/1/answer/2', EditTime: 123 };
const success = items => new Response(JSON.stringify({ Code: 0, Data: { Items: items } }));
async function scenario(name, options, work) {
  const app = createApp({ minIntervalMs: 0, ...options });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  async function call(path, expected, query, expectedCode) {
    const method = path === '/search' ? 'POST' : 'GET';
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/v1${path}`, {
      method, signal: AbortSignal.timeout(2000), ...(method === 'POST' ? {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
      } : {}),
    });
    const body = await response.json();
    assert.equal(response.status, expected);
    const template = path.startsWith('/stories/') ? '/stories/{storyId}' : path;
    const schema = assertResponse(template, method, response.status, body);
    if (expectedCode) assert.equal(body.error.code, expectedCode);
    assert.ok(!JSON.stringify(body).includes('SECRET_SENTINEL'));
    evidence.push({ scenario: name, path: template, status: response.status, schema,
      code: body.error?.code ?? null, passed: true });
    return body;
  }
  try { await work(call); } finally { await new Promise(r => app.close(r)); }
}
test('contract: curated responses and missing story', async () => {
  await scenario('curated', {}, async call => {
    const home = await call('/stories', 200);
    for (const story of home.data.stories) await call(`/stories/${story.id}`, 200);
    await call('/stories/missing', 404, undefined, 'NOT_FOUND');
  });
});
test('contract: live, cached, empty and invalid query', async () => {
  await scenario('search success', { secret: 'SECRET_SENTINEL', fetchImpl: async () => success([item]) }, async call => {
    assert.equal((await call('/search', 200, 'x')).meta.mode, 'live');
    assert.equal((await call('/search', 200, 'x')).meta.mode, 'cached');
    await call('/search', 400, ' ', 'INVALID_QUERY');
  });
  await scenario('empty', { secret: 'SECRET_SENTINEL', fetchImpl: async () => success([]) }, async call => {
    assert.deepEqual((await call('/search', 200, 'x')).data.candidates, []);
  });
});
test('contract: HTTP/business limits and all upstream failures', async () => {
  const cases = [
    ['HTTP limit', () => new Response('', { status: 429 }), 429, 'RATE_LIMITED'],
    ['business limit', () => new Response('{"Code":30001}'), 429, 'RATE_LIMITED'],
    ['HTTP auth', () => new Response('SECRET_SENTINEL', { status: 401 }), 502, 'UPSTREAM_UNAVAILABLE'],
    ['HTTP failure', () => new Response('', { status: 500 }), 502, 'UPSTREAM_UNAVAILABLE'],
    ['business failure', () => new Response('{"Code":20001}'), 502, 'UPSTREAM_UNAVAILABLE'],
    ['invalid JSON', () => new Response('SECRET_SENTINEL'), 502, 'UPSTREAM_UNAVAILABLE'],
    ['missing Items', () => new Response('{"Code":0,"Data":{}}'), 502, 'UPSTREAM_UNAVAILABLE'],
    ['invalid item', () => success([{ ...item, AuthorName: null }]), 502, 'UPSTREAM_UNAVAILABLE'],
    ['network failure', () => { throw new Error('SECRET_SENTINEL'); }, 502, 'UPSTREAM_UNAVAILABLE'],
    ['timeout', (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))), 504, 'UPSTREAM_TIMEOUT'],
  ];
  for (const [name, fetchImpl, status, code] of cases) {
    await scenario(name, { secret: 'SECRET_SENTINEL', fetchImpl, timeoutMs: 20 }, async call => {
      await call('/search', status, 'x', code);
      await call('/stories', 200);
    });
  }
  await scenario('missing secret', {}, call => call('/search', 502, 'x', 'UPSTREAM_UNAVAILABLE'));
});
test('contract guard actually rejects missing/extra fields, wrong enum/date/status', () => {
  const good = { error: { code: 'RATE_LIMITED', message: 'test', retryAfterSeconds: null }, meta: { requestId: 'r' } };
  assertResponse('/search', 'post', 429, good);
  for (const mutate of [x => delete x.meta, x => x.error.code = 'UNKNOWN', x => x.extra = true, x => x.error.retryAfterSeconds = 0]) {
    const bad = structuredClone(good); mutate(bad);
    assert.throws(() => assertResponse('/search', 'post', 429, bad));
  }
  assert.throws(() => assertResponse('/search', 'post', 418, good));
  assert.throws(() => assertSchema('Source', { url: item.Url, authorName: 'a', title: '', retrievedAt: 'yesterday', apiEditTime: null, coverage: 'api_excerpt', rawText: 'x' }));
});
after(() => writeFileSync(new URL('./contract-verification.json', import.meta.url), JSON.stringify({
  verifiedAt: new Date().toISOString(), source: 'actual HTTP responses with controlled upstream, not live Zhihu',
  checks: evidence, reservedNotExercised: ['GET /stories 502', 'GET /stories/{storyId} 502'],
}, null, 2) + '\n'));
