import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the bundle works on any Amplify domain or custom domain.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    // The LCC SDK is a ~1.3 MB prebuilt bundle; silence the size warning and
    // split heavy vendors into cacheable chunks.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          'lcc-sdk': ['./src/vendor/lcc/lcc-0.6.0.js'],
        },
      },
    },
  },
  optimizeDeps: {
    // The SDK ships pre-bundled; keep esbuild from re-scanning it in dev.
    exclude: [],
  },
});
