import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/' para dev y para hosts en raíz (Vercel/Netlify/Railway).
// Si lo servís en GitHub Pages bajo user.github.io/nombre-repo/,
// seteá la env var VITE_BASE_PATH="/nombre-repo/" en el build de CI,
// o cambiá el valor de fallback de abajo directamente.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
