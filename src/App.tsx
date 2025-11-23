import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ZiegelmehlRechner from './components/ZiegelmehlRechner';
import FixkostenRechner from './components/FixkostenRechner';
import VariableKostenRechner from './components/VariableKostenRechner';

function App() {
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

