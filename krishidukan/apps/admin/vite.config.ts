import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5176 },
  resolve: {
    alias: {
      '@krishidukan/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
