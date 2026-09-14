// 私密记录存储（自参考实现 src/records.ts 移植，存储契约不变）：
// 键 later.records.v1、schemaVersion=1；每次写入都在跨标签独占锁内重读再写；
// 旧版本写入抛 StorageConflictError；写失败抛 StorageWriteError，绝不静默降级。

import { codePointLength, isZhihuUrl } from './utils.js'

const STORAGE_KEY = 'later.records.v1'

export class StorageWriteError extends Error {}
export class StorageConflictError extends Error {
  constructor() {
    super('记录已在另一页面更新，请重新载入后确认')
  }
}

const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const keys = (v, allowed) =>
  Object.keys(v).length === allowed.length &&
  allowed.every((k) => Object.prototype.hasOwnProperty.call(v, k))

const date = (s) => {
  if (typeof s !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(s)
  if (!m || !Number.isFinite(Date.parse(s))) return false
  const [, y, mo, d, h, mi, se] = m.map(Number)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1] && h < 24 && mi < 60 && se < 60
}

function text(s) {
  return typeof s === 'string' && codePointLength(s.trim()) > 0 && codePointLength(s) <= 2000
}

function validReceived(v) {
  return (
    object(v) &&
    keys(v, ['shareId', 'situation', 'text', 'demo']) &&
    typeof v.shareId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.shareId) &&
    typeof v.situation === 'string' &&
    codePointLength(v.situation.trim()) > 0 &&
    codePointLength(v.situation) <= 80 &&
    text(v.text) &&
    typeof v.demo === 'boolean'
  )
}

function validRecord(v) {
  return (
    object(v) &&
    keys(v, [
      'id', 'sourceUrl', 'sourceTitle', 'initialText', 'createdAt', 'updatedAt', 'entries',
      ...(Object.prototype.hasOwnProperty.call(v, 'receivedFrom') ? ['receivedFrom'] : []),
      ...(Object.prototype.hasOwnProperty.call(v, 'sourceExcerpt') ? ['sourceExcerpt'] : []),
    ]) &&
    (v.receivedFrom === undefined || validReceived(v.receivedFrom)) &&
    (v.sourceExcerpt === undefined || v.sourceExcerpt === null || (text(v.sourceExcerpt) && typeof v.sourceUrl === 'string' && isZhihuUrl(v.sourceUrl))) &&
    typeof v.id === 'string' && v.id.length > 0 &&
    (v.sourceUrl === null || (typeof v.sourceUrl === 'string' && isZhihuUrl(v.sourceUrl))) &&
    (v.sourceTitle === null || typeof v.sourceTitle === 'string') &&
    text(v.initialText) &&
    date(v.createdAt) && date(v.updatedAt) &&
    Array.isArray(v.entries) &&
    v.entries.every((e) => object(e) && keys(e, ['id', 'text', 'savedAt']) && typeof e.id === 'string' && e.id.length > 0 && text(e.text) && date(e.savedAt)) &&
    new Set(v.entries.map((e) => e.id)).size === v.entries.length
  )
}

export function validateRecordsFile(v) {
  return (
    object(v) &&
    keys(v, ['schemaVersion', 'records']) &&
    v.schemaVersion === 1 &&
    Array.isArray(v.records) &&
    v.records.every(validRecord) &&
    new Set(v.records.map((r) => r.id)).size === v.records.length
  )
}

function raw() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    throw new StorageWriteError('无法读取本设备记录，请先检查浏览器存储权限')
  }
}

export function loadRecords() {
  let value
  try {
    value = raw()
  } catch {
    return { status: 'unavailable' }
  }
  if (value === null) return { status: 'empty' }
  try {
    const data = JSON.parse(value)
    return validateRecordsFile(data) ? { status: 'ok', records: data.records } : { status: 'corrupt', raw: value }
  } catch {
    return { status: 'corrupt', raw: value }
  }
}

// 每次变更都在同一把跨标签锁内重读再写；没有锁就失败，不做不安全回退。
async function locked(operation) {
  if (!navigator.locks) throw new StorageWriteError('当前浏览器无法安全保存，请使用支持的浏览器并先复制文字')
  return navigator.locks.request(STORAGE_KEY, { mode: 'exclusive' }, operation)
}

function current() {
  const value = loadRecords()
  if (value.status === 'empty') return []
  if (value.status !== 'ok') throw new StorageWriteError('暂时无法读取本设备记录，旧数据没有被清除')
  return value.records
}

function write(records) {
  const file = { schemaVersion: 1, records }
  if (!validateRecordsFile(file)) throw new StorageWriteError('记录格式不正确，未写入，请先复制文字')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch {
    throw new StorageWriteError('没有保存成功，先复制留住这段话')
  }
}

function version(r) {
  return JSON.stringify([
    r.id, r.sourceUrl, r.sourceTitle, r.sourceExcerpt ?? null,
    r.receivedFrom ? [r.receivedFrom.shareId, r.receivedFrom.situation, r.receivedFrom.text, r.receivedFrom.demo] : null,
    r.initialText, r.createdAt, r.updatedAt,
    r.entries.map((e) => [e.id, e.text, e.savedAt]),
  ])
}

function match(records, expected) {
  const actual = records.find((r) => r.id === expected.id)
  if (!actual || version(actual) !== version(expected)) throw new StorageConflictError()
}

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

export async function createRecord(input) {
  return locked(() => {
    const records = current(), at = now()
    if (input.creationId) {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.creationId)) {
        throw new StorageWriteError('创建标识不正确，未写入')
      }
      const existing = records.find((r) => r.id === input.creationId)
      if (existing) {
        if (
          existing.initialText !== input.initialText.trim() ||
          existing.sourceUrl !== input.sourceUrl ||
          existing.sourceTitle !== input.sourceTitle ||
          (existing.sourceExcerpt ?? '') !== (input.sourceExcerpt?.trim() ?? '') ||
          JSON.stringify(existing.receivedFrom ?? null) !== JSON.stringify(input.receivedFrom ?? null) ||
          (input.firstEntryText?.trim() && existing.entries[0]?.text !== input.firstEntryText.trim())
        ) throw new StorageConflictError()
        return existing
      }
    }
    const record = {
      ...(input.receivedFrom ? { receivedFrom: { ...input.receivedFrom } } : {}),
      id: input.creationId ?? id(),
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      ...(input.sourceExcerpt?.trim() ? { sourceExcerpt: input.sourceExcerpt.trim() } : {}),
      initialText: input.initialText.trim(),
      createdAt: at,
      updatedAt: at,
      entries: input.firstEntryText?.trim() ? [{ id: id(), text: input.firstEntryText.trim(), savedAt: at }] : [],
    }
    write([record, ...records])
    return record
  })
}

export async function appendEntry(expected, value) {
  return locked(() => {
    const records = current()
    match(records, expected)
    const at = now()
    const updated = { ...expected, entries: [...expected.entries, { id: id(), text: value.trim(), savedAt: at }], updatedAt: at }
    write(records.map((r) => (r.id === expected.id ? updated : r)))
    return updated
  })
}

export async function deleteRecord(expected) {
  return locked(() => {
    const records = current()
    match(records, expected)
    write(records.filter((r) => r.id !== expected.id))
  })
}

export function exportRecordsJson() {
  return raw() ?? JSON.stringify({ schemaVersion: 1, records: [] })
}

export async function resetRecords(expectedRaw) {
  return locked(() => {
    if (raw() !== expectedRaw) throw new StorageConflictError()
    write([])
  })
}

export function onExternalChange(cb) {
  const handler = (e) => {
    if (e.key === STORAGE_KEY || e.key === null) cb()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

// 导入只合并新 ID；版本冲突拒绝，不覆盖任何内容，在锁内原子完成。
export async function importRecordsJson(json) {
  let incoming
  try {
    incoming = JSON.parse(json)
  } catch {
    throw new StorageWriteError('备份不是有效的 JSON，未导入')
  }
  if (!validateRecordsFile(incoming)) throw new StorageWriteError('备份结构或版本不支持，未导入')
  const recordsToImport = incoming.records
  return locked(() => {
    const records = current()
    for (const item of recordsToImport) {
      const existing = records.find((r) => r.id === item.id)
      if (existing && version(existing) !== version(item)) {
        throw new StorageWriteError('备份与现有记录存在不同版本，未覆盖任何内容；请保留两份备份')
      }
    }
    const additions = recordsToImport.filter((r) => !records.some((old) => old.id === r.id))
    if (additions.length) write([...records, ...additions])
    return additions.length
  })
}
