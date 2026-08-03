import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    // TonConnect/@ton/core используют Node-глобалы (Buffer, process) которых
    // нет в браузере — без этого плагина приложение падает с "Buffer is not
    // defined" сразу при загрузке скрипта, ещё до рендера React (поэтому
    // экран остаётся полностью пустым, даже ErrorBoundary не успевает сработать).
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    react(),
  ],
  server: {
    host: true, // чтобы Telegram-девтулзы могли открыть dev-сервер по локальной сети
    port: 5173,
  },
  preview: {
    host: true,
    // Railway (и подобные PaaS) отдают приложение через собственный прокси-домен
    // (*.up.railway.app), которого vite preview по умолчанию не знает и блокирует
    // запрос ("Blocked request. This host is not allowed"). allowedHosts: true
    // снимает эту проверку — сам Railway уже терминирует TLS и проксирует трафик,
    // так что дополнительная защита на уровне vite здесь не нужна.
    allowedHosts: true,
  },
});
