import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
      strictPort: true,
      proxy: {
        '/api': {
          // Defaults to locally-running backend on port 5000; set VITE_PROXY_TARGET
          // in .env.local to point to a remote server (e.g. Render) if desired.
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
        },
      },
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        clientPort: 3000,
      },
    },
  };
});
