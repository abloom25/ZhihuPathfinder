import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertResponse } from './contract.mjs';

// Explicit command only: makes two upstream requests and restarts its named test API.
const project = process.env.ACCEPTANCE_PROJECT;
if (!project || !/^later-[a-z0-9-]+$/.test(project)) throw new Error('Set ACCEPTANCE_PROJECT to a dedicated later-* test stack');
const base = (process.env.BASE_URL || 'http://127.0.0.1:8089').replace(/\/$/, '');
const report = { startedAt: new Date().toISOString(), project, base, steps: [], passed: false };
const compose = args => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', 'compose.search.yaml', ...args], { encoding: 'utf8' });
async function search(expectedMode) {
  const r = await fetch(`${base}/api/v1/search`, { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '后续 还愿 offer' }) });
  const body = await r.json();
  assertResponse('/search', 'post', r.status, body);
  report.steps.push({ action: 'search', status: r.status, mode: body.meta.mode ?? null,
    errorCode: body.error?.code ?? null, fetchedAt: body.meta.fetchedAt ?? null,
    count: body.data?.candidates.length ?? null,
    responseHash: createHash('sha256').update(JSON.stringify(body)).digest('hex') });
  assert.equal(r.status, 200, 'Live query failed; no automatic retry');
  assert.equal(body.meta.mode, expectedMode);
  assert.ok(body.data.candidates.length > 0);
  return body;
}
try {
  const first = await search('live');
  const cached = await search('cached');
  assert.deepEqual(cached.data, first.data);
  assert.equal(cached.meta.fetchedAt, first.meta.fetchedAt);
  const id = compose(['ps', '-q', 'api']).trim();
  const started = () => execFileSync('docker', ['inspect', '--format', '{{.State.StartedAt}}', id], { encoding: 'utf8' }).trim();
  const before = started();
  compose(['restart', 'api']);
  compose(['up', '-d', '--wait', '--wait-timeout', '40']);
  const after = started();
  assert.notEqual(before, after);
  report.steps.push({ action: 'restart', before, after });
  assert.equal((await fetch(`${base}/api/v1/stories`)).status, 200);
  const fresh = await search('live');
  assert.notEqual(fresh.meta.fetchedAt, first.meta.fetchedAt);
  const recached = await search('cached');
  assert.deepEqual(recached.data, fresh.data);
  assert.equal(recached.meta.fetchedAt, fresh.meta.fetchedAt);
  report.passed = true;
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(new URL('../test/container-search-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
