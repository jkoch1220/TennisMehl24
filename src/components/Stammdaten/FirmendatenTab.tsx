import { useState, useEffect } from 'react';
import { Save, Building2, MapPin, Phone, User, Briefcase, CreditCard, FileText, Plus, X } from 'lucide-react';
import { Stammdaten, StammdatenInput } from '../../types/stammdaten';
import { ladeStammdaten, speichereStammdaten, initialisiereStammdaten } from '../../services/stammdatenService';

const FirmendatenTab = () => {
  const [stammdaten, setStammdaten] = useState<Stammdaten | null>(null);
  const [loading, setLoading] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [formData, setFormData] = useState<StammdatenInput>({
    firmenname: '',
    firmenstrasse: '',
    firmenPlz: '',
    firmenOrt: '',
    firmenTelefon: '',
    firmenEmail: '',
    firmenWebsite: '',
    geschaeftsfuehrer: [],
    handelsregister: '',
    sitzGesellschaft: '',
    steuernummer: '',
    ustIdNr: '',
    bankname: '',
    iban: '',
    bic: '',
    werkName: '',
    werkStrasse: '',
    werkPlz: '',
    werkOrt: '',
  });

  useEffect(() => {
    ladeStammdatenDaten();
  }, []);

  const ladeStammdatenDaten = async () => {
    setLoading(true);
    try {
      const daten = await ladeStammdaten();
      if (daten) {
        setStammdaten(daten);
        setFormData({
          firmenname: daten.firmenname,
          firmenstrasse: daten.firmenstrasse,
          firmenPlz: daten.firmenPlz,
          firmenOrt: daten.firmenOrt,
          firmenTelefon: daten.firmenTelefon,
          firmenEmail: daten.firmenEmail,
          firmenWebsite: daten.firmenWebsite || '',
          geschaeftsfuehrer: daten.geschaeftsfuehrer,
          handelsregister: daten.handelsregister,
          sitzGesellschaft: daten.sitzGesellschaft,
          steuernummer: daten.steuernummer || '',
          ustIdNr: daten.ustIdNr,
          bankname: daten.bankname,
          iban: daten.iban,
          bic: daten.bic,
          werkName: daten.werkName || '',
          werkStrasse: daten.werkStrasse || '',
          werkPlz: daten.werkPlz || '',
          werkOrt: daten.werkOrt || '',
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Stammdaten:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpeichern = async () => {
    // KEINE Validierung - Immer speichern erlauben
    // Filtere nur leere Geschäftsführer
    const geschaeftsfuehrerGefiltert = formData.geschaeftsfuehrer.filter(gf => gf.trim() !== '');

    setSpeichert(true);
    try {
      // Speichere mit gefilterten Geschäftsführern
      const datenZumSpeichern = {
        ...formData,
        geschaeftsfuehrer: geschaeftsfuehrerGefiltert
      };
      
      const gespeicherteStammdaten = await speichereStammdaten(datenZumSpeichern);
      setStammdaten(gespeicherteStammdaten);
      
      // Update formData mit gefilterten Geschäftsführern
      setFormData({
        ...formData,
        geschaeftsfuehrer: geschaeftsfuehrerGefiltert
      });
      
      alert('Stammdaten erfolgreich gespeichert!');
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Stammdaten');
    } finally {
      setSpeichert(false);
    }
  };

  const handleInitialisieren = async () => {
    if (!confirm('Möchten Sie die Stammdaten mit Standardwerten initialisieren? Bestehende Daten werden überschrieben.')) {
      return;
    }

    setSpeichert(true);
    try {
      const neueStammdaten = await initialisiereStammdaten();
      setStammdaten(neueStammdaten);
      setFormData({
        firmenname: neueStammdaten.firmenname,
        firmenstrasse: neueStammdaten.firmenstrasse,
        firmenPlz: neueStammdaten.firmenPlz,
        firmenOrt: neueStammdaten.firmenOrt,
        firmenTelefon: neueStammdaten.firmenTelefon,
        firmenEmail: neueStammdaten.firmenEmail,
        firmenWebsite: neueStammdaten.firmenWebsite || '',
        geschaeftsfuehrer: neueStammdaten.geschaeftsfuehrer,
        handelsregister: neueStammdaten.handelsregister,
        sitzGesellschaft: neueStammdaten.sitzGesellschaft,
        steuernummer: neueStammdaten.steuernummer || '',
        ustIdNr: neueStammdaten.ustIdNr,
        bankname: neueStammdaten.bankname,
        iban: neueStammdaten.iban,
        bic: neueStammdaten.bic,
        werkName: neueStammdaten.werkName || '',
        werkStrasse: neueStammdaten.werkStrasse || '',
        werkPlz: neueStammdaten.werkPlz || '',
        werkOrt: neueStammdaten.werkOrt || '',
      });
      alert('Standardwerte erfolgreich geladen!');
    } catch (error) {
      console.error('Fehler beim Initialisieren:', error);
      alert('Fehler beim Initialisieren der Stammdaten');
    } finally {
      setSpeichert(false);
    }
  };

  // Geschäftsführer hinzufügen
  const handleGeschaeftsfuehrerHinzufuegen = () => {
    setFormData({
      ...formData,
      geschaeftsfuehrer: [...formData.geschaeftsfuehrer, '']
    });
  };

  // Geschäftsführer entfernen
  const handleGeschaeftsfuehrerEntfernen = (index: number) => {
    const neueGeschaeftsfuehrer = formData.geschaeftsfuehrer.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      geschaeftsfuehrer: neueGeschaeftsfuehrer
    });
  };

  // Geschäftsführer ändern
  const handleGeschaeftsfuehrerAendern = (index: number, wert: string) => {
    const neueGeschaeftsfuehrer = [...formData.geschaeftsfuehrer];
    neueGeschaeftsfuehrer[index] = wert;
    setFormData({
      ...formData,
      geschaeftsfuehrer: neueGeschaeftsfuehrer
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Stammdaten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Firmendaten</h2>
            <p className="text-gray-600 text-sm">
              Zentrale Verwaltung aller Firmenstammdaten für Dokumente und Rechnungen
            </p>
          </div>
          <div className="flex gap-3">
            {!stammdaten && (
              <button
                onClick={handleInitialisieren}
                disabled={speichert}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Mit Standardwerten initialisieren
              </button>
            )}
            <button
              onClick={handleSpeichern}
              disabled={speichert}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {speichert ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>

      {/* Formular */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-8">
          {/* Firmendaten */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Firmendaten</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firmenname *
                </label>
                <input
                  type="text"
                  value={formData.firmenname}
                  onChange={(e) => setFormData({ ...formData, firmenname: e.target.value })}
                  placeholder="z.B. TENNISMEHL GmbH"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Straße und Hausnummer *
                </label>
                <input
                  type="text"
                  value={formData.firmenstrasse}
                  onChange={(e) => setFormData({ ...formData, firmenstrasse: e.target.value })}
                  placeholder="z.B. Wertheimer Str. 13"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PLZ *
                </label>
                <input
                  type="text"
                  value={formData.firmenPlz}
                  onChange={(e) => setFormData({ ...formData, firmenPlz: e.target.value })}
                  placeholder="z.B. 97959"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ort *
                </label>
                <input
                  type="text"
                  value={formData.firmenOrt}
                  onChange={(e) => setFormData({ ...formData, firmenOrt: e.target.value })}
                  placeholder="z.B. Großrinderfeld"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Kontaktdaten */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Phone className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Kontaktdaten</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon *
                </label>
                <input
                  type="text"
                  value={formData.firmenTelefon}
                  onChange={(e) => setFormData({ ...formData, firmenTelefon: e.target.value })}
                  placeholder="z.B. 09391 9870-0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail *
                </label>
                <input
                  type="email"
                  value={formData.firmenEmail}
                  onChange={(e) => setFormData({ ...formData, firmenEmail: e.target.value })}
                  placeholder="z.B. info@tennismehl.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="text"
                  value={formData.firmenWebsite}
                  onChange={(e) => setFormData({ ...formData, firmenWebsite: e.target.value })}
                  placeholder="z.B. www.tennismehl.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Geschäftsführung */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900">Geschäftsführung</h3>
              </div>
              <button
                type="button"
                onClick={handleGeschaeftsfuehrerHinzufuegen}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Geschäftsführer hinzufügen
              </button>
            </div>
            
            <div className="space-y-3">
              {formData.geschaeftsfuehrer.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <User className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 mb-3">Noch keine Geschäftsführer angelegt</p>
                  <button
                    type="button"
                    onClick={handleGeschaeftsfuehrerHinzufuegen}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Ersten Geschäftsführer hinzufügen
                  </button>
                </div>
              ) : (
                formData.geschaeftsfuehrer.map((gf, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={gf}
                        onChange={(e) => handleGeschaeftsfuehrerAendern(index, e.target.value)}
                        placeholder="z.B. Stefan Egner"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGeschaeftsfuehrerEntfernen(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Entfernen"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sitz der Gesellschaft *
              </label>
              <input
                type="text"
                value={formData.sitzGesellschaft}
                onChange={(e) => setFormData({ ...formData, sitzGesellschaft: e.target.value })}
                placeholder="z.B. Großrinderfeld"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Handelsregister & Steuern */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-gray-900">Handelsregister & Steuern</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Handelsregister *
                </label>
                <input
                  type="text"
                  value={formData.handelsregister}
                  onChange={(e) => setFormData({ ...formData, handelsregister: e.target.value })}
                  placeholder="z.B. Würzburg HRB 731653"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  USt-IdNr. *
                </label>
                <input
                  type="text"
                  value={formData.ustIdNr}
                  onChange={(e) => setFormData({ ...formData, ustIdNr: e.target.value })}
                  placeholder="z.B. DE 320 029 255"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Steuernummer <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.steuernummer}
                  onChange={(e) => setFormData({ ...formData, steuernummer: e.target.value })}
                  placeholder="z.B. 123/456/78901"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Bankdaten */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Bankverbindung</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bankname *
                </label>
                <input
                  type="text"
                  value={formData.bankname}
                  onChange={(e) => setFormData({ ...formData, bankname: e.target.value })}
                  placeholder="z.B. Sparkasse Tauberfranken"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IBAN *
                </label>
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                  placeholder="z.B. DE49 6735 0130 0000254019"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BIC *
                </label>
                <input
                  type="text"
                  value={formData.bic}
                  onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                  placeholder="z.B. SOLADES1TBB"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Werk/Verkauf (optional) */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-cyan-600" />
              <h3 className="text-lg font-semibold text-gray-900">Werk/Verkauf <span className="text-sm text-gray-500 font-normal">(optional)</span></h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.werkName}
                  onChange={(e) => setFormData({ ...formData, werkName: e.target.value })}
                  placeholder="z.B. TENNISMEHL GmbH"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Straße und Hausnummer
                </label>
                <input
                  type="text"
                  value={formData.werkStrasse}
                  onChange={(e) => setFormData({ ...formData, werkStrasse: e.target.value })}
                  placeholder="z.B. Wertheimer Str. 3a"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PLZ
                </label>
                <input
                  type="text"
                  value={formData.werkPlz}
                  onChange={(e) => setFormData({ ...formData, werkPlz: e.target.value })}
                  placeholder="z.B. 97828"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ort
                </label>
                <input
                  type="text"
                  value={formData.werkOrt}
                  onChange={(e) => setFormData({ ...formData, werkOrt: e.target.value })}
                  placeholder="z.B. Marktheidenfeld"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info-Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800">
              <strong>Hinweis:</strong> Diese Stammdaten werden automatisch in allen Dokumenten (Angebote, Rechnungen, Lieferscheine) verwendet. 
              Änderungen wirken sich auf alle zukünftig erstellten Dokumente aus.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirmendatenTab;
