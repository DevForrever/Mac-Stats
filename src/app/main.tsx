import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('Не найден элемент #root')
}

const root = createRoot(rootElement)
const isDevToolsPage = typeof chrome !== 'undefined' && Boolean(chrome.devtools?.panels)
const isPanelPage = new URLSearchParams(window.location.search).has('panel')

if (!isDevToolsPage) {
    root.render(
        <main style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
            Откройте Mac Stats из панели расширения Chrome DevTools.
        </main>
    )
} else if (!isPanelPage) {
    chrome.devtools.panels.create('Mac Stats', '', 'index.html?panel=1')
} else {
    root.render(
        <StrictMode>
            <App />
        </StrictMode>
    )
}
