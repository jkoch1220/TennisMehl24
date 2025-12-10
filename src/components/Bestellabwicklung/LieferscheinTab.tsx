import { useState, useEffect } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { LieferscheinDaten, LieferscheinPosition } from '../../types/bestellabwicklung';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import { Projekt } from '../../types/projekt';

interface LieferscheinTabProps {
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

const LieferscheinTab = ({ projekt, kundeInfo }: LieferscheinTabProps) => {
  const [lieferscheinDaten, setLieferscheinDaten] = useState<LieferscheinDaten>({
    firmenname: 'Koch Dienste',
    firmenstrasse: 'Musterstraße 1',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 123 456789',
    firmenEmail: 'info@kochdienste.de',
    firmenWebsite: 'www.kochdienste.de',
    
    kundenname: '',
    kundenstrasse: '',
    kundenPlzOrt: '',
    
    lieferscheinnummer: '',
    lieferdatum: new Date().toISOString().split('T')[0],
    
    positionen: [],
  });
  
  // Lieferscheinnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!lieferscheinDaten.lieferscheinnummer && !projekt?.lieferscheinnummer) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('lieferschein');
          setLieferscheinDaten(prev => ({ ...prev, lieferscheinnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Lieferscheinnummer:', error);
          setLieferscheinDaten(prev => ({ 
            ...prev, 
            lieferscheinnummer: `LS-2026-TEMP` 
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
        
        const initialePositionen: LieferscheinPosition[] = [];
        const angefragteMenge = projekt?.angefragteMenge || kundeInfo?.angefragteMenge;
        
        if (angefragteMenge) {
          initialePositionen.push({
            id: '1',
            artikel: 'Tennismehl / Ziegelmehl',
            menge: angefragteMenge,
            einheit: 't',
          });
        }
        
        // Lieferscheinnummer generieren, falls nicht vorhanden
        let lieferscheinnummer = projekt?.lieferscheinnummer;
        if (!lieferscheinnummer) {
          try {
            lieferscheinnummer = await generiereNaechsteDokumentnummer('lieferschein');
          } catch (error) {
            console.error('Fehler beim Generieren der Lieferscheinnummer:', error);
            lieferscheinnummer = `LS-2026-TEMP`;
          }
        }
        
        setLieferscheinDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          lieferscheinnummer: lieferscheinnummer,
          lieferdatum: projekt?.lieferdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
          bemerkung: projekt?.notizen || kundeInfo?.notizen || prev.bemerkung,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo]);

  const handleInputChange = (field: keyof LieferscheinDaten, value: any) => {
    setLieferscheinDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof LieferscheinPosition, value: any) => {
    const neuePositionen = [...lieferscheinDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    setLieferscheinDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    const neuePosition: LieferscheinPosition = {
      id: Date.now().toString(),
      artikel: '',
      menge: 1,
      einheit: 'Stk',
    };
    
    setLieferscheinDaten(prev => ({
      ...prev,
      positionen: [...prev.positionen, neuePosition]
    }));
  };

  const removePosition = (index: number) => {
    setLieferscheinDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  const generiereUndLadeLieferschein = async () => {
    try {
      console.log('Generiere Lieferschein...', lieferscheinDaten);
      const pdf = await generiereLieferscheinPDF(lieferscheinDaten);
      pdf.save(`Lieferschein_${lieferscheinDaten.lieferscheinnummer}.pdf`);
      console.log('Lieferschein erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren des Lieferscheins:', error);
      alert('Fehler beim Generieren des Lieferscheins: ' + (error as Error).message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Lieferscheininformationen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Lieferscheininformationen</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieferscheinnummer</label>
              <input
                type="text"
                value={lieferscheinDaten.lieferscheinnummer}
                onChange={(e) => handleInputChange('lieferscheinnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieferdatum</label>
              <input
                type="date"
                value={lieferscheinDaten.lieferdatum}
                onChange={(e) => handleInputChange('lieferdatum', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bestellnummer (optional)</label>
              <input
                type="text"
                value={lieferscheinDaten.bestellnummer || ''}
                onChange={(e) => handleInputChange('bestellnummer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                  value={lieferscheinDaten.kundennummer || ''}
                  onChange={(e) => handleInputChange('kundennummer', e.target.value)}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                checked={lieferscheinDaten.lieferadresseAbweichend || false}
                onChange={(e) => handleInputChange('lieferadresseAbweichend', e.target.checked)}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <span className="text-sm text-gray-600">Abweichende Lieferadresse</span>
            </label>
          </div>
          
          {lieferscheinDaten.lieferadresseAbweichend && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadresseName || ''}
                  onChange={(e) => handleInputChange('lieferadresseName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Lieferpositionen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Lieferpositionen</h2>
              <p className="text-sm text-gray-500 mt-1">Hinweis: Lieferscheine enthalten KEINE Preise</p>
            </div>
            <button
              onClick={addPosition}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Position hinzufügen
            </button>
          </div>

          <div className="space-y-4">
            {lieferscheinDaten.positionen.map((position, index) => (
              <div key={position.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Artikel</label>
                      <input
                        type="text"
                        value={position.artikel}
                        onChange={(e) => handlePositionChange(index, 'artikel', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Menge</label>
                      <input
                        type="number"
                        value={position.menge}
                        onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label>
                      <input
                        type="text"
                        value={position.einheit}
                        onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Chargennr. (optional)</label>
                      <input
                        type="text"
                        value={position.chargennummer || ''}
                        onChange={(e) => handlePositionChange(index, 'chargennummer', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
              </div>
            ))}
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Bemerkung</h2>
          <textarea
            value={lieferscheinDaten.bemerkung || ''}
            onChange={(e) => handleInputChange('bemerkung', e.target.value)}
            rows={3}
            placeholder="z.B. Hinweise zur Lieferung oder Empfangsbestätigung"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Rechte Spalte - Zusammenfassung */}
      <div className="lg:col-span-2">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-200 p-8 sticky top-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Zusammenfassung</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Lieferpositionen:</span>
              <span className="font-medium text-gray-900">{lieferscheinDaten.positionen.length}</span>
            </div>
            
            <div className="border-t border-green-200 pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Gesamtmenge:</span>
                <span className="font-medium text-gray-900">
                  {lieferscheinDaten.positionen.reduce((sum, pos) => sum + pos.menge, 0)} Einheiten
                </span>
              </div>
            </div>
            
            <div className="border-t border-green-200 pt-3 mt-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Hinweis:</strong> Ein Lieferschein dokumentiert nur die gelieferten Waren und enthält keine Preisangaben.
                </p>
              </div>
            </div>
          </div>
          
          <button
            onClick={generiereUndLadeLieferschein}
            className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
          >
            <Download className="h-5 w-5" />
            PDF Generieren
          </button>
        </div>
      </div>
    </div>
  );
};

export default LieferscheinTab;
