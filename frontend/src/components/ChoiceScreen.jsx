import { useState } from 'react'
import { ACTIONS, EARLY } from '../data/cases.js'
import { Icon } from './Icons.jsx'
import { PencilTextarea } from './PencilField.jsx'
import Illustration from './Illustration.jsx'
import { MAX_REASON } from '../lib/flow.js'

// S0+S1：进入处境并先做自己的选择（01 文档第 1/2 节：早期原文仅 p8/p9；
// 允许多选或只写自己的做法；理由可选，350 字；按钮"记住这次选择，看看后来"）。
export default function ChoiceScreen({
  actions,
  custom,
  error,
  frozen,
  onToggle,
  onCustomChange,
  onSubmit,
  onReenterReveal,
  onRestart,
  onOpenCompanion,
}) {
  const [confirming, setConfirming] = useState(false)

  // 揭晓后：原始选择冻结，只读回看
  if (frozen) {
    return (
      <section className="stage" aria-label="看后续前的我（已冻结）">
        <p className="kicker">看后续前的我 · 原话保留</p>
        <h1 className="title">{frozen.text}</h1>
        <div className="paper-card readonly-card">
          {frozen.custom.trim() ? (
            <p className="frozen-text">{frozen.custom}</p>
          ) : (
            <p className="frozen-note">当时没有填写理由。</p>
          )}
          <p className="frozen-note">本轮选择已在揭晓时冻结，可回看，不可修改。</p>
        </div>
        <button type="button" className="btn-primary" onClick={onReenterReveal}>
          回到他们的后来 →
        </button>
        {confirming ? (
          <div className="confirm-bar" role="alert">
            <p>再开始一轮：本标签页将开始一份新的探索草稿；已保存的记录保持不变。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
                先不
              </button>
              <button type="button" className="btn-danger-text" onClick={onRestart}>
                开始新一轮
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link quiet" onClick={() => setConfirming(true)}>
            再开始一轮
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="stage hero" aria-label="先做自己的选择">
      <p className="kicker">第一章 · 等待</p>
      <h1 className="title">等消息的这一周</h1>
      <p className="situation">谈过条件了，消息还没来。</p>
      <p className="source-note">先留下自己的选择，再看看不同人的后来。</p>

      <Illustration />

      <div className="paper-card early-card">
        <p className="source-note">知乎作者 {EARLY.author} 记下了这段等待。以下只展示其叙述中收到后续消息之前的部分：</p>
        {EARLY.quotes.map((q, i) => (
          <blockquote className="quote-text" key={i}>
            “{q}”
          </blockquote>
        ))}
        <p className="frozen-note">{EARLY.note}</p>
        <details className="source-details">
          <summary>查看来源</summary>
          <a className="source-link" href={EARLY.source.url} target="_blank" rel="noreferrer">
            {EARLY.source.title} <Icon name="ext" size={14} />
          </a>
        </details>
      </div>

      <h2 className="question">如果是你，下一步倾向怎么安排？</h2>
      <div className="choices" role="group" aria-label="行动选择，可组合">
        {ACTIONS.map((a) => {
          const on = actions.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              className={`choice-card${on ? ' selected' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(a.id)}
            >
              <span className="choice-label">
                <strong>{a.id} · {a.label}</strong>
                <small>{a.sub}</small>
              </span>
              <span className="choice-check" aria-hidden>
                {on ? '✓' : ''}
              </span>
            </button>
          )
        })}
      </div>
      <p className="hint">可以组合，也可以暂不选、写自己的做法。没有标准答案。</p>
      <label className="field-label" htmlFor="first-reason">
        我为什么这样想／我的其他做法（可选）
      </label>
      <PencilTextarea
        id="first-reason"
        rows={2}
        maxLength={MAX_REASON}
        placeholder="只留下你现在的想法，不需要猜中结果。"
        value={custom}
        onChange={(e) => onCustomChange(e.target.value)}
      />

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" className="btn-primary" onClick={onSubmit}>
        记住这次选择，看看后来 →
      </button>
      <p className="caption">揭示后，起初选择与原话保持不变；你可以再写现在的想法。</p>
      <button type="button" className="link quiet" onClick={onOpenCompanion}>
        我想先补充自己的情况
      </button>
    </section>
  )
}
