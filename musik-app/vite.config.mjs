import { defineConfig } from 'vite'
import { resolve } from 'path'
import RubyPlugin from 'vite-plugin-ruby'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    RubyPlugin(),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'app/javascript') },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
  },
})
