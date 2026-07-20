import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Receipt root element is missing.')

if (window.self !== window.top) {
  rootElement.className = 'frame-blocked'
  rootElement.textContent = 'Receipt cannot run inside another site. Open it in a new tab.'
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
