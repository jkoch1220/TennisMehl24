import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
import Home from './pages/Home';
import ZiegelmehlRechner from './components/ZiegelmehlRechner';
import FixkostenRechner from './components/FixkostenRechner';
import VariableKostenRechner from './components/VariableKostenRechner';
import { isAuthenticated } from './utils/auth';

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
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ziegelmehl" element={<ZiegelmehlRechner />} />
          <Route path="/fixkosten" element={<FixkostenRechner />} />
          <Route path="/variable-kosten" element={<VariableKostenRechner />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

