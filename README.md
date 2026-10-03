# Mac Stats

Расширение Chrome DevTools для просмотра метрик открытой вкладки:

- FPS
- Long Tasks за последние 10 секунд
- CPU вкладки и JS Heap

## Запуск

```bash
bun install
bun run build
```

Загрузите `dist` через **Load unpacked** на странице `chrome://extensions`, затем откройте панель **Mac Stats** в DevTools.

CPU — оценка времени задач вкладки, FPS — частота `requestAnimationFrame`.
