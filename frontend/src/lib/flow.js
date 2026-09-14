// 关卡流程纯逻辑：选择合成、揭晓冻结、保存文本合成（带【关卡探索】头）、草稿恢复。
// 原话保护：揭晓时刻冻结的起初文字之后不可改写；保存文本逐字引用原话，不生成结局。

import { codePointLength } from './utils.js'
import { ACTIONS_BY_ID } from '../data/cases.js'

export const LEVEL_DRAFT_KEY = 'later.level.waiting-week.v1'
export const MAX_REASON = 350
const MAX_TEXT = 2000

// 行动标签合成；有自定义做法时标注，自定义原文只进"理由"行，不重复进倾向行。
export function composeText(actions, custom) {
  const parts = actions.map((id) => ACTIONS_BY_ID[id]?.label ?? id)
  if (custom.trim()) parts.push('有自己的做法')
  return parts.length ? parts.join('；') : '仍未决定'
}

/** 揭晓时冻结。返回对象之后不得被修改。 */
export function freezeChoice(actions, custom) {
  return Object.freeze({
    actions: Object.freeze([...actions]),
    custom,
    text: composeText(actions, custom),
  })
}

export function describeAfter(after) {
  if (after.mode === 'keep') return '保持原选择。'
  if (after.mode === 'change') return `改变倾向：${after.text || '（未填写）'}`
  return '我还没想好。'
}

/** 保存时的完整原话文本（initialText），格式与参考实现 reflectionText 一致。 */
export function buildInitialText({ frozen, after, context, disagreement }) {
  return [
    '【关卡探索｜等消息的这一周】\n以下是我在这次探索中的选择与想法，不代表这些求职事件已经发生在我身上。',
    '看后续前，我倾向：' + frozen.text,
    frozen.custom.trim() ? '我起初的理由（原话）：\n' + frozen.custom.trim() : '我起初没有填写理由。',
    '看过材料后，我倾向：' + describeAfter(after),
    after.reason.trim() ? '我现在的理由（原话）：\n' + after.reason.trim() : '我现在没有补充理由。',
    context.trim() ? '我补充的情况（自己的原话）：\n' + context.trim() : '',
    disagreement.trim() ? '我想保留的异议（尚未核验）：\n' + disagreement.trim() : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** 长度校验（合成文本本身也算长度）；超长在保存前就拦下，不写一半。 */
export function textFits(text) {
  return codePointLength(text) <= MAX_TEXT
}

// ---- 草稿（sessionStorage：刷新可恢复，关闭标签页后不承诺恢复） ----

export function freshDraft() {
  return {
    version: 1,
    creationId: crypto.randomUUID(),
    revealed: false,
    actions: [],
    custom: '',
    mode: 'unsure',
    text: '',
    reason: '',
    context: '',
    contextKind: '',
    disagreement: '',
    quoteId: '',
    savedId: null,
  }
}

const isActions = (v) =>
  Array.isArray(v) && v.every((x) => x === 'A' || x === 'B' || x === 'C') && new Set(v).size === v.length

export function validDraft(d) {
  if (!d || typeof d !== 'object') return false
  return (
    d.version === 1 &&
    typeof d.creationId === 'string' &&
    /^[a-f0-9-]{36}$/.test(d.creationId) &&
    typeof d.revealed === 'boolean' &&
    isActions(d.actions) &&
    ['custom', 'text', 'reason', 'context', 'contextKind', 'disagreement', 'quoteId'].every(
      (k) => typeof d[k] === 'string' && codePointLength(d[k]) <= 600,
    ) &&
    ['keep', 'change', 'unsure'].includes(d.mode) &&
    (d.savedId === null || d.savedId === d.creationId)
  )
}

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(LEVEL_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 草稿恢复是尽力而为，不承诺 */
  }
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(LEVEL_DRAFT_KEY)
    if (!raw) return { draft: freshDraft(), error: '' }
    const d = JSON.parse(raw)
    if (validDraft(d)) return { draft: d, error: '' }
    return {
      draft: freshDraft(),
      error: '之前的关卡草稿格式无法识别，尚未覆盖。你可以回到我的问津，或明确开始新一轮。',
    }
  } catch {
    return {
      draft: freshDraft(),
      error: '无法恢复关卡草稿，尚未覆盖已有内容。请先检查浏览器存储，或明确开始新一轮。',
    }
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(LEVEL_DRAFT_KEY)
  } catch {
    /* 同上 */
  }
}
