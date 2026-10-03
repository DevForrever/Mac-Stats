type PageMetricsCommand = { type: 'START_PAGE_METRICS' | 'STOP_PAGE_METRICS' }

let monitoring = false
let frames = 0
let lastReport = 0
let frameId: number | null = null
let observer: PerformanceObserver | null = null
let longTasks: number[] = []

function sendMetrics(fps: number, longTasks: number) {
    if (!monitoring) return
    chrome.runtime.sendMessage({ type: 'PAGE_METRICS_UPDATE', fps, longTasks }).catch(stopPageMetrics)
}

function frame() {
    if (!monitoring) return
    frames += 1

    const now = performance.now()
    if (now - lastReport >= 1000) {
        while (longTasks.length && now - longTasks[0] > 10_000) longTasks.shift()
        sendMetrics(Math.round((frames / (now - lastReport)) * 1000), longTasks.length)
        frames = 0
        lastReport = now
    }

    frameId = requestAnimationFrame(frame)
}

function startPageMetrics() {
    if (monitoring) return
    monitoring = true
    frames = 0
    longTasks = []
    lastReport = performance.now()

    try {
        observer = new PerformanceObserver((list) => {
            longTasks.push(...list.getEntries().map((entry) => entry.startTime))
        })
        observer.observe({ type: 'longtask', buffered: true })
    } catch {
        observer = null
    }

    frameId = requestAnimationFrame(frame)
}

function stopPageMetrics() {
    monitoring = false
    if (frameId !== null) cancelAnimationFrame(frameId)
    frameId = null
    observer?.disconnect()
    observer = null
    longTasks = []
}

chrome.runtime.onMessage.addListener((message: PageMetricsCommand) => {
    if (message.type === 'START_PAGE_METRICS') startPageMetrics()
    else stopPageMetrics()
})
