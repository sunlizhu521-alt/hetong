import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/hetong/',
  plugins: [react()],
  server: {
    proxy: {
      '/hetong-api': 'http://127.0.0.1:8010',
    },
  },
})
