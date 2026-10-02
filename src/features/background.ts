let monitoredTabId: number | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

type StartMessage = { type: 'START_MONITORING'; tabId: number }
type StopMessage = { type: 'STOP_MONITORING' }
type InboundMessage = StartMessage | StopMessage

chrome.runtime.onMessage.addListener((message: InboundMessage, _sender, sendResponse) => {
    if (message.type === 'START_MONITORING') {
        startMonitoring(message.tabId)
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: String(err) }))
        return true
    }

    if (message.type === 'STOP_MONITORING') {
        stopMonitoring()
        sendResponse({ ok: true })
        return true
    }
})

async function startMonitoring(tabId: number) {
    if (monitoredTabId !== null && monitoredTabId !== tabId) {
        stopMonitoring()
    }

    monitoredTabId = tabId

    await chrome.debugger.attach({ tabId }, '1.3')
    await chrome.debugger.sendCommand({ tabId }, 'Performance.enable')
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')

    pollTimer = setInterval(async () => {
        if (monitoredTabId === null) return

        try {
            const [performanceResult, heapResult] = await Promise.all([
                chrome.debugger.sendCommand({ tabId: monitoredTabId }, 'Performance.getMetrics'),
                chrome.debugger.sendCommand({ tabId: monitoredTabId }, 'Runtime.getHeapUsage')
            ])

            chrome.runtime.sendMessage({
                type: 'METRICS_UPDATE',
                metrics: performanceResult,
                heap: heapResult
            })
        } catch {
            stopMonitoring()
        }
    }, 1000)
}

function stopMonitoring() {
    if (pollTimer !== null) {
        clearInterval(pollTimer)
        pollTimer = null
    }

    if (monitoredTabId !== null) {
        chrome.debugger.detach({ tabId: monitoredTabId }).catch(() => {})
        monitoredTabId = null
    }
}
