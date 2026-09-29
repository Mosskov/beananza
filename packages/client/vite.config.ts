import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    // Phaser alone is well over the default 500 kB warning; the vendor chunk is expected.
    chunkSizeWarningLimit: 2000,
  },
});
