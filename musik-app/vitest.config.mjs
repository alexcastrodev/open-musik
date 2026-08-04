import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'app/javascript') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['spec/javascript/**/*.spec.{js,jsx,ts,tsx}'],
    setupFiles: ['./spec/javascript/support/setup.js'],
  },
})
