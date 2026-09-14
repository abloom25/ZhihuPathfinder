import { useEffect, useRef, useState } from 'react'
import { exportRecordsJson, importRecordsJson, loadRecords } from '../lib/records.js'

// 我的问津：本机全部私密记录。导出→导入可迁移；导入只合并新 ID，冲突备份不覆盖任何内容。
export default function RecordsList({ reloadStored, notice, onNotice, onOpen, onNewRound }) {
  const [state, setState] = useState(null) // loadRecords() 结果
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const reload = () => {
    setError(null)
    setState(reloadStored())
  }

  useEffect(() => {
    reload()
  }, [])

  function doExport() {
    setError(null)
    try {
      const json = exportRecordsJson()
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'later-records.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      onNotice('已发起下载备份文件；下载完成前请不要清空浏览器数据。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败，不能确认已备份')
    }
  }

  async function doImport(file) {
    if (!file) return
    setError(null)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5MB，请先保留原文件并拆分后导入')
      const count = await importRecordsJson(await file.text())
      reload()
      onNotice(count > 0 ? `已导入 ${count} 条记录，未覆盖已有内容。` : '备份内容已在记录中，未重复导入。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败，原记录未改动')
    }
  }

  if (state === null) return null

  if (state.status === 'unavailable') {
    return (
      <section className="stage" aria-label="我的问津">
        <h1 className="screen-title">我的问津</h1>
        <p className="error-text" role="alert">
          无法读取浏览器存储，不能确认数据状态。请检查存储权限后重试。
        </p>
        <button type="button" className="btn-ghost" onClick={reload}>
          重试
        </button>
      </section>
    )
  }

  if (state.status === 'corrupt') {
    return (
      <section className="stage" aria-label="我的问津">
        <h1 className="screen-title">我的问津</h1>
        <div className="confirm-bar" role="alert">
          <p>暂时无法读取本设备记录。原始数据仍保留在本机，没有被清空。</p>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <p className="scope-note">可以先导出原始数据留底，再从备份导入恢复。</p>
        <div className="aux-row">
          <button type="button" className="btn-ghost" onClick={doExport}>
            导出原始数据留底
          </button>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
            从备份导入
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            doImport(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </section>
    )
  }

  const records = state.status === 'empty' ? [] : state.records

  return (
    <section className="stage" aria-label="我的问津">
      <h1 className="screen-title">我的问津</h1>
      <p className="scope-note">保存在此浏览器本地，不会跨设备同步。迁移请用导出→导入。</p>

      {notice && (
        <p className="saved-state" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {records.length === 0 ? (
        <div className="paper-card">
          <p>还没有保存的记录。完成一次探索后，这里会留下你的原话。</p>
          <button type="button" className="btn-primary" onClick={onNewRound}>
            去探索「等消息的这一周」→
          </button>
        </div>
      ) : (
        <ul className="record-list">
          {records.map((r) => (
            <li key={r.id}>
              <button type="button" className="paper-card record-item" onClick={() => onOpen(r.id)}>
                <span className="update-time">保存于 {new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                <p className="frozen-text">{r.initialText.split('\n')[0]}</p>
                <span className="tag">
                  {r.entries.length > 0 ? `${r.entries.length} 条补充` : '暂无补充'}
                  {r.sourceExcerpt ? ' · 含来源摘录' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="aux-row">
        <button type="button" className="link" onClick={doExport}>
          导出备份（JSON）
        </button>
        <button type="button" className="link" onClick={() => fileRef.current?.click()}>
          导入备份
        </button>
        <button type="button" className="link" onClick={reload}>
          刷新
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          doImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </section>
  )
}
