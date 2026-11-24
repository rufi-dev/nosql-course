import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' + HashRouter => the built site works from any static host or sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
})
