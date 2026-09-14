import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

const item = { Title: '后来', AuthorName: '测试作者', ContentText: '当时等待，后来再次申请。',
  Url: 'https://www.zhihu.com/question/1/answer/2?utm_source=test', EditTime: 123 };
const upstream = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
test('empty author names retain separate source identities instead of failing the whole batch', async () => {
  await withApp({secret:'test-only', fetchImpl:async()=>upstream({Code:0,Data:{Items:[
    {...item,AuthorName:''}, {...item,AuthorName:'  ',Url:'https://www.zhihu.com/question/1/answer/3'},item,
  ]}})}, async (_,post)=>{
    const response=await post('offer 回复期限');
    assert.equal(response.status,200);
    const {data}=await response.json();
    assert.equal(data.candidates.length,2);
    assert.equal(data.candidates[0].source.authorName,'作者名未返回');
    assert.equal(data.candidates[1].source.authorName,'作者名未返回');
    assert.notEqual(data.candidates[0].id,data.candidates[1].id);
    assert.equal(data.candidates[0].reviewStatus,'unreviewed');
  });
});
async function withApp(options, work) {
  const app = createApp({ minIntervalMs: 0, ...options });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}/api/v1`;
  const post = query => fetch(`${base}/search`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  try { await work(base, post); } finally { await new Promise(resolve => app.close(resolve)); }
}
test('curated home/detail work without API; quotations and separate episodes retained', async () => {
  await withApp({}, async base => {
    const home = await (await fetch(`${base}/stories`)).json();
    assert.equal(home.data.stories.length, 3);
    for (const story of home.data.stories) {
      const detail = await (await fetch(`${base}/stories/${story.id}`)).json();
      assert.deepEqual(detail.data, story);
      for (const ep of story.episodes) for (const n of ep.nodes) assert.ok(story.source.rawText.includes(n.quote));
    }
    assert.equal(home.data.stories.find(s => s.id === 'story-h02-05').episodes.length, 2);
    assert.equal((await fetch(`${base}/stories/missing`)).status, 404);
  });
});
test('trimmed Unicode query, live mapping, stable cache timestamp and request-specific ID', async () => {
  let calls = 0;
  await withApp({ secret: 'test-only', fetchImpl: async (url, options) => {
    calls++; assert.equal(url.searchParams.get('Query'), '😀'.repeat(120));
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    return upstream({ Code: 0, Data: { Items: [item, item] } });
  } }, async (_, post) => {
    const a = await (await post(` ${'😀'.repeat(120)} `)).json();
    const b = await (await post('😀'.repeat(120))).json();
    assert.equal(calls, 1); assert.equal(a.meta.mode, 'live'); assert.equal(b.meta.mode, 'cached');
    assert.equal(a.meta.fetchedAt, b.meta.fetchedAt); assert.notEqual(a.meta.requestId, b.meta.requestId);
    assert.equal(a.data.candidates.length, 1);
    assert.equal(a.data.candidates[0].source.rawText, item.ContentText);
    assert.equal(a.data.candidates[0].source.url, 'https://www.zhihu.com/question/1/answer/2');
    assert.equal(a.data.candidates[0].reviewStatus, 'unreviewed');
    assert.equal((await post('😀'.repeat(121))).status, 400);
  });
});
test('invalid body never reaches upstream', async () => {
  await withApp({ fetchImpl: () => assert.fail('unexpected upstream') }, async (base, post) => {
    for (const q of ['', '  ', 123, null]) assert.equal((await post(q)).status, 400);
    for (const body of ['{', '{}', '{"query":"x","extra":true}']) {
      assert.equal((await fetch(`${base}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 400);
    }
    assert.equal((await post('valid')).status, 502);
  });
});
test('upstream business rate limit blocks repeats while home remains usable', async () => {
  let calls = 0;
  await withApp({ secret: 'test-only', fetchImpl: async () => { calls++; return upstream({ Code: 30001 }); } }, async (base, post) => {
    for (const query of ['a', 'b']) {
      const response = await post(query); assert.equal(response.status, 429);
      const wait = (await response.json()).error.retryAfterSeconds;
      assert.ok(Number.isInteger(wait) && wait >= 1 && wait <= 60);
      assert.equal(response.headers.get('retry-after'), String(wait));
    }
    assert.equal(calls, 1); assert.equal((await fetch(`${base}/stories`)).status, 200);
  });
});
test('timeout is 504 and releases the active search lock', async () => {
  await withApp({ secret: 'test-only', timeoutMs: 10, fetchImpl: async (_, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }, async (_, post) => {
    assert.equal((await post('a')).status, 504); assert.equal((await post('b')).status, 504);
  });
});
test('empty success distinguished from malformed or failed upstream, errors do not leak', async () => {
  const cases = [
    [() => upstream({ Code: 0, Data: { Items: [] } }), 200],
    [() => upstream({ Code: 0, Data: {} }), 502],
    [() => upstream({ Code: 0, Data: { Items: [{ ...item, Url: 'https://evil.test/' }] } }), 502],
    [() => new Response('secret-test-only', { status: 401 }), 502],
    [() => new Response('secret-test-only'), 502],
    [() => new Response('', { status: 429 }), 429],
  ];
  for (const [fetchImpl, expected] of cases) await withApp({ secret: 'test-only', fetchImpl }, async (_, post) => {
    const r = await post('x'); assert.equal(r.status, expected);
    const text = await r.text(); assert.ok(!text.includes('secret-test-only'));
    if (expected === 200) assert.deepEqual(JSON.parse(text).data.candidates, []);
  });
});
test('expired cache refetches and active calls do not fan out', async () => {
  let clock = 100000, calls = 0;
  await withApp({ secret: 'test-only', now: () => clock, cacheTtlMs: 10, fetchImpl: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 40));
    return upstream({ Code: 0, Data: { Items: [] } });
  } }, async (_, post) => {
    await post('a'); clock += 11;
    await post('a'); assert.equal(calls, 2);
    const pending = post('b'); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await post('c')).status, 429); await pending; assert.equal(calls, 3);
  });
});
