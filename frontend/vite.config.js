import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      include: ['src/lib/commerce.js', 'src/lib/adminProducts.js', 'src/lib/cotizaciones.js', 'src/lib/quotePdf.js', 'src/data/catalog.js'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
})
