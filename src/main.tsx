import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

if (window.__TAURI_INTERNALS__) {
  // Dynamic import: Tauri runtime is only loaded when actually inside a
  // Tauri window. Web builds tree-shake this entire module out.
  import('./lib/tauri-bridge').then(({ initTauriBridge }) => initTauriBridge())
  import('./lib/ai').then(({ ensureTauriFetchLoaded }) => ensureTauriFetchLoaded())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
