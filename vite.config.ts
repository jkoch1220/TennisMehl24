import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vendor-Chunking für besseres Caching und paralleles Laden
        manualChunks: {
          // React Core - wird von allen Komponenten gebraucht
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI Libraries
          'vendor-ui': ['lucide-react', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // Charts - nur von wenigen Komponenten gebraucht
          'vendor-charts': ['recharts'],
          // Maps - Leaflet + Google Maps
          'vendor-maps': ['leaflet', 'react-leaflet', '@react-google-maps/api'],
          // PDF Generation
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          // Excel Import/Export
          'vendor-excel': ['exceljs'],
          // Appwrite SDK
          'vendor-appwrite': ['appwrite'],
          // Date utilities
          'vendor-date': ['date-fns'],
        }
      }
    },
    // Warnung bei großen Chunks (default ist 500kB)
    chunkSizeWarningLimit: 600,
  },
})

