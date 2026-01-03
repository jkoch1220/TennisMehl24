import { createContext, useContext, ReactNode } from 'react';
import { createPrivatKreditorService } from '../services/privatKreditorService';
import { createPrivatAktivitaetService } from '../services/privatAktivitaetService';
import {
  PRIVAT_RECHNUNGEN_JULIAN_COLLECTION_ID,
  PRIVAT_KREDITOREN_JULIAN_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_JULIAN_COLLECTION_ID,
  PRIVAT_RECHNUNGEN_LUCA_COLLECTION_ID,
  PRIVAT_KREDITOREN_LUCA_COLLECTION_ID,
  PRIVAT_AKTIVITAETEN_LUCA_COLLECTION_ID,
} from '../config/appwrite';

// Service-Typen
type KreditorServiceType = ReturnType<typeof createPrivatKreditorService>;
type AktivitaetServiceType = ReturnType<typeof createPrivatAktivitaetService>;

interface PrivatKreditorContextType {
  kreditorService: KreditorServiceType;
  aktivitaetService: AktivitaetServiceType;
  ownerName: string;
}

const PrivatKreditorContext = createContext<PrivatKreditorContextType | null>(null);

// Vorkonfigurierte Services für Julian
export const julianKreditorService = createPrivatKreditorService(
  PRIVAT_RECHNUNGEN_JULIAN_COLLECTION_ID,
  PRIVAT_KREDITOREN_JULIAN_COLLECTION_ID
);
export const julianAktivitaetService = createPrivatAktivitaetService(
  PRIVAT_AKTIVITAETEN_JULIAN_COLLECTION_ID
);

// Vorkonfigurierte Services für Luca
export const lucaKreditorService = createPrivatKreditorService(
  PRIVAT_RECHNUNGEN_LUCA_COLLECTION_ID,
  PRIVAT_KREDITOREN_LUCA_COLLECTION_ID
);
export const lucaAktivitaetService = createPrivatAktivitaetService(
  PRIVAT_AKTIVITAETEN_LUCA_COLLECTION_ID
);

interface PrivatKreditorProviderProps {
  children: ReactNode;
  owner: 'julian' | 'luca';
}

export const PrivatKreditorProvider = ({ children, owner }: PrivatKreditorProviderProps) => {
  const services = owner === 'julian'
    ? {
        kreditorService: julianKreditorService,
        aktivitaetService: julianAktivitaetService,
        ownerName: 'Julian',
      }
    : {
        kreditorService: lucaKreditorService,
        aktivitaetService: lucaAktivitaetService,
        ownerName: 'Luca',
      };

  return (
    <PrivatKreditorContext.Provider value={services}>
      {children}
    </PrivatKreditorContext.Provider>
  );
};

export const usePrivatKreditor = () => {
  const context = useContext(PrivatKreditorContext);
  if (!context) {
    throw new Error('usePrivatKreditor muss innerhalb von PrivatKreditorProvider verwendet werden');
  }
  return context;
};
