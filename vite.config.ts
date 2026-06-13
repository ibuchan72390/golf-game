/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
