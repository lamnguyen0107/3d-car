import { defineConfig } from 'vite';

const isGitHubPagesBuild = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  base: isGitHubPagesBuild ? '/3d-car/' : '/',
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
