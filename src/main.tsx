import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import crimsonProUrl from '@fontsource/crimson-pro/files/crimson-pro-latin-300-normal.woff2?url'
import './index.css'
import App from './App.tsx'

const crimsonPro = new FontFace(
  'Crimson Pro',
  `url(${crimsonProUrl}) format('woff2')`,
  { weight: '300', style: 'normal', display: 'block' },
)
document.fonts.add(crimsonPro)
crimsonPro.load()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
