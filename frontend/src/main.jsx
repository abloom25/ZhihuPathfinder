import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ShareReceive from './components/ShareReceive.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles.css'

// 最小路由：/share/:id 为分享接收页（独立浏览器可直接打开），其余为主应用。
const shareMatch = /^\/share\/([0-9a-f-]{36})\/?$/.exec(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {shareMatch ? <ShareReceive shareId={shareMatch[1]} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
)
