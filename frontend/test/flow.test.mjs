import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { beforeEachReset } from './helpers.js'
import { buildInitialText, clearDraft, composeText, describeAfter, freezeChoice, freshDraft, loadDraft, saveDraft, textFits, validDraft, LEVEL_DRAFT_KEY } from '../src/lib/flow.js'
beforeEach(beforeEachReset)
const subsets = Array.from({ length: 8 }, (_, mask) => ['A','B','C'].filter((_, i) => mask & (1 << i)))
const build = (frozen, after) => buildInitialText({ frozen, after, context: '', disagreement: '' })
test('冻结对象逐字保存起初选择；修改原数组不影响原话', () => {
  const actions = ['B'], frozen = freezeChoice(actions, '先礼貌地问一句')
  actions.push('A')
  assert.deepEqual(frozen.actions, ['B'])
  assert.throws(() => { frozen.text = '改写' })
  assert.throws(() => { frozen.actions.push('C') })
})
test('保存原话、异议与不确定性，并标明探索不等于亲历', () => {
  const text = buildInitialText({ frozen: freezeChoice(['B'], '问一下进度'), after: { mode: 'keep', text: '', reason: '还不知道结果' }, context: '还有另一份机会', disagreement: '条件可能不同' })
  for (const word of ['问一下进度','还不知道结果','还有另一份机会','条件可能不同','不代表这些求职事件已经发生在我身上','保持原选择']) assert.ok(text.includes(word))
  assert.doesNotMatch(text, /已入职|背调通过|收到offer|两天后/)
})
test('全部 64 种前后行动组合，起初选择和原话均不被改写', () => {
  let count = 0
  for (const first of subsets) for (const next of subsets) {
    const frozen = freezeChoice(first, '起初原话')
    const text = build(frozen, { mode: 'change', text: composeText(next, ''), reason: '后来判断' })
    assert.ok(text.includes('看后续前，我倾向：' + frozen.text))
    assert.ok(text.includes('起初原话'))
    assert.ok(text.includes('改变倾向：' + composeText(next, '')))
    assert.ok(text.includes('后来判断'))
    count++
  }
  assert.equal(count, 64)
})
test('8 组选择 × 3 种态度，未决定也能完整记录', () => {
  assert.equal(composeText([], ''), '仍未决定')
  for (const first of subsets) for (const mode of ['keep','change','unsure']) {
    const after = { mode, text: '', reason: '' }
    assert.ok(build(freezeChoice(first, ''), after).includes(describeAfter(after)))
  }
})
test('2000 Unicode 码点边界，包括合成后超限', () => {
  assert.equal(textFits('😀'.repeat(2000)), true)
  assert.equal(textFits('😀'.repeat(2001)), false)
  assert.equal(textFits(build(freezeChoice(['A'], '字'.repeat(2000)), { mode: 'keep', text: '', reason: '' })), false)
})
test('草稿恢复保留 UUID；坏 JSON 与伪 UUID 不覆盖', () => {
  const d = { ...freshDraft(), actions: ['B'], custom: '自定义' }
  saveDraft(d)
  assert.deepEqual(loadDraft(), { draft: d, error: '' })
  clearDraft()
  assert.equal(loadDraft().error, '')
  assert.equal(validDraft({ ...d, creationId: '-'.repeat(36) }), false)
  sessionStorage.setItem(LEVEL_DRAFT_KEY, '{broken json')
  assert.ok(loadDraft().error)
  assert.equal(sessionStorage.getItem(LEVEL_DRAFT_KEY), '{broken json')
})
