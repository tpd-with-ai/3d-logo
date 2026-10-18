import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
