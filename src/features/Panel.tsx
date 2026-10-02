import { useEffect, useRef, useState } from 'react'
import styles from './Panel.module.css'

type DeviceInfo = {
    architecture: string | null
    platform: string | null
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
            .then(({ os, arch }) => {
                if (!mounted) return

                setDevice({
                    platform: os,
                    architecture: arch,
                    cores: navigator.hardwareConcurrency ?? null
                })
            })
            .catch(() => {
                if (!mounted) return

                setDevice({
                    platform: null,
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
                    resetMetrics()
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

    function resetMetrics() {
        setCpuPercent(null)
        setHeapMb(null)
        setFps(null)
        setLongTasks(null)
        prevTaskDuration.current = null
        prevTimestamp.current = null
    }

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
        <main className={styles.panel} data-theme={theme}>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>DEVTOOLS · PERFORMANCE</p>
                    <h1 className={styles.title}>Mac Stats</h1>
                </div>
                <span className={`${styles.status} ${isMonitoring ? styles.statusActive : ''}`} role='status'>
                    <span className={styles.statusDot} />
                    {statusText}
                </span>
            </header>

            <section className={styles.section} aria-labelledby='device-heading'>
                <h2 className={styles.sectionTitle} id='device-heading'>
                    Устройство
                </h2>

                <dl className={styles.deviceList}>
                    <DeviceRow label='Платформа' value={formatPlatform(device?.platform)} />
                    <DeviceRow label='Архитектура' value={formatArchitecture(device)} />
                    <DeviceRow label='Ядра CPU' value={device?.cores?.toString() ?? 'Определяю…'} />
                </dl>
            </section>

            <section className={styles.section} aria-labelledby='metrics-heading'>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} id='metrics-heading'>
                        Метрики вкладки
                    </h2>
                    <span className={styles.sectionHint}>Обновление каждую секунду</span>
                </div>

                <div className={styles.metricGrid}>
                    <MetricCard label='FPS, оценка' value={formatMetric(fps)} />
                    <MetricCard label='Длинные задачи / 10 с' value={formatMetric(longTasks)} />
                    <MetricCard label='CPU' value={cpuPercent === null ? '—' : `${cpuPercent}%`} />
                    <MetricCard label='JS Heap' value={heapMb === null ? '—' : `${heapMb} MB`} />
                </div>

                {!isMonitoring && (
                    <p className={styles.helperText}>Запустите мониторинг, чтобы собирать метрики этой вкладки.</p>
                )}
            </section>

            {error && (
                <p className={styles.error} role='alert'>
                    {error}
                </p>
            )}

            <button
                className={`${styles.button} ${isMonitoring ? styles.buttonStop : ''}`}
                type='button'
                onClick={handleToggleMonitoring}
                disabled={isBusy}
            >
                {isBusy ? 'Подключение…' : isMonitoring ? 'Остановить мониторинг' : 'Начать мониторинг'}
            </button>

            <p className={styles.footer}>Данные остаются в браузере</p>
        </main>
    )
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.metricCard}>
            <span className={styles.metricValue}>{value}</span>
            <span className={styles.metricLabel}>{label}</span>
        </div>
    )
}

function DeviceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.deviceRow}>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    )
}

function formatMetric(value: number | null) {
    return value === null ? '—' : String(value)
}

function formatPlatform(platform: string | null | undefined) {
    if (!platform) return 'Неизвестно'

    const labels: Record<string, string> = {
        mac: 'macOS',
        win: 'Windows',
        linux: 'Linux',
        cros: 'ChromeOS',
        android: 'Android',
        openbsd: 'OpenBSD'
    }

    return labels[platform] ?? platform
}

function formatArchitecture(device: DeviceInfo | null) {
    if (!device?.architecture) return 'Неизвестно'

    const architecture = device.architecture.toLowerCase()

    if (device.platform === 'mac' && (architecture === 'arm' || architecture === 'arm64')) {
        return 'Apple Silicon'
    }

    const labels: Record<string, string> = {
        arm: 'ARM',
        arm64: 'ARM64',
        'x86-32': 'x86 32-bit',
        'x86-64': 'x86 64-bit',
        x86: 'x86'
    }

    return labels[architecture] ?? device.architecture
}
