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
    throw new ShareHttpError(0, '网络请求失败，分享还没有创建；内容已留在本地，可重试')
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
    /^[a-f0-9-]{36}$/.test(r.id) &&
    typeof r.situation === 'string' &&
    typeof r.text === 'string' &&
    typeof r.demo === 'boolean' &&
    typeof r.createdAt === 'string' &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    (r.sourceExcerpt === null || typeof r.sourceExcerpt === 'string') &&
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
