// 分享客户端（自参考实现 src/shares.ts 移植并按契约补齐创建/撤回）：
// 浏览器生成 crypto.randomUUID() 作为 id；32 随机字节转 64 位小写十六进制管理 token，
// 先存 localStorage 并回读成功再请求；重试沿用同一 id、token 与 body，绝不重建。

export const managerKey = (id) => 'later.share-manager.' + id

export function managementToken(id) {
  try {
    return localStorage.getItem(managerKey(id))
  } catch {
    return null
  }
}

function storeToken(id, token) {
  try {
    localStorage.setItem(managerKey(id), token)
    if (localStorage.getItem(managerKey(id)) !== token) throw new Error('readback')
  } catch {
    throw new Error('管理凭据无法保存在本设备，未发起分享；请检查浏览器存储权限')
  }
}

/** 32 随机字节 → 64 位小写十六进制 */
function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class ShareHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, method, body, token) {
  let response
  try {
    response = await fetch('/api/v1/shares' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new ShareHttpError(0, '未能确认请求结果；服务器可能已经处理，请沿用本次提交重试')
  }
  let result = null
  try {
    result = await response.json()
  } catch {
    /* 非 JSON 响应按错误处理 */
  }
  if (!response.ok) {
    throw new ShareHttpError(response.status, result?.error?.message || `分享请求失败（${response.status}）`)
  }
  if (!result?.data || (method === 'POST' && (!validShare(result.data) || result.data.id !== body.id || ['situation', 'text', 'demo', 'sourceUrl', 'sourceExcerpt'].some(k => result.data[k] !== body[k]))) ||
      (method === 'DELETE' && result.data.revoked !== true)) {
    throw new ShareHttpError(0, '服务器返回格式异常，未确认操作结果；请沿用本次提交重试')
  }
  return result.data
}

/**
 * 创建或幂等重试分享。same (id, token, body) 重试：首次 201，同内容重试 200。
 * content 需为契约 body：{situation,text,demo,consent,sourceUrl,sourceExcerpt}，id 由本函数生成。
 * 返回 {share, token}。
 */
export async function createShare({ id, content, existingToken }) {
  if (!id) id = crypto.randomUUID()
  const token = existingToken ?? newToken()
  if (!existingToken) storeToken(id, token)
  const share = await request('', 'POST', { id, ...content }, token)
  return { share, token, id }
}

/** 撤回：DELETE /api/v1/shares/:id，body {} 与原管理 token。失去 token 后无法撤回。 */
export async function revokeShare(id, token) {
  if (!token) throw new ShareHttpError(0, '本设备已失去这份分享的管理凭据，无法撤回')
  return request('/' + id, 'DELETE', {}, token)
}

export function validShare(v) {
  if (!v || typeof v !== 'object') return false
  const r = v
  return (
    typeof r.id === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.id) &&
    shortText(r.situation, 80) &&
    shortText(r.text, 2000) &&
    typeof r.demo === 'boolean' &&
    typeof r.createdAt === 'string' &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    (r.sourceExcerpt === null || (shortText(r.sourceExcerpt, 500) && safeSource(r.sourceUrl))) &&
    (r.sourceUrl === null || safeSource(r.sourceUrl))
  )
}

function safeSource(v) {
  try {
    if (typeof v !== 'string') return false
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com'))
  } catch {
    return false
  }
}

function shortText(v, max) {
  return typeof v === 'string' && !!v.trim() && Array.from(v).length <= max
}

// One immutable attempt per private record. Persist before the network; fail closed
// on damaged storage. The Web Lock serializes preparation across browser tabs.
export const attemptKey = (recordId) => 'later.share-attempt.' + recordId
export function loadShareAttempt(recordId) {
  const raw = localStorage.getItem(attemptKey(recordId))
  if (!raw) return null
  let a
  try { a = JSON.parse(raw) } catch { throw new Error('分享管理记录损坏，未覆盖；请保留本机数据并通过原接收链接管理') }
  if (!a || a.version !== 1 || a.recordId !== recordId || !['pending', 'published', 'revoked'].includes(a.status) ||
      a.body?.consent !== true || !validShare({ ...a.body, id: a.id, createdAt: '2026-01-01T00:00:00.000Z' }) ||
      !/^[a-f0-9]{64}$/.test(managementToken(a.id) || '')) {
    throw new Error('分享管理记录或凭据异常，未创建新的分享；请保留本机数据并通过原接收链接检查')
  }
  return a
}
function storeAttempt(a) {
  const raw = JSON.stringify(a)
  localStorage.setItem(attemptKey(a.recordId), raw)
  if (localStorage.getItem(attemptKey(a.recordId)) !== raw) throw new Error('分享管理记录未能保存，结果尚未确认')
  return a
}
export async function prepareShare(recordId, body) {
  if (!navigator.locks?.request) throw new Error('浏览器缺少安全提交所需的 Web Locks，请使用 HTTPS 或 localhost 下的现代浏览器')
  return navigator.locks.request(attemptKey(recordId), { mode: 'exclusive' }, () => {
    const old = loadShareAttempt(recordId)
    if (old && old.status !== 'revoked') {
      if (JSON.stringify(old.body) !== JSON.stringify(body)) throw new Error('已有另一份提交，请关闭并重新打开分享，先管理原提交')
      return old
    }
    const id = crypto.randomUUID()
    if (body?.consent !== true || !validShare({ ...body, id, createdAt: new Date().toISOString() })) throw new Error('请检查公开内容、处境与来源格式')
    storeToken(id, newToken())
    return storeAttempt({ version: 1, recordId, id, body, status: 'pending' })
  })
}
export async function publishPrepared(recordId) {
  return navigator.locks.request(attemptKey(recordId), { mode: 'exclusive' }, async () => {
    const a = loadShareAttempt(recordId)
    if (!a || a.status === 'revoked') throw new Error('没有可重试的提交，请重新打开分享')
    const result = await createShare({ id: a.id, content: a.body, existingToken: managementToken(a.id) })
    storeAttempt({ ...a, status: 'published' })
    return result
  })
}
export async function revokePrepared(recordId) {
  return navigator.locks.request(attemptKey(recordId), { mode: 'exclusive' }, async () => {
    const a = loadShareAttempt(recordId)
    if (!a) throw new Error('未找到分享管理记录')
    await revokeShare(a.id, managementToken(a.id))
    storeAttempt({ ...a, status: 'revoked' })
  })
}
