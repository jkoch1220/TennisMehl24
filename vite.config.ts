import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Ziel für den Netlify-Functions-Proxy.
  // Standard: Produktion. Für lokalen E-Mail-Test EMAIL_PROXY_TARGET=http://localhost:8888
  // in .env setzen und `npm run dev:full` starten (lokaler Mail-Server auf Port 8888).
  //
  // Die frühere Vorgabe zeigte auf tennismehl24-tools.netlify.app — diese Adresse
  // liefert inzwischen 404, wodurch im Dev-Betrieb JEDE Netlify-Function ins Leere
  // lief (E-Mail, Bestellung, Datenprüfung, Benutzerverwaltung). Die Live-Adresse
  // steht in VITE_PORTAL_PUBLIC_URL; sie wird hier als Vorgabe verwendet, damit
  // Proxy und Produktion nicht wieder auseinanderlaufen.
  const functionsTarget =
    env.EMAIL_PROXY_TARGET || env.VITE_PORTAL_PUBLIC_URL || 'https://tennismehl-portal.online'

  return {
  plugins: [react()],
  server: {
    // Port aus der Umgebung übernehmen, sonst Vite-Standard 5173.
    // Nötig, damit sich mehrere Dev-Server desselben Projekts parallel starten
    // lassen (z.B. zwei Arbeitssitzungen) — ohne das belegt der erste 5173 und
    // der zweite scheitert.
    port: Number(process.env.PORT) || 5173,
    // Proxy für Netlify Functions in Development
    // Vermeidet CORS-Probleme beim lokalen Entwickeln
    proxy: {
      '/.netlify/functions': {
        target: functionsTarget,
        changeOrigin: true,
        secure: true,
      }
    }
  },
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
  }
})

