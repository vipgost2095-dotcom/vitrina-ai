import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // чтобы Telegram-девтулзы могли открыть dev-сервер по локальной сети
    port: 5173,
  },
});
