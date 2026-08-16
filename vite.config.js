import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Served from its own subdomain, so assets live at the root. Set VITE_BASE
  // if this ever moves under a path on the main domain instead.
  base: process.env.VITE_BASE || '/',
  // Vite does not read PORT on its own, so an assigned port has to be wired in
  // explicitly. Falls back to the Vite default when PORT is unset.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      // The API is a Supabase Edge Function. `npm run dev:api` runs that exact
      // function locally on 8000 through Deno, so development and production
      // execute the same code rather than two implementations that agree by
      // hand. In production VITE_API_BASE points at the deployed function and
      // this proxy is not involved at all.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})