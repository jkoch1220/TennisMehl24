import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import EmailFormular from '../Projektabwicklung/EmailFormular';
import { DebitorView } from '../../types/debitor';
import { MahnwesenDokumentTyp } from '../../types/mahnwesen';
import {
  bereiteMahnungVersandVor,
  sendeVorbereiteteMahnung,
  ladeMahnEmailKandidaten,
  mahnTypLabel,
  MahnEmailKandidat,
  MahnVersandVorbereitung,
} from '../../services/mahnwesenService';

interface MahnEmailDialogProps {
  debitor: DebitorView;
  typ: MahnwesenDokumentTyp;
  /** Testmodus des aufrufenden Tabs vorbelegen */
  testModusVorgabe?: boolean;
  /** Anschrift fürs Anschreiben, wenn der Aufrufer sie besser kennt als der Debitor */
  adresse?: { strasse?: string; plzOrt?: string };
  onClose: () => void;
  /** Nach erfolgreichem ECHTEN Versand — der DebitorView ist danach veraltet */
  onSent?: () => void;
}

/**
 * Verbindet das Mahnwesen mit dem E-Mail-Client: bereitet Betreff, Text und PDF vor,
 * zeigt sie im gewohnten Versand-Dialog zum Prüfen und Bearbeiten und übergibt den
 * Versand an `sendeVorbereiteteMahnung` (Archivierung, Mahnstufe, Protokoll).
 *
 * Beim Öffnen wird nichts gespeichert — erst der Klick auf „E-Mail senden" wirkt.
 */
const MahnEmailDialog = ({
  debitor,
  typ,
  testModusVorgabe,
  adresse,
  onClose,
  onSent,
}: MahnEmailDialogProps) => {
  const [vorbereitung, setVorbereitung] = useState<MahnVersandVorbereitung | null>(null);
  const [kandidaten, setKandidaten] = useState<MahnEmailKandidat[]>([]);
  // Die Kandidaten treffen asynchron ein. EmailFormular übernimmt den Empfänger nur
  // beim Aufbau — würde es vorher rendern, bliebe das An-Feld leer, obwohl eine
  // Adresse bekannt ist. Deshalb erst rendern, wenn beide Ladewege durch sind.
  const [kandidatenGeladen, setKandidatenGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Der Versand-Callback braucht den aktuellen Stand, ohne dass EmailFormular
  // wegen einer neuen Callback-Identität neu initialisiert.
  const vorbereitungRef = useRef<MahnVersandVorbereitung | null>(null);
  vorbereitungRef.current = vorbereitung;

  useEffect(() => {
    let abgebrochen = false;

    const laden = async () => {
      try {
        const vorb = await bereiteMahnungVersandVor(debitor, typ, undefined, undefined, adresse);
        if (!abgebrochen) setVorbereitung(vorb);
      } catch (error) {
        console.error('Mahnung konnte nicht vorbereitet werden:', error);
        if (!abgebrochen) {
          setFehler(
            error instanceof Error ? error.message : 'Die Mahnung konnte nicht vorbereitet werden'
          );
        }
      }
    };

    const kandidatenLaden = async () => {
      try {
        const liste = await ladeMahnEmailKandidaten(debitor);
        if (!abgebrochen) setKandidaten(liste);
      } catch (error) {
        // Vorschläge sind Komfort — ihr Ausfall darf den Versand nicht aufhalten
        console.warn('E-Mail-Vorschläge konnten nicht geladen werden:', error);
      } finally {
        if (!abgebrochen) setKandidatenGeladen(true);
      }
    };

    void laden();
    void kandidatenLaden();

    return () => {
      abgebrochen = true;
    };
    // Bewusst nur projektId + typ: sonst würde bei jedem neuen DebitorView-Objekt
    // erneut ein PDF gerendert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debitor.projektId, typ, adresse?.strasse, adresse?.plzOrt]);

  if (fehler) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {mahnTypLabel(typ)} konnte nicht vorbereitet werden
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{fehler}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!vorbereitung || !kandidatenGeladen) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <span className="text-gray-700 dark:text-dark-textMuted">
              {mahnTypLabel(typ)} wird vorbereitet…
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <EmailFormular
      pdf={vorbereitung.pdf}
      dateiname={vorbereitung.dateiname}
      dokumentTyp="mahnwesen"
      dokumentLabel={mahnTypLabel(typ)}
      dokumentNummer={vorbereitung.daten.dokumentNummer}
      // Die Nummer entsteht erst beim Senden — über sie zu suchen träfe nie etwas.
      // Leerstring: alle Mahn-Mails dieses Projekts zählen für die Warnung.
      verlaufNummer=""
      kundenname={debitor.kundenname}
      kundennummer={debitor.kundennummer}
      projektId={debitor.projektId}
      // Ohne Projekt-E-Mail den besten Kandidaten (Kunde/Ansprechpartner) vorbelegen,
      // statt den Nutzer vor ein leeres Feld zu setzen
      standardEmpfaenger={vorbereitung.empfaenger || kandidaten[0]?.email}
      empfaengerVorschlaege={kandidaten}
      absenderVorgabe={vorbereitung.absender}
      testModusVorgabe={testModusVorgabe}
      hinweisText={
        debitor.istPlatzbauerprojekt
          ? `Platzbauer-Projekt: Empfänger ist der Platzbauer, nicht der Verein „${debitor.kundenname}". Bitte die Platzbauer-Adresse wählen.`
          : undefined
      }
      inhaltVorgabe={{
        betreff: vorbereitung.betreff,
        htmlBody: vorbereitung.htmlBody,
        signatur: vorbereitung.signatur,
      }}
      onSenden={async ({ empfaenger, absender, betreff, htmlBody, testModus }) => {
        const aktuell = vorbereitungRef.current;
        if (!aktuell) return { success: false, error: 'Mahnung nicht vorbereitet' };

        const ergebnis = await sendeVorbereiteteMahnung({
          debitor,
          dokumentTyp: typ,
          daten: aktuell.daten,
          pdf: aktuell.pdf,
          betreff,
          htmlBody,
          empfaenger,
          absender,
          testModus,
        });

        // Nur echter Versand verändert Mahnstufe und Liste
        if (ergebnis.success && !testModus) onSent?.();

        return { success: ergebnis.success, error: ergebnis.fehler };
      }}
      onClose={onClose}
    />
  );
};

export default MahnEmailDialog;
