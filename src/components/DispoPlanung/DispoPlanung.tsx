import { useState } from 'react';
import { List, Map } from 'lucide-react';
import BestellungsListe from './BestellungsListe';
import BestellungsKarte from './BestellungsKarte';
import { Bestellung } from '../../types/bestellung';
import { bestellungService } from '../../services/bestellungService';
import { useEffect } from 'react';

type Tab = 'liste' | 'karte';

const DispoPlanung = () => {
  const [aktiverTab, setAktiverTab] = useState<Tab>('liste');
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [ausgewaehlteBestellung, setAusgewaehlteBestellung] = useState<Bestellung | null>(null);

  const tabs = [
    { id: 'liste' as Tab, name: 'Bestellungsliste', icon: List },
    { id: 'karte' as Tab, name: 'Kartenansicht', icon: Map },
  ];

  useEffect(() => {
    ladeBestellungen();
  }, []);

  const ladeBestellungen = async () => {
    try {
      const geladeneBestellungen = await bestellungService.loadAlleBestellungen();
      setBestellungen(geladeneBestellungen);
    } catch (error) {
      console.error('Fehler beim Laden der Bestellungen:', error);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Dispo-Planung
          </h1>
          <p className="text-gray-600">
            Planung und Verwaltung von Lieferungen, Routen und Fahrzeugen
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const istAktiv = aktiverTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setAktiverTab(tab.id)}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                    transition-colors
                    ${
                      istAktiv
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {aktiverTab === 'liste' && (
            <BestellungsListe
              onBestellungAktualisiert={() => ladeBestellungen()}
            />
          )}
          {aktiverTab === 'karte' && (
            <BestellungsKarte
              bestellungen={bestellungen}
              onBestellungClick={(bestellung) => {
                setAusgewaehlteBestellung(bestellung);
                setAktiverTab('liste');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DispoPlanung;

