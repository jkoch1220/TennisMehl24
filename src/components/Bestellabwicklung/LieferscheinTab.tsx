import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Download, FileCheck, Edit3, AlertCircle, CheckCircle2, Loader2, Cloud, CloudOff } from 'lucide-react';
import { LieferscheinDaten, LieferscheinPosition, GespeichertesDokument } from '../../types/bestellabwicklung';
import { generiereLieferscheinPDF } from '../../services/dokumentService';
import { generiereNaechsteDokumentnummer } from '../../services/nummerierungService';
import {
  ladeDokumentNachTyp,
  speichereLieferschein,
  aktualisereLieferschein,
  ladeDokumentDaten,
  getFileDownloadUrl,
  speichereEntwurf,
  ladeEntwurf
} from '../../services/bestellabwicklungDokumentService';
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
  
  // Dokument-Status
  const [gespeichertesDokument, setGespeichertesDokument] = useState<GespeichertesDokument | null>(null);
  const [istBearbeitungsModus, setIstBearbeitungsModus] = useState(false);
  const [ladeStatus, setLadeStatus] = useState<'laden' | 'bereit' | 'speichern' | 'fehler'>('laden');
  const [statusMeldung, setStatusMeldung] = useState<{ typ: 'erfolg' | 'fehler'; text: string } | null>(null);
  
  // Auto-Save Status
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
        
        // Erst prüfen ob ein finalisiertes Dokument existiert
        const dokument = await ladeDokumentNachTyp(projekt.$id, 'lieferschein');
        
        if (dokument) {
          setGespeichertesDokument(dokument);
          // Lade gespeicherte Daten für Bearbeitung
          const gespeicherteDaten = ladeDokumentDaten<LieferscheinDaten>(dokument);
          if (gespeicherteDaten) {
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setLieferscheinDaten({
              ...gespeicherteDaten,
              kundennummer: gespeicherteDaten.kundennummer || projekt?.kundennummer,
              kundenname: gespeicherteDaten.kundenname || projekt?.kundenname || '',
              kundenstrasse: gespeicherteDaten.kundenstrasse || projekt?.kundenstrasse || '',
              kundenPlzOrt: gespeicherteDaten.kundenPlzOrt || projekt?.kundenPlzOrt || '',
            });
          }
          setAutoSaveStatus('gespeichert');
        } else {
          // Kein finalisiertes Dokument - versuche Entwurf zu laden
          const entwurf = await ladeEntwurf<LieferscheinDaten>(projekt.$id, 'lieferscheinDaten');
          if (entwurf) {
            // Ergänze fehlende Projekt-Daten (z.B. Kundennummer)
            setLieferscheinDaten({
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

  // Auto-Save mit Debounce
  const speichereAutomatisch = useCallback(async (daten: LieferscheinDaten) => {
    if (!projekt?.$id || initialLaden.current || gespeichertesDokument) return;
    
    try {
      setAutoSaveStatus('speichern');
      await speichereEntwurf(projekt.$id, 'lieferscheinDaten', daten);
      setAutoSaveStatus('gespeichert');
    } catch (error) {
      console.error('Auto-Save Fehler:', error);
      setAutoSaveStatus('fehler');
    }
  }, [projekt?.$id, gespeichertesDokument]);

  // Debounced Auto-Save bei Änderungen
  useEffect(() => {
    if (initialLaden.current || !hatGeaendert.current || gespeichertesDokument) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      speichereAutomatisch(lieferscheinDaten);
    }, 1500);
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [lieferscheinDaten, speichereAutomatisch, gespeichertesDokument]);

  // Lieferscheinnummer generieren (nur wenn noch keine vorhanden ist)
  useEffect(() => {
    const generiereNummer = async () => {
      if (!lieferscheinDaten.lieferscheinnummer && !projekt?.lieferscheinnummer && !gespeichertesDokument) {
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
  }, [gespeichertesDokument]);
  
  // Wenn Projekt oder Kundendaten übergeben wurden, fülle das Formular vor
  useEffect(() => {
    const ladeDaten = async () => {
      // Nicht überschreiben wenn bereits ein Dokument geladen wurde
      if (gespeichertesDokument) return;
      
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
        }));
      }
    };
    ladeDaten();
  }, [projekt, kundeInfo, gespeichertesDokument]);

  const handleInputChange = (field: keyof LieferscheinDaten, value: any) => {
    hatGeaendert.current = true;
    setLieferscheinDaten(prev => ({ ...prev, [field]: value }));
  };

  const handlePositionChange = (index: number, field: keyof LieferscheinPosition, value: any) => {
    hatGeaendert.current = true;
    const neuePositionen = [...lieferscheinDaten.positionen];
    neuePositionen[index] = {
      ...neuePositionen[index],
      [field]: value
    };
    
    setLieferscheinDaten(prev => ({ ...prev, positionen: neuePositionen }));
  };

  const addPosition = () => {
    hatGeaendert.current = true;
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
    hatGeaendert.current = true;
    setLieferscheinDaten(prev => ({
      ...prev,
      positionen: prev.positionen.filter((_, i) => i !== index)
    }));
  };

  // Nur PDF generieren und herunterladen (ohne Speicherung)
  const generiereUndLadeLieferschein = async () => {
    try {
      console.log('Generiere Lieferschein (nur Download)...', lieferscheinDaten);
      const pdf = await generiereLieferscheinPDF(lieferscheinDaten);
      pdf.save(`Lieferschein_${lieferscheinDaten.lieferscheinnummer}.pdf`);
      console.log('Lieferschein erfolgreich generiert!');
    } catch (error) {
      console.error('Fehler beim Generieren des Lieferscheins:', error);
      alert('Fehler beim Generieren des Lieferscheins: ' + (error as Error).message);
    }
  };

  // Speichern in Appwrite
  const speichereUndHinterlegeLieferschein = async () => {
    if (!projekt?.$id) {
      setStatusMeldung({ typ: 'fehler', text: 'Kein Projekt ausgewählt. Bitte wählen Sie zuerst ein Projekt aus.' });
      return;
    }
    
    try {
      setLadeStatus('speichern');
      setStatusMeldung(null);
      
      let neuesDokument: GespeichertesDokument;
      
      if (gespeichertesDokument && istBearbeitungsModus) {
        // Aktualisieren
        neuesDokument = await aktualisereLieferschein(
          gespeichertesDokument.$id!,
          gespeichertesDokument.dateiId,
          lieferscheinDaten
        );
        setStatusMeldung({ typ: 'erfolg', text: 'Lieferschein erfolgreich aktualisiert!' });
      } else {
        // Neu erstellen
        neuesDokument = await speichereLieferschein(projekt.$id, lieferscheinDaten);
        setStatusMeldung({ typ: 'erfolg', text: 'Lieferschein erfolgreich gespeichert und hinterlegt!' });
      }
      
      setGespeichertesDokument(neuesDokument);
      setIstBearbeitungsModus(false);
      setLadeStatus('bereit');
      
      // Status-Meldung nach 5 Sekunden ausblenden
      setTimeout(() => setStatusMeldung(null), 5000);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      setStatusMeldung({ typ: 'fehler', text: 'Fehler beim Speichern: ' + (error as Error).message });
      setLadeStatus('fehler');
    }
  };

  // Zeige Lade-Indikator
  if (ladeStatus === 'laden') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        <span className="ml-3 text-gray-600">Lade Dokument...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Linke Spalte - Formular */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* STATUS-BANNER: Bereits hinterlegtes Dokument */}
        {gespeichertesDokument && !istBearbeitungsModus && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <FileCheck className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-800">Lieferschein hinterlegt</h3>
                <p className="text-sm text-green-700 mt-1">
                  <strong>{gespeichertesDokument.dokumentNummer}</strong> wurde am{' '}
                  {gespeichertesDokument.$createdAt && new Date(gespeichertesDokument.$createdAt).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} gespeichert.
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <a
                    href={getFileDownloadUrl(gespeichertesDokument.dateiId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    PDF herunterladen
                  </a>
                  <button
                    onClick={() => setIstBearbeitungsModus(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium"
                  >
                    <Edit3 className="h-4 w-4" />
                    Bearbeiten & neu speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bearbeitungs-Hinweis */}
        {istBearbeitungsModus && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Edit3 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Bearbeitungsmodus aktiv</p>
                <p className="text-xs text-amber-700">Änderungen werden nach dem Speichern den bestehenden Lieferschein ersetzen.</p>
              </div>
              <button
                onClick={() => {
                  setIstBearbeitungsModus(false);
                  // Originaldaten wiederherstellen
                  if (gespeichertesDokument) {
                    const gespeicherteDaten = ladeDokumentDaten<LieferscheinDaten>(gespeichertesDokument);
                    if (gespeicherteDaten) {
                      setLieferscheinDaten(gespeicherteDaten);
                    }
                  }
                }}
                className="ml-auto text-sm text-amber-700 hover:text-amber-900 underline"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Status-Meldung */}
        {statusMeldung && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            statusMeldung.typ === 'erfolg'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {statusMeldung.typ === 'erfolg' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            )}
            <p className={`text-sm ${statusMeldung.typ === 'erfolg' ? 'text-green-800' : 'text-red-800'}`}>
              {statusMeldung.text}
            </p>
          </div>
        )}

        {/* Auto-Save Status (nur wenn noch kein Dokument hinterlegt) */}
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
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieferdatum</label>
              <input
                type="date"
                value={lieferscheinDaten.lieferdatum}
                onChange={(e) => handleInputChange('lieferdatum', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bestellnummer (optional)</label>
              <input
                type="text"
                value={lieferscheinDaten.bestellnummer || ''}
                onChange={(e) => handleInputChange('bestellnummer', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. K-2024-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projektnummer (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.projektnummer || ''}
                  onChange={(e) => handleInputChange('projektnummer', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. P-2024-042"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ihr Ansprechpartner (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.ihreAnsprechpartner || ''}
                  onChange={(e) => handleInputChange('ihreAnsprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Stefan Egner"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner beim Kunden (optional)</label>
                <input
                  type="text"
                  value={lieferscheinDaten.ansprechpartner || ''}
                  onChange={(e) => handleInputChange('ansprechpartner', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenname}
                onChange={(e) => handleInputChange('kundenname', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenstrasse}
                onChange={(e) => handleInputChange('kundenstrasse', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
              <input
                type="text"
                value={lieferscheinDaten.kundenPlzOrt}
                onChange={(e) => handleInputChange('kundenPlzOrt', e.target.value)}
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
                disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:opacity-50"
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
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadresseStrasse || ''}
                  onChange={(e) => handleInputChange('lieferadresseStrasse', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={lieferscheinDaten.lieferadressePlzOrt || ''}
                  onChange={(e) => handleInputChange('lieferadressePlzOrt', e.target.value)}
                  disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
            {(!gespeichertesDokument || istBearbeitungsModus) && (
              <button
                onClick={addPosition}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Position hinzufügen
              </button>
            )}
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
                        disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Menge</label>
                      <input
                        type="number"
                        value={position.menge}
                        onChange={(e) => handlePositionChange(index, 'menge', parseFloat(e.target.value) || 0)}
                        disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label>
                      <input
                        type="text"
                        value={position.einheit}
                        onChange={(e) => handlePositionChange(index, 'einheit', e.target.value)}
                        disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Chargennr. (optional)</label>
                      <input
                        type="text"
                        value={position.chargennummer || ''}
                        onChange={(e) => handlePositionChange(index, 'chargennummer', e.target.value)}
                        disabled={!!gespeichertesDokument && !istBearbeitungsModus}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                  
                  {(!gespeichertesDokument || istBearbeitungsModus) && (
                    <button
                      onClick={() => removePosition(index)}
                      className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
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
            disabled={!!gespeichertesDokument && !istBearbeitungsModus}
            rows={3}
            placeholder="z.B. Hinweise zur Lieferung oder Empfangsbestätigung"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
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
          
          {/* Buttons basierend auf Status */}
          <div className="mt-6 space-y-3">
            {/* Immer verfügbar: Nur PDF generieren */}
            <button
              onClick={generiereUndLadeLieferschein}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-green-700 border-2 border-green-300 rounded-lg hover:bg-green-50 transition-all"
            >
              <Download className="h-5 w-5" />
              Nur PDF herunterladen
            </button>
            
            {/* Haupt-Aktion basierend auf Status */}
            {(!gespeichertesDokument || istBearbeitungsModus) && projekt?.$id && (
              <button
                onClick={speichereUndHinterlegeLieferschein}
                disabled={ladeStatus === 'speichern'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ladeStatus === 'speichern' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-5 w-5" />
                    {istBearbeitungsModus ? 'Änderungen speichern' : 'Lieferschein speichern & hinterlegen'}
                  </>
                )}
              </button>
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

export default LieferscheinTab;
