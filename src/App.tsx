import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import { setupAppwriteFields } from './utils/appwriteSetup';

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
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
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
    </Router>
  );
}

// Main App mit AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

