Mac Stats
A Chrome DevTools extension that displays device information and metrics for the current tab.
Metrics

- Device: platform, architecture, and CPU core count.
- Long Tasks: number of long tasks in the last 10 seconds.
- CPU: estimated CPU usage of the tab.
- JS Heap: JavaScript memory currently in use.
- FPS: frame rate measured with requestAnimationFrame.

Run: 
1. bun install
2. bun run build
3. Open chrome://extensions, enable Developer mode, and select Load unpacked to load the dist folder. Then open DevTools on the tab you want to monitor, select Mac Stats, and click Start monitoring.
