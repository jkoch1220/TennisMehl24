import { useState, useEffect } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { RechnungsDaten, Position } from '../../types/bestellabwicklung';
import { generiereRechnungPDF, berechneRechnungsSummen } from '../../services/rechnungService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import { Projekt } from '../../types/projekt';

interface RechnungTabProps {
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

const RechnungTab = ({ projekt, kundeInfo }: RechnungTabProps) => {
  const [rechnungsDaten, setRechnungsDaten] = useState<RechnungsDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',
    
    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    bankname: 'Sparkasse Tauberfranken',
    iban: 'DE49 6735 0130 0000254019',
    bic: 'SOLADES1TBB',
    
    rechnungsnummer: '',
    rechnungsdatum: new Date().toISOString().split('T')[0],
    leistungsdatum: new Date().toISOString().split('T')[0],
    
    positionen: [],
    zahlungsziel: '14 Tage',
  });
  
  // Rechnungsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!rechnungsDaten.rechnungsnummer && !projekt?.rechnungsnummer) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('rechnung');
          setRechnungsDaten(prev => ({ ...prev, rechnungsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Rechnungsnummer:', error);
          setRechnungsDaten(prev => ({ 
            ...prev, 
            rechnungsnummer: `RE-${new Date().getFullYear()}-TEMP` 
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
        
        // Rechnungsnummer generieren, falls nicht vorhanden
        let rechnungsnummer = projekt?.rechnungsnummer;
        if (!rechnungsnummer) {
          try {
            rechnungsnummer = await generiereNaechsteDokumentnummer('rechnung');
          } catch (error) {
            console.error('Fehler beim Generieren der Rechnungsnummer:', error);
            rechnungsnummer = `RE-${new Date().getFullYear()}-TEMP`;
          }
        }
        
        setRechnungsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          projektnummer: projekt?.id,
          rechnungsnummer: rechnungsnummer,
          rechnungsdatum: projekt?.rechnungsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          leistungsdatum: heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          bemerkung: projekt?.notizen || kundeInfo?.notizen || prev.bemerkung,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo]);

  const handleInputChange = (field: keyof RechnungsDaten, value: any) => {
    setRechnungsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    const neuePositionen = [...rechnungsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis = 
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setRechnungsDaten(prev => ({ ...prev, positionen: neuePositionen }));
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
    
    setRechnungsDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

  const removePosition = (index: number) => {
    setRechnungsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  const generiereUndLadeRechnung = async () => {
    try {
      console.log('Generiere Rechnung...', rechnungsDaten);
      const pdf = await generiereRechnungPDF(rechnungsDaten);
      pdf.save(`Rechnung_${rechnungsDaten.rechnungsnummer}.pdf`);
      console.log('Rechnung erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren der Rechnung:', error);
      alert('Fehler beim Generieren der Rechnung: ' + (error as Error).message);
    }
  };

  const berechnung = berechneRechnungsSummen(rechnungsDaten.positionen);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Rechnungsinformationen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Rechnungsinformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rechnungsnummer
              </label>
              <input
                type="text"
                value={rechnungsDaten.rechnungsnummer}
                onChange={(e) => handleInputChange('rechnungsnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rechnungsdatum
              </label>
              <input
                type="date"
                value={rechnungsDaten.rechnungsdatum}
                onChange={(e) => handleInputChange('rechnungsdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Leistungsdatum
              </label>
              <input
                type="date"
                value={rechnungsDaten.leistungsdatum || ''}
                onChange={(e) => handleInputChange('leistungsdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                  value={rechnungsDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={rechnungsDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={rechnungsDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={rechnungsDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kundenname</label>
              <input
                type="text"
                value={rechnungsDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input
                type="text"
                value={rechnungsDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={rechnungsDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                checked={rechnungsDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <span className="text-sm text-gray-600">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {rechnungsDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={rechnungsDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Rechnungspositionen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Rechnungspositionen</h2>
            <button
              onClick={addPosition}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Position hinzufügen
            </button>
          </div>

          <div className="space-y-4">
            {rechnungsDaten.positionen.map((position, index) => (
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Leistungsbeschreibung</label>
                      <input
                        type="text"
                        value={position.bezeichnung}
                        onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Menge</label>
                      <input
                        type="number"
                        value={position.menge}
                        onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label>
                      <input
                        type="text"
                        value={position.einheit}
                        onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einzelpreis (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={position.einzelpreis}
                        onChange={(e) => handlePositionChange(index, 'einzelpreis', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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

        {/* Zahlungsbedingungen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zahlungsbedingungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel</label>
              <select
                value={rechnungsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                  checked={rechnungsDaten.skontoAktiviert || false}
                  onChange={(e) => handleInputChange('skontoAktiviert', e.target.checked)}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">Skonto aktivieren</span>
              </label>
              
              {rechnungsDaten.skontoAktiviert && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Skonto %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={rechnungsDaten.skonto?.prozent || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: parseFloat(e.target.value) || 0,
                        tage: rechnungsDaten.skonto?.tage || 7
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tage</label>
                    <input
                      type="number"
                      value={rechnungsDaten.skonto?.tage || ''}
                      onChange={(e) => handleInputChange('skonto', {
                        prozent: rechnungsDaten.skonto?.prozent || 0,
                        tage: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
            value={rechnungsDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-sm border border-red-200 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zusammenfassung</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Positionen:</span>
              <span className="font-medium text-gray-900">{rechnungsDaten.positionen.length}</span>
            </div>
            
            <div className="border-t border-red-200 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Nettobetrag:</span>
                <span className="font-medium text-gray-900">{berechnung.nettobetrag.toFixed(2)} €</span>
              </div>
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">MwSt. ({berechnung.umsatzsteuersatz}%):</span>
                <span className="font-medium text-gray-900">{berechnung.umsatzsteuer.toFixed(2)} €</span>
              </div>
              
              <div className="border-t border-red-200 pt-3 mt-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-gray-900">Gesamtbetrag:</span>
                  <span className="text-3xl font-bold text-red-600 break-all">
                    {berechnung.bruttobetrag.toFixed(2)} €
                  </span>
                </div>
              </div>
            </div>
            
            {rechnungsDaten.skontoAktiviert && rechnungsDaten.skonto && rechnungsDaten.skonto.prozent > 0 && (
              <div className="border-t border-red-200 pt-3 mt-3">
                <div className="text-sm text-gray-600 mb-1">
                  Bei Zahlung innerhalb von {rechnungsDaten.skonto.tage} Tagen:
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Skonto ({rechnungsDaten.skonto.prozent}%):</span>
                  <span className="font-semibold text-green-600">
                    {(berechnung.bruttobetrag * (1 - rechnungsDaten.skonto.prozent / 100)).toFixed(2)} €
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={generiereUndLadeRechnung}
            className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl"
          >
            <Download className="h-5 w-5" />
            PDF Generieren
          </button>
        </div>
      </div>
    </div>
  );
};

export default RechnungTab;
