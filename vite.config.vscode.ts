import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the React app as a single self-contained HTML file for use as a
// VS Code WebView. Output goes to extension/media/ so it's packaged with
// the extension. Using viteSingleFile avoids WebView CSP asset-path issues.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // Don't copy public/ assets (CNAME, vite.svg) into the WebView bundle
  publicDir: false,
  build: {
    outDir: 'extension/media',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
