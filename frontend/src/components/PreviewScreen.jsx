import { Icon } from './Icons.jsx'

// S5：预览显示真正要保存的 initialText，允许返回编辑；保存失败内容保留并可重试。
export default function PreviewScreen({
  initialText,
  quote,
  busy,
  saveError,
  onBack,
  onConfirm,
}) {
  return (
    <section className="stage" aria-label="确认后，留给未来的自己">
      <p className="kicker center">05 · 预览与保存</p>
      <div className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="返回编辑" disabled={busy}>
          <Icon name="back" />
        </button>
        <h1 className="screen-title">确认后，留给未来的自己</h1>
        <span className="head-spacer" />
      </div>

      <div className="paper-card">
        <h2 className="card-label">将保存的原文</h2>
        <p className="record-text">{initialText}</p>
      </div>

      {quote && (
        <div className="paper-card quote-card">
          <h2 className="card-label">另附的来源原话</h2>
          <blockquote className="quote-text">“{quote.quote.text}”</blockquote>
          <a className="source-link" href={quote.card.source.url} target="_blank" rel="noreferrer">
            来源 · {quote.card.source.author} <Icon name="ext" size={14} />
          </a>
          <p className="frozen-note">与自己的记述分开保存。</p>
        </div>
      )}

      <p className="caption">
        保存后从「我的问津」回来追加现实中的变化。只有你愿意，才选择内容分享；现在不会公开。
      </p>
      <p className="scope-note">保存范围：仅保存在本设备浏览器，不会跨设备同步。</p>

      {saveError && (
        <div className="confirm-bar" role="alert">
          <p className="error-text">{saveError}</p>
          <details className="source-details">
            <summary>复制留住这段文字</summary>
            <p className="record-text">{initialText}</p>
          </details>
        </div>
      )}

      <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
        {busy ? '正在保存…' : saveError ? '重试保存' : '确认保存到我的问津'}
      </button>
      <button type="button" className="link quiet" onClick={onBack} disabled={busy}>
        返回修改
      </button>
    </section>
  )
}
