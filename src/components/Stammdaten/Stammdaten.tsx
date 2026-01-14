import { useState } from 'react';
import { Building2, Package, Database, Hash, Mail, ShoppingBag, Calendar } from 'lucide-react';
import FirmendatenTab from './FirmendatenTab';
import ArtikelVerwaltungTab from '../Projektabwicklung/ArtikelVerwaltungTab';
import UniversalArtikelTab from './UniversaArtikelTab';
import KundennummernTab from './KundennummernTab';
import EmailTemplatesTab from './EmailTemplatesTab';
import SaisonEinstellungenTab from './SaisonEinstellungenTab';

type TabId = 'firmendaten' | 'artikel' | 'universaArtikel' | 'kundennummern' | 'emailTemplates' | 'saison';

const Stammdaten = () => {
  const [activeTab, setActiveTab] = useState<TabId>('firmendaten');

  const tabs = [
    { 
      id: 'firmendaten' as TabId, 
      label: 'Firmendaten', 
      icon: Building2, 
      color: 'from-blue-600 to-cyan-600',
      description: 'Firmenname, Kontakt, Bankdaten, etc.'
    },
    {
      id: 'artikel' as TabId,
      label: 'Artikelverwaltung',
      icon: Package,
      color: 'from-purple-600 to-pink-600',
      description: 'Eigene Standardartikel'
    },
    {
      id: 'universaArtikel' as TabId,
      label: 'Universal Artikel',
      icon: ShoppingBag,
      color: 'from-orange-500 to-red-600',
      description: 'Universal Sport Katalog'
    },
    {
      id: 'kundennummern' as TabId, 
      label: 'Kundennummern', 
      icon: Hash, 
      color: 'from-green-600 to-emerald-600',
      description: 'Kundennummern generieren'
    },
    {
      id: 'emailTemplates' as TabId,
      label: 'E-Mail-Templates',
      icon: Mail,
      color: 'from-purple-600 to-indigo-600',
      description: 'E-Mail-Vorlagen bearbeiten'
    },
    {
      id: 'saison' as TabId,
      label: 'Saison',
      icon: Calendar,
      color: 'from-orange-600 to-amber-600',
      description: 'Saison-Einstellungen'
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg dark:shadow-dark-lg">
            <Database className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Stammdaten</h1>
            <p className="text-gray-600 dark:text-dark-textMuted mt-1">Zentrale Verwaltung aller Firmenstammdaten und Artikel</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border mb-6 overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-dark-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-2 px-6 py-4 transition-all ${
                  isActive
                    ? 'bg-gradient-to-r ' + tab.color + ' text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold">{tab.label}</span>
                </div>
                {!isActive && (
                  <span className="text-xs text-gray-500 dark:text-dark-textMuted">{tab.description}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'firmendaten' && <FirmendatenTab />}
        {activeTab === 'artikel' && <ArtikelVerwaltungTab />}
        {activeTab === 'universaArtikel' && <UniversalArtikelTab />}
        {activeTab === 'kundennummern' && <KundennummernTab />}
        {activeTab === 'emailTemplates' && <EmailTemplatesTab />}
        {activeTab === 'saison' && <SaisonEinstellungenTab />}
      </div>

      {/* Info-Box über Stammdaten */}
      <div className="mt-8 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-3">Über Stammdaten</h3>
        <div className="space-y-2 text-sm text-gray-700 dark:text-dark-textMuted">
          <p>
            <strong>Firmendaten:</strong> Alle Firmenstammdaten wie Name, Adresse, Kontaktdaten, Bankverbindung, 
            Handelsregister und Geschäftsführer. Diese Daten werden automatisch in PDF-Dokumenten (Rechnungen, 
            Angebote, Lieferscheine) im Footer verwendet.
          </p>
          <p>
            <strong>Artikelverwaltung:</strong> Eigene Standardartikel für die schnelle Angebotserstellung.
            Die hier angelegten Artikel können bei der Erstellung von Angeboten direkt ausgewählt werden.
          </p>
          <p>
            <strong>Universal Artikel:</strong> Artikelkatalog von Universal Sport GmbH.
            Importieren Sie die Großhändler-/Katalogpreisliste als Excel-Datei, um alle Artikel mit aktuellen Preisen verfügbar zu haben.
          </p>
          <p>
            <strong>Kundennummern:</strong> Automatische Vergabe von eindeutigen Kundennummern für alle Kunden
            in der Kundenliste. Die Nummern beginnen bei 231 und werden fortlaufend vergeben.
          </p>
          <p>
            <strong>Saison:</strong> Konfiguration der aktuellen Saison für die Auftragsbestätigungsnummern.
            AB-Nummern werden im Format AB-YYYY-0001 generiert, wobei YYYY das Saisonjahr ist.
          </p>
          <p className="text-blue-700 font-medium mt-4">
            Tipp: Pflegen Sie Ihre Stammdaten sorgfältig, da diese zentral in vielen Bereichen verwendet werden.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Stammdaten;
