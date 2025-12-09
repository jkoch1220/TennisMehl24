import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
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
import Vorschlaege from './components/Tickets/Vorschlaege';
import Todos from './components/Todos/Todos';
import Wiki from './components/Wiki/Wiki';
import KundenKarte from './pages/KundenKarte';
import KundenListe from './components/KundenListe/KundenListe';
import Bestellabwicklung from './components/Bestellabwicklung/Bestellabwicklung';
import ProjektVerwaltung from './components/ProjektVerwaltung/ProjektVerwaltung';
import Stammdaten from './components/Stammdaten/Stammdaten';
import { isAuthenticated } from './utils/auth';
import { setupAppwriteFields } from './utils/appwriteSetup';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Prüfe beim Start, ob bereits eine Session existiert
    const checkAuth = () => {
      const auth = isAuthenticated();
      setAuthenticated(auth);
      setLoading(false);
    };

    checkAuth();
    
    // Appwrite Auto-Setup (läuft einmal pro Tab, wenn API Key verfügbar)
    if (import.meta.env.VITE_APPWRITE_API_KEY && typeof window !== 'undefined' && !sessionStorage.getItem('appwrite_setup_run')) {
      sessionStorage.setItem('appwrite_setup_run', 'true');
      setupAppwriteFields().catch(console.error);
    }
  }, []);

  const handleLogin = () => {
    setAuthenticated(true);
  };

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

  if (!authenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <Routes>
        {/* Fullscreen Route ohne Layout */}
        <Route path="/call-liste" element={<CallListePage />} />
        
        {/* Normale Routes mit Layout */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/speditionskosten" element={<SpeditionskostenRechner />} />
              <Route path="/fixkosten" element={<FixkostenRechner />} />
              <Route path="/variable-kosten" element={<VariableKostenRechner />} />
              <Route path="/dispo-planung" element={<DispoPlanung />} />
              <Route path="/saisonplanung" element={<Saisonplanung />} />
              <Route path="/kreditoren" element={<KreditorenVerwaltung />} />
              <Route path="/konkurrenten" element={<KonkurrentenVerwaltung />} />
              <Route path="/kunden-karte" element={<KundenKarte />} />
              <Route path="/kunden-liste" element={<KundenListe />} />
              {/* Bestellabwicklung nur noch über Projekte zugänglich */}
              <Route path="/bestellabwicklung" element={<Bestellabwicklung />} />
              <Route path="/projekt-verwaltung" element={<ProjektVerwaltung />} />
              <Route path="/vorschlaege" element={<Vorschlaege />} />
              <Route path="/todos" element={<Todos />} />
              <Route path="/wiki" element={<Wiki />} />
              <Route path="/stammdaten" element={<Stammdaten />} />
              {/* Legacy route redirect */}
              <Route path="/ziegelmehl" element={<SpeditionskostenRechner />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}

export default App;

