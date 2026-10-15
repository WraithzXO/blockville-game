import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      // forward /api calls to the local backend scaffold during development
      '/api': 'http://localhost:8787',
      // presence socket rides the same origin in dev, so no port juggling
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
