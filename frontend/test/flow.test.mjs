// 迁移的行为测试（来自交接包消融清单）：原话保护（initial-words）。
// 揭晓时冻结的起初文字不可被改写；保存文本逐字引用原话；
// 任何 A/B/C 组合与"仍未决定"都不生成结局、不代写判断。
// 2026-09-14 按现行 buildInitialText({frozen,after,context,disagreement}) 签名重写（生产调用方 App.jsx 为准）。

import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { beforeEachReset } from './helpers.js'
import { codePointLength } from '../src/lib/utils.js'
import {
  LEVEL_DRAFT_KEY,
  buildInitialText,
  clearDraft,
  composeText,
  describeAfter,
  freezeChoice,
  freshDraft,
  loadDraft,
  saveDraft,
  textFits,
} from '../src/lib/flow.js'

beforeEach(() => beforeEachReset())

// 与 src/data/cases.js 的真实动作 id 一致（A/B/C），避免用替身 id 掩盖 validDraft 的校验语义
const ALL = ['A', 'B', 'C']
const subsets = Array.from({ length: 8 }, (_, mask) => ALL.filter((_, i) => mask & (1 << i)))
const build = (frozen, after, context = '', disagreement = '') => buildInitialText({ frozen, after, context, disagreement })

test('冻结对象逐字保存起初选择；冻结后修改原数组不影响已冻结内容', () => {
  const actions = ['B']
  let frozen = freezeChoice(actions, '先礼貌地问一句')
  actions.push('wait') // 冻结后再改原数组
  assert.deepEqual(frozen.actions, ['B'])
  assert.equal(frozen.text, composeText(['B'], '先礼貌地问一句'))
  assert.throws(() => {
    'use strict'
    frozen.text = '自动改写'
  })
})

test('保存文本包含原话原文；不出现编造的结局词', () => {
  const frozen = freezeChoice(['B'], '问一下进度')
  const after = { mode: 'keep', text: '', reason: '我还不知道结果' }
  const text = build(frozen, after)
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
      const text = build(frozen, after)
      assert.ok(text.startsWith('【关卡探索'), '固定文件头在最前')
      assert.ok(text.includes('看后续前，我倾向：'), '倾向行保留')
      assert.ok(text.includes('我的起初原话'), '起初原话必须逐字保留')
      assert.ok(text.includes('我的后来判断'))
      assert.equal(text.includes(composeText(first, '我的起初原话')), true)
      assert.doesNotMatch(text, /已入职|背调通过/)
    }
  }
})

test('空输入组成“仍未决定”；描述函数与保存文本一致；补充字段按需出现', () => {
  const frozen = freezeChoice([], '')
  assert.equal(frozen.text, '仍未决定')
  const after = { mode: 'unsure', text: '', reason: '' }
  const bare = build(frozen, after)
  assert.ok(bare.includes(describeAfter(after)))
  assert.ok(!bare.includes('我补充的情况'), '无补充时不出现补充段')
  assert.ok(!bare.includes('我想保留的异议'), '无异义时不出现异议段')
  const full = build(frozen, after, '我的补充情况', '我的异议')
  assert.ok(full.includes('我的补充情况') && full.includes('我的异议'))
})

test('长度边界：2000 码点以内可保存，超过则拒绝', () => {
  // 固定文案开销自适应计算，不硬编码：len(n) = len(1) + (n-1)，据此定位恰好 2000 的临界值
  const head = (n) => build(freezeChoice(['A'], '字'.repeat(n)), { mode: 'keep', text: '', reason: '' })
  const len1 = codePointLength(head(1))
  const maxN = 2000 - len1 + 1
  assert.ok(maxN > 0, `固定开销异常：len1=${len1}`)
  assert.equal(textFits(head(maxN)), true, `${maxN} 字应恰好 2000 码点`)
  assert.equal(codePointLength(head(maxN)), 2000)
  assert.equal(textFits(head(maxN + 1)), false, `${maxN + 1} 字应超限`)
})

test('草稿刷新可恢复、可清除；损坏草稿被忽略而不是让页面崩溃', () => {
  const d = freshDraft()
  d.actions = ['A']
  d.custom = '自定义'
  d.revealed = true
  saveDraft(d)
  const loaded = loadDraft()
  assert.equal(loaded.error, '')
  assert.deepEqual(loaded.draft.actions, ['A'])
  assert.equal(loaded.draft.custom, '自定义')
  assert.equal(loaded.draft.revealed, true)
  // 非法动作 id 的草稿按无法识别处理（validDraft 只接受 A/B/C）
  const bad = freshDraft()
  bad.actions = ['wait']
  saveDraft(bad)
  assert.notEqual(loadDraft().error, '')
  clearDraft()
  const cleared = loadDraft()
  assert.equal(cleared.error, '')
  assert.equal(cleared.draft.revealed, false, '清除后回到全新草稿')
  // 损坏 JSON：给出可理解错误、回退新草稿，不抛异常
  globalThis.sessionStorage.setItem(LEVEL_DRAFT_KEY, '{broken json')
  const broken = loadDraft()
  assert.notEqual(broken.error, '')
  assert.equal(broken.draft.revealed, false)
  // 旧结构（无 version 等必需字段）：同样被忽略而非崩溃
  saveDraft({ selected: ['A'], custom: '旧结构' })
  const legacy = loadDraft()
  assert.notEqual(legacy.error, '')
  assert.equal(legacy.draft.revealed, false)
})
