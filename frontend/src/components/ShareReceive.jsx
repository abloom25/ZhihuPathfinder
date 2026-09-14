import { useEffect, useRef, useState } from 'react'
import { managementToken, revokeShare, validShare, loadShareAttempt, revokePrepared } from '../lib/shares.js'

import { createRecord, loadRecords } from '../lib/records.js'
import { codePointLength } from '../lib/utils.js'

// 分享接收页（/share/:id）：独立可访问；撤回后 404/不可见；
// 演示标记必须保留；来源摘录与分享者本人的经历分别表达。
export default function ShareReceive({ shareId }) {
  const [state, setState] = useState({ status: 'loading' })

  const [writing, setWriting] = useState(false)
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const creationId = useRef(crypto.randomUUID())
  async function saveReflection() {
    if (saving.current || state.status !== 'ok') return
    saving.current = true; setBusy(true); setError('')
    try {
      const { id, situation, text, demo } = state.share
      const record = await createRecord({ creationId: creationId.current, initialText: words.trim(),
        sourceUrl: null, sourceTitle: null, receivedFrom: { shareId: id, situation, text, demo } })
      window.location.assign('/?record=' + encodeURIComponent(record.id))
    } catch (e) { setError(e.message) }
    finally { saving.current = false; setBusy(false) }
  }
  async function revoke() {
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    try {
      const records = loadRecords()
      const own = records.status === 'ok' && records.records.find(r => {
        try { return loadShareAttempt(r.id)?.id === shareId } catch { return false }
      })
      if (own) await revokePrepared(own.id)
      else await revokeShare(shareId, managementToken(shareId))
      setState({ status: 'error', message: '这份分享已撤回，本应用不再公开展示。' })
    } catch (e) { setError(e.message) }
    finally { saving.current = false; setBusy(false) }
  }

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ status: 'loading' })
    fetch(`/api/v1/shares/${encodeURIComponent(shareId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) throw new Error('这份分享不存在或已被撤回。')
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error?.message || `暂时无法读取这份内容（${res.status}）。`)
        if (!validShare(body?.data) || body.data.id !== shareId) throw new Error('分享数据格式异常，未展示。')
        return body.data
      })
      .then((share) => active && setState({ status: 'ok', share }))
      .catch((err) => active && setState({ status: 'error', message: err instanceof Error ? err.message : '读取失败' }))
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
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
                <span className="tag">{state.share.demo ? '演示／虚构测试内容' : '本人自述，未经独立核验'}</span>
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
              <button className="btn-primary" onClick={() => setWriting(true)}>从这份经历，留下我的当下 →</button>
              {writing && <div className="paper-card">
                <label className="field-label" htmlFor="received-reflection">这让我想到自己的什么？我现在倾向怎么做，为什么？</label>
                <textarea id="received-reflection" className="share-text" rows={5} value={words} disabled={busy} onChange={e => setWords(e.target.value)} />
                <p className="frozen-note">只保存到本设备；另附上方分享的原话和关联，后续可追加变化。不会自动公开。</p>
                <button className="btn-primary small" disabled={busy || !words.trim() || codePointLength(words.trim()) > 2000} onClick={saveReflection}>保存我的记录与关联</button>
                {codePointLength(words.trim()) > 2000 && <p role="alert">最多 2000 字，请精简。</p>}
              </div>}
              {managementToken(shareId) && <div className="paper-card">
                <p>本设备持有这份分享的管理凭据。</p>
                <button className="btn-ghost" disabled={busy} onClick={revoke}>撤回这份分享</button>
              </div>}
            </>
          )}
          {error && <p className="error-text" role="alert">{error}</p>}
        </section>
      </main>
    </div>
  )
}
