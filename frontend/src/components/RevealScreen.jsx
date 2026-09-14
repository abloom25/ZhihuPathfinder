import { ACTIONS_BY_ID, SUPPLEMENT_CARDS } from '../data/cases.js'
import { Icon } from './Icons.jsx'

function EvidenceCard({ card, quoteId, frozen, onQuote }) {
  return (
    <article className="paper-card case-card" key={card.id}>
      <p className="case-kicker">
        {card.source.author} 的记述
        {card.suggestedAction ? ` · 关联行动 ${card.suggestedAction}` : ' · 补充记述'}
      </p>
      <h2 className="case-author">{card.label}</h2>

      <div className="fact-panels">
        {card.displayFacts.map((t) => (
          <div className="fact-panel" key={t}>
            {t}
          </div>
        ))}
      </div>

      <div className="unknown-block">
        <strong>仍然不知道</strong>
        <ul>
          {card.unknowns.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <details className="source-details">
        <summary>条件差异与原文依据</summary>
        <ul className="cond-list">
          {card.conditionDifferences.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="frozen-note">
          以下来自保存的知乎 API 片段（{card.source.scope}）。可选一段保留在自己的记录里。
        </p>
        {card.quotes.map((q) => (
          <div className="quote-select" key={q.id}>
            <blockquote className="quote-text">“{q.text}”</blockquote>
            <label className="quote-pick">
              <input
                type="radio"
                name="level-quote"
                disabled={frozen}
                checked={quoteId === q.id}
                onChange={() => onQuote(q.id)}
              />
              这段让我想到自己，随记录保留
            </label>
          </div>
        ))}
        <a className="source-link" href={card.source.url} target="_blank" rel="noreferrer">
          回到知乎来源 <Icon name="ext" size={14} />
        </a>
      </details>
    </article>
  )
}

// S2：他们各自的后来。核心 5 张全部可达（相关的优先），补充 2 张收在折叠区；
// 补充案例不是行动推荐，a/b/c/d 是公司代号，不是本关 A/B/C 行动。
export default function RevealScreen({
  coreCards,
  index,
  quoteId,
  frozen,
  onPrev,
  onNext,
  onSelect,
  onQuote,
  onProceed,
  onOpenCompanion,
  onBack,
}) {
  const card = coreCards[index]

  return (
    <section className="stage" aria-label="他们各自的后来" id="level-evidence">
      <p className="kicker center">02 · 揭开后来</p>
      <div className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="返回看后续前的我">
          <Icon name="back" />
        </button>
        <h1 className="screen-title">他们各自的后来</h1>
        <span className="head-spacer" />
      </div>
      <p className="caption">
        优先呈现与你所选行动相关的记述。它们属于不同的人，条件也不同；选择不会改变作者已经发生的经历。
      </p>

      <div className="case-stack">
        <EvidenceCard card={card} quoteId={quoteId} frozen={frozen} onQuote={onQuote} />
      </div>

      <div className="case-switch">
        <button type="button" className="btn-ghost" onClick={onPrev} aria-label="上一段经历">
          ←
        </button>
        <div className="dots" role="tablist" aria-label="切换核心案例">
          {coreCards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`第 ${i + 1} 段经历`}
              className={`dot${i === index ? ' active' : ''}`}
              onClick={() => onSelect(i)}
            />
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={onNext} aria-label="下一段经历">
          →
        </button>
      </div>
      <p className="caption">
        {index + 1} / {coreCards.length} · 不同人的经历，条件也不同
      </p>

      <details className="supplement-fold">
        <summary>如果还有别的机会在等你（2 段补充记述）</summary>
        <p className="frozen-note">
          补充案例不是行动推荐；里面的 a/b/c/d 是原文中的公司代号，不是本关 A/B/C 行动选项。
        </p>
        {SUPPLEMENT_CARDS.map((c) => (
          <EvidenceCard card={c} quoteId={quoteId} frozen={frozen} onQuote={onQuote} key={c.id} />
        ))}
      </details>

      <button type="button" className="btn-primary with-icon" onClick={onProceed}>
        <Icon name="pen" size={18} />
        去写我的这一页 →
      </button>
      <div className="aux-row">
        <button type="button" className="link" onClick={onNext}>
          换一段经历
        </button>
        <button type="button" className="link" onClick={onOpenCompanion}>
          一起想一想
        </button>
      </div>
      {quoteId ? null : (
        <p className="caption">还没选择触动片段。可以展开案例的原文选择，也可以只保存自己的想法。</p>
      )}
    </section>
  )
}
