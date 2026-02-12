/**
 * PlatzbauerLieferscheinTab
 *
 * Lieferschein-Tab für Platzbauer-Projektabwicklung.
 * Zeigt alle Vereine und ermöglicht einzelne Lieferschein-Erstellung.
 *
 * Features:
 * - Liste aller Vereine aus AB/Angebot
 * - Status pro Verein (erstellt/nicht erstellt)
 * - Einzelerstellung pro Verein
 * - PDF-Download
 */

import { useState, useEffect } from 'react';
import {
  Truck,
  Loader2,
  AlertCircle,
  FileCheck,
  Download,
  Eye,
  Calendar,
  MapPin,
  Package,
} from 'lucide-react';
import { PlatzbauerProjekt, PlatzbauerPosition, PlatzbauerLieferscheinFormularDaten, GespeicherterPlatzbauerLieferschein } from '../../types/platzbauer';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  speicherePlatzbauerLieferschein,
  ladeAktuellesDokument,
  ladeLieferscheineFuerProjekt,
} from '../../services/platzbauerprojektabwicklungDokumentService';
import { APPWRITE_ENDPOINT, PROJECT_ID, PLATZBAUER_DATEIEN_BUCKET_ID } from '../../config/appwrite';

interface PlatzbauerLieferscheinTabProps {
  projekt: PlatzbauerProjekt;
  platzbauer: SaisonKunde | null;
}

interface VereinMitLieferschein {
  position: PlatzbauerPosition;
  lieferschein: GespeicherterPlatzbauerLieferschein | null;
}

const PlatzbauerLieferscheinTab = ({ projekt, platzbauer }: PlatzbauerLieferscheinTabProps) => {
  // === STATE ===
  const [vereineListe, setVereineListe] = useState<VereinMitLieferschein[]>([]);
  const [laden, setLaden] = useState(true);
  const [erstellenFuer, setErstellenFuer] = useState<string | null>(null);
  const [lieferdatum, setLieferdatum] = useState<Record<string, string>>({});

  // === DATEN LADEN ===
  useEffect(() => {
    const ladeDaten = async () => {
      if (!projekt?.id) return;

      setLaden(true);
      try {
        // Positionen aus AB oder Angebot laden
        let positionen: PlatzbauerPosition[] = [];

        // Erst AB prüfen
        const ab = await ladeAktuellesDokument(projekt.id, 'auftragsbestaetigung');
        if (ab && ab.daten) {
          let abDaten: any;
          try {
            abDaten = typeof ab.daten === 'string' ? JSON.parse(ab.daten) : ab.daten;
          } catch {
            abDaten = {};
          }
          if (abDaten.positionen && abDaten.positionen.length > 0) {
            positionen = abDaten.positionen;
          }
        }

        // Falls keine AB, dann Angebot
        if (positionen.length === 0) {
          const angebot = await ladeAktuellesDokument(projekt.id, 'angebot');
          if (angebot && angebot.daten) {
            let angebotDaten: any;
            try {
              angebotDaten = typeof angebot.daten === 'string' ? JSON.parse(angebot.daten) : angebot.daten;
            } catch {
              angebotDaten = {};
            }
            if (angebotDaten.positionen && angebotDaten.positionen.length > 0) {
              positionen = angebotDaten.positionen;
            }
          }
        }

        // Bestehende Lieferscheine laden
        const lieferscheine = await ladeLieferscheineFuerProjekt(projekt.id);

        // Vereine mit Lieferschein-Status zusammenführen
        const vereineMitStatus: VereinMitLieferschein[] = positionen.map(pos => {
          const ls = lieferscheine.find(l => l.vereinId === pos.vereinId);
          return {
            position: pos,
            lieferschein: ls || null,
          };
        });

        setVereineListe(vereineMitStatus);

        // Standard-Lieferdatum initialisieren
        const heute = new Date().toISOString().split('T')[0];
        const initialDaten: Record<string, string> = {};
        vereineMitStatus.forEach(v => {
          initialDaten[v.position.vereinId] = heute;
        });
        setLieferdatum(initialDaten);
      } catch (error) {
        console.error('Fehler beim Laden:', error);
      } finally {
        setLaden(false);
      }
    };

    ladeDaten();
  }, [projekt?.id]);

  // === LIEFERSCHEIN ERSTELLEN ===
  const handleLieferscheinErstellen = async (verein: VereinMitLieferschein) => {
    if (!platzbauer) {
      alert('Platzbauer-Daten fehlen.');
      return;
    }

    setErstellenFuer(verein.position.vereinId);
    try {
      const formularDaten: PlatzbauerLieferscheinFormularDaten = {
        vereinId: verein.position.vereinId,
        vereinsname: verein.position.vereinsname,
        vereinsstrasse: verein.position.lieferadresse?.strasse || '',
        vereinsPlzOrt: verein.position.lieferadresse
          ? `${verein.position.lieferadresse.plz} ${verein.position.lieferadresse.ort}`
          : '',
        vereinsAnsprechpartner: '',
        lieferadresseAbweichend: false,
        lieferscheinnummer: '',
        lieferdatum: lieferdatum[verein.position.vereinId] || new Date().toISOString().split('T')[0],
        menge: verein.position.menge,
        einheit: 't',
        platzbauername: platzbauer.name,
        bemerkung: '',
        unterschriftenFuerEmpfangsbestaetigung: true,
        ihreAnsprechpartner: '',
      };

      const neuerLieferschein = await speicherePlatzbauerLieferschein(projekt, verein.position, formularDaten);

      // Liste aktualisieren
      setVereineListe(prev =>
        prev.map(v =>
          v.position.vereinId === verein.position.vereinId
            ? { ...v, lieferschein: neuerLieferschein }
            : v
        )
      );

      // PDF öffnen
      const viewUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${PLATZBAUER_DATEIEN_BUCKET_ID}/files/${neuerLieferschein.dateiId}/view?project=${PROJECT_ID}`;
      window.open(viewUrl, '_blank');
    } catch (error: any) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setErstellenFuer(null);
    }
  };

  // === RENDER ===
  if (laden) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Lade Lieferschein-Daten...</p>
      </div>
    );
  }

  if (vereineListe.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Keine Positionen vorhanden</h3>
        <p className="text-gray-500 dark:text-gray-400">
          Bitte erstellen Sie zuerst ein Angebot oder eine Auftragsbestätigung.
        </p>
      </div>
    );
  }

  const erstelltCount = vereineListe.filter(v => v.lieferschein).length;
  const offenCount = vereineListe.length - erstelltCount;

  return (
    <div className="space-y-6">
      {/* Übersicht */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-green-500" />
            Lieferscheine
          </h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-600 dark:text-green-400 font-medium">
              {erstelltCount} erstellt
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {offenCount} offen
            </span>
          </div>
        </div>
      </div>

      {/* Vereine Liste */}
      <div className="space-y-4">
        {vereineListe.map((verein) => {
          const istErstellt = !!verein.lieferschein;
          const istInArbeit = erstellenFuer === verein.position.vereinId;

          return (
            <div
              key={verein.position.vereinId}
              className={`bg-white dark:bg-slate-900 rounded-xl p-5 border ${
                istErstellt
                  ? 'border-green-200 dark:border-green-800'
                  : 'border-gray-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                {/* Verein-Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {istErstellt ? (
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <FileCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {verein.position.vereinsname}
                      </h4>
                      {verein.position.lieferadresse && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {verein.position.lieferadresse.plz} {verein.position.lieferadresse.ort}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 ml-11">
                    <span className="font-medium">{verein.position.menge.toFixed(1)} t</span>
                    {istErstellt && verein.lieferschein && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-green-600 dark:text-green-400">
                          {verein.lieferschein.lieferscheinnummer}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span>{new Date(verein.lieferschein.lieferdatum).toLocaleDateString('de-DE')}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Aktionen */}
                <div className="flex items-center gap-3">
                  {istErstellt && verein.lieferschein ? (
                    <>
                      <a
                        href={`${APPWRITE_ENDPOINT}/storage/buckets/${PLATZBAUER_DATEIEN_BUCKET_ID}/files/${verein.lieferschein.dateiId}/view?project=${PROJECT_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                      >
                        <Eye className="w-4 h-4" />
                        Anzeigen
                      </a>
                      <a
                        href={`${APPWRITE_ENDPOINT}/storage/buckets/${PLATZBAUER_DATEIEN_BUCKET_ID}/files/${verein.lieferschein.dateiId}/download?project=${PROJECT_ID}`}
                        className="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <input
                          type="date"
                          value={lieferdatum[verein.position.vereinId] || ''}
                          onChange={(e) =>
                            setLieferdatum(prev => ({
                              ...prev,
                              [verein.position.vereinId]: e.target.value,
                            }))
                          }
                          className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <button
                        onClick={() => handleLieferscheinErstellen(verein)}
                        disabled={istInArbeit}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                      >
                        {istInArbeit ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Erstelle...
                          </>
                        ) : (
                          <>
                            <Truck className="w-4 h-4" />
                            Lieferschein erstellen
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Zusammenfassung */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-green-900 dark:text-green-200">Fortschritt</h4>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              {erstelltCount} von {vereineListe.length} Lieferscheinen erstellt
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-green-700 dark:text-green-400">Gesamtmenge</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-200">
              {vereineListe.reduce((sum, v) => sum + v.position.menge, 0).toFixed(1)} t
            </p>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="mt-4">
          <div className="h-2 bg-green-200 dark:bg-green-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${(erstelltCount / vereineListe.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatzbauerLieferscheinTab;
