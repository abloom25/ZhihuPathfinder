import React from 'react'

// 页面崩溃的局部恢复：不整页白屏；提供刷新与回到记录列表，本地数据不受影响。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app">
        <main className="main">
          <section className="stage" aria-label="页面出现问题">
            <h1 className="screen-title">这一页出了问题，已停下</h1>
            <div className="confirm-bar" role="alert">
              <p>已保存的记录仍在此浏览器本地，不受影响。</p>
            </div>
            <div className="aux-row">
              <button type="button" className="btn-primary" onClick={() => window.location.assign('/')}>
                回到探索
              </button>
              <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
                重新加载本页
              </button>
            </div>
            <p className="frozen-note">
              {String(this.state.error?.message ?? this.state.error)}
            </p>
          </section>
        </main>
      </div>
    )
  }
}
