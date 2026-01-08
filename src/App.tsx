import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Dashboard from './components/Dashboard/Dashboard';
import SpeditionskostenRechner from './components/SpeditionskostenRechner';
import FixkostenRechner from './components/FixkostenRechner';
import VariableKostenRechner from './components/VariableKostenRechner';
import DispoPlanung from './components/DispoPlanung/DispoPlanung';
import Saisonplanung from './components/Saisonplanung/Saisonplanung';
import CallListePage from './pages/CallListePage';
import KreditorenVerwaltung from './components/KreditorenVerwaltung/KreditorenVerwaltung';
import KonkurrentenVerwaltung from './components/KonkurrentenKarte/KonkurrentenVerwaltung';
import VorschlaegeNeu from './components/Tickets/VorschlaegeNeu';
import Todos from './components/Todos/Todos';
import Wiki from './components/Wiki/Wiki';
import KundenKarte from './pages/KundenKarte';
import Bestellabwicklung from './components/Bestellabwicklung/Bestellabwicklung';
import ProjektVerwaltung from './components/ProjektVerwaltung/ProjektVerwaltung';
import Stammdaten from './components/Stammdaten/Stammdaten';
import Anfragen from './components/Anfragen/Anfragen';
import Kalender from './components/Kalender/Kalender';
import ExcelImport from './components/ExcelImport/ExcelImport';
import Newsletter from './components/Newsletter/Newsletter';
import Unsubscribe from './pages/Unsubscribe';
import Qualitaetssicherung from './components/Qualitaetssicherung/Qualitaetssicherung';
import PrivatKreditorenAuswahl from './components/PrivatKreditoren/PrivatKreditorenAuswahl';
import Fahrkostenabrechnung from './components/Fahrkostenabrechnung/Fahrkostenabrechnung';
import LogistikpartnerVerwaltung from './components/LogistikpartnerVerwaltung/LogistikpartnerVerwaltung';
import EmailDashboard from './components/EmailDashboard/EmailDashboard';
import { setupAppwriteFields } from './utils/appwriteSetup';
import OfflineBanner from './components/OfflineBanner';

// Authentifizierte App-Inhalte
function AuthenticatedContent() {
  return (
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
          <Routes>
            {/* Startseite - immer zugänglich */}
            <Route path="/" element={<Home />} />

            {/* Geschützte Tool-Routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute toolId="dashboard">
                  <Dashboard />
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
              <Route path="/kreditoren" element={
                <ProtectedRoute toolId="kreditoren">
                  <KreditorenVerwaltung />
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
              <Route path="/bestellabwicklung/:projektId" element={
                <ProtectedRoute toolId="projekt-verwaltung">
                  <Bestellabwicklung />
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

              {/* Legacy route redirect - auch geschützt */}
              <Route path="/ziegelmehl" element={
                <ProtectedRoute toolId="speditionskosten">
                  <SpeditionskostenRechner />
                </ProtectedRoute>
              } />
            </Routes>
          </Layout>
        } />
      </Routes>
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
          <Routes>
            {/* ÖFFENTLICHE Route für Newsletter-Abmeldung (ohne Login!) */}
            <Route path="/abmelden/:token" element={<Unsubscribe />} />

            {/* Alle anderen Routes benötigen Authentifizierung */}
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

