import { useEffect, useRef, useState } from 'react'
import { CORE_CARDS, findQuote } from './data/cases.js'
import {
  buildInitialText,
  freezeChoice,
  freshDraft,
  loadDraft,
  saveDraft,
  textFits,
  LEVEL_DRAFT_KEY,
} from './lib/flow.js'
import { appendEntry, createRecord, loadRecords } from './lib/records.js'
import ChoiceScreen from './components/ChoiceScreen.jsx'
import RevealScreen from './components/RevealScreen.jsx'
import CompanionPanel from './components/CompanionPanel.jsx'
import EditScreen from './components/EditScreen.jsx'
import PreviewScreen from './components/PreviewScreen.jsx'
import SavedScreen from './components/SavedScreen.jsx'
import RecordsList from './components/RecordsList.jsx'
import ShareReceive from './components/ShareReceive.jsx'
import SearchPanel from './components/SearchPanel.jsx'

function loadRecordById(id) {
  const state = loadRecords()
  if (state.status !== 'ok') return null
  return state.records.find((r) => r.id === id) ?? null
}

export default function App() {
  // 极简路由：/share/:id 为独立接收页；其余为本应用
  const path = window.location.pathname
  if (path.startsWith('/share/')) {
    const shareId = decodeURIComponent(path.slice('/share/'.length).replace(/\/+$/, ''))
    return <ShareReceive shareId={shareId} />
  }
  return <MainApp />
}

function MainApp() {
  const [loaded] = useState(loadDraft)
  const [d, setD] = useState(loaded.draft)
  const [recoveryError, setRecoveryError] = useState(loaded.error)
  const [view, setView] = useState('level') // 'level' | 'records' | 'record'
  const [record, setRecord] = useState(null)
  const [recordsNotice, setRecordsNotice] = useState('')
  const [stage, setStage] = useState('choice') // choice | reveal | edit | preview
  const [caseIndex, setCaseIndex] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState('context')
  const [searchOpen, setSearchOpen] = useState(false)
  const [choiceError, setChoiceError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [appending, setAppending] = useState(false)
  const [appendError, setAppendError] = useState('')
  const [restartAsk, setRestartAsk] = useState(false)
  const saving = useRef(false)

  const frozen = busy || !!d.savedId
  const frozenChoice = d.revealed ? freezeChoice(d.actions, d.custom) : null

  // 相关行动的核心案例优先，其余顺序保持；全部可达
  const sortedCore = [...CORE_CARDS].sort(
    (a, b) => Number(d.actions.includes(b.suggestedAction)) - Number(d.actions.includes(a.suggestedAction)),
  )

  const selectedQuote = findQuote(d.quoteId)
  const initialText = d.revealed
    ? buildInitialText({ frozen: freezeChoice(d.actions, d.custom), after: d, context: d.context, disagreement: d.disagreement })
    : ''

  // 草稿暂存（恢复失败时不覆盖）
  useEffect(() => {
    if (recoveryError) return
    saveDraft(d)
  }, [d, recoveryError])

  function update(patch) {
    if (frozen) return
    setD((old) => ({ ...old, ...patch }))
  }

  function toggleAction(id) {
    setChoiceError('')
    const old = d.actions
    update({ actions: old.includes(id) ? old.filter((x) => x !== id) : [...old, id] })
  }

  function submitChoice() {
    if (d.actions.length === 0 && !d.custom.trim()) {
      setChoiceError('先选一个，或写自己的做法。')
      return
    }
    update({ revealed: true })
    setStage('reveal')
    window.scrollTo(0, 0)
  }

  function restart() {
    setD(freshDraft())
    setStage('choice')
    setCaseIndex(0)
    setChoiceError('')
    setSaveError('')
    setRecoveryError('')
    setRestartAsk(false)
    setView('level')
    window.scrollTo(0, 0)
  }

  async function doSave() {
    if (saving.current || d.savedId || !d.revealed || recoveryError) return
    saving.current = true
    setBusy(true)
    setSaveError('')
    try {
      if (!textFits(initialText)) throw new Error('文字超过 2000 字，请精简自己的补充后保存。')
      if (d.quoteId && !selectedQuote) throw new Error('找不到所选原文，请重新选择。')
      const rec = await createRecord({
        creationId: d.creationId,
        initialText,
        sourceUrl: selectedQuote?.card.source.url ?? null,
        sourceTitle: selectedQuote?.card.source.title ?? null,
        sourceExcerpt: selectedQuote?.quote.text ?? null,
      })
      const done = { ...d, savedId: rec.id }
      setD(done)
      try {
        sessionStorage.setItem(LEVEL_DRAFT_KEY, JSON.stringify(done))
      } catch {
        /* 记录本身已安全提交 */
      }
      openRecord(rec.id)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '没有保存成功，文字仍在')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function openRecord(id) {
    const rec = loadRecordById(id)
    if (rec) {
      setRecord(rec)
      setView('record')
      window.scrollTo(0, 0)
    } else {
      setView('records')
    }
  }

  async function handleAppend(text) {
    if (appending || !record) return false
    setAppending(true)
    setAppendError('')
    try {
      const updated = await appendEntry(record, text)
      setRecord(updated)
      return true
    } catch (e) {
      setAppendError(e instanceof Error ? e.message : '没有保存成功，文字仍在')
      return false
    } finally {
      setAppending(false)
    }
  }

  const openCompanion = (tab) => {
    setPanelTab(tab ?? 'context')
    setPanelOpen(true)
  }

  // 草稿损坏：不覆盖，先确认
  if (recoveryError) {
    return (
      <div className="app">
        <Topbar onRecords={() => setView('records')} onLevel={() => setView('level')} />
        <main className="main">
          <section className="stage" aria-label="关卡草稿需要确认">
            <h1 className="screen-title">关卡草稿需要确认</h1>
            <div className="confirm-bar" role="alert">
              <p>{recoveryError}</p>
              <div className="confirm-actions">
                <button type="button" className="btn-ghost" onClick={() => setView('records')}>
                  回到我的问津
                </button>
                <button type="button" className="btn-primary small" onClick={restart}>
                  开始新一轮
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <Topbar
        onRecords={() => setView('records')}
        onLevel={() => setView('level')}
        onSearch={() => setSearchOpen(true)}
        active={view}
      />

      <main className="main">
        {view === 'records' && (
          <RecordsList
            reloadStored={loadRecords}
            notice={recordsNotice}
            onNotice={setRecordsNotice}
            onOpen={openRecord}
            onNewRound={() => setView('level')}
          />
        )}

        {view === 'record' && record && (
          <SavedScreen
            record={record}
            appending={appending}
            appendError={appendError}
            onAppend={handleAppend}
            onBackToSource={() => {
              if (record.sourceUrl) window.open(record.sourceUrl, '_blank', 'noopener')
              else setView('level')
            }}
            onOpenRecords={() => setView('records')}
          />
        )}

        {view === 'level' && (
          <>
            {d.savedId && (
              <div className="confirm-bar" role="status">
                <p>这轮已保存。</p>
                <div className="confirm-actions">
                  <button type="button" className="link" onClick={() => openRecord(d.savedId)}>
                    回看记录与续写
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setRestartAsk(true)}>
                    再探索一轮
                  </button>
                </div>
              </div>
            )}

            {stage === 'choice' && (
              <ChoiceScreen
                actions={d.actions}
                custom={d.custom}
                error={choiceError}
                frozen={frozenChoice}
                onToggle={toggleAction}
                onCustomChange={(v) => {
                  setChoiceError('')
                  update({ custom: v })
                }}
                onSubmit={submitChoice}
                onReenterReveal={() => setStage('reveal')}
                onRestart={restart}
                onOpenCompanion={() => openCompanion('context')}
              />
            )}

            {stage === 'reveal' && (
              <RevealScreen
                coreCards={sortedCore}
                index={caseIndex}
                quoteId={d.quoteId}
                frozen={frozen}
                onPrev={() => setCaseIndex((caseIndex + sortedCore.length - 1) % sortedCore.length)}
                onNext={() => setCaseIndex((caseIndex + 1) % sortedCore.length)}
                onSelect={setCaseIndex}
                onQuote={(id) => update({ quoteId: d.quoteId === id ? '' : id })}
                onProceed={() => {
                  setStage('edit')
                  window.scrollTo(0, 0)
                }}
                onOpenCompanion={() => openCompanion('context')}
                onBack={() => setStage('choice')}
              />
            )}

            {stage === 'edit' && (
              <EditScreen
                frozen={frozenChoice}
                quote={selectedQuote}
                after={d}
                frozenInput={frozen}
                onChange={(after) => update(after)}
                onClearQuote={() => update({ quoteId: '' })}
                onPreview={() => {
                  setStage('preview')
                  window.scrollTo(0, 0)
                }}
                onBack={() => setStage('reveal')}
              />
            )}

            {stage === 'preview' && (
              <PreviewScreen
                initialText={initialText}
                quote={selectedQuote}
                busy={busy}
                saveError={saveError}
                onBack={() => setStage('edit')}
                onConfirm={doSave}
              />
            )}
          </>
        )}
      </main>

      <CompanionPanel
        open={panelOpen}
        tab={panelTab}
        context={d.context}
        contextKind={d.contextKind}
        disagreement={d.disagreement}
        frozen={frozen}
        onTab={setPanelTab}
        onChange={(patch) => update(patch)}
        onClose={() => setPanelOpen(false)}
      />

      {searchOpen && (
        <div className="panel-root" role="dialog" aria-modal="true" aria-label="搜索补充材料">
          <div className="panel-backdrop" onClick={() => setSearchOpen(false)} />
          <div className="share-modal">
            <div className="screen-head">
              <h2 className="panel-title">搜索补充材料</h2>
              <button type="button" className="icon-btn" onClick={() => setSearchOpen(false)} aria-label="关闭搜索">
                ✕
              </button>
            </div>
            <SearchPanel />
          </div>
        </div>
      )}

      {restartAsk && (
        <div className="panel-root" role="dialog" aria-modal="true" aria-label="再探索一轮">
          <div className="panel-backdrop" onClick={() => setRestartAsk(false)} />
          <div className="share-modal">
            <h2 className="panel-title">再开始一轮？</h2>
            <p>已保存的记录保持不变，本标签页将开始一份新的探索草稿。</p>
            <div className="confirm-actions">
              <button type="button" className="btn-ghost" onClick={() => setRestartAsk(false)}>
                先不
              </button>
              <button type="button" className="btn-primary small" onClick={restart}>
                开始新一轮
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Topbar({ onRecords, onLevel, onSearch, active }) {
  return (
    <header className="topbar">
      <span className="brand">问津 Pathfinder</span>
      <nav className="topnav">
        <button type="button" className={`nav-item${active === 'level' ? ' active' : ''}`} onClick={onLevel}>
          探索
        </button>
        <button type="button" className={`nav-item${active === 'records' ? ' active' : ''}`} onClick={onRecords}>
          我的问津
        </button>
        {onSearch && (
          <button type="button" className="nav-item" onClick={onSearch}>
            搜索
          </button>
        )}
        <span className="badge">概念设计</span>
      </nav>
    </header>
  )
}
