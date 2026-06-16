import { useRef, useState } from 'react';
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  MosaikImportBundle,
  MosaikKunde,
  MosaikAnsprechpartner,
  MosaikSubAdresse,
  MosaikAdressreferenz,
  MosaikBestellhistorie,
  MosaikZahlungsverhalten,
} from '../../types/mosaik';
import { ImportFortschritt, mosaikMigrationService } from '../../services/mosaikMigrationService';

interface Props {
  onImportFertig: () => void;
}

const ERWARTETE_DATEIEN: Array<{ name: string; key: keyof MosaikImportBundle; pflicht: boolean }> = [
  { name: 'kunden.json', key: 'kunden', pflicht: true },
  { name: 'ansprechpartner.json', key: 'ansprechpartner', pflicht: false },
  { name: 'sub_adressen.json', key: 'subAdressen', pflicht: false },
  { name: 'adressreferenzen.json', key: 'adressreferenzen', pflicht: false },
  { name: 'bestellhistorie.json', key: 'bestellhistorie', pflicht: false },
  { name: 'zahlungsverhalten.json', key: 'zahlungsverhalten', pflicht: false },
];

export default function MosaikImportPanel({ onImportFertig }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<Partial<MosaikImportBundle>>({});
  const [dateienGeladen, setDateienGeladen] = useState<Set<string>>(new Set());
  const [importLauft, setImportLauft] = useState(false);
  const [fortschritt, setFortschritt] = useState<ImportFortschritt | null>(null);

  async function dateiLesen(file: File): Promise<unknown> {
    const text = await file.text();
    return JSON.parse(text);
  }

  async function dateienAuswaehlen(files: FileList | null) {
    if (!files) return;
    const neuesBundle: Partial<MosaikImportBundle> = { ...bundle };
    const neuGeladen = new Set(dateienGeladen);
    let fehler = 0;

    for (const file of Array.from(files)) {
      const erwartet = ERWARTETE_DATEIEN.find((d) => d.name === file.name);
      if (!erwartet) {
        toast.warning(`Unbekannte Datei "${file.name}" wird ignoriert`);
        continue;
      }
      try {
        const inhalt = await dateiLesen(file);
        // Sehr defensive Type-Casts; die Struktur prüfen wir nicht streng,
        // weil das die Python-Export-Pipeline garantiert.
        switch (erwartet.key) {
          case 'kunden':
            neuesBundle.kunden = inhalt as MosaikKunde[];
            break;
          case 'ansprechpartner':
            neuesBundle.ansprechpartner = inhalt as Record<string, MosaikAnsprechpartner[]>;
            break;
          case 'subAdressen':
            neuesBundle.subAdressen = inhalt as MosaikSubAdresse[];
            break;
          case 'adressreferenzen':
            neuesBundle.adressreferenzen = inhalt as MosaikAdressreferenz[];
            break;
          case 'bestellhistorie':
            neuesBundle.bestellhistorie = inhalt as Record<string, MosaikBestellhistorie>;
            break;
          case 'zahlungsverhalten':
            neuesBundle.zahlungsverhalten = inhalt as Record<string, MosaikZahlungsverhalten>;
            break;
        }
        neuGeladen.add(file.name);
      } catch (error) {
        console.error(error);
        toast.error(`Konnte ${file.name} nicht lesen — gültiges JSON?`);
        fehler++;
      }
    }

    setBundle(neuesBundle);
    setDateienGeladen(neuGeladen);
    if (fehler === 0) toast.success(`${files.length} Datei(en) geladen`);
  }

  async function importStarten() {
    if (!bundle.kunden || bundle.kunden.length === 0) {
      toast.error('kunden.json fehlt');
      return;
    }
    setImportLauft(true);
    setFortschritt(null);
    try {
      const fullBundle: MosaikImportBundle = {
        kunden: bundle.kunden,
        ansprechpartner: bundle.ansprechpartner ?? {},
        subAdressen: bundle.subAdressen ?? [],
        adressreferenzen: bundle.adressreferenzen ?? [],
        bestellhistorie: bundle.bestellhistorie ?? {},
        zahlungsverhalten: bundle.zahlungsverhalten ?? {},
      };
      const result = await mosaikMigrationService.importBundle(fullBundle, (f) =>
        setFortschritt({ ...f })
      );
      toast.success(
        `Import abgeschlossen: ${result.angelegt} neu, ${result.aktualisiert} aktualisiert, ${result.fehler} Fehler`
      );
      onImportFertig();
    } catch (error) {
      console.error(error);
      toast.error('Import fehlgeschlagen — siehe Konsole');
    } finally {
      setImportLauft(false);
    }
  }

  const kundenZahl = bundle.kunden?.length ?? 0;
  const fertig = fortschritt ? fortschritt.verarbeitet === fortschritt.gesamt : false;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text flex items-center gap-2">
            <FileJson className="w-5 h-5 text-orange-500" />
            Mosaik-Export importieren
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-textMuted mt-1">
            Wähle die JSON-Dateien aus <code className="font-mono text-xs">migration/data/</code>.
            Re-Import überschreibt Rohdaten, behält aber bestehende Match-Entscheidungen.
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg font-medium hover:from-red-700 hover:to-orange-700 transition-all shadow-sm"
        >
          <Upload className="w-4 h-4" />
          Dateien wählen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          className="hidden"
          onChange={(e) => dateienAuswaehlen(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {ERWARTETE_DATEIEN.map((d) => {
          const geladen = dateienGeladen.has(d.name);
          return (
            <div
              key={d.name}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                geladen
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                  : d.pflicht
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {geladen ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : d.pflicht ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <FileJson className="w-3.5 h-3.5" />
              )}
              <span className="font-mono truncate">{d.name}</span>
              {d.pflicht && !geladen && <span className="ml-auto font-semibold">Pflicht</span>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-gray-600 dark:text-dark-textMuted">
          {kundenZahl > 0 ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-dark-text">{kundenZahl}</span>{' '}
              Kunden vorbereitet
            </>
          ) : (
            'Noch keine Datei geladen'
          )}
        </div>
        <button
          onClick={importStarten}
          disabled={!bundle.kunden || importLauft}
          className="inline-flex items-center gap-2 px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importLauft ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importiere …
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              In Staging importieren
            </>
          )}
        </button>
      </div>

      {fortschritt && (
        <div className="mt-4">
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all"
              style={{ width: `${(fortschritt.verarbeitet / fortschritt.gesamt) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1.5 text-gray-600 dark:text-dark-textMuted">
            <span>
              {fortschritt.verarbeitet} / {fortschritt.gesamt} verarbeitet
            </span>
            <span>
              {fortschritt.angelegt} neu · {fortschritt.aktualisiert} aktualisiert
              {fortschritt.fehler > 0 ? (
                <span className="text-red-600 dark:text-red-400 ml-1">
                  · {fortschritt.fehler} Fehler
                </span>
              ) : null}
            </span>
          </div>
          {fertig && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Fertig — Tabelle unten aktualisiert.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
