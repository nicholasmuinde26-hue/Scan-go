import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          // Defaults to the hosted Render API; set VITE_PROXY_TARGET=http://127.0.0.1:5000
          // in .env.local to proxy to a locally-running backend instead.
          target: env.VITE_PROXY_TARGET || 'https://scan-go-re1r.onrender.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
