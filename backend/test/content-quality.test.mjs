import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mapItems, createApp } from '../server.mjs';
import { assertSchema, assertResponse } from '../scripts/contract.mjs';

const raw = readFileSync(new URL('./fixtures/historical-40.json', import.meta.url));
const rows = JSON.parse(raw);
const provenance = JSON.parse(readFileSync(new URL('./fixtures/historical-source.json', import.meta.url)));
const time = '2026-09-06T00:00:00.000Z'; // Test capture timestamp, not historical event time.
const sha = value => createHash('sha256').update(value).digest('hex');
const hintAudits = {
  'H01-01': { multiple: true, evidence: '第一个面试工作：客服', secondEvidence: '第二个面试工作：前台', note: '漏提示：至少两份不同工作。' },
  'H01-06': { multiple: true, evidence: '第二次正式面试', note: '提示有依据：不同公司的面试。' },
  'H02-05': { multiple: true, evidence: '时隔两年再次来求offer', note: '提示有依据：旧申请与新申请分开。' },
  'H02-02': { multiple: false, evidence: '另一家', note: '建议中比较公司，不能据此确认作者有多次经历。' },
  'H02-07': { multiple: false, evidence: '另一家公司', note: '维权材料举例，不能据此确认作者经历。' },
  'H02-09': { multiple: false, evidence: '再次投递', note: '建议再次投递，不是已发生的作者经历。' },
  'H02-10': { multiple: false, evidence: '第二次读', note: '重复阅读，不是再次求职。' },
  'H03-02': { multiple: false, evidence: '另一个旅游点', note: '地点措辞，不是另一次辞职事件。' },
};
test('40 historical items: exact mapping, canonical duplicates, missing fields and bounded hints', () => {
  assert.equal(rows.length, 40);
  assert.equal(sha(raw), provenance.sha256);
  let missingFieldChecks = 0;
  const checks = rows.map(row => {
    const [candidate] = mapItems([row], time);
    assertSchema('Candidate', candidate);
    const expectedUrl = new URL(row.Url); expectedUrl.search = ''; expectedUrl.hash = '';
    assert.equal(candidate.source.url, expectedUrl.href);
    assert.equal(candidate.source.rawText, row.ContentText);
    assert.equal(candidate.source.authorName, row.AuthorName);
    assert.equal(candidate.source.title, row.Title);
    assert.equal(candidate.source.apiEditTime, row.EditTime);
    assert.equal(candidate.reviewStatus, 'unreviewed');
    assert.equal(candidate.source.coverage, 'api_excerpt');
    assert.ok(!('episodes' in candidate));
    assert.ok(!('verified_outcome' in candidate));
    const deduped = mapItems([row, { ...row, Url: expectedUrl.href + '?utm_source=duplicate' }], time);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].id, candidate.id);
    for (const key of ['ContentText', 'AuthorName', 'Title', 'Url']) {
      const bad = { ...row }; delete bad[key];
      assert.throws(() => mapItems([bad], time), error => error.status === 502);
      missingFieldChecks++;
    }
    assert.equal(mapItems([{ ...row, EditTime: undefined }], time)[0].source.apiEditTime, null);
    const audit = hintAudits[row.id];
    if (audit) {
      assert.ok(row.ContentText.includes(audit.evidence));
      if (audit.secondEvidence) assert.ok(row.ContentText.includes(audit.secondEvidence));
    }
    return { id: row.id, display: 'unreviewed candidate only', mappingPassed: true,
      rawTextSha256: sha(row.ContentText), sourceUrl: candidate.source.url,
      duplicateCollapsed: true, requiredMissingRejected: true, hint: candidate.possibleMultipleEvents,
      hintAudit: audit ? { ...audit, agreesWithEvidence: audit.multiple === candidate.possibleMultipleEvents } : null };
  });
  for (let i = 0; i < 40; i += 10) assert.equal(mapItems(rows.slice(i, i + 10), time).length, 10);
  const report = {
    verifiedAt: new Date().toISOString(), inputSha256: sha(raw), rowCount: rows.length,
    mappingPassed: checks.length, duplicateChecks: rows.length, missingFieldChecks,
    missingEditTimeChecks: rows.length, hintsTrue: checks.filter(c => c.hint).length,
    manualHintAudits: Object.keys(hintAudits).length,
    hintMismatches: checks.filter(c => c.hintAudit && !c.hintAudit.agreesWithEvidence).map(c => c.id),
    limitation: 'Automated metadata/text fidelity check for all 40. Eight targeted hint-context audits, not full semantic annotation or independent source verification. A false hint does not prove a single event; a true hint does not confirm multiple events.',
    checks,
  };
  writeFileSync(new URL('./content-quality-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
});
test('one malformed upstream record rejects entire response rather than fabricating empty success', async () => {
  const app = createApp({ secret: 'synthetic', minIntervalMs: 0, fetchImpl: async () => new Response(JSON.stringify({
    Code: 0, Data: { Items: [rows[0], { ...rows[1], ContentText: '' }] },
  })) });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${app.address().port}/api/v1/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"query":"x"}',
    });
    const body = await r.json();
    assert.equal(r.status, 502);
    assertResponse('/search', 'post', r.status, body);
    assert.equal(body.error.code, 'UPSTREAM_UNAVAILABLE');
  } finally { await new Promise(r => app.close(r)); }
});
