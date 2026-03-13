import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    // Raise warning threshold to 1000 KB so we don't see false alarms
    // after splitting (individual chunks are expected to be large for geo/chart libs)
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        /**
         * Manual chunk strategy — keeps the initial JS bundle tiny by isolating
         * heavy vendor libraries into their own async chunks. Each chunk is only
         * downloaded when the user first visits a page that needs it.
         *
         * Chunk groups:
         *  - react-core      : react + react-dom + react-router  (always needed)
         *  - ui-components   : radix-ui + shadcn glue            (always needed)
         *  - charts          : echarts + recharts                 (chart pages)
         *  - geo             : deck.gl + maplibre-gl + react-map-gl (geo page)
         *  - flow            : xyflow                             (visual ETL / DB diagram)
         *  - editor          : tiptap + react-quill               (stories / AI reports)
         *  - xlsx            : xlsx (file export pages)
         *  - query           : tanstack-query                     (always, but separate)
         */
        manualChunks(id: string) {
          // Let Vite handle React, Router, and standard UI libraries to prevent 
          // "createContext is undefined" ESM/CJS interop errors across chunks.

          // ── Charts (ECharts + Recharts) ─────────────────────────────────────
          if (
            id.includes("node_modules/echarts/") ||
            id.includes("node_modules/echarts-for-react/") ||
            id.includes("node_modules/zrender/") ||
            id.includes("node_modules/recharts/")
          ) {
            return "charts";
          }

          // ── Geo / Map (deck.gl + maplibre + react-map-gl) ──────────────────
          if (
            id.includes("node_modules/@deck.gl/") ||
            id.includes("node_modules/maplibre-gl/") ||
            id.includes("node_modules/react-map-gl/") ||
            id.includes("node_modules/@luma.gl/") ||
            id.includes("node_modules/@loaders.gl/") ||
            id.includes("node_modules/@math.gl/")
          ) {
            return "geo";
          }

          // ── Flow / Diagram (xyflow / react-flow) ───────────────────────────
          if (id.includes("node_modules/@xyflow/")) {
            return "flow";
          }

          // ── Rich text editors (tiptap + react-quill) ───────────────────────
          if (
            id.includes("node_modules/@tiptap/") ||
            id.includes("node_modules/react-quill/") ||
            id.includes("node_modules/quill/")
          ) {
            return "editor";
          }

          // ── XLSX (spreadsheet export) ──────────────────────────────────────
          if (id.includes("node_modules/xlsx/")) {
            return "xlsx";
          }

          // Vite's default strategy is smart enough to share Framer Motion and Radix 
          // across modules without breaking context.
        },
      },
    },
  },
}));
