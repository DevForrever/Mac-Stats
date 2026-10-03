import { useEffect, useRef, useState } from 'react'
import s from './App.module.css'

const inDevTools = typeof chrome !== 'undefined' && Boolean(chrome.devtools?.panels)
const isPanel = inDevTools && new URLSearchParams(location.search).has('panel')

type Stats = { fps: number | null; longTasks: number | null; cpu: number | null; heap: number | null }
type Message =
    | { type: 'MONITORING_STATE'; ok: boolean; isMonitoring: boolean; error?: string }
    | { type: 'METRICS_UPDATE'; metrics: { metrics: { name: string; value: number }[] }; heap: { usedSize: number } }
    | { type: 'PAGE_METRICS_UPDATE'; fps?: number; longTasks?: number }

export function App() {
    const [architecture, setArchitecture] = useState('Detecting…')
    const [stats, setStats] = useState<Stats>({ fps: null, longTasks: null, cpu: null, heap: null })
    const [monitoring, setMonitoring] = useState(false)
    const [busy, setBusy] = useState(true)
    const [error, setError] = useState('')
    const port = useRef<chrome.runtime.Port | null>(null)
    const panelCreated = useRef(false)
    const previous = useRef<{ task: number; time: number } | null>(null)
    const theme = inDevTools && chrome.devtools.panels.themeName === 'dark' ? 'dark' : 'light'

    useEffect(() => {
        if (!isPanel) return
        chrome.runtime.getPlatformInfo().then(({ arch }) => {
            setArchitecture(
                arch === 'arm' || arch === 'arm64' ? 'Apple Silicon' : arch.startsWith('x86') ? 'Intel' : arch
            )
        })
    }, [])

    useEffect(() => {
        if (!inDevTools) return
        if (!isPanel) {
            if (!panelCreated.current) {
                panelCreated.current = true
                chrome.devtools.panels.create('Mac Stats', '', 'index.html?panel=1')
            }
            return
        }

        const connection = chrome.runtime.connect({ name: 'mac-stats-panel' })
        let active = true
        port.current = connection
        setBusy(false)

        connection.onMessage.addListener((message: Message) => {
            if (!active) return

            if (message.type === 'MONITORING_STATE') {
                setMonitoring(message.isMonitoring)
                setBusy(false)
                setError(message.ok ? '' : (message.error ?? 'Could not connect to the tab'))
                if (!message.isMonitoring) {
                    previous.current = null
                    setStats({ fps: null, longTasks: null, cpu: null, heap: null })
                }
            } else if (message.type === 'METRICS_UPDATE') {
                const values = message.metrics.metrics
                const task = values.find((metric) => metric.name === 'TaskDuration')?.value
                const time = values.find((metric) => metric.name === 'Timestamp')?.value
                const last = previous.current
                const cpu =
                    task !== undefined && time !== undefined && last && task >= last.task && time > last.time
                        ? Math.min(100, Math.round(((task - last.task) / (time - last.time)) * 100))
                        : null

                if (task !== undefined && time !== undefined) previous.current = { task, time }

                setStats((stats) => ({
                    ...stats,
                    ...(cpu !== null ? { cpu } : {}),
                    heap: Math.round(message.heap.usedSize / 1024 / 1024)
                }))
            } else {
                setStats((stats) => ({
                    ...stats,
                    fps: message.fps ?? stats.fps,
                    longTasks: message.longTasks ?? stats.longTasks
                }))
            }
        })

        connection.onDisconnect.addListener(() => {
            if (!active) return
            port.current = null
            setMonitoring(false)
            setBusy(false)
            
        })

        return () => {
            active = false
            port.current = null
            connection.disconnect()
        }
    }, [])

    function toggleMonitoring() {
        if (!port.current || busy) return
        setError('')
        setBusy(true)
        try {
            port.current.postMessage(
                monitoring
                    ? { type: 'STOP_MONITORING' }
                    : { type: 'START_MONITORING', tabId: chrome.devtools.inspectedWindow.tabId }
            )
        } catch {
            setBusy(false)
            setError('Could not send the monitoring command')
        }
    }

    if (!isPanel) {
        return (
            <main className={s.panel} data-theme={theme}>
                {inDevTools ? 'Opening Mac Stats panel…' : 'Open Mac Stats from Chrome DevTools.'}
            </main>
        )
    }

    return (
        <main className={s.panel} data-theme={theme}>
            <header className={s.header}>
                <h1 className={s.title}>Mac Stats</h1>
                <div className={s.headerActions}>
                    <span className={`${s.status} ${monitoring ? s.statusActive : ''}`} role='status'>
                        <span className={s.statusDot} />
                        {busy ? 'Connecting…' : monitoring ? 'Monitoring active' : 'Monitoring stopped'}
                    </span>
                    <button
                        className={`${s.button} ${monitoring ? s.buttonActive : ''}`}
                        type='button'
                        onClick={toggleMonitoring}
                        disabled={busy}
                    >
                        {monitoring ? 'Stop monitoring' : 'Start monitoring'}
                    </button>
                </div>
            </header>

            <section className={s.section} aria-labelledby='device-heading'>
                <h2 className={s.sectionTitle} id='device-heading'>
                    Device
                </h2>
                <dl className={s.deviceList}>
                    <DeviceRow label='Platform' value='macOS' />
                    <DeviceRow label='Architecture' value={architecture} />
                    <DeviceRow label='CPU cores' value={navigator.hardwareConcurrency?.toString() ?? '—'} />
                </dl>
            </section>

            <section className={s.section} aria-labelledby='metrics-heading'>
                <h2 className={s.sectionTitle} id='metrics-heading'>
                    Tab metrics
                </h2>
                <div className={s.metricGrid}>
                    <MetricCard
                        label='Long Tasks (10s)'
                        value={stats.longTasks === null ? '—' : String(stats.longTasks)}
                    />
                    <MetricCard label='CPU' value={stats.cpu === null ? '—' : `${stats.cpu}%`} />
                    <MetricCard label='JS Heap' value={stats.heap === null ? '—' : `${stats.heap} MB`} />
                    <MetricCard label='FPS' value={stats.fps === null ? '—' : String(stats.fps)} />
                </div>
            </section>

            {error && (
                <p className={s.error} role='alert'>
                    {error}
                </p>
            )}
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
