import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Preview builds (branch "preview", or SKILLTRACK_DEMO=1) run on in-memory sample data:
// the data layer and Clerk are swapped for demo versions, so nothing touches the real database.
const demo = process.env.SKILLTRACK_DEMO === '1' || process.env.VERCEL_GIT_COMMIT_REF === 'preview'
const src = path.resolve(__dirname, 'src')

function demoSwap() {
  return {
    name: 'skilltrack-demo',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source === '@clerk/react') return path.join(src, 'demo/clerk.jsx')
      if (importer && !importer.includes('/src/demo/') && /(^|\/)data(\.js)?$/.test(source)) {
        const r = await this.resolve(source, importer, { ...options, skipSelf: true })
        if (r && r.id === path.join(src, 'lib/data.js')) return path.join(src, 'demo/data.js')
      }
      return null
    },
  }
}

export default defineConfig({
  base: demo ? './' : '/',
  plugins: [...(demo ? [demoSwap()] : []), react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] } },
    },
  },
})
