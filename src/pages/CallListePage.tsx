import { useNavigate } from 'react-router-dom';
import CallListeV2 from '../components/Saisonplanung/CallListeV2';

const CallListePage = () => {
  const navigate = useNavigate();
  const saisonjahr = 2026; // Aktuelle Saison

  return (
    <CallListeV2
      saisonjahr={saisonjahr}
      onClose={() => navigate('/saisonplanung')}
    />
  );
};

export default CallListePage;
