import { useEffect, useRef, useState } from 'react'

type DeviceInfo = {
    architecture: string | null
    platform: string | null
    cores: number | null
}
type RawMetric = { name: string; value: number }
type HeapUsage = { usedSize: number; totalSize: number }
type MetricsUpdateMessage = {
    type: 'METRICS_UPDATE'
    metrics: { metrics: RawMetric[] }
    heap: HeapUsage
}
type PageMetricsMessage = {
    type: 'PAGE_METRICS_UPDATE'
    fps?: number
    longTasksLast10s?: number
}
type InboundMessage = MetricsUpdateMessage | PageMetricsMessage

export function Panel() {
    const [device, setDevice] = useState<DeviceInfo | null>(null)
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [cpuPercent, setCpuPercent] = useState<number | null>(null)
    const [heapMb, setHeapMb] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [fps, setFps] = useState<number | null>(null)
    const [longTasks, setLongTasks] = useState<number | null>(null)
    const prevTaskDuration = useRef<number | null>(null)
    const prevTimestamp = useRef<number | null>(null)

    useEffect(() => {
        async function loadDeviceInfo() {
            const cores = navigator.hardwareConcurrency ?? null
            const data = (navigator as any).userAgentData

            if (!data) {
                setDevice({ architecture: null, platform: null, cores })
                return
            }

            const highEntropy = await data.getHighEntropyValues(['architecture', 'platform'])
            setDevice({
                architecture: highEntropy.architecture ?? null,
                platform: highEntropy.platform ?? null,
                cores
            })
        }

        loadDeviceInfo()
    }, [])

    useEffect(() => {
        function handleMessage(message: InboundMessage) {
            if (message.type === 'METRICS_UPDATE') {
                const raw = message.metrics.metrics
                const taskDurationMetric = raw.find((m) => m.name === 'TaskDuration')

                if (taskDurationMetric) {
                    const now = performance.now()
                    const currentDuration = taskDurationMetric.value

                    if (prevTaskDuration.current !== null && prevTimestamp.current !== null) {
                        const durationDelta = currentDuration - prevTaskDuration.current
                        const timeDeltaSeconds = (now - prevTimestamp.current) / 1000
                        const percent = Math.min(100, Math.round((durationDelta / timeDeltaSeconds) * 100))
                        setCpuPercent(percent)
                    }

                    prevTaskDuration.current = currentDuration
                    prevTimestamp.current = now
                }

                if (message.heap) {
                    const usedMb = message.heap.usedSize / 1024 / 1024
                    setHeapMb(Math.round(usedMb * 10) / 10)
                }
            }

            if (message.type === 'PAGE_METRICS_UPDATE') {
                if (message.fps !== undefined) setFps(message.fps)
                if (message.longTasksLast10s !== undefined) setLongTasks(message.longTasksLast10s)
            }
        }

        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [])

    async function handleToggleMonitoring() {
        setError(null)

        if (isMonitoring) {
            await chrome.runtime.sendMessage({ type: 'STOP_MONITORING' })
            setIsMonitoring(false)
            setCpuPercent(null)
            setHeapMb(null)
            prevTaskDuration.current = null
            prevTimestamp.current = null
            return
        }

        const tabId = chrome.devtools.inspectedWindow.tabId
        const response = await chrome.runtime.sendMessage({ type: 'START_MONITORING', tabId })

        if (response?.ok) {
            setIsMonitoring(true)
        } else {
            setError(response?.error ?? 'Не удалось подключиться к вкладке')
        }
    }

    return (
        <div>
            <div>
                {device === null ? (
                    <span>Определяю устройство…</span>
                ) : (
                    <>
                        <Row label='Платформа' value={device.platform ?? 'неизвестно'} />
                        <Row
                            label='Архитектура'
                            value={device.architecture === 'arm' ? 'Apple Silicon (arm64)' : 'Intel (x86_64)'}
                        />
                        <Row label='Ядра CPU' value={device.cores?.toString() ?? 'недоступно'} />
                    </>
                )}
            </div>
            <div>
                <MetricBlock label='FPS' value={fps === null ? '…' : `${fps}`} />
                <MetricBlock label='Long tasks / 10с' value={longTasks === null ? '…' : `${longTasks}`} />
            </div>
            <div>
                <button onClick={handleToggleMonitoring}>{isMonitoring ? 'Остановить' : 'Запустить'}</button>
                {error && <p>Ошибка: {error}</p>}

                {isMonitoring && (
                    <div>
                        <MetricBlock label='CPU' value={cpuPercent === null ? '…' : `${cpuPercent}%`} />
                        <MetricBlock label='JS Heap' value={heapMb === null ? '…' : `${heapMb} MB`} />
                    </div>
                )}
            </div>
        </div>
    )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div>{value}</div>
            <div>{label}</div>
        </div>
    )
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    )
}
