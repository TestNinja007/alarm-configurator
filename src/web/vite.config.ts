import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    // Only used during front-end development; in Docker the API serves the
    // built SPA itself, so everything is same-origin.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
});
