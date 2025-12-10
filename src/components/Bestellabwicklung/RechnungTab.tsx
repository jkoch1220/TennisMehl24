import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, FileCheck, AlertCircle, CheckCircle2, Loader2, Lock, AlertTriangle, Cloud, CloudOff } from 'lucide-react';
import { RechnungsDaten, Position, GespeichertesDokument } from '../../types/bestellabwicklung';
import { generiereRechnungPDF, berechneRechnungsSummen } from '../../services/rechnungService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  ladeDokumentNachTyp,
  speichereRechnung,
  ladeDokumentDaten,
  getFileDownloadUrl,
  speichereEntwurf,
  ladeEntwurf
} from '../../services/bestellabwicklungDokumentService';
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
  
  // Dokument-Status
  const [gespeichertesDokument, setGespeichertesDokument] = useState<GespeichertesDokument | null>(null);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'speichern' | 'fehler'>('laden');
  const [statusMeldung, setStatusMeldung] = useState<{ typ: 'erfolg' | 'fehler' | 'warnung'; text: string } | null>(null);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  
  // Auto-Save Status (nur für Entwürfe, Rechnungen sind final!)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'gespeichert' | 'speichern' | 'fehler' | 'idle'>('idle');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const hatGeaendert = useRef(false);
  const initialLaden = useRef(true);
  
  // Gespeichertes Dokument und Entwurf laden (wenn Projekt vorhanden)
  useEffect(() => {
    const ladeDokument = async () => {
      if (!projekt?.$id) {
        setLadeStatus('bereit');
        initialLaden.current = false;
        return;
      }
      
      try {
        setLadeStatus('laden');
        
        // Erst prüfen ob eine finale Rechnung existiert
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'rechnung');
        
        if (dokument) {
          setGespeichertesDokument(dokument);
          // Lade gespeicherte Daten zur Anzeige
          const gespeicherteDaten = ladeDokumentDaten<RechnungsDaten>(dokument);
          if (gespeicherteDaten) {
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setRechnungsDaten({
              ...gespeicherteDaten,
              kundennummer: gespeicherteDaten.kundennummer || projekt?.kundennummer,
              kundenname: gespeicherteDaten.kundenname || projekt?.kundenname || '',
              kundenstrasse: gespeicherteDaten.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: gespeicherteDaten.kundenPlzOrt || projekt?.kundenPlzOrt || '',
            });
          }
          setAutoSaveStatus('gespeichert');
        } else {
          // Keine finale Rechnung - versuche Entwurf zu laden
          const entwurf = await ladeEntwurf<RechnungsDaten>(projekt.$id, 'rechnungsDaten');
          if (entwurf) {
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setRechnungsDaten({
              ...entwurf,
              kundennummer: entwurf.kundennummer || projekt?.kundennummer,
              kundenname: entwurf.kundenname || projekt?.kundenname || '',
              kundenstrasse: entwurf.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: entwurf.kundenPlzOrt || projekt?.kundenPlzOrt || '',
            });
            setAutoSaveStatus('gespeichert');
          }
        }
        
        setLadeStatus('bereit');
        initialLaden.current = false;
      } catch (error) {
        console.error('Fehler beim Laden des Dokuments:', error);
        setLadeStatus('bereit');
        initialLaden.current = false;
      }
    };
    
    ladeDokument();
  }, [projekt?.$id]);

  // Auto-Save mit Debounce (nur für Entwürfe, nicht für finale Rechnungen!)
  const speichereAutomatisch = useCallback(async (daten: RechnungsDaten) => {
    if (!projekt?.$id || initialLaden.current || gespeichertesDokument) return;
    
    try {
      setAutoSaveStatus('speichern');
      await speichereEntwurf(projekt.$id, 'rechnungsDaten', daten);
      setAutoSaveStatus('gespeichert');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setAutoSaveStatus('fehler');
    }
  }, [projekt?.$id, gespeichertesDokument]);

  // Debounced Auto-Save bei Änderungen (nur wenn noch keine finale Rechnung existiert!)
  useEffect(() => {
    if (initialLaden.current || !hatGeaendert.current || gespeichertesDokument) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch(rechnungsDaten);
    }, 1500);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [rechnungsDaten, speichereAutomatisch, gespeichertesDokument]);

  // Rechnungsnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!rechnungsDaten.rechnungsnummer && !projekt?.rechnungsnummer && !gespeichertesDokument) {
        try {
          const neueNummer = await generiereNaechsteDokumentnummer('rechnung');
          setRechnungsDaten(prev => ({ ...prev, rechnungsnummer: neueNummer }));
        } catch (error) {
          console.error('Fehler beim Generieren der Rechnungsnummer:', error);
          setRechnungsDaten(prev => ({ 
            ...prev, 
            rechnungsnummer: `RE-2026-TEMP` 
          }));
        }
      }
    };
    generiereNummer();
  }, [gespeichertesDokument]);
  
  // Wenn Projekt oder Kundendaten übergeben wurden, fülle das Formular vor
  useEffect(() => {
    const ladeDaten = async () => {
      // Nicht überschreiben wenn bereits ein Dokument geladen wurde (Rechnung ist FINAL!)
      if (gespeichertesDokument) return;
      
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
            rechnungsnummer = `RE-2026-TEMP`;
          }
        }
        
        setRechnungsDaten(prev => ({
          ...prev,
          kundennummer: projekt?.kundennummer || kundeInfo?.kundennummer,
          kundenname: projekt?.kundenname || kundeInfo?.kundenname || '',
          kundenstrasse: projekt?.kundenstrasse || kundeInfo?.kundenstrasse || '',
          kundenPlzOrt: projekt?.kundenPlzOrt || kundeInfo?.kundenPlzOrt || '',
          ansprechpartner: kundeInfo?.ansprechpartner,
          rechnungsnummer: rechnungsnummer,
          rechnungsdatum: projekt?.rechnungsdatum?.split('T')[0] || heute.toISOString().split('T')[0],
          leistungsdatum: heute.toISOString().split('T')[0],
          positionen: initialePositionen.length > 0 ? initialePositionen : prev.positionen,
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo, gespeichertesDokument]);

  const handleInputChange = (field: keyof RechnungsDaten, value: any) => {
    hatGeaendert.current = true;
    setRechnungsDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof Position, value: any) => {
    hatGeaendert.current = true;
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
    hatGeaendert.current = true;
    const neuePosition: Position = {
      id: Date.now().toString(),
      bezeichnung: '',
      beschreibung: '',
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
    hatGeaendert.current = true;
    setRechnungsDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  // Nur PDF generieren und herunterladen (ohne Speicherung) - z.B. für Entwurf
  const generiereUndLadeRechnung = async () => {
    try {
      console.log('Generiere Rechnung (nur Download/Entwurf)...', rechnungsDaten);
      const pdf = await generiereRechnungPDF(rechnungsDaten);
      pdf.save(`Rechnung_ENTWURF_${rechnungsDaten.rechnungsnummer}.pdf`);
      console.log('Rechnung-Entwurf erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren der Rechnung:', error);
      alert('Fehler beim Generieren der Rechnung: ' + (error as Error).message);
    }
  };

  // FINAL speichern in Appwrite - NICHT MEHR ÄNDERBAR!
  const speichereUndHinterlegeRechnung = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }
    
    try {
      setLadeStatus('speichern');
      setStatusMeldung(null);
      setShowFinalConfirm(false);
      
      const neuesDokument = await speichereRechnung(projekt.$id, rechnungsDaten);
      
      setGespeichertesDokument(neuesDokument);
      setStatusMeldung({ typ: 'erfolg', text: 'Rechnung erfolgreich gespeichert und finalisiert! Diese Rechnung kann nicht mehr geändert werden.' });
      setLadeStatus('bereit');
      
      // Status-Meldung nach 8 Sekunden ausblenden
      setTimeout(() => setStatusMeldung(null), 8000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler beim Speichern: ' + (error as Error).message });
      setLadeStatus('fehler');
    }
  };

  const berechnung = berechneRechnungsSummen(rechnungsDaten.positionen);

  // Zeige Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <span className="ml-3 text-gray-600">Lade Dokument...</span>
      </div>
    );
  }

  // Rechnung bereits finalisiert - Read-Only Ansicht
  if (gespeichertesDokument) {
    return (
      <div className="space-y-6">
        {/* FINALES BANNER */}
        <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border-2 border-green-300 rounded-xl p-8 shadow-lg">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center shadow-inner">
                <Lock className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-green-800">Rechnung finalisiert</h2>
                <span className="px-3 py-1 bg-green-200 text-green-800 text-xs font-semibold rounded-full uppercase tracking-wide">
                  Unveränderbar
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-green-700">Rechnungsnummer</p>
                  <p className="text-xl font-bold text-green-900">{gespeichertesDokument.dokumentNummer}</p>
                </div>
                <div>
                  <p className="text-sm text-green-700">Erstellt am</p>
                  <p className="text-xl font-bold text-green-900">
                    {gespeichertesDokument.$createdAt && new Date(gespeichertesDokument.$createdAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-700">Bruttobetrag</p>
                  <p className="text-xl font-bold text-green-900">
                    {gespeichertesDokument.bruttobetrag?.toFixed(2)} €
                  </p>
                </div>
              </div>
              
              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href={getFileDownloadUrl(gespeichertesDokument.dateiId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg hover:shadow-xl font-medium"
                >
                  <Download className="h-5 w-5" />
                  Rechnung herunterladen
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Info-Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-blue-800">Warum kann diese Rechnung nicht geändert werden?</h3>
              <p className="mt-2 text-sm text-blue-700">
                Rechnungen sind rechtlich verbindliche Dokumente. Nach der Finalisierung wird die Rechnung archiviert 
                und kann aus Compliance-Gründen nicht mehr verändert werden. Sollten Korrekturen notwendig sein, 
                müssen Sie eine Stornorechnung oder Gutschrift erstellen.
              </p>
            </div>
          </div>
        </div>

        {/* Archivierte Rechnungsdetails - Read Only */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-gray-500" />
            Archivierte Rechnungsdetails
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-600">Kunde</p>
              <p className="font-medium text-gray-900">{rechnungsDaten.kundenname}</p>
              <p className="text-gray-600 text-xs mt-1">{rechnungsDaten.kundenstrasse}, {rechnungsDaten.kundenPlzOrt}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-600">Rechnungsdatum</p>
              <p className="font-medium text-gray-900">
                {new Date(rechnungsDaten.rechnungsdatum).toLocaleDateString('de-DE')}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-600">Leistungsdatum</p>
              <p className="font-medium text-gray-900">
                {rechnungsDaten.leistungsdatum 
                  ? new Date(rechnungsDaten.leistungsdatum).toLocaleDateString('de-DE')
                  : '-'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-600">Zahlungsziel</p>
              <p className="font-medium text-gray-900">{rechnungsDaten.zahlungsziel}</p>
            </div>
          </div>

          {/* Positionen - Read Only Tabelle */}
          {rechnungsDaten.positionen.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Positionen</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-700">Bezeichnung</th>
                      <th className="px-4 py-2 text-right text-gray-700">Menge</th>
                      <th className="px-4 py-2 text-left text-gray-700">Einheit</th>
                      <th className="px-4 py-2 text-right text-gray-700">Einzelpreis</th>
                      <th className="px-4 py-2 text-right text-gray-700">Gesamt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rechnungsDaten.positionen.map((pos, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-gray-900">{pos.bezeichnung}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{pos.menge}</td>
                        <td className="px-4 py-3 text-gray-900">{pos.einheit}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{pos.einzelpreis.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{pos.gesamtpreis.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">Netto:</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{berechnung.nettobetrag.toFixed(2)} €</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">MwSt. (19%):</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{berechnung.umsatzsteuer.toFixed(2)} €</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td colSpan={4} className="px-4 py-3 text-right font-bold text-green-800">Brutto:</td>
                      <td className="px-4 py-3 text-right font-bold text-green-800 text-lg">{berechnung.bruttobetrag.toFixed(2)} €</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Noch keine Rechnung erstellt - Bearbeitbare Ansicht
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* WICHTIGER HINWEIS */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-amber-800">Wichtig: Rechnungen sind endgültig</h3>
              <p className="mt-1 text-sm text-amber-700">
                Nach dem Speichern kann diese Rechnung <strong>nicht mehr geändert</strong> werden. 
                Bitte überprüfen Sie alle Daten sorgfältig. Nutzen Sie ggf. die "Entwurf herunterladen" Funktion 
                um die Rechnung vor dem Finalisieren zu prüfen.
              </p>
            </div>
          </div>
        </div>

        {/* Status-Meldung */}
        {statusMeldung && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            statusMeldung.typ === 'erfolg' 
              ? 'bg-green-50 border border-green-200' 
              : statusMeldung.typ === 'warnung'
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {statusMeldung.typ === 'erfolg' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : statusMeldung.typ === 'warnung' ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            )}
            <p className={`text-sm ${
              statusMeldung.typ === 'erfolg' ? 'text-green-800' : 
              statusMeldung.typ === 'warnung' ? 'text-amber-800' : 'text-red-800'
            }`}>
              {statusMeldung.text}
            </p>
          </div>
        )}

        {/* Auto-Save Status (nur wenn noch keine finale Rechnung existiert) */}
        {projekt?.$id && !gespeichertesDokument && (
          <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${
            autoSaveStatus === 'gespeichert' ? 'bg-green-50 text-green-700' :
            autoSaveStatus === 'speichern' ? 'bg-blue-50 text-blue-700' :
            autoSaveStatus === 'fehler' ? 'bg-red-50 text-red-700' :
            'bg-gray-50 text-gray-500'
          }`}>
            {autoSaveStatus === 'gespeichert' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Entwurf automatisch gespeichert</span>
              </>
            )}
            {autoSaveStatus === 'speichern' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Speichern...</span>
              </>
            )}
            {autoSaveStatus === 'fehler' && (
              <>
                <CloudOff className="h-4 w-4" />
                <span>Fehler beim Speichern</span>
              </>
            )}
            {autoSaveStatus === 'idle' && (
              <>
                <Cloud className="h-4 w-4" />
                <span>Bereit</span>
              </>
            )}
          </div>
        )}

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
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bezeichnung</label>
                        <input
                          type="text"
                          value={position.bezeichnung}
                          onChange={(e) => handlePositionChange(index, 'bezeichnung', e.target.value)}
                          placeholder="z.B. Tennismehl / Ziegelmehl"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Streichpreis (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={position.streichpreis ?? ''}
                          onChange={(e) => handlePositionChange(index, 'streichpreis', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="Optional"
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung (optional)</label>
                      <textarea
                        value={position.beschreibung || ''}
                        onChange={(e) => handlePositionChange(index, 'beschreibung', e.target.value)}
                        placeholder="Detaillierte Beschreibung der Position..."
                        rows={2}
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
          
          {/* Buttons */}
          <div className="mt-6 space-y-3">
            {/* Entwurf herunterladen */}
            <button
              onClick={generiereUndLadeRechnung}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-red-700 border-2 border-red-300 rounded-lg hover:bg-red-50 transition-all"
            >
              <Download className="h-5 w-5" />
              Entwurf herunterladen
            </button>
            
            {/* Finalisieren */}
            {projekt?.$id && !showFinalConfirm && (
              <button
                onClick={() => setShowFinalConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl"
              >
                <Lock className="h-5 w-5" />
                Rechnung finalisieren
              </button>
            )}
            
            {/* Bestätigungs-Dialog */}
            {showFinalConfirm && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800">Sind Sie sicher?</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Nach dem Finalisieren kann diese Rechnung nicht mehr geändert werden!
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFinalConfirm(false)}
                    className="flex-1 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={speichereUndHinterlegeRechnung}
                    disabled={ladeStatus === 'speichern'}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {ladeStatus === 'speichern' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Speichern...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Ja, finalisieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {!projekt?.$id && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Zum Speichern muss ein Projekt ausgewählt sein.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechnungTab;
