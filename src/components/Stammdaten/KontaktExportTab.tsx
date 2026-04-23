import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Smartphone, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { saisonplanungService } from '../../services/saisonplanungService';
import {
  downloadVCard,
  generiereVCardExport,
  type VCardExportStats,
} from '../../utils/vcardExport';
import type { Ansprechpartner, SaisonKunde, SaisonKundeMitDaten } from '../../types/saisonplanung';

type TypFilter = 'alle' | 'verein' | 'platzbauer';

const KontaktExportTab = () => {
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState<string>('');
  const [kunden, setKunden] = useState<SaisonKunde[]>([]);
  const [ansprechpartnerMap, setAnsprechpartnerMap] = useState<Map<string, Ansprechpartner[]>>(new Map());

  const [typFilter, setTypFilter] = useState<TypFilter>('alle');
  const [nurAktiveAnsprechpartner, setNurAktiveAnsprechpartner] = useState(true);
  const [includeKundenOhneAnsprechpartner, setIncludeKundenOhneAnsprechpartner] = useState(true);

  const [letzterExport, setLetzterExport] = useState<VCardExportStats | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFehler('');
    try {
      const [alleKunden, alleAP] = await Promise.all([
        saisonplanungService.loadAlleKunden(),
        saisonplanungService.loadAlleAnsprechpartner(),
      ]);
      setKunden(alleKunden);
      setAnsprechpartnerMap(alleAP);
    } catch (err) {
      console.error('Fehler beim Laden der Kontaktdaten:', err);
      setFehler('Die Kontaktdaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const kundenMitDaten: SaisonKundeMitDaten[] = useMemo(
    () =>
      kunden.map((kunde) => ({
        kunde,
        ansprechpartner: ansprechpartnerMap.get(kunde.id) ?? [],
        saisonHistorie: [],
        aktivitaeten: [],
      })),
    [kunden, ansprechpartnerMap],
  );

  const vorschau = useMemo(() => {
    const relevante = kundenMitDaten.filter(({ kunde }) => {
      if (!kunde.aktiv) return false;
      if (typFilter === 'alle') return true;
      return kunde.typ === typFilter;
    });

    let kontakteSichtbar = 0;
    let clubsOhneAp = 0;
    for (const { kunde, ansprechpartner } of relevante) {
      const aktive = nurAktiveAnsprechpartner ? ansprechpartner.filter((a) => a.aktiv) : ansprechpartner;
      kontakteSichtbar += aktive.filter((a) => a.name?.trim()).length;
      if (aktive.length === 0 && (kunde.email?.trim() || kunde.dispoAnsprechpartner?.telefon?.trim())) {
        clubsOhneAp += 1;
      }
    }

    return {
      clubsGesamt: relevante.length,
      kontakte: kontakteSichtbar,
      clubsOhneAp,
    };
  }, [kundenMitDaten, typFilter, nurAktiveAnsprechpartner]);

  const exportieren = () => {
    const { vcf, stats } = generiereVCardExport(kundenMitDaten, {
      typFilter,
      nurAktiveAnsprechpartner,
      includeKundenOhneAnsprechpartner,
    });

    if (stats.vcardsErstellt === 0) {
      setFehler('Für die gewählten Filter gibt es keine exportierbaren Kontakte.');
      return;
    }
    setFehler('');
    downloadVCard(vcf);
    setLetzterExport(stats);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-teal-600 to-cyan-600 rounded-lg">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text">Kontakt-Export</h2>
            <p className="text-gray-600 dark:text-dark-textMuted">
              Exportiert alle Vereinskontakte als vCard-Datei (.vcf) für iPhone, Android oder Mac
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-dark-surface rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">Aktive Kunden</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-dark-text">
              {kunden.filter((k) => k.aktiv).length}
            </p>
          </div>
          <div className="bg-white dark:bg-dark-surface rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">In Auswahl</p>
            <p className="text-3xl font-bold text-teal-600">{vorschau.clubsGesamt}</p>
          </div>
          <div className="bg-white dark:bg-dark-surface rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-600 dark:text-dark-textMuted">Ansprechpartner</p>
            <p className="text-3xl font-bold text-cyan-600">{vorschau.kontakte}</p>
          </div>
        </div>
      </div>

      {/* Filter & Aktion */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text mb-4">Export-Einstellungen</h3>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-textMuted mb-2">
              Welche Kunden sollen exportiert werden?
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'alle', label: 'Alle' },
                  { id: 'verein', label: 'Nur Vereine' },
                  { id: 'platzbauer', label: 'Nur Platzbauer' },
                ] as { id: TypFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTypFilter(opt.id)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    typFilter === opt.id
                      ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-transparent'
                      : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-textMuted border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={nurAktiveAnsprechpartner}
              onChange={(e) => setNurAktiveAnsprechpartner(e.target.checked)}
              className="mt-1 w-4 h-4 text-teal-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-dark-textMuted">
              <span className="font-medium text-gray-900 dark:text-dark-text">Nur aktive Ansprechpartner exportieren</span>
              <br />
              Inaktive Ansprechpartner werden übersprungen.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeKundenOhneAnsprechpartner}
              onChange={(e) => setIncludeKundenOhneAnsprechpartner(e.target.checked)}
              className="mt-1 w-4 h-4 text-teal-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-dark-textMuted">
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Vereinsvisitenkarten für Kunden ohne Ansprechpartner
              </span>
              <br />
              Erzeugt einen Kontakteintrag mit dem Vereinsnamen, E-Mail und Dispo-Telefon ({vorschau.clubsOhneAp} Einträge).
            </span>
          </label>

          {fehler && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-900">{fehler}</p>
            </div>
          )}

          {letzterExport && !fehler && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-900">
                Export erstellt: <strong>{letzterExport.vcardsErstellt}</strong> Kontakte aus{' '}
                <strong>{letzterExport.kundenMitExport}</strong> Kunden. Öffne die .vcf-Datei am Handy, um
                alle Kontakte zu importieren.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportieren}
              disabled={loading || vorschau.clubsGesamt === 0}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                loading || vorschau.clubsGesamt === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700'
              }`}
            >
              <Download className="w-5 h-5" />
              vCard-Datei herunterladen
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-dark-textMuted hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {/* Anleitung */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text">So importierst du die Kontakte</h3>
        </div>
        <ol className="list-decimal ml-5 space-y-2 text-sm text-gray-700 dark:text-dark-textMuted">
          <li>Klicke auf „vCard-Datei herunterladen". Deine Auswahl wird als .vcf-Datei gespeichert.</li>
          <li>
            <strong>iPhone:</strong> Datei per AirDrop oder E-Mail ans Handy senden, dann öffnen und
            „Alle X Kontakte hinzufügen" tippen.
          </li>
          <li>
            <strong>Android:</strong> Datei auf das Handy kopieren, mit „Kontakte" öffnen und importieren –
            oder in <em>contacts.google.com</em> → „Importieren" hochladen (Sync auf alle Geräte).
          </li>
          <li>
            Die Kontakte sind über die Kategorie <em>Tennismehl</em> gruppiert und haben eine stabile
            UID — bei erneutem Import aktualisiert das Handy bestehende Einträge statt doppelt anzulegen.
          </li>
        </ol>
      </div>
    </div>
  );
};

export default KontaktExportTab;
