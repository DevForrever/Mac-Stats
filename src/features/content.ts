let frameCount = 0
let lastFpsReportTime = performance.now()

function frameTick() {
    frameCount++
    const now = performance.now()
    const elapsed = now - lastFpsReportTime

    if (elapsed >= 1000) {
        const fps = Math.round((frameCount / elapsed) * 1000)
        sendUpdate({ fps })
        frameCount = 0
        lastFpsReportTime = now
    }
    requestAnimationFrame(frameTick)
}

requestAnimationFrame(frameTick)

const recentLongTasks: number[] = []

try {
    const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        for (let i = 0; i < entries.length; i++) {
            recentLongTasks.push(performance.now())
        }
    })
    observer.observe({ type: 'longtask', buffered: true })
} catch {}
setInterval(() => {
    const now = performance.now()
    const windowMs = 10_000
    while (recentLongTasks.length > 0 && now - recentLongTasks[0] > windowMs) {
        recentLongTasks.shift()
    }

    sendUpdate({ longTasksLast10s: recentLongTasks.length })
}, 1000)
function sendUpdate(payload: { fps?: number; longTasksLast10s?: number }) {
    try {
        chrome.runtime.sendMessage({ type: 'PAGE_METRICS_UPDATE', ...payload }).catch(() => {})
    } catch {}
}
