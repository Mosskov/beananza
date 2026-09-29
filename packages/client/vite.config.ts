import { defineConfig } from 'vite';

export default defineConfig({
  // Not Vite's default 5173, so this repo does not collide with other local Vite projects.
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
  build: {
    target: 'es2022',
    // Phaser alone is well over the default 500 kB warning; the vendor chunk is expected.
    chunkSizeWarningLimit: 2000,
  },
});
