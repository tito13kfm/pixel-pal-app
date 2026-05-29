import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const IS_WEB = process.env.VITE_BUILD_TARGET === 'web'

export default defineConfig({
  plugins: [react()],
  base: IS_WEB ? '/pixel-pal-app/' : './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('en-CA')),
    'import.meta.env.VITE_WEB': JSON.stringify(IS_WEB),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
