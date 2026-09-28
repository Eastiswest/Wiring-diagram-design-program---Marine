/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/, so the base path must match.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  test: {
    environment: 'node',
  },
});
