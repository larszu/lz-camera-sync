import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  base: './',
  // 4192: next free port after lz-presenter (4190) and 4191. strictPort so a
  // taken port aborts instead of silently moving on.
  server: { port: 4192, strictPort: true },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
