// 迁移的行为测试（来自交接包消融清单）：原话保护（initial-words）。
// 揭晓时冻结的起初文字不可被改写；保存文本逐字引用原话；
// 任何 A/B/C 组合与"仍未决定"都不生成结局、不代写判断。

import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { beforeEachReset } from './helpers.js'
import {
  buildInitialText,
  clearDraft,
  composeText,
  describeAfter,
  freezeChoice,
  loadDraft,
  saveDraft,
  textFits,
} from '../src/lib/flow.js'

beforeEach(() => beforeEachReset())

const ALL = ['wait', 'ask', 'prepare']
const subsets = Array.from({ length: 8 }, (_, mask) => ALL.filter((_, i) => mask & (1 << i)))

test('冻结对象逐字保存起初选择；冻结后修改原数组不影响已冻结内容', () => {
  const actions = ['ask']
  let frozen = freezeChoice(actions, '先礼貌地问一句')
  actions.push('wait') // 冻结后再改原数组
  assert.deepEqual(frozen.actions, ['ask'])
  assert.equal(frozen.text, composeText(['ask'], '先礼貌地问一句'))
  assert.throws(() => {
    'use strict'
    frozen.text = '自动改写'
  })
})

test('保存文本包含原话原文；不出现编造的结局词', () => {
  const frozen = freezeChoice(['ask'], '问一下进度')
  const after = { mode: 'keep', text: '', reason: '我还不知道结果' }
  const text = buildInitialText(frozen, after)
  assert.ok(text.includes('问一下进度'))
  assert.ok(text.includes('我还不知道结果'))
  assert.ok(text.includes('保持原选择'))
  assert.doesNotMatch(text, /已入职|背调通过|收到offer|两天后/)
})

test('全部 64 种前后组合：起初文字保持不变，仍未决定也完整记录', () => {
  for (const first of subsets) {
    const frozen = freezeChoice(first, '我的起初原话')
    for (const afterMode of ['keep', 'change', 'unsure']) {
      const after = { mode: afterMode, text: afterMode === 'change' ? '更想先准备' : '', reason: '我的后来判断' }
      const text = buildInitialText(frozen, after)
      assert.ok(text.includes('我的起初原话'), '起初原话必须逐字保留')
      assert.ok(text.includes('我的后来判断'))
      assert.ok(text.startsWith('看后续前，我倾向：'))
      assert.equal(text.includes(composeText(first, '我的起初原话')), true)
      assert.doesNotMatch(text, /已入职|背调通过/)
    }
  }
})

test('空输入不能组成起初文字；描述函数与保存文本一致', () => {
  const frozen = freezeChoice([], '')
  assert.equal(frozen.text, '')
  const after = { mode: 'unsure', text: '', reason: '' }
  assert.ok(buildInitialText(frozen, after).includes(describeAfter(after)))
})

test('长度边界：2000 码点以内可保存，超过则拒绝', () => {
  // 合成文本含固定标签与动作词（共 36 码点），自定义做法部分最长 1964
  const frozen = freezeChoice(['wait'], '字'.repeat(1964))
  const after = { mode: 'keep', text: '', reason: '' }
  assert.equal(textFits(buildInitialText(frozen, after)), true)
  const tooLong = freezeChoice(['wait'], '字'.repeat(1965))
  assert.equal(textFits(buildInitialText(tooLong, after)), false)
})

test('草稿刷新可恢复、可清除；损坏草稿被忽略而不是让页面崩溃', () => {
  saveDraft({ selected: ['ask'], custom: '自定义', frozen: freezeChoice(['ask'], '自定义').text })
  const d = loadDraft()
  assert.equal(d.selected.join(), 'ask')
  assert.equal(d.custom, '自定义')
  clearDraft()
  assert.equal(loadDraft(), null)
  saveDraft('not-an-object-serialize')
  globalThis.sessionStorage.setItem('later.level.waiting-week.v1', '{broken json')
  assert.equal(loadDraft(), null)
})
