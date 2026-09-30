import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/render': {
          target: 'https://ansovang.onrender.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/render/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          controller: path.resolve(__dirname, 'Controller.html'),
          host: path.resolve(__dirname, 'Host.html'),
          player1: path.resolve(__dirname, 'Player1.html'),
          player2: path.resolve(__dirname, 'Player2.html'),
          player3: path.resolve(__dirname, 'Player3.html'),
          player4: path.resolve(__dirname, 'Player4.html'),
          viewer: path.resolve(__dirname, 'Viewer.html'),
        },
      },
    },
  };
});
