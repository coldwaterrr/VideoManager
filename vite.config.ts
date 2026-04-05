import path from 'node:path'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

// @ts-ignore - electron plugin types don't match
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        // 主进程入口
        entry: 'electron/main.ts',
        // 输出目录
        outDir: 'dist-electron',
        // 格式：ES 模块，但需要 __dirname polyfill
        format: 'es',
        nodeIntegration: true,
        contextIsolation: false,
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js'], // 将 sql.js 排除在构建之外
            },
          },
        },
      },
    ]),
    {
      name: 'copy-preload',
      closeBundle() {
        const outDir = path.resolve(__dirname, 'dist-electron');
        fs.mkdirSync(outDir, { recursive: true });
        const preloadContent = fs.readFileSync(path.resolve(__dirname, 'electron/preload.ts'), 'utf-8');
        fs.writeFileSync(path.resolve(outDir, 'preload.cjs'), preloadContent);
      },
    },
  ],
})
