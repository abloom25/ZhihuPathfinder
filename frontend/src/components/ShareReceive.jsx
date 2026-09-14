import { useEffect, useState } from 'react'
import { validShare } from '../lib/shares.js'

// 分享接收页（/share/:id）：独立可访问；撤回后 404/不可见；
// 演示标记必须保留；来源摘录与分享者本人的经历分别表达。
export default function ShareReceive({ shareId }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fetch(`/api/v1/shares/${encodeURIComponent(shareId)}`, { signal: AbortSignal.timeout(15000) })
      .then(async (res) => {
        if (res.status === 404) throw new Error('这份分享不存在或已被撤回。')
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error?.message || `暂时无法读取这份内容（${res.status}）。`)
        if (!validShare(body?.data)) throw new Error('分享数据格式异常，未展示。')
        return body.data
      })
      .then((share) => active && setState({ status: 'ok', share }))
      .catch((err) => active && setState({ status: 'error', message: err instanceof Error ? err.message : '读取失败' }))
    return () => {
      active = false
    }
  }, [shareId])

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">问津 Pathfinder</span>
        <nav className="topnav">
          <a className="nav-item" href="/">
            去探索
          </a>
          <span className="badge">概念设计</span>
        </nav>
      </header>
      <main className="main">
        <section className="stage" aria-label="留给后来者的一段经历">
          <h1 className="screen-title">留给后来者的一段经历</h1>
          <p className="scope-note">
            从别人的处境、感受和变化中找参考。内容为本人自述，未经独立核验；不能保证你的结果相同。
          </p>

          {state.status === 'loading' && <p role="status">正在读取…</p>}

          {state.status === 'error' && (
            <div className="confirm-bar" role="alert">
              <p>{state.message}</p>
              <p className="frozen-note">可以稍后重试，或回到探索页看已核对的知乎经历。</p>
              <div className="confirm-actions">
                <a className="btn-ghost" href="/">
                  回到探索
                </a>
              </div>
            </div>
          )}

          {state.status === 'ok' && (
            <>
              <div className="paper-card">
                <span className="tag">演示／虚构测试内容</span>
                <h2 className="card-label">处境：{state.share.situation}</h2>
                <p className="frozen-text">{state.share.text}</p>
                <p className="frozen-note">公开于 {new Date(state.share.createdAt).toLocaleString('zh-CN')} · 独立分享副本</p>
              </div>
              {state.share.sourceUrl && (
                <div className="paper-card quote-card">
                  <h2 className="card-label">作者选择关联的知乎来源</h2>
                  <a className="source-link" href={state.share.sourceUrl} target="_blank" rel="noopener noreferrer">
                    去知乎看原文
                  </a>
                  {state.share.sourceExcerpt && (
                    <blockquote className="quote-text">“{state.share.sourceExcerpt}”</blockquote>
                  )}
                  <p className="frozen-note">来源摘录与分享者本人的经历分别表达，不证明两者相同。</p>
                </div>
              )}
              <p className="caption">这份记述让你想到自己的哪一步？可以先私下留下自己的记录。</p>
              <a className="btn-primary" href="/">
                从这份经历，开始我的探索 →
              </a>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
