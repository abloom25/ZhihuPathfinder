// 迁移的行为测试（来自交接包消融清单中的两组）：
// 1. 来源快照（source-snapshot）：保存后摘录必须与来源链接一同持久存在；
//    无来源的摘录不能写入；2000 码点上限不得伤及已有记录。
// 2. 旧版本冲突（stale-write）：过时页面的追加/删除必须被拒绝，
//    并发写入恰好一方成功；绝不静默覆盖后来追加的内容。

import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { beforeEachReset, getRaw, KEY, setStorage } from './helpers.js'
import {
  StorageConflictError,
  StorageWriteError,
  appendEntry,
  createRecord,
  deleteRecord,
  exportRecordsJson,
  importRecordsJson,
  loadRecords,
  validateRecordsFile,
} from '../src/lib/records.js'

const input = (text) => ({ initialText: text, sourceUrl: null, sourceTitle: null })
const ZHIHU = 'https://www.zhihu.com/question/49022412/answer/2040264812706385925'

beforeEach(() => beforeEachReset())

// ---------- 旧版本冲突组（stale-write） ----------

test('并发创建保留两条记录；过时版本的追加与删除被拒绝且不丢内容', async () => {
  const [a, b] = await Promise.all([createRecord(input('first')), createRecord(input('second'))])
  assert.equal(loadRecords().records.length, 2)
  const updated = await appendEntry(a, 'later')
  await assert.rejects(appendEntry(a, 'stale'), StorageConflictError)
  await assert.rejects(deleteRecord(a), StorageConflictError)
  assert.equal(loadRecords().records.find((r) => r.id === a.id).entries.length, 1)
  await deleteRecord(updated)
  assert.deepEqual(loadRecords().records.map((r) => r.id), [b.id])
})

test('同一版本的两次并发追加：恰好一次成功、一次冲突，只有一条进入存储', async () => {
  const a = await createRecord(input('initial'))
  const results = await Promise.allSettled([appendEntry(a, 'A'), appendEntry(a, 'B')])
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  assert.equal(results.filter((x) => x.status === 'rejected' && x.reason instanceof StorageConflictError).length, 1)
  assert.equal(loadRecords().records[0].entries.length, 1)
})

test('写入失败保留旧字节；读取失败不得伪装成空导出', async () => {
  const a = await createRecord(input('keep'))
  const old = getRaw()
  setStorage({ write: true })
  await assert.rejects(deleteRecord(a))
  assert.equal(getRaw(), old)
  setStorage({ read: true })
  assert.equal(loadRecords().status, 'unavailable')
  assert.throws(exportRecordsJson)
})

test('相同 creationId 重试复用原记录；内容变更则冲突拒绝，不产生第二条', async () => {
  const a = await createRecord({ ...input('我的原话'), creationId: '11111111-1111-4111-8111-111111111111' })
  const again = await createRecord({ ...input('我的原话'), creationId: a.id })
  assert.equal(again.id, a.id)
  assert.equal(loadRecords().records.length, 1)
  await assert.rejects(
    createRecord({ ...input('改口之后的原话'), creationId: a.id }),
    StorageConflictError,
  )
  assert.equal(loadRecords().records.length, 1)
  await assert.rejects(createRecord({ ...input('x'), creationId: 'not-a-uuid' }), StorageWriteError)
})

// ---------- 来源快照组（source-snapshot） ----------

test('来源摘录在追加、导出、导入后逐字保留；旧结构记录仍可加载', async () => {
  const legacy = await createRecord(input('legacy'))
  assert.equal(loadRecords().status, 'ok')
  const r = await createRecord({
    ...input('我当时的原话'),
    sourceUrl: ZHIHU,
    sourceTitle: 'L05-04',
    sourceExcerpt: '5.18问了一下hr，反馈还在走流程中',
  })
  const updated = await appendEntry(r, '我后来的补充')
  assert.equal(updated.sourceExcerpt, '5.18问了一下hr，反馈还在走流程中')
  const backup = exportRecordsJson()
  assert.ok(validateRecordsFile(JSON.parse(backup)))
  await importRecordsJson(backup)
  assert.equal(loadRecords().records.find((x) => x.id === r.id).sourceExcerpt, '5.18问了一下hr，反馈还在走流程中')
  assert.equal(loadRecords().records.find((x) => x.id === legacy.id).sourceExcerpt, undefined)
})

test('摘录必须伴随知乎来源；超限摘录被拒绝且不影响已有记录', async () => {
  await createRecord(input('keep'))
  await assert.rejects(createRecord({ ...input('x'), sourceExcerpt: '只有摘录没有来源' }))
  await assert.rejects(
    createRecord({ ...input('x'), sourceUrl: 'https://evil.example.com/x', sourceExcerpt: '非知乎来源' }),
  )
  await assert.rejects(
    createRecord({ ...input('x'), sourceUrl: ZHIHU, sourceExcerpt: '字'.repeat(2001) }),
  )
  assert.equal(loadRecords().records.length, 1)
})

test('摘录版本冲突的备份被整体拒绝，不覆盖任何内容', async () => {
  const a = await createRecord({
    ...input('原话'),
    sourceUrl: ZHIHU,
    sourceExcerpt: '原快照',
  })
  const changed = { ...a, sourceExcerpt: '被替换的快照' }
  const before = getRaw()
  await assert.rejects(importRecordsJson(JSON.stringify({ schemaVersion: 1, records: [changed] })), /不同版本/)
  assert.equal(getRaw(), before)
  await assert.rejects(appendEntry(changed, 'stale'), StorageConflictError)
})

test('收到的分享快照与本人原话分开；追加、导出导入保持关联，伪 ID 不落库', async () => {
  const receivedFrom = { shareId: crypto.randomUUID(), situation: '等待', text: '他人的原文片段', demo: true }
  const r = await createRecord({ ...input('自己的当下'), receivedFrom })
  const updated = await appendEntry(r, '自己的后来')
  assert.equal(updated.initialText, '自己的当下')
  assert.deepEqual(updated.receivedFrom, receivedFrom)
  const backup = exportRecordsJson()
  localStorage.removeItem(KEY)
  await importRecordsJson(backup)
  assert.deepEqual(loadRecords().records[0].receivedFrom, receivedFrom)
  assert.equal(loadRecords().records[0].entries[0].text, '自己的后来')
  const before = getRaw()
  await assert.rejects(createRecord({ ...input('错误来源'), receivedFrom: { ...receivedFrom, shareId: '-'.repeat(36) } }))
  assert.equal(getRaw(), before)
})
