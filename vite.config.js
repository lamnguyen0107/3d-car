import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          gsap: ['gsap']
        }
      }
    }
  },
  server: {
    host: true,
    port: 4173
  },
  preview: {
    host: true,
    port: 4173
  }
});
