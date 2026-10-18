import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Public base path. Local dev, preview, and Portals serve from `/`; the GitHub Pages workflow
  // sets BASE_PATH to the repository subpath (`/3d-logo/`).
  base: process.env.BASE_PATH || '/',
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
