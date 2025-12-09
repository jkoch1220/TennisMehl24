import { useState } from 'react';
import { FileText, Plus, Trash2, Download } from 'lucide-react';
import { RechnungsDaten, RechnungsPosition } from '../../types/bestellabwicklung';
import { generiereRechnungPDF, berechneRechnungsSummen } from '../../services/rechnungService';

const Bestellabwicklung = () => {
  const [rechnungsDaten, setRechnungsDaten] = useState<RechnungsDaten>({
    // Rechnungsinformationen
    rechnungsnummer: 'RE-2024-001',
    rechnungsdatum: new Date().toISOString().split('T')[0],
    leistungsdatum: new Date().toISOString().split('T')[0],
    
    // Kundeninformationen
    kundenname: 'Musterkunde GmbH',
    kundenstrasse: 'Musterstraße 123',
    kundenPlzOrt: '12345 Musterstadt',
    
    // Firmendaten
    firmenname: 'TennisMehl GmbH',
    firmenstrasse: 'Musterstraße 123',
    firmenPlzOrt: '12345 Musterstadt',
    firmenTelefon: '+49 (0) 123 456789',
    firmenEmail: 'info@tennismehl.de',
    firmenWebsite: 'www.tennismehl.de',
    
    // Bankdaten
    bankname: 'Sparkasse Musterstadt',
    iban: 'DE89 3704 0044 0532 0130 00',
    bic: 'COBADEFFXXX',
    
    // Steuerdaten
    steuernummer: '123/456/78910',
    ustIdNr: 'DE123456789',
    
    // Positionen
    positionen: [
      {
        id: '1',
        bezeichnung: 'Tennismehl Premium - Rot',
        menge: 100,
        einheit: 'kg',
        einzelpreis: 15.50,
        gesamtpreis: 1550.00
      }
    ],
    
    // Zahlungsbedingungen
    zahlungsziel: 14,
    skonto: {
      prozent: 2,
      tage: 7
    },
    
    // Bemerkungen
    bemerkung: 'Vielen Dank für Ihren Auftrag! Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.'
  });

  const handleInputChange = (field: keyof RechnungsDaten, value: any) => {
    setRechnungsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof RechnungsPosition, value: any) => {
    const neuePositionen = [...rechnungsDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    // Automatische Berechnung des Gesamtpreises
    if (field === 'menge' || field === 'einzelpreis') {
      neuePositionen[index].gesamtpreis = 
        neuePositionen[index].menge * neuePositionen[index].einzelpreis;
    }
    
    setRechnungsDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    const neuePosition: RechnungsPosition = {
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

  const generiereUndLadeRechnung = () => {
    const pdf = generiereRechnungPDF(rechnungsDaten);
    pdf.save(`Rechnung_${rechnungsDaten.rechnungsnummer}.pdf`);
  };

  const berechnung = berechneRechnungsSummen(rechnungsDaten);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bestellabwicklung</h1>
            <p className="text-gray-600 mt-1">Rechnungen erstellen und verwalten</p>
          </div>
        </div>
        
        <button
          onClick={generiereUndLadeRechnung}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Download className="h-5 w-5" />
          PDF Generieren
        </button>
      </div>

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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kundenname
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.kundenname}
                  onChange={(e) => handleInputChange('kundenname', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Straße
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.kundenstrasse}
                  onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PLZ & Ort
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.kundenPlzOrt}
                  onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Firmendaten */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Ihre Firmendaten</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firmenname
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.firmenname}
                  onChange={(e) => handleInputChange('firmenname', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Straße
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.firmenstrasse}
                  onChange={(e) => handleInputChange('firmenstrasse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PLZ & Ort
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.firmenPlzOrt}
                  onChange={(e) => handleInputChange('firmenPlzOrt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.firmenTelefon}
                  onChange={(e) => handleInputChange('firmenTelefon', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={rechnungsDaten.firmenEmail}
                  onChange={(e) => handleInputChange('firmenEmail', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website (optional)
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.firmenWebsite || ''}
                  onChange={(e) => handleInputChange('firmenWebsite', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
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
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Bezeichnung
                        </label>
                        <input
                          type="text"
                          value={position.bezeichnung}
                          onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Menge
                        </label>
                        <input
                          type="number"
                          value={position.menge}
                          onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Einheit
                        </label>
                        <input
                          type="text"
                          value={position.einheit}
                          onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Einzelpreis (€)
                        </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Zahlungsziel (Tage)
                </label>
                <input
                  type="number"
                  value={rechnungsDaten.zahlungsziel}
                  onChange={(e) => handleInputChange('zahlungsziel', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Skonto % (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={rechnungsDaten.skonto?.prozent || ''}
                  onChange={(e) => handleInputChange('skonto', {
                    ...rechnungsDaten.skonto,
                    prozent: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              {rechnungsDaten.skonto && rechnungsDaten.skonto.prozent > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Skonto Tage
                  </label>
                  <input
                    type="number"
                    value={rechnungsDaten.skonto.tage}
                    onChange={(e) => handleInputChange('skonto', {
                      ...rechnungsDaten.skonto,
                      tage: parseInt(e.target.value) || 0
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bankdaten */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Bankverbindung</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bankname
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.bankname}
                  onChange={(e) => handleInputChange('bankname', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IBAN
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.iban}
                  onChange={(e) => handleInputChange('iban', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BIC
                </label>
                <input
                  type="text"
                  value={rechnungsDaten.bic}
                  onChange={(e) => handleInputChange('bic', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Steuerdaten & Bemerkung */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Weitere Angaben</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Steuernummer (optional)
                  </label>
                  <input
                    type="text"
                    value={rechnungsDaten.steuernummer || ''}
                    onChange={(e) => handleInputChange('steuernummer', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    USt-IdNr. (optional)
                  </label>
                  <input
                    type="text"
                    value={rechnungsDaten.ustIdNr || ''}
                    onChange={(e) => handleInputChange('ustIdNr', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bemerkung (optional)
                </label>
                <textarea
                  value={rechnungsDaten.bemerkung || ''}
                  onChange={(e) => handleInputChange('bemerkung', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rechte Spalte - Zusammenfassung */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-sm border border-red-200 p-8 sticky top-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Zusammenfassung</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Positionen:</span>
                <span className="font-medium text-gray-900">
                  {rechnungsDaten.positionen.length}
                </span>
              </div>
              
              <div className="border-t border-red-200 pt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Nettobetrag:</span>
                  <span className="font-medium text-gray-900">
                    {berechnung.nettobetrag.toFixed(2)} €
                  </span>
                </div>
                
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">MwSt. ({berechnung.umsatzsteuersatz}%):</span>
                  <span className="font-medium text-gray-900">
                    {berechnung.umsatzsteuer.toFixed(2)} €
                  </span>
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
              
              {rechnungsDaten.skonto && rechnungsDaten.skonto.prozent > 0 && (
                <div className="border-t border-red-200 pt-3 mt-3">
                  <div className="text-sm text-gray-600 mb-1">
                    Bei Zahlung innerhalb von {rechnungsDaten.skonto.tage} Tagen:
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">
                      Skonto ({rechnungsDaten.skonto.prozent}%):
                    </span>
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
    </div>
  );
};

export default Bestellabwicklung;
