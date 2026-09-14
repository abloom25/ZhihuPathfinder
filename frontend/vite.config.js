import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发代理：/api 转到本机后端；生产不保留，需同源反代。
      // 契约要求后端收到的外部 Host 与 Origin 一致（分享 403 来源校验），不能改写 Host
      '/api': { target: 'http://127.0.0.1:18787', changeOrigin: false },
    },
  },
})
