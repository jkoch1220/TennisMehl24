import { useState, useEffect } from 'react';
import { Plus, Trash2, Download, Package, Search } from 'lucide-react';
import { AngebotsDaten, Position } from '../../types/bestellabwicklung';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { berechneDokumentSummen } from '../../services/rechnungService';
import { getAlleArtikel } from '../../services/artikelService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import { Artikel } from '../../types/artikel';
import { Projekt } from '../../types/projekt';

interface AngebotTabProps {
  projekt?: Projekt;
  kundeInfo?: {
    kundennummer?: string;
    kundenname: string;
    kundenstrasse: string;
    kundenPlzOrt: string;
    ansprechpartner?: string;
    angefragteMenge?: number;
    preisProTonne?: number;
    notizen?: string;
  };
}

const AngebotTab = ({ projekt, kundeInfo }: AngebotTabProps) => {
  // Initialisiere mit leeren Daten
  const [angebotsDaten, setAngebotsDaten] = useState<AngebotsDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',
    
    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    angebotsnummer: '',
    angebotsdatum: new Date().toISOString().split('T')[0],
    gueltigBis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    
    positionen: [],
    zahlungsziel: '14 Tage',
  });
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [showArtikelAuswahl, setShowArtikelAuswahl] = useState(false);
  const [artikelSuchtext, setArtikelSuchtext] = useState('');
  const [artikelSortierung, setArtikelSortierung] = useState<'bezeichnung' | 'artikelnummer' | 'einzelpreis'>('bezeichnung');
  
  // Artikel laden
  useEffect(() => {
    const ladeArtikel = async () => {
      try {
        const artikelListe = await getAlleArtikel();
        setArtikel(artikelListe);
      } catch (error) {
        console.error('Fehler beim Laden der Artikel:', error);
      }
    };
    ladeArtikel();
  }, []);
  
  // Angebotsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!angebotsDaten.angebotsnummer && !projekt?.angebotsnummer) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('angebot');
          setAngebotsDaten(prev => ({ ...prev, angebotsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Angebotsnummer:', error);
          // Fallback
          setAngebotsDaten(prev => ({ 
            ...prev, 
            angebotsnummer: `ANG-${new Date().getFullYear()}-TEMP` 
          }));
        }
      }
    };
    generiereNummer();
  }, []);

  // Wenn Projekt oder Kundendaten übergeben wurden, fülle das Formular vor
  useEffect(() => {
    const ladeDaten = async () => {
      const datenQuelle = projekt || kundeInfo;
      if (datenQuelle) {
        const heute = new Date();
        const gueltigBis = new Date(heute);
        gueltigBis.setDate(gueltigBis.getDate() + 30);
        
        const initialePositionen: Position[] = [];
        const angefragteMenge = projekt?.angefragteMenge || kundeInfo?.angefragteMenge;
        const preisProTonne = projekt?.preisProTonne || kundeInfo?.preisProTonne;
        
        if (angefragteMenge && preisProTonne) {
          initialePositionen.push({
            id: '1',
            artikelnummer: 'TM-ZM',
            bezeichnung: 'Tennismehl / Ziegelmehl',
            menge: angefragteMenge,
            einheit: 't',
            einzelpreis: preisProTonne,
            gesamtpreis: angefragteMenge * preisProTonne,
          });
        }
        
        // Angebotsnummer generieren, falls nicht vorhanden
        let angebotsnummer = projekt?.angebotsnummer;
        if (!angebotsnummer) {
          try {
            angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
          } catch (error) {
            console.error('Fehler beim Generieren der Angebotsnummer:', error);
            angebotsnummer = `ANG-${new Date().getFullYear()}-TEMP`;
          }
        }
        
        setAngebotsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          projektnummer: projekt?.id,
          angebotsnummer: angebotsnummer,
          angebotsdatum: projekt?.angebotsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          gueltigBis: gueltigBis.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          bemerkung: projekt?.notizen || kundeInfo?.notizen || prev.bemerkung,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo]);

  const handleInputChange = (field: keyof AngebotsDaten, value: any) => {
    setAngebotsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    const neuePositionen = [...angebotsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis = 
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setAngebotsDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    const neuePosition: Position = {
      id: Date.now().toString(),
      bezeichnung: '',
      menge: 1,
      einheit: 'Stk',
      einzelpreis: 0,
      gesamtpreis: 0
    };
    
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

  const addPositionAusArtikel = (artikelId: string) => {
    const selectedArtikel = artikel.find(a => a.$id === artikelId);
    if (!selectedArtikel) return;

    // Verwende den Einzelpreis des Artikels, falls vorhanden, sonst 0
    const preis = selectedArtikel.einzelpreis ?? 0;

    const neuePosition: Position = {
      id: Date.now().toString(),
      artikelnummer: selectedArtikel.artikelnummer,
      bezeichnung: selectedArtikel.bezeichnung,
      menge: 1,
      einheit: selectedArtikel.einheit,
      einzelpreis: preis,
      gesamtpreis: preis,
    };
    
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
    
    setShowArtikelAuswahl(false);
    setArtikelSuchtext(''); // Suche zurücksetzen
  };

  // Gefilterte und sortierte Artikel für die Auswahl
  const gefilterteArtikel = artikel
    .filter(art => {
      if (!artikelSuchtext.trim()) return true;
      const suchtext = artikelSuchtext.toLowerCase();
      return (
        art.bezeichnung.toLowerCase().includes(suchtext) ||
        art.artikelnummer.toLowerCase().includes(suchtext) ||
        (art.beschreibung && art.beschreibung.toLowerCase().includes(suchtext))
      );
    })
    .sort((a, b) => {
      if (artikelSortierung === 'bezeichnung') {
        return a.bezeichnung.localeCompare(b.bezeichnung);
      } else if (artikelSortierung === 'artikelnummer') {
        return a.artikelnummer.localeCompare(b.artikelnummer);
      } else if (artikelSortierung === 'einzelpreis') {
        const preisA = a.einzelpreis ?? 0;
        const preisB = b.einzelpreis ?? 0;
        return preisA - preisB;
      }
      return 0;
    });

  const removePosition = (index: number) => {
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  const generiereUndLadeAngebot = async () => {
    try {
      console.log('Generiere Angebot...', angebotsDaten);
      const pdf = await generiereAngebotPDF(angebotsDaten);
      pdf.save(`Angebot_${angebotsDaten.angebotsnummer}.pdf`);
      console.log('Angebot erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren des Angebots:', error);
      alert('Fehler beim Generieren des Angebots: ' + (error as Error).message);
    }
  };

  const berechnung = berechneDokumentSummen(angebotsDaten.positionen);
  const frachtUndVerpackung = (angebotsDaten.frachtkosten || 0) + (angebotsDaten.verpackungskosten || 0);
  const gesamtBrutto = (berechnung.nettobetrag + frachtUndVerpackung) * 1.19;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Angebotsinformationen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Angebotsinformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Angebotsnummer</label>
              <input
                type="text"
                value={angebotsDaten.angebotsnummer}
                onChange={(e) => handleInputChange('angebotsnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Angebotsdatum</label>
              <input
                type="date"
                value={angebotsDaten.angebotsdatum}
                onChange={(e) => handleInputChange('angebotsdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gültig bis</label>
              <input
                type="date"
                value={angebotsDaten.gueltigBis}
                onChange={(e) => handleInputChange('gueltigBis', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Kundendaten */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Kundendaten</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kundennummer</label>
                <input
                  type="text"
                  value={angebotsDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={angebotsDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kundenname</label>
              <input
                type="text"
                value={angebotsDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input
                type="text"
                value={angebotsDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={angebotsDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Lieferadresse */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Lieferadresse</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={angebotsDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {angebotsDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={angebotsDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Angebotspositionen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Angebotspositionen</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowArtikelAuswahl(!showArtikelAuswahl)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Package className="h-4 w-4" />
                Aus Artikel
              </button>
              <button
                onClick={addPosition}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Leere Position
              </button>
            </div>
          </div>

          {/* Artikel-Auswahl */}
          {showArtikelAuswahl && (
            <div className="mb-4 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Artikel auswählen</h3>
                <button
                  onClick={() => {
                    setShowArtikelAuswahl(false);
                    setArtikelSuchtext('');
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Schließen
                </button>
              </div>

              {artikel.length === 0 ? (
                <p className="text-sm text-gray-600">
                  Keine Artikel vorhanden. Legen Sie zuerst Artikel in der Artikelverwaltung an.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Suchfeld und Sortierung */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={artikelSuchtext}
                        onChange={(e) => setArtikelSuchtext(e.target.value)}
                        placeholder="Artikel suchen (Bezeichnung, Art.-Nr., Beschreibung)..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                      />
                    </div>
                    <select
                      value={artikelSortierung}
                      onChange={(e) => setArtikelSortierung(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                    >
                      <option value="bezeichnung">Sortierung: Bezeichnung</option>
                      <option value="artikelnummer">Sortierung: Art.-Nr.</option>
                      <option value="einzelpreis">Sortierung: Preis</option>
                    </select>
                  </div>

                  {/* Artikel-Tabelle */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-96 overflow-y-auto">
                    {gefilterteArtikel.length === 0 ? (
                      <div className="p-4 text-center text-gray-600 text-sm">
                        Keine Artikel gefunden
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-purple-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">
                              Art.-Nr.
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">
                              Bezeichnung
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">
                              Beschreibung
                            </th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">
                              Einheit
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                              Preis
                            </th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700">
                              Aktion
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {gefilterteArtikel.map((art) => (
                            <tr key={art.$id} className="hover:bg-purple-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {art.artikelnummer}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {art.bezeichnung}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <div className="line-clamp-2 max-w-xs">
                                  {art.beschreibung || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-center">
                                {art.einheit}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                {art.einzelpreis !== undefined && art.einzelpreis !== null 
                                  ? `${art.einzelpreis.toFixed(2)} €` 
                                  : <span className="text-gray-400 italic text-xs">auf Anfrage</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => addPositionAusArtikel(art.$id!)}
                                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                  Hinzufügen
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Info-Zeile */}
                  <div className="text-xs text-gray-600 text-center">
                    {gefilterteArtikel.length} von {artikel.length} Artikel{artikel.length !== 1 ? 'n' : ''} angezeigt
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {angebotsDaten.positionen.map((position, index) => (
              <div key={position.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Artikel-Nr.</label>
                      <input
                        type="text"
                        value={position.artikelnummer || ''}
                        onChange={(e) => handlePositionChange(index, 'artikelnummer', e.target.value)}
                        placeholder="TM-001"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Leistungsbeschreibung</label>
                      <input
                        type="text"
                        value={position.bezeichnung}
                        onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Menge</label>
                      <input
                        type="number"
                        value={position.menge}
                        onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label>
                      <input
                        type="text"
                        value={position.einheit}
                        onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einzelpreis (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={position.einzelpreis}
                        onChange={(e) => handlePositionChange(index, 'einzelpreis', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={() => removePosition(index)}
                    className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="mt-2 text-right">
                  <span className="text-sm text-gray-600">Gesamtpreis: </span>
                  <span className="text-lg font-semibold text-gray-900">
                    {position.gesamtpreis.toFixed(2)} €
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lieferbedingungen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Lieferbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieferzeit</label>
              <input
                type="text"
                value={angebotsDaten.lieferzeit || ''}
                onChange={(e) => handleInputChange('lieferzeit', e.target.value)}
                placeholder="z.B. 2-3 Werktage"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frachtkosten (€)</label>
              <input
                type="number"
                step="0.01"
                value={angebotsDaten.frachtkosten || ''}
                onChange={(e) => handleInputChange('frachtkosten', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Zahlungsbedingungen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zahlungsbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel</label>
              <select
                value={angebotsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Vorkasse">Vorkasse</option>
                <option value="Sofort">Sofort</option>
                <option value="7 Tage">7 Tage</option>
                <option value="14 Tage">14 Tage</option>
                <option value="30 Tage">30 Tage</option>
                <option value="60 Tage">60 Tage</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={angebotsDaten.skontoAktiviert || false}
                  onChange={(e) => handleInputChange('skontoAktiviert', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Skonto aktivieren</span>
              </label>
              
              {angebotsDaten.skontoAktiviert && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Skonto %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={angebotsDaten.skonto?.prozent || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: parseFloat(e.target.value) || 0,
                        tage: angebotsDaten.skonto?.tage || 7
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tage</label>
                    <input
                      type="number"
                      value={angebotsDaten.skonto?.tage || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: angebotsDaten.skonto?.prozent || 0,
                        tage: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Bemerkung</h2>
          <textarea
            value={angebotsDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl shadow-sm border border-blue-200 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zusammenfassung</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Positionen:</span>
              <span className="font-medium text-gray-900">{angebotsDaten.positionen.length}</span>
            </div>
            
            <div className="border-t border-blue-200 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Nettobetrag:</span>
                <span className="font-medium text-gray-900">{berechnung.nettobetrag.toFixed(2)} €</span>
              </div>
              
              {frachtUndVerpackung > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Fracht/Verpackung:</span>
                  <span className="font-medium text-gray-900">{frachtUndVerpackung.toFixed(2)} €</span>
                </div>
              )}
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">MwSt. (19%):</span>
                <span className="font-medium text-gray-900">
                  {((berechnung.nettobetrag + frachtUndVerpackung) * 0.19).toFixed(2)} €
                </span>
              </div>
              
              <div className="border-t border-blue-200 pt-3 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-gray-900">Angebotssumme:</span>
                  <span className="text-3xl font-bold text-blue-600 break-all">
                    {gesamtBrutto.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>
            
            {angebotsDaten.skontoAktiviert && angebotsDaten.skonto && angebotsDaten.skonto.prozent > 0 && (
              <div className="border-t border-blue-200 pt-3 mt-3">
                <div className="text-sm text-gray-600 mb-1">
                  Bei Zahlung innerhalb von {angebotsDaten.skonto.tage} Tagen:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Skonto ({angebotsDaten.skonto.prozent}%):</span>
                  <span className="font-semibold text-green-600">
                    {(gesamtBrutto * (1 - angebotsDaten.skonto.prozent / 100)).toFixed(2)} €
                  </span>
                </div>
              </div>
            )}
            
            <div className="border-t border-blue-200 pt-3">
              <div className="text-sm text-gray-600 mb-1">
                Gültig bis: {new Date(angebotsDaten.gueltigBis).toLocaleDateString('de-DE')}
              </div>
            </div>
          </div>
          
          <button
            onClick={generiereUndLadeAngebot}
            className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl"
          >
            <Download className="h-5 w-5" />
            PDF Generieren
          </button>
        </div>
      </div>
    </div>
  );
};

export default AngebotTab;
