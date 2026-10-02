import { useEffect, useRef, useState } from 'react'
import s from './Panel.module.css'

type DeviceInfo = {
    architecture: string | null
    cores: number | null
}

type RawMetric = {
    name: string
    value: number
}

type MetricsUpdateMessage = {
    type: 'METRICS_UPDATE'
    metrics: { metrics: RawMetric[] }
    heap: { usedSize: number; totalSize: number }
}

type PageMetricsUpdateMessage = {
    type: 'PAGE_METRICS_UPDATE'
    fps?: number
    longTasksLast10s?: number
}

type MonitoringStateMessage = {
    type: 'MONITORING_STATE'
    ok: boolean
    isMonitoring: boolean
    error?: string
}

type PanelMessage = MetricsUpdateMessage | PageMetricsUpdateMessage | MonitoringStateMessage

export function Panel() {
    const [device, setDevice] = useState<DeviceInfo | null>(null)
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [cpuPercent, setCpuPercent] = useState<number | null>(null)
    const [heapMb, setHeapMb] = useState<number | null>(null)
    const [fps, setFps] = useState<number | null>(null)
    const [longTasks, setLongTasks] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const portRef = useRef<chrome.runtime.Port | null>(null)
    const prevTaskDuration = useRef<number | null>(null)
    const prevTimestamp = useRef<number | null>(null)

    const theme = chrome.devtools.panels.themeName === 'dark' ? 'dark' : 'light'

    useEffect(() => {
        let mounted = true

        chrome.runtime
            .getPlatformInfo()
            .then(({ arch }) => {
                if (!mounted) return

                setDevice({
                    architecture: arch,
                    cores: navigator.hardwareConcurrency ?? null
                })
            })
            .catch(() => {
                if (!mounted) return

                setDevice({
                    architecture: null,
                    cores: navigator.hardwareConcurrency ?? null
                })
            })

        return () => {
            mounted = false
        }
    }, [])

    useEffect(() => {
        let mounted = true
        const port = chrome.runtime.connect({ name: 'mac-stats-panel' })

        portRef.current = port

        port.onMessage.addListener((message: PanelMessage) => {
            if (!mounted) return

            if (message.type === 'MONITORING_STATE') {
                setIsMonitoring(message.isMonitoring)
                setIsBusy(false)
                setError(message.ok ? null : (message.error ?? 'Не удалось подключиться к вкладке'))

                if (!message.isMonitoring) {
                    setCpuPercent(null)
                    setHeapMb(null)
                    setFps(null)
                    setLongTasks(null)
                    prevTaskDuration.current = null
                    prevTimestamp.current = null
                }

                return
            }

            if (message.type === 'METRICS_UPDATE') {
                const taskDuration = message.metrics.metrics.find((metric) => metric.name === 'TaskDuration')

                if (taskDuration) {
                    const now = performance.now()
                    const durationDelta =
                        prevTaskDuration.current === null ? null : taskDuration.value - prevTaskDuration.current
                    const timeDeltaSeconds =
                        prevTimestamp.current === null ? null : (now - prevTimestamp.current) / 1000

                    if (
                        durationDelta !== null &&
                        timeDeltaSeconds !== null &&
                        durationDelta >= 0 &&
                        timeDeltaSeconds > 0
                    ) {
                        const percent = Math.min(100, Math.round((durationDelta / timeDeltaSeconds) * 100))

                        setCpuPercent(percent)
                    }

                    prevTaskDuration.current = taskDuration.value
                    prevTimestamp.current = now
                }

                setHeapMb(Math.round((message.heap.usedSize / 1024 / 1024) * 10) / 10)
                return
            }

            if (message.type === 'PAGE_METRICS_UPDATE') {
                if (message.fps !== undefined) setFps(message.fps)
                if (message.longTasksLast10s !== undefined) {
                    setLongTasks(message.longTasksLast10s)
                }
            }
        })

        port.onDisconnect.addListener(() => {
            if (portRef.current === port) {
                portRef.current = null
            }

            if (!mounted) return

            setIsMonitoring(false)
            setIsBusy(false)
            setError('Соединение с фоновым процессом потеряно')
        })

        return () => {
            mounted = false

            if (portRef.current === port) {
                portRef.current = null
            }

            port.disconnect()
        }
    }, [])

    function handleToggleMonitoring() {
        const port = portRef.current

        if (!port || isBusy) return

        setError(null)
        setIsBusy(true)

        try {
            if (isMonitoring) {
                port.postMessage({ type: 'STOP_MONITORING' })
            } else {
                port.postMessage({
                    type: 'START_MONITORING',
                    tabId: chrome.devtools.inspectedWindow.tabId
                })
            }
        } catch (requestError) {
            setIsBusy(false)
            setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить команду мониторинга')
        }
    }

    const statusText = isBusy ? 'Подключение…' : isMonitoring ? 'Мониторинг активен' : 'Мониторинг остановлен'

    return (
        <main className={s.panel} data-theme={theme}>
            <header className={s.header}>
                <div>
                    <p className={s.eyebrow}>DEVTOOLS · PERFORMANCE</p>
                    <h1 className={s.title}>Mac Stats</h1>
                </div>
                <span className={`${s.status} ${isMonitoring ? s.statusActive : ''}`} role='status'>
                    <span className={s.statusDot} />
                    {statusText}
                </span>
            </header>

            <section className={s.section} aria-labelledby='device-heading'>
                <h2 className={s.sectionTitle} id='device-heading'>
                    Устройство
                </h2>

                <dl className={s.deviceList}>
                    <DeviceRow label='Платформа' value='macOS' />
                    <DeviceRow label='Архитектура' value={formatArchitecture(device?.architecture)} />
                    <DeviceRow label='Ядра CPU' value={device?.cores?.toString() ?? 'Определяю…'} />
                </dl>
            </section>

            <section className={s.section} aria-labelledby='metrics-heading'>
                <div className={s.sectionHeader}>
                    <h2 className={s.sectionTitle} id='metrics-heading'>
                        Метрики вкладки
                    </h2>
                    <span className={s.sectionHint}>Обновление каждую секунду</span>
                </div>

                <div className={s.metricGrid}>
                    <MetricCard label='FPS, оценка' value={formatMetric(fps)} />
                    <MetricCard label='Длинные задачи / 10 с' value={formatMetric(longTasks)} />
                    <MetricCard label='CPU' value={cpuPercent === null ? '—' : `${cpuPercent}%`} />
                    <MetricCard label='JS Heap' value={heapMb === null ? '—' : `${heapMb} MB`} />
                </div>

                {!isMonitoring && (
                    <p className={s.helperText}>Запустите мониторинг, чтобы собирать метрики этой вкладки.</p>
                )}
            </section>

            {error && (
                <p className={s.error} role='alert'>
                    {error}
                </p>
            )}

            <button
                className={`${s.button} ${isMonitoring ? s.buttonStop : ''}`}
                type='button'
                onClick={handleToggleMonitoring}
                disabled={isBusy}
            >
                {isBusy ? 'Подключение…' : isMonitoring ? 'Остановить мониторинг' : 'Начать мониторинг'}
            </button>

            <p className={s.footer}>Данные остаются в браузере</p>
        </main>
    )
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className={s.metricCard}>
            <span className={s.metricValue}>{value}</span>
            <span className={s.metricLabel}>{label}</span>
        </div>
    )
}

function DeviceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className={s.deviceRow}>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    )
}

function formatMetric(value: number | null) {
    return value === null ? '—' : String(value)
}

function formatArchitecture(architecture: string | null | undefined) {
    if (!architecture) return 'Неизвестно'
    if (architecture === 'arm' || architecture === 'arm64') return 'Apple Silicon'
    if (architecture.startsWith('x86')) return 'Intel'

    return architecture
}
