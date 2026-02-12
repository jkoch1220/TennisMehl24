/**
 * InstandsetzungsauftragFormular - Formular zum Erstellen eines Sammelauftrags
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  FileText,
  Calendar,
  CheckSquare,
  Square,
  Eye,
  ExternalLink,
  User,
  Phone,
} from 'lucide-react';
import { SaisonKunde } from '../../types/saisonplanung';
import {
  InstandsetzungsPosition,
  NeuerInstandsetzungsauftrag,
} from '../../types/instandsetzungsauftrag';
import {
  instandsetzungsauftragService,
  InstandsetzungsVereinMitProjekt,
} from '../../services/instandsetzungsauftragService';
import {
  generiereInstandsetzungsauftragPDFPreview,
  InstandsetzungsauftragPdfDaten,
} from '../../services/instandsetzungsauftragPdfService';

interface InstandsetzungsauftragFormularProps {
  platzbauerId: string;
  platzbauerName: string;
  saisonjahr: number;
  vereine: InstandsetzungsVereinMitProjekt[];
  onSave: () => void;
  onCancel: () => void;
  onProjektOeffnen?: (projektId: string) => void;
}

interface VereinAuswahl {
  vereinId: string;
  kunde: SaisonKunde;
  projektId?: string;
  projektNummer?: string;
  // Dispo-Ansprechpartner aus dem Projekt (z.B. Platzwart)
  dispoAnsprechpartner?: {
    name: string;
    telefon: string;
  };
  ausgewaehlt: boolean;
  dienst: string;
  anzahlPlaetze: number;
  gewuenschterTermin: string;
}

const InstandsetzungsauftragFormular = ({
  platzbauerId,
  platzbauerName,
  saisonjahr,
  vereine,
  onSave,
  onCancel,
  onProjektOeffnen,
}: InstandsetzungsauftragFormularProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dienste, setDienste] = useState<string[]>(['Frühjahrs-Instandsetzung']);

  // Vereine mit Auswahl-State
  const [vereineAuswahl, setVereineAuswahl] = useState<VereinAuswahl[]>([]);

  // Dienste laden
  useEffect(() => {
    const loadDienste = async () => {
      const loadedDienste = await instandsetzungsauftragService.loadInstandsetzungsDienste();
      setDienste(loadedDienste);
    };
    loadDienste();
  }, []);

  // Vereine initialisieren - inkl. Projekt-Info und Dispo-Ansprechpartner (wie in Dispo-Planung)
  useEffect(() => {
    setVereineAuswahl(
      vereine.map(({ kunde, projekt, aktuelleSaison }) => ({
        vereinId: kunde.id,
        kunde,
        projektId: projekt?.$id || projekt?.id,
        projektNummer: projekt?.angebotsnummer || projekt?.auftragsbestaetigungsnummer,
        // Dispo-Ansprechpartner: erst Projekt, dann Kunde (wie in Dispo-Planung)
        dispoAnsprechpartner: projekt?.dispoAnsprechpartner || kunde.dispoAnsprechpartner,
        ausgewaehlt: true, // Standardmäßig alle ausgewählt
        dienst: dienste[0] || 'Frühjahrs-Instandsetzung',
        anzahlPlaetze: aktuelleSaison?.anzahlPlaetze || 1, // Aus Saisondaten
        gewuenschterTermin: '',
      }))
    );
  }, [vereine, dienste]);

  // Alle auswählen / abwählen
  const toggleAlleAusgewaehlt = () => {
    const alleAusgewaehlt = vereineAuswahl.every(v => v.ausgewaehlt);
    setVereineAuswahl(
      vereineAuswahl.map(v => ({ ...v, ausgewaehlt: !alleAusgewaehlt }))
    );
  };

  // Einzelnen Verein auswählen
  const toggleVereinAuswahl = (vereinId: string) => {
    setVereineAuswahl(
      vereineAuswahl.map(v =>
        v.vereinId === vereinId ? { ...v, ausgewaehlt: !v.ausgewaehlt } : v
      )
    );
  };

  // Verein-Daten aktualisieren
  const updateVerein = (vereinId: string, updates: Partial<VereinAuswahl>) => {
    setVereineAuswahl(
      vereineAuswahl.map(v =>
        v.vereinId === vereinId ? { ...v, ...updates } : v
      )
    );
  };

  // Ausgewählte Vereine
  const ausgewaehlteVereine = vereineAuswahl.filter(v => v.ausgewaehlt);

  // Vorschau anzeigen
  const handlePreview = async () => {
    if (ausgewaehlteVereine.length === 0) {
      setError('Bitte wählen Sie mindestens einen Verein aus');
      return;
    }

    const positionen: InstandsetzungsPosition[] = ausgewaehlteVereine.map(v => ({
      vereinId: v.vereinId,
      vereinName: v.kunde.name,
      adresse: v.kunde.lieferadresse || v.kunde.rechnungsadresse || {
        strasse: '',
        plz: '',
        ort: '',
      },
      anzahlPlaetze: v.anzahlPlaetze,
      dienst: v.dienst,
      gewuenschterTermin: v.gewuenschterTermin || undefined,
      projektId: v.projektId,
      // Dispo-Ansprechpartner aus dem Projekt
      ansprechpartner: v.dispoAnsprechpartner ? {
        name: v.dispoAnsprechpartner.name,
        telefon: v.dispoAnsprechpartner.telefon,
      } : undefined,
    }));

    const pdfDaten: InstandsetzungsauftragPdfDaten = {
      auftrag: {
        id: 'preview',
        platzbauerId,
        platzbauerName,
        saisonjahr,
        auftragsnummer: 'IA-VORSCHAU',
        status: 'erstellt',
        positionen,
        erstelltAm: new Date().toISOString(),
      },
      platzbauername: platzbauerName,
      platzbauerstrasse: '', // Wird aus Platzbauer-Daten geladen
      platzbauerPlzOrt: '',
    };

    await generiereInstandsetzungsauftragPDFPreview(pdfDaten);
  };

  // Speichern
  const handleSave = async () => {
    if (ausgewaehlteVereine.length === 0) {
      setError('Bitte wählen Sie mindestens einen Verein aus');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const positionen: InstandsetzungsPosition[] = ausgewaehlteVereine.map(v => ({
        vereinId: v.vereinId,
        vereinName: v.kunde.name,
        adresse: v.kunde.lieferadresse || v.kunde.rechnungsadresse || {
          strasse: '',
          plz: '',
          ort: '',
        },
        anzahlPlaetze: v.anzahlPlaetze,
        dienst: v.dienst,
        gewuenschterTermin: v.gewuenschterTermin || undefined,
        projektId: v.projektId,
        // Dispo-Ansprechpartner aus dem Projekt
        ansprechpartner: v.dispoAnsprechpartner ? {
          name: v.dispoAnsprechpartner.name,
          telefon: v.dispoAnsprechpartner.telefon,
        } : undefined,
      }));

      const neuerAuftrag: NeuerInstandsetzungsauftrag = {
        platzbauerId,
        platzbauerName,
        saisonjahr,
        auftragsnummer: '', // Wird automatisch generiert
        status: 'erstellt',
        positionen,
      };

      await instandsetzungsauftragService.createAuftrag(neuerAuftrag);
      onSave();
    } catch (err: any) {
      console.error('Fehler beim Speichern:', err);
      setError(err.message || 'Fehler beim Speichern des Auftrags');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Neuer Sammelauftrag
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {platzbauerName} - Saison {saisonjahr}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
          >
            <Eye className="w-4 h-4" />
            Vorschau
          </button>
          <button
            onClick={handleSave}
            disabled={loading || ausgewaehlteVereine.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Fehler */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Info */}
      <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <FileText className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{ausgewaehlteVereine.length}</strong> von {vereineAuswahl.length} Vereinen ausgewählt
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Die ausgewählten Vereine werden im Sammelauftrag an den Platzbauer aufgeführt.
          </p>
        </div>
      </div>

      {/* Vereine-Tabelle */}
      <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-bg">
            <tr className="text-left text-sm font-medium text-gray-500 dark:text-gray-400">
              <th className="p-3 w-10">
                <button
                  onClick={toggleAlleAusgewaehlt}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded"
                >
                  {vereineAuswahl.every(v => v.ausgewaehlt) ? (
                    <CheckSquare className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="p-3">Verein</th>
              <th className="p-3">Ort</th>
              <th className="p-3">Projekt</th>
              <th className="p-3 w-24">Plätze</th>
              <th className="p-3">Dienst</th>
              <th className="p-3 w-40">Termin</th>
              <th className="p-3">Ansprechpartner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {vereineAuswahl.map(v => {
              const adresse = v.kunde.lieferadresse || v.kunde.rechnungsadresse;

              return (
                <tr
                  key={v.vereinId}
                  className={`${
                    v.ausgewaehlt
                      ? 'bg-amber-50/50 dark:bg-amber-900/10'
                      : 'bg-white dark:bg-dark-surface'
                  }`}
                >
                  <td className="p-3">
                    <button
                      onClick={() => toggleVereinAuswahl(v.vereinId)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded"
                    >
                      {v.ausgewaehlt ? (
                        <CheckSquare className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {v.kunde.name}
                    </div>
                    {v.kunde.kundennummer && (
                      <div className="text-xs text-gray-400">
                        #{v.kunde.kundennummer}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                    {adresse ? (
                      <div>
                        {adresse.strasse && <div>{adresse.strasse}</div>}
                        <div>{adresse.plz} {adresse.ort}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-3">
                    {v.projektId && onProjektOeffnen ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjektOeffnen(v.projektId!);
                        }}
                        className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[100px]">
                          {v.projektNummer || 'Projekt'}
                        </span>
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={1}
                      value={v.anzahlPlaetze}
                      onChange={e =>
                        updateVerein(v.vereinId, {
                          anzahlPlaetze: parseInt(e.target.value) || 1,
                        })
                      }
                      disabled={!v.ausgewaehlt}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-dark-border rounded text-center disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-dark-bg"
                    />
                  </td>
                  <td className="p-3">
                    <select
                      value={v.dienst}
                      onChange={e =>
                        updateVerein(v.vereinId, { dienst: e.target.value })
                      }
                      disabled={!v.ausgewaehlt}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border rounded disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-dark-bg"
                    >
                      {dienste.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      value={v.gewuenschterTermin}
                      onChange={e =>
                        updateVerein(v.vereinId, {
                          gewuenschterTermin: e.target.value,
                        })
                      }
                      disabled={!v.ausgewaehlt}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border rounded disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-dark-bg"
                    />
                  </td>
                  <td className="p-3">
                    {v.dispoAnsprechpartner ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 font-medium text-gray-900 dark:text-white text-sm">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {v.dispoAnsprechpartner.name}
                        </div>
                        {v.dispoAnsprechpartner.telefon && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Phone className="w-3 h-3" />
                            {v.dispoAnsprechpartner.telefon}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        Kein Dispo-AP
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legende */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>
          <Calendar className="w-3 h-3 inline mr-1" />
          Termin: Gewünschter Instandsetzungstermin (optional, wird im PDF angezeigt)
        </p>
      </div>
    </div>
  );
};

export default InstandsetzungsauftragFormular;
