import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), crx({ manifest })],
    build: {
        rollupOptions: {
            input: {
                panel: 'index.html'
            }
        }
    },
    server: {
        port: 5173,
        strictPort: true,
    }
})
