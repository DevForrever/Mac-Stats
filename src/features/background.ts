type PanelCommand = { type: 'START_MONITORING'; tabId: number } | { type: 'STOP_MONITORING' }

type PanelResponse = {
    type: 'MONITORING_STATE'
    ok: boolean
    isMonitoring: boolean
    error?: string
}

type RawMetric = {
    name: string
    value: number
}

type PerformanceMetricsResult = {
    metrics: RawMetric[]
}

type HeapUsage = {
    usedSize: number
    totalSize: number
}

type MetricsUpdateMessage = {
    type: 'METRICS_UPDATE'
    metrics: PerformanceMetricsResult
    heap: HeapUsage
}

function isPerformanceMetricsResult(value: object | undefined): value is PerformanceMetricsResult {
    if (!value || !('metrics' in value) || !Array.isArray(value.metrics)) {
        return false
    }

    return value.metrics.every(
        (metric: unknown) =>
            typeof metric === 'object' &&
            metric !== null &&
            'name' in metric &&
            typeof metric.name === 'string' &&
            'value' in metric &&
            typeof metric.value === 'number'
    )
}

function isHeapUsage(value: object | undefined): value is HeapUsage {
    return (
        value !== undefined &&
        'usedSize' in value &&
        typeof value.usedSize === 'number' &&
        'totalSize' in value &&
        typeof value.totalSize === 'number'
    )
}

type PageMetricsUpdateMessage = {
    type: 'PAGE_METRICS_UPDATE'
    fps?: number
    longTasksLast10s?: number
}

let monitoredTabId: number | null = null
let monitoringPort: chrome.runtime.Port | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPolling = false

function post(port: chrome.runtime.Port | null, message: unknown) {
    if (!port) return

    try {
        port.postMessage(message)
    } catch {}
}

async function sendPageCommand(tabId: number, type: 'START_PAGE_METRICS' | 'STOP_PAGE_METRICS') {
    try {
        await chrome.tabs.sendMessage(tabId, { type })
    } catch {}
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'mac-stats-panel') return

    port.onMessage.addListener((message: PanelCommand) => {
        if (message.type === 'START_MONITORING') {
            void startMonitoring(message.tabId, port)
                .then(() => {
                    post(port, {
                        type: 'MONITORING_STATE',
                        ok: true,
                        isMonitoring: true
                    } satisfies PanelResponse)
                })
                .catch((error: unknown) => {
                    post(port, {
                        type: 'MONITORING_STATE',
                        ok: false,
                        isMonitoring: false,
                        error: error instanceof Error ? error.message : String(error)
                    } satisfies PanelResponse)
                })

            return
        }

        if (message.type === 'STOP_MONITORING') {
            void stopMonitoring()
        }
    })

    port.onDisconnect.addListener(() => {
        if (monitoringPort === port) {
            void stopMonitoring()
        }
    })
})

async function startMonitoring(tabId: number, owner: chrome.runtime.Port) {
    if (monitoredTabId === tabId && monitoringPort === owner && pollTimer !== null) {
        return
    }

    await stopMonitoring()

    let attached = false

    try {
        await chrome.debugger.attach({ tabId }, '1.3')
        attached = true

        monitoredTabId = tabId
        monitoringPort = owner

        await chrome.debugger.sendCommand({ tabId }, 'Performance.enable')
        await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')

        await sendPageCommand(tabId, 'START_PAGE_METRICS')

        pollTimer = setInterval(() => {
            void pollMetrics()
        }, 1000)
    } catch (error) {
        if (attached) {
            await stopMonitoring()
        }

        throw error
    }
}

async function pollMetrics() {
    const tabId = monitoredTabId
    const owner = monitoringPort

    if (tabId === null || owner === null || isPolling) return

    isPolling = true

    try {
        const [performanceResult, heapResult] = await Promise.all([
            chrome.debugger.sendCommand({ tabId }, 'Performance.getMetrics'),
            chrome.debugger.sendCommand({ tabId }, 'Runtime.getHeapUsage')
        ])

        if (!isPerformanceMetricsResult(performanceResult) || !isHeapUsage(heapResult)) {
            throw new Error('Chrome returned metrics in an unexpected format')
        }
        if (monitoredTabId !== tabId || monitoringPort !== owner) return

        post(owner, {
            type: 'METRICS_UPDATE',
            metrics: performanceResult,
            heap: heapResult
        } satisfies MetricsUpdateMessage)
    } catch {
        await stopMonitoring('Connection to the tab was lost')
    } finally {
        isPolling = false
    }
}

async function stopMonitoring(error?: string) {
    const tabId = monitoredTabId
    const owner = monitoringPort

    if (pollTimer !== null) {
        clearInterval(pollTimer)
        pollTimer = null
    }

    monitoredTabId = null
    monitoringPort = null

    if (tabId !== null) {
        await sendPageCommand(tabId, 'STOP_PAGE_METRICS')

        try {
            await chrome.debugger.detach({ tabId })
        } catch {}
    }

    post(owner, {
        type: 'MONITORING_STATE',
        ok: error === undefined,
        isMonitoring: false,
        ...(error ? { error } : {})
    } satisfies PanelResponse)
}

chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId === undefined || source.tabId !== monitoredTabId) return

    const owner = monitoringPort

    if (pollTimer !== null) {
        clearInterval(pollTimer)
        pollTimer = null
    }

    monitoredTabId = null
    monitoringPort = null

    void sendPageCommand(source.tabId, 'STOP_PAGE_METRICS')

    post(owner, {
        type: 'MONITORING_STATE',
        ok: false,
        isMonitoring: false,
        error: 'Debugger detached from the tab'
    } satisfies PanelResponse)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === monitoredTabId && changeInfo.status === 'complete') {
        void sendPageCommand(tabId, 'START_PAGE_METRICS')
    }
})

function isPageMetricsUpdate(message: unknown): message is PageMetricsUpdateMessage {
    return (
        typeof message === 'object' && message !== null && 'type' in message && message.type === 'PAGE_METRICS_UPDATE'
    )
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isPageMetricsUpdate(message)) return
    if (sender.tab?.id !== monitoredTabId) return

    post(monitoringPort, message)
})
