import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import { setupAppwriteFields } from './utils/appwriteSetup';
import OfflineBanner from './components/OfflineBanner';

// === LAZY LOADED KOMPONENTEN ===
// Diese werden erst geladen wenn sie gebraucht werden (Code-Splitting)

// Dashboard & Rechner
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const SpeditionskostenRechner = lazy(() => import('./components/SpeditionskostenRechner'));
const RabenRechner = lazy(() => import('./components/RabenRechner'));
const FixkostenRechner = lazy(() => import('./components/FixkostenRechner'));
const VariableKostenRechner = lazy(() => import('./components/VariableKostenRechner'));

// Planung & Verwaltung (schwere Komponenten)
const DispoPlanung = lazy(() => import('./components/DispoPlanung/DispoPlanung'));
const Saisonplanung = lazy(() => import('./components/Saisonplanung/Saisonplanung'));
const CallListePage = lazy(() => import('./pages/CallListePage'));
const PlatzbauerverwaltungPage = lazy(() => import('./components/PlatzbauerverwaltungPage/PlatzbauerverwaltungPage'));
const PlatzbauerProjektabwicklung = lazy(() => import('./components/PlatzbauerverwaltungPage/PlatzbauerProjektabwicklung'));

// Kreditoren & Debitoren
const KreditorenVerwaltung = lazy(() => import('./components/KreditorenVerwaltung/KreditorenVerwaltung'));
const DebitorenVerwaltung = lazy(() => import('./components/DebitorenVerwaltung/DebitorenVerwaltung'));

// Karten (Leaflet - schwere Dependency)
const KonkurrentenVerwaltung = lazy(() => import('./components/KonkurrentenKarte/KonkurrentenVerwaltung'));
const KundenKarte = lazy(() => import('./pages/KundenKarte'));

// Projekt-Module
const Projektabwicklung = lazy(() => import('./components/Projektabwicklung/Projektabwicklung'));
const ProjektVerwaltung = lazy(() => import('./components/ProjektVerwaltung/ProjektVerwaltung'));

// Stammdaten & Anfragen
const Stammdaten = lazy(() => import('./components/Stammdaten/Stammdaten'));
const Anfragen = lazy(() => import('./components/Anfragen/Anfragen'));

// Weitere Tools
const VorschlaegeNeu = lazy(() => import('./components/Tickets/VorschlaegeNeu'));
const Todos = lazy(() => import('./components/Todos/Todos'));
const Wiki = lazy(() => import('./components/Wiki/Wiki'));
const Kalender = lazy(() => import('./components/Kalender/Kalender'));
const ExcelImport = lazy(() => import('./components/ExcelImport/ExcelImport'));
const Newsletter = lazy(() => import('./components/Newsletter/Newsletter'));
const Qualitaetssicherung = lazy(() => import('./components/Qualitaetssicherung/Qualitaetssicherung'));
const PrivatKreditorenAuswahl = lazy(() => import('./components/PrivatKreditoren/PrivatKreditorenAuswahl'));
const Fahrkostenabrechnung = lazy(() => import('./components/Fahrkostenabrechnung/Fahrkostenabrechnung'));
const LogistikpartnerVerwaltung = lazy(() => import('./components/LogistikpartnerVerwaltung/LogistikpartnerVerwaltung'));
const EmailDashboard = lazy(() => import('./components/EmailDashboard/EmailDashboard'));
const Instandhaltung = lazy(() => import('./components/Instandhaltung/Instandhaltung'));
const Schichtplanung = lazy(() => import('./components/Schichtplanung/Schichtplanung'));
const ProduktionsTracker = lazy(() => import('./components/ProduktionsTracker/ProduktionsTracker'));

// Öffentliche Seiten
const PublicProduktion = lazy(() => import('./components/PublicProduktion/PublicProduktion'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));

// Loading-Komponente für Suspense
const PageLoader = () => (
  <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface flex items-center justify-center transition-colors duration-300">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 dark:border-dark-accent mx-auto"></div>
      <p className="mt-4 text-gray-600 dark:text-dark-textMuted transition-colors duration-300">Lade Modul...</p>
    </div>
  </div>
);

// Authentifizierte App-Inhalte
function AuthenticatedContent() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Fullscreen Route ohne Layout - auch geschützt */}
        <Route path="/call-liste" element={
          <ProtectedRoute toolId="saisonplanung">
            <CallListePage />
          </ProtectedRoute>
        } />

        {/* Normale Routes mit Layout */}
        <Route path="/*" element={
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Startseite - immer zugänglich */}
                <Route path="/" element={<Home />} />

                {/* Geschützte Tool-Routes */}
                  <Route path="/dashboard" element={
                    <ProtectedRoute toolId="dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/raben-rechner" element={
                    <ProtectedRoute toolId="raben-rechner">
                      <RabenRechner />
                    </ProtectedRoute>
                  } />
                  <Route path="/speditionskosten" element={
                    <ProtectedRoute toolId="speditionskosten">
                      <SpeditionskostenRechner />
                    </ProtectedRoute>
                  } />
                  <Route path="/fixkosten" element={
                    <ProtectedRoute toolId="fixkosten">
                      <FixkostenRechner />
                    </ProtectedRoute>
                  } />
                  <Route path="/variable-kosten" element={
                    <ProtectedRoute toolId="variable-kosten">
                      <VariableKostenRechner />
                    </ProtectedRoute>
                  } />
                  <Route path="/dispo-planung" element={
                    <ProtectedRoute toolId="dispo-planung">
                      <DispoPlanung />
                    </ProtectedRoute>
                  } />
                  <Route path="/saisonplanung" element={
                    <ProtectedRoute toolId="saisonplanung">
                      <Saisonplanung />
                    </ProtectedRoute>
                  } />
                  <Route path="/platzbauer-verwaltung" element={
                    <ProtectedRoute toolId="platzbauer-verwaltung">
                      <PlatzbauerverwaltungPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/platzbauer-projektabwicklung/:projektId" element={
                    <ProtectedRoute toolId="platzbauer-verwaltung">
                      <PlatzbauerProjektabwicklung />
                    </ProtectedRoute>
                  } />
                  <Route path="/kreditoren" element={
                    <ProtectedRoute toolId="kreditoren">
                      <KreditorenVerwaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/debitoren" element={
                    <ProtectedRoute toolId="debitoren">
                      <DebitorenVerwaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/konkurrenten" element={
                    <ProtectedRoute toolId="konkurrenten">
                      <KonkurrentenVerwaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/kunden-karte" element={
                    <ProtectedRoute toolId="kunden-karte">
                      <KundenKarte />
                    </ProtectedRoute>
                  } />
                  <Route path="/projektabwicklung/:projektId" element={
                    <ProtectedRoute toolId="projekt-verwaltung">
                      <Projektabwicklung />
                    </ProtectedRoute>
                  } />
                  <Route path="/projekt-verwaltung" element={
                    <ProtectedRoute toolId="projekt-verwaltung">
                      <ProjektVerwaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/vorschlaege" element={
                    <ProtectedRoute toolId="vorschlaege">
                      <VorschlaegeNeu />
                    </ProtectedRoute>
                  } />
                  <Route path="/todos" element={
                    <ProtectedRoute toolId="todos">
                      <Todos />
                    </ProtectedRoute>
                  } />
                  <Route path="/wiki" element={
                    <ProtectedRoute toolId="wiki">
                      <Wiki />
                    </ProtectedRoute>
                  } />
                  <Route path="/stammdaten" element={
                    <ProtectedRoute toolId="stammdaten">
                      <Stammdaten />
                    </ProtectedRoute>
                  } />
                  <Route path="/anfragen" element={
                    <ProtectedRoute toolId="anfragen">
                      <Anfragen />
                    </ProtectedRoute>
                  } />
                  <Route path="/kalender" element={
                    <ProtectedRoute toolId="kalender">
                      <Kalender />
                    </ProtectedRoute>
                  } />
                  <Route path="/excel-import" element={
                    <ProtectedRoute toolId="excel-import">
                      <ExcelImport />
                    </ProtectedRoute>
                  } />
                  <Route path="/newsletter" element={
                    <ProtectedRoute toolId="newsletter">
                      <Newsletter />
                    </ProtectedRoute>
                  } />
                  <Route path="/qualitaetssicherung" element={
                    <ProtectedRoute toolId="qualitaetssicherung">
                      <Qualitaetssicherung />
                    </ProtectedRoute>
                  } />
                  <Route path="/privat-kreditoren" element={
                    <ProtectedRoute toolId="privat-kreditoren">
                      <PrivatKreditorenAuswahl />
                    </ProtectedRoute>
                  } />
                  <Route path="/fahrtkosten" element={
                    <ProtectedRoute toolId="fahrtkosten">
                      <Fahrkostenabrechnung />
                    </ProtectedRoute>
                  } />
                  <Route path="/logistikpartner" element={
                    <ProtectedRoute toolId="logistikpartner">
                      <LogistikpartnerVerwaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/email-dashboard" element={
                    <ProtectedRoute toolId="email-dashboard">
                      <EmailDashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/instandhaltung" element={
                    <ProtectedRoute toolId="instandhaltung">
                      <Instandhaltung />
                    </ProtectedRoute>
                  } />
                  <Route path="/schichtplanung" element={
                    <ProtectedRoute toolId="schichtplanung">
                      <Schichtplanung />
                    </ProtectedRoute>
                  } />
                  <Route path="/produktion" element={
                    <ProtectedRoute toolId="produktion">
                      <ProduktionsTracker />
                    </ProtectedRoute>
                  } />

                  {/* Legacy route redirect - auch geschützt */}
                  <Route path="/ziegelmehl" element={
                    <ProtectedRoute toolId="speditionskosten">
                      <SpeditionskostenRechner />
                    </ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
            </Layout>
          } />
        </Routes>
      </Suspense>
  );
}

// App Content Komponente (braucht Auth Context)
function AppContent() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Appwrite Auto-Setup (läuft einmal pro Tab, wenn API Key verfügbar)
    if (import.meta.env.VITE_APPWRITE_API_KEY && typeof window !== 'undefined' && !sessionStorage.getItem('appwrite_setup_run')) {
      sessionStorage.setItem('appwrite_setup_run', 'true');
      setupAppwriteFields().catch(console.error);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface flex items-center justify-center transition-colors duration-300">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 dark:border-dark-accent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-dark-textMuted transition-colors duration-300">Lade...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AuthenticatedContent />;
}

// Main App mit Theme und Auth Provider
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineBanner />
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ÖFFENTLICHE Route für Newsletter-Abmeldung (ohne Login!) */}
              <Route path="/abmelden/:token" element={<Unsubscribe />} />

              {/* ÖFFENTLICHE Route für Produktions-Erfassung (mit einfachem Passwort) */}
              <Route path="/produktion-erfassen" element={<PublicProduktion />} />

              {/* Alle anderen Routes benötigen Authentifizierung */}
              <Route path="/*" element={<AppContent />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
