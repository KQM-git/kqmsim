import react from '@vitejs/plugin-react-swc';
import * as path from 'path';
import {defineConfig} from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://sim.kqm.gg',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: [{find: '@', replacement: path.resolve(__dirname, 'src')}],
  },
});
