import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { assertResponse } from './contract.mjs';

const base = (process.env.BASE_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');
const results = [];
async function request(path, expected, body) {
  const r = await fetch(base + path, { signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  assert.equal(r.status, expected, `${path}: expected ${expected}, got ${r.status}`);
  assert.match(r.headers.get('content-type') || '', /application\/json/);
  const data = await r.json();
  if (path.startsWith('/api/v1/') && path !== '/api/v1/unknown') {
    const template = path.startsWith('/api/v1/stories/') ? '/stories/{storyId}' : path.slice('/api/v1'.length);
    assertResponse(template, body === undefined ? 'GET' : 'POST', r.status, data);
  }
  results.push({ path, status: r.status, passed: true });
  return data;
}
try {
  assert.equal((await request('/healthz', 200)).status, 'ok');
  const home = await request('/api/v1/stories', 200);
  assert.equal(home.meta.contentMode, 'curated_snapshot');
  assert.equal(home.data.stories.length, 3);
  for (const story of home.data.stories) {
    const detail = await request(`/api/v1/stories/${story.id}`, 200);
    assert.deepEqual(detail.data, story);
    for (const episode of story.episodes) {
      assert.ok(episode.unknowns.length);
      for (const node of episode.nodes) assert.ok(story.source.rawText.includes(node.quote));
    }
  }
  assert.equal(home.data.stories.find(s => s.id === 'story-h02-05').episodes.length, 2);
  assert.equal((await request('/api/v1/stories/not-found', 404)).error.code, 'NOT_FOUND');
  assert.equal((await request('/api/v1/unknown', 404)).error.code, 'NOT_FOUND');
  assert.equal((await request('/api/v1/search', 400, { query: ' ' })).error.code, 'INVALID_QUERY');
  if (process.env.CHECK_SEARCH === '1') {
    const query = process.env.SEARCH_QUERY || '后续 还愿 offer';
    const first = await request('/api/v1/search', 200, { query });
    assert.equal(first.data.hasMore, false);
    assert.ok(first.data.candidates.length <= 10);
    for (const candidate of first.data.candidates) assert.equal(candidate.reviewStatus, 'unreviewed');
    const second = await request('/api/v1/search', 200, { query });
    assert.equal(second.meta.mode, 'cached');
    assert.equal(second.meta.fetchedAt, first.meta.fetchedAt);
  }
  if (process.env.CHECK_FRONTEND === '1') {
    // Routing checks only: browser interaction and local persistence remain separate.
    let index;
    for (const path of ['/', '/stories/story-h02-01', '/records', '/records/acceptance-record', '/record/new']) {
      const r = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
      assert.equal(r.status, 200, `frontend route ${path}`);
      assert.match(r.headers.get('content-type') || '', /text\/html/);
      const html = await r.text();
      assert.match(html, /<html[\s>]/i);
      if (index === undefined) index = html;
      else assert.equal(html, index, 'SPA refresh must return the same entry document');
      results.push({ path, status: r.status, passed: true, type: 'routing-only' });
    }
    const missing = await fetch(base + '/assets/acceptance-missing.js');
    assert.equal(missing.status, 404);
  }
} catch (error) {
  results.push({ passed: false, message: error.message });
  process.exitCode = 1;
}
const report = { verifiedAt: new Date().toISOString(), baseUrl: base,
  passed: results.every(r => r.passed), searchChecked: process.env.CHECK_SEARCH === '1',
  frontendRoutingChecked: process.env.CHECK_FRONTEND === '1',
  frontendUserJourneyVerified: false, results };
if (process.env.REPORT_PATH) writeFileSync(process.env.REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
