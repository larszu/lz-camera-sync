import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import '@fontsource-variable/public-sans'
import './ui/tokens.css'
import './ui/app.css'
import './ui/modern.css'
import { readLook } from './ui/parts'

document.documentElement.dataset.style = readLook()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
