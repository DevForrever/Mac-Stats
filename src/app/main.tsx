import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

if (!window.location.search.includes('panel=1') && chrome.devtools?.panels) {
    chrome.devtools.panels.create('Mac Stats', '', 'index.html?panel=1')
} else {
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <App />
        </StrictMode>
    )
}
