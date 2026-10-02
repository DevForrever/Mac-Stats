import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Panel } from '../features/Panel'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('Root element #root was not found')
}

const root = createRoot(rootElement)
const isDevToolsPage = typeof chrome !== 'undefined' && Boolean(chrome.devtools?.panels)
const isPanelPage = new URLSearchParams(window.location.search).has('panel')

if (!isDevToolsPage) {
    root.render(
        <main style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
            Open Mac Stats from the Chrome DevTools panel.
        </main>
    )
} else if (!isPanelPage) {
    chrome.devtools.panels.create('Mac Stats', '', 'index.html?panel=1')
} else {
    root.render(
        <StrictMode>
            <Panel />
        </StrictMode>
    )
}
