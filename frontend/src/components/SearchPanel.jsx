import { useEffect, useRef, useState } from 'react'
import { ApiError, fictionSignal, searchCandidates } from '../lib/search.js'

// 补充入口：实时搜索（无密钥/限流/坏响应时显示可理解状态，关卡不受影响）。
// 旧请求晚返回不得覆盖新查询：发起新查询时取消上一个。
export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(null) // {kind:'ok'|'error'|'loading', ...}
  const controllerRef = useRef(null)

  useEffect(() => () => controllerRef.current?.abort(new ApiError('NETWORK_ERROR', '已取消')), [])

  function run() {
    const q = query.trim()
    if (!q) {
      setStatus({ kind: 'error', message: '先写一个想查的处境或关键词。' })
      return
    }
    if (Array.from(q).length > 120) {
      setStatus({ kind: 'error', message: '查询最长 120 个字，请精简后再试。' })
      return
    }
    controllerRef.current?.abort(new ApiError('NETWORK_ERROR', '已取消'))
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus({ kind: 'loading' })
    searchCandidates(q, controller.signal)
      .then((res) => {
        if (controllerRef.current !== controller) return
        setStatus({ kind: 'ok', data: res.data, meta: res.meta })
      })
      .catch((err) => {
        if (controllerRef.current !== controller) return
        if (err instanceof ApiError) {
          const messages = {
            INVALID_QUERY: '查询格式不正确，请换个说法再试。',
            RATE_LIMITED: '现在查询的人太多，暂时限流；稍后再试，或先用固定关卡继续。',
            UPSTREAM_UNAVAILABLE: '查询服务暂时不可用（未配置或上游故障）；固定关卡不受影响，仍可继续。',
            UPSTREAM_TIMEOUT: '这次查询超时了；固定关卡不受影响，仍可继续。',
            CLIENT_TIMEOUT: '这次查询等待太久，已取消；可以稍后再试。',
            BAD_RESPONSE: '查询返回了无法理解的内容；固定关卡不受影响。',
            NETWORK_ERROR: '网络请求没有完成；你的输入已保留，可重试。',
          }
          setStatus({
            kind: 'error',
            message: messages[err.code] ?? '查询暂时不可用；固定关卡不受影响。',
            retryAfterSeconds: err.retryAfterSeconds,
          })
        } else {
          setStatus({ kind: 'error', message: '查询暂时不可用；固定关卡不受影响。' })
        }
      })
  }

  return (
    <div>
      <p>{'想看更多真实记述，可以按处境搜索知乎（补充入口；没有密钥或限流时不可用，关卡不受影响）。'}</p>
      <div className="panel-input-row">
        <input
          type="text"
          className="search-input"
          placeholder="例如：等审批的这一周"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-send" onClick={run} disabled={status?.kind === 'loading'} aria-label="搜索">
          搜
        </button>
      </div>

      {status?.kind === 'loading' && <p role="status">正在查询…</p>}

      {status?.kind === 'error' && (
        <div className="panel-reply unmatched" role="alert">
          <p>
            {status.message}
            {typeof status.retryAfterSeconds === 'number' && status.retryAfterSeconds > 0
              ? `（约 ${status.retryAfterSeconds} 秒后可再试）`
              : ''}
          </p>
        </div>
      )}

      {status?.kind === 'ok' && status.data.candidates.length === 0 && (
        <div className="panel-reply unmatched" role="status">
          <p>没有找到相关记述。可以换个词，或先留下自己的当下。</p>
        </div>
      )}

      {status?.kind === 'ok' && status.data.candidates.length > 0 && (
        <ul className="panel-cases">
          {status.data.candidates.map((c) => {
            const signal = fictionSignal({ title: c.source.title, rawText: c.source.rawText })
            return (
              <li key={c.id}>
                <strong>{c.source.authorName || '作者名未返回'}</strong>
                ：{c.source.rawText}
                <br />
                <a href={c.source.url} target="_blank" rel="noopener noreferrer">
                  查看原文
                </a>
                <span className="tag">未核验</span>
                {c.possibleMultipleEvents && <span className="tag">可能包含多次事件</span>}
                {signal && <span className="tag">小说筛查：{signal.field}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {status?.kind === 'ok' && <p className="panel-note">候选内容未经核验；未检测出小说不等于证实是真实经历。</p>}
    </div>
  )
}
