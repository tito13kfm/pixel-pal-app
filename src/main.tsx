import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTauriBridge } from './lib/tauri-bridge'

if (window.__TAURI_INTERNALS__) {
  initTauriBridge()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
