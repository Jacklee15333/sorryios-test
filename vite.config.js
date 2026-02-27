import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // 生产环境base路径（对应后端 /app/ 路由）
  base: process.env.NODE_ENV === 'production' ? '/app/' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/outputs': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    // 构建输出到后端的 public/app 目录
    outDir: path.resolve(__dirname, '../backend/public/app'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false
  }
})
