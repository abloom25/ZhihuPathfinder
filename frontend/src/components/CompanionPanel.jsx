import {
  COMPANION_LABEL,
  contextAdvice,
  CORRECTIONS,
  DEADLINE_SUPPLEMENT_NOTE,
  FREE_TEXT_NOTE,
  POSSIBILITIES_TEXT,
  SUPPLEMENT_CARDS,
} from '../data/cases.js'
import { Icon } from './Icons.jsx'
import { PencilTextarea } from './PencilField.jsx'
import { MAX_REASON } from '../lib/flow.js'

const TABS = [
  { id: 'context', label: '补充我的情况', userLang: '我的情况不一样' },
  { id: 'possibilities', label: '看看其他可能', userLang: '还有其他可能吗' },
  { id: 'challenge', label: '反驳这个判断', userLang: '这点我不认同' },
]

// S3：三个固定辅助（01 文档第 4 节）。结构化选项给出固定对照；自由文字只保留原话，
// 不生成个性化判断，不做假思考/假流式输出。关闭面板保留输入并回到原处。
export default function CompanionPanel({
  open,
  tab,
  context,
  contextKind,
  disagreement,
  frozen,
  onTab,
  onChange,
  onClose,
}) {
  if (!open) return null

  return (
    <div className="panel-root" role="dialog" aria-modal="true" aria-label="一起想一想">
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel">
        <div className="panel-quote">
          <span className="panel-bird" aria-hidden>
            <Icon name="bird" size={28} />
          </span>
          <p className="panel-quote-text">有时候，想清楚比等到消息更重要。</p>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭面板">
            <Icon name="close" />
          </button>
        </div>

        <div className="panel-inner">
          <h2 className="panel-title">一起想一想</h2>
          <p className="frozen-note">{COMPANION_LABEL}</p>

          <div className="panel-tabs" role="tablist" aria-label="三个辅助入口">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`panel-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => onTab(t.id)}
                title={t.userLang}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="panel-body">
            {tab === 'context' && (
              <>
                <label className="field-label" htmlFor="context-kind">
                  我想补充的约束
                </label>
                <select
                  id="context-kind"
                  className="text-input"
                  disabled={frozen}
                  value={contextKind}
                  onChange={(e) => onChange({ contextKind: e.target.value })}
                >
                  <option value="">用自己的话补充</option>
                  <option value="deadline">有明确的答复期限</option>
                  <option value="interview">还有其他面试要准备</option>
                  <option value="no-contact">暂时不想再询问 HR</option>
                </select>
                <div className="panel-reply mapped">
                  <span className="reply-avatar" aria-hidden>
                    <Icon name="bird" size={18} />
                  </span>
                  <div className="reply-content">
                    <p>{contextAdvice(contextKind)}</p>
                    <span className="tag">固定案例对照</span>
                  </div>
                </div>
                {contextKind === 'deadline' && (
                  <div className="deadline-supplement">
                    <p className="frozen-note">{DEADLINE_SUPPLEMENT_NOTE}</p>
                    <ul className="panel-cases">
                      {SUPPLEMENT_CARDS.map((c) => (
                        <li key={c.id}>
                          <strong>{c.label}</strong>（{c.source.author}）
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="field-label" htmlFor="level-context">
                  我的具体情况（原话保留，可选）
                </label>
                <PencilTextarea
                  id="level-context"
                  rows={2}
                  maxLength={MAX_REASON}
                  disabled={frozen}
                  placeholder="例如：对方说下周三给答复。这是你的补充，不会变成案例作者的条件。"
                  value={context}
                  onChange={(e) => onChange({ context: e.target.value })}
                />
              </>
            )}

            {tab === 'possibilities' && (
              <>
                {POSSIBILITIES_TEXT.map((t) => (
                  <p key={t}>{t}</p>
                ))}
                <a className="link" href="#level-evidence" onClick={onClose}>
                  对照原文与条件 ↓
                </a>
              </>
            )}

            {tab === 'challenge' && (
              <>
                {CORRECTIONS.map((c) => (
                  <details className="source-details" key={c.title}>
                    <summary>{c.title}</summary>
                    <p>{c.text}</p>
                  </details>
                ))}
                <label className="field-label" htmlFor="level-disagreement">
                  我的反驳或不同情况（可选）
                </label>
                <PencilTextarea
                  id="level-disagreement"
                  rows={2}
                  maxLength={MAX_REASON}
                  disabled={frozen}
                  placeholder="写下具体哪句话、哪种条件不对。异议会作为你的原话保留，不自动改写案例。"
                  value={disagreement}
                  onChange={(e) => onChange({ disagreement: e.target.value })}
                />
                <p className="frozen-note">{FREE_TEXT_NOTE}</p>
              </>
            )}
          </div>

          <p className="panel-foot">
            三个入口都可以跳过；关闭面板会保留你写的内容并回到原处。这里没有实时 AI 分析。
          </p>
        </div>
      </aside>
    </div>
  )
}
