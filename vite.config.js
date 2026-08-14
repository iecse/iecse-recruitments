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
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})