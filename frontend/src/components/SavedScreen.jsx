import { useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { PencilTextarea } from './PencilField.jsx'
import { loadShareAttempt, prepareShare, publishPrepared, revokePrepared } from '../lib/shares.js'
import { codePointLength } from '../lib/utils.js'

// 记录详情：原话（只读）、来源摘录、追加变化、自愿分享（选择→预览→确认后才发请求）。
export default function SavedScreen({ record, appending, appendError, onAppend, onBackToSource, onOpenRecords }) {
  const [draft, setDraft] = useState('')
  const [shareOpen, setShareOpen] = useState(false)

  async function append() {
    const t = draft.trim()
    if (!t) return
    const ok = await onAppend(t)
    if (ok) setDraft('')
  }

  return (
    <section className="stage" aria-label="已保存的记录">
      <div className="saved-banner" role="status">
        <span className="panel-bird" aria-hidden>
          <Icon name="bird" size={30} />
        </span>
        <h1 className="screen-title">已留给自己</h1>
        <p className="scope-note">已保存在本设备浏览器，不会跨设备同步。</p>
      </div>

      <div className="paper-card readonly-card">
        <h2 className="card-label">我的这一页（原话）</h2>
        <p className="record-text">{record.initialText}</p>
        <p className="frozen-note">保存于 {new Date(record.createdAt).toLocaleString('zh-CN')}</p>
      </div>

      {record.receivedFrom && (
        <div className="paper-card quote-card">
          <h2 className="card-label">起初触动我的分享（保存时的副本）</h2>
          <p className="frozen-note">{record.receivedFrom.demo ? '演示／虚构测试内容' : '本人自述，未经独立核验'} · {record.receivedFrom.situation}</p>
          <blockquote className="quote-text">{record.receivedFrom.text}</blockquote>
          <a className="source-link" href={`/share/${record.receivedFrom.shareId}`}>回看关联分享</a>
          <p className="frozen-note">对方撤回后链接可能不可用；这份已保存的参考与我的原话分别保留。</p>
        </div>
      )}

      {record.sourceExcerpt && record.sourceUrl && (
        <div className="paper-card quote-card">
          <h2 className="card-label">另附的来源原话</h2>
          <blockquote className="quote-text">“{record.sourceExcerpt}”</blockquote>
          <a className="source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">
            {record.sourceTitle || '知乎来源'} <Icon name="ext" size={14} />
          </a>
        </div>
      )}

      <div className="paper-card">
        <h2 className="card-label">后来有变化，回来接着写</h2>
        {record.entries.length > 0 && (
          <ul className="update-list">
            {record.entries.map((e) => (
              <li key={e.id}>
                <span className="update-time">{new Date(e.savedAt).toLocaleString('zh-CN')}</span>
                <p>{e.text}</p>
              </li>
            ))}
          </ul>
        )}
        <PencilTextarea
          rows={2}
          placeholder="【演示：模拟后续】……"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {appendError && (
          <p className="error-text" role="alert">
            {appendError}
          </p>
        )}
        <button type="button" className="btn-ghost" onClick={append} disabled={appending || !draft.trim()}>
          {appending ? '正在保存…' : '追加变化'}
        </button>
      </div>

      <div className="aux-row">
        <button type="button" className="link" onClick={onBackToSource}>
          回到来源
        </button>
        <button type="button" className="link" onClick={onOpenRecords}>
          我的问津
        </button>
        <button type="button" className="link" onClick={() => setShareOpen(true)}>
          分享／管理已公开的内容
        </button>
      </div>

      {shareOpen && <ShareFlow record={record} onClose={() => setShareOpen(false)} />}
    </section>
  )
}

// 分享流程：选择内容 → 预览 → 勾选自愿 → 才发请求。同一次提交冻结 id/token/body，重试不重复创建。
function ShareFlow({ record, onClose }) {
  const parts = [
    { label: '起初的我', text: record.initialText },
    ...record.entries.map((e, i) => ({ label: `第 ${i + 1} 次追加`, text: e.text })),
  ]
  const [restored] = useState(() => {
    try { const a = loadShareAttempt(record.id); return { attempt: a?.status === 'revoked' ? null : a, error: '' } }
    catch (e) { return { attempt: null, error: e.message } }
  })
  const [selected, setSelected] = useState([])
  const [text, setText] = useState(restored.attempt?.body.text ?? '')
  const [situation, setSituation] = useState(restored.attempt?.body.situation ?? '')
  const [demo, setDemo] = useState(restored.attempt?.body.demo ?? true) // 演示内容默认勾演示标记
  const [includeSource, setIncludeSource] = useState(!!restored.attempt?.body.sourceUrl)
  const [preview, setPreview] = useState(!!restored.attempt)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(restored.error)
  const [done, setDone] = useState(restored.attempt?.status === 'published' ? { id: restored.attempt.id } : null) // {id}
  const [revoking, setRevoking] = useState(false)
  const [notice, setNotice] = useState('')
  const attempt = useRef(restored.attempt) // {id, body}

  const edited = () => {
    setPreview(false)
    setConsent(false)
  }

  function togglePart(i, checked) {
    const next = checked ? [...selected, i] : selected.filter((x) => x !== i)
    setSelected(next)
    setText(
      parts
        .filter((_, j) => next.includes(j))
        .map((p) => p.label + '：\n' + p.text)
        .join('\n\n'),
    )
    edited()
  }

  async function publish() {
    if (!consent || !preview || busy || done || restored.error) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!attempt.current) {
        const body = {
          situation: situation.trim(),
          text: text.trim(),
          demo,
          consent: true,
          sourceUrl: includeSource ? record.sourceUrl : null,
          sourceExcerpt:
            includeSource && record.sourceExcerpt
              ? Array.from(record.sourceExcerpt).slice(0, 500).join('')
              : null,
        }
        attempt.current = await prepareShare(record.id, body)
      }
      await publishPrepared(record.id)
      setDone({ id: attempt.current.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : '未确认发布结果，可通过接收页检查状态后重试')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!done || revoking) return
    setRevoking(true)
    setError('')
    try {
      await revokePrepared(record.id)
      setDone(null)
      setNotice('这份分享已撤回，本应用不再公开展示。私人记录保持不变。')
      attempt.current = null
      setPreview(false)
      setConsent(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤回失败')
    } finally {
      setRevoking(false)
    }
  }

  const textTooLong = codePointLength(text.trim()) > 2000

  return (
    <div className="panel-root" role="dialog" aria-modal="true" aria-label="分享给后来者">
      <div className="panel-backdrop" onClick={onClose} />
      <div className="share-modal share-flow">
        <h2 className="panel-title">留给有相似处境的人</h2>
        <p className="frozen-note">
          只选择你愿意公开的本人内容，私人记录与以后的续写保持私密。不自动发布到知乎。
        </p>

        {notice && <p role="status">{notice}</p>}
        {done ? (
          <div className="confirm-bar" role="status">
            <p>已公开到本应用「留给后来者」。公开不等于有人读过，更不等于帮助成功。</p>
            <p>
              <a className="link" href={`/share/${done.id}`} target="_blank" rel="noreferrer">
                打开接收页 /share/{done.id.slice(0, 8)}… ↗
              </a>
            </p>
            <p className="frozen-note">管理凭据保存在本浏览器；撤回后本应用不再展示。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-ghost" onClick={revoke} disabled={revoking}>
                {revoking ? '正在撤回…' : '撤回这份分享'}
              </button>
              <button type="button" className="btn-primary small" onClick={onClose}>
                完成
              </button>
            </div>
          </div>
        ) : (
          <>
            <fieldset disabled={busy || !!attempt.current || !!restored.error} className="share-fields">
              {parts.map((p, i) => (
                <label key={i} className="share-part">
                  <input
                    type="checkbox"
                    checked={selected.includes(i)}
                    onChange={(e) => togglePart(i, e.target.checked)}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    <span className="share-part-text">{p.text.slice(0, 80)}{p.text.length > 80 ? '…' : ''}</span>
                  </span>
                </label>
              ))}
              <label className="field-label" htmlFor="share-situation">
                适合什么处境的人看？
              </label>
              <input
                id="share-situation"
                className="text-input"
                maxLength={80}
                value={situation}
                onChange={(e) => {
                  setSituation(e.target.value)
                  edited()
                }}
                placeholder="例如：正在等一个谈好条件的消息的人"
              />
              <label className="field-label" htmlFor="share-text">
                将公开的本人内容（最多 2000 字）
              </label>
              <textarea
                id="share-text"
                className="share-text"
                rows={6}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  edited()
                }}
              />
              {textTooLong && <p className="error-text">超过 2000 字，请精简后再公开。</p>}
              {record.sourceUrl && (
                <label className="demo-toggle">
                  <input
                    type="checkbox"
                    checked={includeSource}
                    onChange={(e) => {
                      setIncludeSource(e.target.checked)
                      edited()
                    }}
                  />
                  同时公开关联知乎链接与已保存摘录（最多 500 字）
                </label>
              )}
              <label className="demo-toggle">
                <input
                  type="checkbox"
                  checked={demo}
                  onChange={(e) => {
                    setDemo(e.target.checked)
                    edited()
                  }}
                />
                这是演示／虚构测试内容，单列展示
              </label>
            </fieldset>

            {attempt.current && (
              <div className="frozen-note">
                <p>已恢复同一次提交的原内容。结果尚未确认，可以重试；不会另建一份分享。</p>
                <a href={`/share/${attempt.current.id}`} target="_blank" rel="noreferrer">检查原提交／进入接收页管理</a>
              </div>
            )}

            {!preview ? (
              <div className="confirm-actions">
                <button type="button" className="btn-ghost" onClick={onClose}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn-primary small"
                  disabled={!text.trim() || !situation.trim() || textTooLong || busy}
                  onClick={() => setPreview(true)}
                >
                  预览将公开的内容
                </button>
              </div>
            ) : (
              <div className="paper-card share-card">
                <p className="share-card-title">{situation}</p>
                <p className="frozen-note">{demo ? '演示／虚构测试内容' : '本人自述，未经独立核验'}</p>
                <p className="record-text">{text}</p>
                {includeSource && record.sourceUrl && (
                  <>
                    <a className="source-link" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
                      关联知乎来源 <Icon name="ext" size={14} />
                    </a>
                    {record.sourceExcerpt && (
                      <blockquote className="quote-text">
                        “{Array.from(record.sourceExcerpt).slice(0, 500).join('')}”
                      </blockquote>
                    )}
                  </>
                )}
                <p className="frozen-note">
                  确认后会保存到服务器，进入「留给后来者」列表，任何能访问本应用的人都可阅读。撤回后本应用不再展示，但不能收回他人已复制的内容。
                </p>
                <label className="demo-toggle">
                  <input type="checkbox" disabled={busy} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  我已检查内容，自愿公开预览中的信息
                </label>
                <div className="confirm-actions">
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPreview(false)}>
                    返回修改
                  </button>
                  <button type="button" className="btn-primary small" disabled={busy || !consent || !!restored.error} onClick={publish}>
                    {busy ? '正在提交…' : '确认公开，留给后来者'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}（请求失败或超时不代表未发布；同一次提交可安全重试。）
          </p>
        )}
      </div>
    </div>
  )
}
