// 搜索客户端（自参考实现 src/api.ts/responseValidation.ts/fictionScreening.ts 最小移植）：
// 响应必须过结构校验；旧请求晚返回不得覆盖新查询（AbortController）；
// 429/502/504/坏响应都映射为可理解状态，不伪装实时结果。

export class ApiError extends Error {
  constructor(code, message, retryAfterSeconds = null) {
    super(message)
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v) => typeof v === 'string'
const date = (v) => str(v) && Number.isFinite(Date.parse(v))
const strings = (v) => Array.isArray(v) && v.every(str)

function source(v) {
  if (!obj(v) || !str(v.url)) return false
  try {
    const u = new URL(v.url)
    if (u.protocol !== 'https:' || u.username || u.password || !(u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com'))) return false
  } catch {
    return false
  }
  return str(v.authorName) && str(v.title) && date(v.retrievedAt) && (v.apiEditTime === null || Number.isSafeInteger(v.apiEditTime)) && v.coverage === 'api_excerpt' && str(v.rawText)
}

export function validSearch(v) {
  return (
    obj(v) && obj(v.meta) && str(v.meta.requestId) &&
    ['live', 'cached'].includes(String(v.meta.mode)) && date(v.meta.fetchedAt) &&
    obj(v.data) && str(v.data.query) && v.data.hasMore === false &&
    Array.isArray(v.data.candidates) &&
    v.data.candidates.every((c) => obj(c) && str(c.id) && c.reviewStatus === 'unreviewed' && source(c.source) && str(c.notice) && typeof c.possibleMultipleEvents === 'boolean')
  )
}

// 保守的小说呈现筛查，不是真实性结论；未检出也不等于真实个人经历。
export function fictionSignal(sourceLike) {
  const titleMarker = /[（(【\[]\s*(?:已完结|完结|全文完|短篇小说|虚构故事|小说|连载中)\s*[）)】\]]/.exec(sourceLike.title)
  if (titleMarker) return { field: '标题作品标记', quote: titleMarker[0] }
  const declaration = /^(?:\s*)(?:声明[：:]\s*)?((?:本文|本篇|本故事|本作品)(?:为|是|属于)(?:一篇)?(?:虚构(?:故事|作品)?|小说)[。！!；;，,]|故事纯属虚构[。！!；;，,]|本文纯属虚构[。！!；;，,])/.exec(sourceLike.rawText)
  if (declaration) return { field: '开头声明', quote: declaration[1] }
  return null
}

const CLIENT_TIMEOUT_MS = 30000

export async function searchCandidates(query, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new ApiError('CLIENT_TIMEOUT', '这次查询超时了，你可以稍后再试')), CLIENT_TIMEOUT_MS)
  const onAbort = () => controller.abort(signal.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    let res
    try {
      res = await fetch('/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof ApiError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError('NETWORK_ERROR', '这次查询没有完成；输入已保留，可重试')
      throw new ApiError('NETWORK_ERROR', '查询暂时不可用，你的输入已保留')
    }
    let body
    try {
      body = await res.json()
    } catch {
      throw new ApiError('BAD_RESPONSE', '查询暂时不可用，你的输入已保留')
    }
    if (!res.ok) {
      const code = body?.error?.code
      const known = ['INVALID_QUERY', 'NOT_FOUND', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT']
      if (code && known.includes(code)) throw new ApiError(code, body.error.message, body.error.retryAfterSeconds ?? null)
      throw new ApiError('BAD_RESPONSE', '查询暂时不可用，你的输入已保留')
    }
    if (!validSearch(body)) throw new ApiError('BAD_RESPONSE', '查询暂时不可用，你的输入已保留')
    return body
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
