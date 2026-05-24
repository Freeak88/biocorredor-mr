import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React + framework
            'vendor': ['react', 'react-dom'],
            // Heavy libraries
            'leaflet': ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],
            'motion': ['motion/react'],
            'pocketbase': ['pocketbase'],
            'lucide': ['lucide-react'],
          },
        },
      },
      // Optimize chunk loading
      chunkSizeWarningLimit: 500,
      sourcemap: false,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
