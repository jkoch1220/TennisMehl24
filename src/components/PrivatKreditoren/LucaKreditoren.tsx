import { PrivatKreditorProvider } from '../../contexts/PrivatKreditorContext';
import PrivatKreditorenVerwaltung from './PrivatKreditorenVerwaltung';

const LucaKreditoren = () => {
  return (
    <PrivatKreditorProvider owner="luca">
      <PrivatKreditorenVerwaltung />
    </PrivatKreditorProvider>
  );
};

export default LucaKreditoren;
