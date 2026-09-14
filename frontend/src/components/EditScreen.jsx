import { Icon } from './Icons.jsx'
import { PencilInput, PencilTextarea } from './PencilField.jsx'
import { MAX_REASON } from '../lib/flow.js'

// S4：看过这些后来，现在的我。起初（只读）/ 此刻（可编辑）/ 可选来源片段（准确引用）。
export default function EditScreen({ frozen, quote, after, frozenInput, onChange, onClearQuote, onPreview, onBack }) {
  const set = (patch) => onChange({ ...after, ...patch })

  return (
    <section className="stage" aria-label="看过这些后来，现在的我">
      <p className="kicker center">04 · 留给未来的自己</p>
      <div className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="返回他们的后来">
          <Icon name="back" />
        </button>
        <h1 className="screen-title">我的这一页</h1>
        <span className="head-spacer" />
      </div>

      <div className="paper-card readonly-card">
        <h2 className="card-label">看后续前，我倾向</h2>
        <p className="frozen-text">{frozen.text}</p>
        {frozen.custom.trim() ? (
          <p className="reason-text">{frozen.custom}</p>
        ) : (
          <p className="frozen-note">当时没有填写理由。</p>
        )}
        <p className="frozen-note">只读 · 揭晓时已冻结</p>
      </div>

      <div className="squiggle" aria-hidden>
        <svg viewBox="0 0 200 12" width="180" height="12">
          <path
            d="M2 6 Q 14 0 26 6 T 50 6 T 74 6 T 98 6 T 122 6 T 146 6 T 170 6 T 194 6"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="paper-card">
        <span className="card-tag">示例记录 · 关卡探索</span>
        <h2 className="card-label">看过这些后来，现在的我</h2>
        <p className="frozen-note">可以坚持原选择、改变想法，也可以仍不确定。这里记录的是你的思考，不是模拟出的个人结局。</p>
        <div className="mode-row" role="radiogroup" aria-label="此刻的倾向">
          {[
            ['keep', '保持原选择'],
            ['change', '改变倾向'],
            ['unsure', '我还没想好'],
          ].map(([v, label]) => (
            <label key={v} className={`mode${after.mode === v ? ' selected' : ''}`}>
              <input
                type="radio"
                name="mode"
                value={v}
                disabled={frozenInput}
                checked={after.mode === v}
                onChange={() => set({ mode: v })}
              />
              {label}
            </label>
          ))}
        </div>
        {after.mode === 'change' && (
          <PencilInput
            placeholder="现在更倾向…"
            disabled={frozenInput}
            value={after.text}
            onChange={(e) => set({ text: e.target.value })}
          />
        )}
        <label className="field-label" htmlFor="now-reason">
          我现在的理由（可选）
        </label>
        <PencilTextarea
          id="now-reason"
          rows={3}
          maxLength={MAX_REASON}
          disabled={frozenInput}
          placeholder="理由（可选，不写长文也能留下记录）"
          value={after.reason}
          onChange={(e) => set({ reason: e.target.value })}
        />
      </div>

      {quote ? (
        <div className="paper-card quote-card">
          <h2 className="card-label">已选触动我的摘录</h2>
          <blockquote className="quote-text">“{quote.quote.text}”</blockquote>
          <a className="source-link" href={quote.card.source.url} target="_blank" rel="noreferrer">
            来源 · {quote.card.source.author} <Icon name="ext" size={14} />
          </a>
          <div>
            <button type="button" className="link quiet" disabled={frozenInput} onClick={onClearQuote}>
              取消附带片段
            </button>
          </div>
        </div>
      ) : (
        <p className="caption">还没选择触动片段。可以回到案例展开原文选择，也可以只保存自己的想法。</p>
      )}

      <button type="button" className="btn-primary" disabled={frozenInput} onClick={onPreview}>
        预览我的这一页 →
      </button>
    </section>
  )
}
