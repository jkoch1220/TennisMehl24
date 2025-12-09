import { useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import { AngebotsDaten, Position } from '../../types/bestellabwicklung';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { berechneDokumentSummen } from '../../services/rechnungService';
import { testAngebot } from './testdaten';

const AngebotTab = () => {
  const [angebotsDaten, setAngebotsDaten] = useState<AngebotsDaten>(testAngebot);

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

  const removePosition = (index: number) => {
    setAngebotsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  const generiereUndLadeAngebot = () => {
    try {
      console.log('Generiere Angebot...', angebotsDaten);
      const pdf = generiereAngebotPDF(angebotsDaten);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner</label>
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
            <button
              onClick={addPosition}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Position hinzufügen
            </button>
          </div>

          <div className="space-y-4">
            {angebotsDaten.positionen.map((position, index) => (
              <div key={position.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bezeichnung</label>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel (Tage)</label>
              <input
                type="number"
                value={angebotsDaten.zahlungsziel}
                onChange={(e) => handleInputChange('zahlungsziel', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsart</label>
              <input
                type="text"
                value={angebotsDaten.zahlungsart || ''}
                onChange={(e) => handleInputChange('zahlungsart', e.target.value)}
                placeholder="z.B. Überweisung"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
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
