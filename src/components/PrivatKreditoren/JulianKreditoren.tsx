import { PrivatKreditorProvider } from '../../contexts/PrivatKreditorContext';
import PrivatKreditorenVerwaltung from './PrivatKreditorenVerwaltung';

const JulianKreditoren = () => {
  return (
    <PrivatKreditorProvider owner="julian">
      <PrivatKreditorenVerwaltung />
    </PrivatKreditorProvider>
  );
};

export default JulianKreditoren;
