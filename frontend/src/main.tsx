import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/app'

try {
  if (localStorage.getItem('fi-theme') === 'light') document.documentElement.classList.remove('dark')
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
