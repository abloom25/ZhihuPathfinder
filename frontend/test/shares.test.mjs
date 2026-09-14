import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { beforeEachReset, setStorage } from './helpers.js'
import { prepareShare, publishPrepared, loadShareAttempt, revokePrepared, attemptKey, validShare, createShare } from '../src/lib/shares.js'
const originalFetch = globalThis.fetch
beforeEach(beforeEachReset)
afterEach(() => { globalThis.fetch = originalFetch })
const body = { situation: '测试处境', text: '【演示】我还在等待', demo: true, consent: true, sourceUrl: null, sourceExcerpt: null }
const success = (id, content = body) => ({ ...content, id, createdAt: new Date().toISOString() })
test('响应丢失后重新读取管理记录，以相同 ID、凭据、原文重试', async () => {
  const a = await prepareShare('r1', body), calls = []
  globalThis.fetch = async (_, init) => {
    calls.push({ body: init.body, headers: init.headers })
    if (calls.length === 1) throw new Error('lost after server write')
    return Response.json({ data: success(a.id) })
  }
  await assert.rejects(publishPrepared('r1'), /未能确认/)
  assert.equal(loadShareAttempt('r1').status, 'pending')
  assert.equal((await prepareShare('r1', body)).id, a.id)
  await publishPrepared('r1')
  assert.deepEqual(calls[0], calls[1])
  assert.equal(loadShareAttempt('r1').status, 'published')
})
test('32 个并发准备只得到一个 ID；不同内容不得覆盖冻结提交', async () => {
  const rows = await Promise.all(Array.from({ length: 32 }, () => prepareShare('r1', body)))
  assert.equal(new Set(rows.map(a => a.id)).size, 1)
  await assert.rejects(prepareShare('r1', { ...body, text: '另一份文字' }), /已有另一份/)
  assert.equal(loadShareAttempt('r1').body.text, body.text)
})
test('存储拒绝或管理记录损坏时不发出请求、不覆盖损坏内容', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({}) }
  setStorage({ write: true })
  await assert.rejects(prepareShare('r1', body))
  setStorage()
  localStorage.setItem(attemptKey('r1'), '{')
  await assert.rejects(prepareShare('r1', body))
  assert.equal(localStorage.getItem(attemptKey('r1')), '{')
  assert.equal(calls, 0)
})
test('HTTP 200 空包、错 ID、错误来源都不能确认公开', async () => {
  const a = await prepareShare('r1', body)
  for (const data of [undefined, {}, success(crypto.randomUUID()), { ...success(a.id), sourceUrl: 'javascript:alert(1)' }]) {
    globalThis.fetch = async () => Response.json({ data })
    await assert.rejects(publishPrepared('r1'), /格式异常/)
    assert.equal(loadShareAttempt('r1').status, 'pending')
  }
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(createShare({ content: body }))
})
test('关闭后可重新读取撤回凭据；错误撤回响应不标成功，重复撤回安全', async () => {
  const a = await prepareShare('r1', body)
  globalThis.fetch = async () => Response.json({ data: success(a.id) })
  await publishPrepared('r1')
  globalThis.fetch = async () => Response.json({ data: {} })
  await assert.rejects(revokePrepared('r1'))
  assert.equal(loadShareAttempt('r1').status, 'published')
  globalThis.fetch = async () => Response.json({ data: { revoked: true } })
  await revokePrepared('r1'); await revokePrepared('r1')
  assert.equal(loadShareAttempt('r1').status, 'revoked')
  assert.notEqual((await prepareShare('r1', body)).id, a.id)
})
test('递归极端成功包不能绕过契约校验', () => {
  const values = [null, [], {}, true, 0, 'x', '-'.repeat(36)]
  let layer = values
  for (let depth = 0; depth < 6; depth++) {
    for (const value of layer) assert.equal(validShare(value), false)
    layer = layer.map(value => ({ data: [value], id: value }))
  }
  assert.equal(validShare({ ...success(crypto.randomUUID()), demo: false }), true)
})
