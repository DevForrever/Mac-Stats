type PageMetricsCommand = {
    type: 'START_PAGE_METRICS' | 'STOP_PAGE_METRICS'
}

let isMonitoring = false
let frameCount = 0
let lastFpsReportTime = 0
let animationFrameId: number | null = null
let reportTimer: ReturnType<typeof setInterval> | null = null
let observer: PerformanceObserver | null = null

const recentLongTasks: number[] = []

function sendUpdate(payload: { fps?: number; longTasksLast10s?: number }) {
    if (!isMonitoring) return

    void chrome.runtime.sendMessage({ type: 'PAGE_METRICS_UPDATE', ...payload }).catch(() => {})
}

function frameTick() {
    if (!isMonitoring) return

    frameCount += 1

    const now = performance.now()
    const elapsed = now - lastFpsReportTime

    if (elapsed >= 1000) {
        const fpsEstimate = Math.round((frameCount / elapsed) * 1000)

        sendUpdate({ fps: fpsEstimate })

        frameCount = 0
        lastFpsReportTime = now
    }

    animationFrameId = requestAnimationFrame(frameTick)
}

function startPageMetrics() {
    if (isMonitoring) return

    isMonitoring = true
    frameCount = 0
    lastFpsReportTime = performance.now()
    recentLongTasks.length = 0

    animationFrameId = requestAnimationFrame(frameTick)

    try {
        observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                recentLongTasks.push(entry.startTime)
            }
        })

        observer.observe({ type: 'longtask', buffered: true })
    } catch {
        // Некоторые окружения не предоставляют Long Tasks API.
    }

    reportTimer = setInterval(() => {
        const now = performance.now()
        const windowMs = 10_000

        while (recentLongTasks.length > 0 && now - recentLongTasks[0] > windowMs) {
            recentLongTasks.shift()
        }

        sendUpdate({ longTasksLast10s: recentLongTasks.length })
    }, 1000)
}

function stopPageMetrics() {
    if (!isMonitoring) return

    isMonitoring = false

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
    }

    if (reportTimer !== null) {
        clearInterval(reportTimer)
        reportTimer = null
    }

    observer?.disconnect()
    observer = null
    recentLongTasks.length = 0
}

chrome.runtime.onMessage.addListener((message: PageMetricsCommand) => {
    if (message.type === 'START_PAGE_METRICS') {
        startPageMetrics()
    }

    if (message.type === 'STOP_PAGE_METRICS') {
        stopPageMetrics()
    }
})
