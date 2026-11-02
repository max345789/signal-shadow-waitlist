import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/]react(?:-dom)?[\\/]/, priority: 20 },
            { name: 'workflow-vendor', test: /node_modules[\\/](@xyflow|@phosphor-icons)[\\/]/, maxSize: 240_000, priority: 15 },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/, maxSize: 240_000, priority: 15 },
            { name: 'vendor', test: /node_modules[\\/]/, maxSize: 240_000, priority: 5 },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
})
