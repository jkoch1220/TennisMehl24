import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, FileText, Loader2, Save, Archive, Truck, PauseCircle, AlertTriangle, MapPin, Warehouse, History, BadgeEuro, ExternalLink, Inbox, Mail as MailIcon, RotateCcw,
  CheckCircle2, Info, Mail, Calendar, Package, Euro, ChevronLeft, ChevronRight, Plus, Trash2, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { MassenAngebotZeile, MassenAngebotKampagne, ZeilenMarkierung } from '../../types/massenAngebot';
import { massenAngebotKampagnenService, BelegHistorieEintrag } from '../../services/massenAngebotKampagnenService';
import { massenAngebotService } from '../../services/massenAngebotService';
import { generiereAngebotPDF } from '../../services/dokumentService';
import { getFileViewUrl } from '../../services/projektabwicklungDokumentService';
import { useAuth } from '../../contexts/AuthContext';
import { saisonplanungService } from '../../services/saisonplanungService';
import { berechneFremdlieferungRoute } from '../../utils/routeCalculation';
import { SaisonKunde } from '../../types/saisonplanung';
import { Position } from '../../types/projektabwicklung';
import { Artikel } from '../../types/artikel';
import { getAlleArtikel } from '../../services/artikelService';
import {
  findePrimaerPosition, summiere, setzeMengeAufPrimaer, setzePreisAufPrimaer,
  aenderePositionsWert, round2,
} from '../../utils/angebotsPositionen';

/**
 * Detailansicht einer Kampagnen-Zeile.
 *
 * Beim Durchgehen von hunderten Vereinen reicht die Zeile allein nicht: Der
 * Bearbeiter muss sehen, WORAUF der Vorschlag beruht (welcher Beleg, welches
 * Jahr, welche Positionen), die Zahlen anpassen und das Ergebnis als PDF prüfen
 * können, bevor es rausgeht.
 *
 * Aufbau — der Grund für das zentrierte, zweispaltige Fenster:
 * Links stehen die Fakten zum Nachschlagen (Grundlage, Historie, Anschriften,
 * Lieferkosten, Positionen), rechts die Werkbank zum Handeln (Menge, Preis,
 * Anschreiben, Entscheidung). Wer den Preis eintippt, sieht daneben, was der
 * Verein letztes Jahr gezahlt hat. Der schmale Seitenstreifen davor zwang zum
 * Scrollen zwischen Frage und Antwort.
 *
 * Nichts geht verloren: Speichern schließt das Fenster NICHT (die Zeile bleibt
 * offen, die Werte werden frisch geladen), und wer mit offenen Änderungen
 * schließen oder weiterblättern will, wird gefragt.
 */

const SCHNELLAKTIONEN: Array<{ markierung: ZeilenMarkierung; label: string; icon: typeof Archive; klasse: string }> = [
  { markierung: 'geprueft', label: 'Geprüft — geht raus', icon: CheckCircle2, klasse: 'bg-green-600 text-white hover:bg-green-700' },
  { markierung: 'kompliziert', label: 'Kompliziert', icon: AlertTriangle, klasse: 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300' },
  { markierung: 'zurueckgestellt', label: 'Diesmal nicht', icon: PauseCircle, klasse: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300' },
  { markierung: 'platzbauer', label: 'Über Platzbauer', icon: Truck, klasse: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950/50 dark:text-purple-300' },
  { markierung: 'archivieren', label: 'Ins Archiv', icon: Archive, klasse: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300' },
];

interface Props {
  zeile: MassenAngebotZeile;
  kampagne: MassenAngebotKampagne;
  onSchliessen: () => void;
  onGespeichert: () => void;
  /** Stellung in der gefilterten Liste — beantwortet „wie weit bin ich?". */
  position?: { nummer: number; gesamt: number };
  /** Blättern ohne Schließen. Fehlt der Nachbar, ist der Knopf tot. */
  onVorher?: () => void;
  onNaechste?: () => void;
}

export default function MassenAngebotZeileDetail({
  zeile, kampagne, onSchliessen, onGespeichert, position, onVorher, onNaechste,
}: Props) {
  const { user } = useAuth();
  const gesperrt = kampagne.status === 'versendet';

  /**
   * Die Positionen sind die EINZIGE Wahrheit über Menge, Preis und Summe.
   *
   * Vorher lagen Menge und Tonnenpreis als eigener State daneben und wurden
   * beim Speichern in die Positionen zurückgerechnet. Sobald man eine Position
   * von Hand ändert, ist das eine Doppelführung, bei der zwangsläufig eine
   * Seite verliert — hier wäre es die Handeingabe gewesen. Die Felder „Menge"
   * und „Preis" oben lesen und schreiben deshalb direkt die Primärposition.
   */
  const [positionen, setPositionen] = useState<Position[]>(zeile.positionen);
  const [email, setEmail] = useState(zeile.empfaengerEmail ?? '');
  const [notiz, setNotiz] = useState(zeile.notiz ?? '');
  const [speichert, setSpeichert] = useState(false);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  /**
   * Die E-Mail, wie sie beim Verein ankommt.
   *
   * Wer hunderte Mails verschickt, muss vorher genau eine davon gelesen haben.
   * `vorlage` ist der Text aus den Stammdaten, `emailBetreff`/`emailText` die
   * bewusste Abweichung für diesen einen Verein. Leer heißt: Vorlage gilt.
   */
  const [vorlage, setVorlage] = useState<{ betreff: string; text: string; absender: string } | null>(null);
  const [emailBetreff, setEmailBetreff] = useState(zeile.emailBetreff ?? '');
  const [emailText, setEmailText] = useState(zeile.emailText ?? '');
  const [zeigeEmail, setZeigeEmail] = useState(false);
  useEffect(() => {
    if (!zeigeEmail || vorlage) return;
    massenAngebotService
      .baueEmailVorschau(zeile.angebotsnummer ?? 'ANG-VORSCHAU', zeile.kundenname, zeile.kundennummer)
      .then((v) => setVorlage({ betreff: v.betreff, text: v.text, absender: v.absender }))
      .catch(() => setVorlage(null));
  }, [zeigeEmail, vorlage, zeile.angebotsnummer, zeile.kundenname, zeile.kundennummer]);

  /**
   * Der volle Kundendatensatz.
   *
   * Die Zeile trägt bewusst nur Name und Nummer — für das Angebot braucht es
   * aber Rechnungs- UND Lieferadresse. Ohne sie erschien im PDF ein Angebot
   * ohne Empfängeranschrift.
   */
  const [kunde, setKunde] = useState<SaisonKunde | null>(null);
  useEffect(() => {
    let aktiv = true;
    saisonplanungService.loadKunde(zeile.kundeId)
      .then((k) => { if (aktiv) setKunde(k); })
      .catch(() => { /* PDF-Vorschau meldet den Fehler dann selbst */ });
    return () => { aktiv = false; };
  }, [zeile.kundeId]);

  /**
   * Die Geschäftshistorie. Sie beantwortet die Frage vor dem Angebot: treuer
   * Kunde oder einmaliger Interessent? Zahlt er? Wie hat sich der Preis
   * entwickelt? Der eine Referenzbeleg sagt das nicht.
   */
  const [historie, setHistorie] = useState<BelegHistorieEintrag[] | null>(null);
  useEffect(() => {
    let aktiv = true;
    massenAngebotKampagnenService
      .ladeBelegHistorie(zeile.kundeId, kunde?.preisHistorie ?? [])
      .then((h) => { if (aktiv) setHistorie(h); })
      .catch(() => { if (aktiv) setHistorie([]); });
    return () => { aktiv = false; };
  }, [zeile.kundeId, kunde]);

  // Die Rechenregeln stehen in `utils/angebotsPositionen.ts` — dort geprüft.
  const primaer = useMemo(
    () => findePrimaerPosition(positionen, zeile.primaerPositionId),
    [positionen, zeile.primaerPositionId]
  );
  const primaerId = primaer?.id;
  const menge = primaer?.menge ?? zeile.menge;
  const preis = primaer?.einzelpreis ?? zeile.preisProTonne;
  const summe = summiere(positionen);

  const setzeMenge = (neu: number) => setPositionen((alt) => setzeMengeAufPrimaer(alt, primaerId, neu));
  const setzePreis = (neu: number) => setPositionen((alt) => setzePreisAufPrimaer(alt, primaerId, neu));
  const aenderePosition = (id: string, feld: 'menge' | 'einzelpreis', wert: number) =>
    setPositionen((alt) => aenderePositionsWert(alt, id, feld, wert));

  const entfernePosition = (id: string) => setPositionen((alt) => alt.filter((p) => p.id !== id));

  /** Der Artikelstamm wird erst geladen, wenn jemand wirklich etwas hinzufügt. */
  const [artikel, setArtikel] = useState<Artikel[] | null>(null);
  const [artikelSuche, setArtikelSuche] = useState<string | null>(null);
  useEffect(() => {
    if (artikelSuche === null || artikel) return;
    // nurAktive: archivierte Artikel sind für neue Positionen nicht mehr wählbar
    getAlleArtikel('artikelnummer', true).then(setArtikel).catch(() => setArtikel([]));
  }, [artikelSuche, artikel]);

  const fuegeArtikelHinzu = (a: Artikel) => {
    const einzelpreis = Number(a.einzelpreis ?? 0);
    setPositionen((alt) => [...alt, {
      id: `pos-${Date.now()}-${alt.length}`,
      artikelnummer: a.artikelnummer,
      bezeichnung: a.bezeichnung,
      menge: 1,
      einheit: a.einheit,
      einzelpreis,
      gesamtpreis: round2(einzelpreis),
    }]);
    setArtikelSuche(null);
  };

  // Lieferkosten wie in der Projektabwicklung — für Selbstabholer sinnlos.
  const [fracht, setFracht] = useState<{ laedt: boolean; distanz?: number; minuten?: number; kosten?: number; plz?: string }>({ laedt: false });
  const zielPlz = useMemo(
    () => kunde?.lieferadresse?.plz || kunde?.rechnungsadresse?.plz || '',
    [kunde]
  );
  useEffect(() => {
    if (zeile.selbstabholer || !/^\d{5}$/.test(zielPlz) || menge <= 0) { setFracht({ laedt: false }); return; }
    let aktiv = true;
    setFracht({ laedt: true, plz: zielPlz });
    // Kurz verzögert: Beim Tippen in der Menge sonst eine Routenabfrage je Tastendruck.
    const timer = setTimeout(() => {
      berechneFremdlieferungRoute('97828', zielPlz, {
        stundenlohn: 105.0, durchschnittsgeschwindigkeit: 60.0,
        beladungszeit: 30, abladungszeit: 30, anzahlAbladestellen: 1,
        pausenzeit: 45, lkwLadungInTonnen: menge,
      })
        .then((e) => { if (aktiv) setFracht({ laedt: false, plz: zielPlz, distanz: e.distanz, minuten: e.gesamtzeit, kosten: e.lohnkosten }); })
        .catch(() => { if (aktiv) setFracht({ laedt: false, plz: zielPlz }); });
    }, 600);
    return () => { aktiv = false; clearTimeout(timer); };
  }, [zielPlz, menge, zeile.selbstabholer]);

  const geaendert =
    JSON.stringify(positionen) !== JSON.stringify(zeile.positionen) ||
    email !== (zeile.empfaengerEmail ?? '') ||
    notiz !== (zeile.notiz ?? '') ||
    emailBetreff !== (zeile.emailBetreff ?? '') ||
    emailText !== (zeile.emailText ?? '');

  const speichern = async (markierung?: ZeilenMarkierung) => {
    setSpeichert(true);
    try {
      // Die Positionen werden NICHT mehr aus Menge und Preis zurückgerechnet —
      // sie sind der bearbeitete Stand. `menge` und `preisProTonne` an der Zeile
      // sind die Spiegelung der Primärposition, damit die Tabelle und die
      // Frachtkalkulation dieselbe Zahl sehen.
      await massenAngebotKampagnenService.speichereZeile(
        {
          ...zeile, menge, preisProTonne: preis,
          // Mitschreiben: Wer die bisherige Hauptposition löscht, bekommt eine
          // neue zugewiesen — sonst zeigt die gemerkte Id dauerhaft ins Leere.
          primaerPositionId: primaerId,
          empfaengerEmail: email.trim() || undefined,
          notiz: notiz.trim() || undefined,
          emailBetreff: emailBetreff.trim() || undefined,
          emailText: emailText.trim() || undefined,
          positionen,
          ...(markierung ? { markierung, ausgewaehlt: markierung === 'geprueft' } : {}),
        },
        user?.name || user?.email
      );
      await massenAngebotKampagnenService.aktualisiereZaehler(kampagne.id);

      // Eine hier von Hand eingetragene Adresse gehört an den KUNDEN, sonst ist
      // sie nächste Saison wieder weg und dieselbe Recherche fällt erneut an.
      // Nur wenn dort noch nichts steht: Eine bewusst abweichende Adresse für
      // diesen einen Lauf darf den gepflegten Verteiler nicht überschreiben.
      const adresse = email.trim();
      if (adresse && kunde && !massenAngebotService.ermittleEmpfaenger(kunde)) {
        try {
          await massenAngebotService.setzeAngebotsEmails(kunde.id, [adresse]);
          toast.success(`${adresse} auch am Kunden hinterlegt`);
        } catch (error) {
          console.warn('Adresse konnte nicht am Kunden nachgetragen werden:', error);
        }
      }

      toast.success(markierung ? `Als „${markierung}" markiert` : 'Änderungen gespeichert');
      onGespeichert();
      // Eine Entscheidung beendet die Arbeit an diesem Verein — reines Speichern
      // nicht. Wer zwischendurch sichert, will weiterarbeiten, nicht neu suchen.
      if (markierung) onSchliessen();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
      return false;
    } finally {
      setSpeichert(false);
    }
  };

  /**
   * Schutz vor stillem Verlust.
   *
   * Ein Klick neben das Fenster, die Escape-Taste oder der Sprung zum nächsten
   * Verein warfen bis dahin alles Getippte weg, ohne ein Wort. Jetzt hält die
   * Rückfrage die Aktion an, bis der Bearbeiter entschieden hat.
   */
  const [abfrage, setAbfrage] = useState<null | { text: string; weiter: () => void }>(null);
  const mitSchutz = useCallback((text: string, weiter: () => void) => {
    if (geaendert && !gesperrt) setAbfrage({ text, weiter });
    else weiter();
  }, [geaendert, gesperrt]);

  const schliessenVersuch = useCallback(
    () => mitSchutz('Das Fenster schließen?', onSchliessen),
    [mitSchutz, onSchliessen]
  );

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Die Rückfrage fängt Escape selbst ab, sonst schlösse sie das Fenster gleich mit.
      if (abfrage) { setAbfrage(null); return; }
      schliessenVersuch();
    };
    window.addEventListener('keydown', beiTaste);
    return () => window.removeEventListener('keydown', beiTaste);
  }, [abfrage, schliessenVersuch]);

  /** Baut das Angebot testweise auf und öffnet es — ohne etwas zu speichern. */
  const pdfAnsehen = async () => {
    setPdfLaedt(true);
    try {
      const stammdaten = await massenAngebotService.getStammdaten();
      if (!kunde) throw new Error('Kundendaten noch nicht geladen — kurz warten und erneut versuchen.');
      const daten = massenAngebotService.baueAngebotsDaten(
        {
          ...zeile,
          typ: kunde.typ,
          status: 'neu',
          // Die Vorschau zeigt den BEARBEITETEN Stand, auch ungespeichert —
          // sonst prüft man ein anderes Dokument als das, das rausgeht.
          positionen,
          angebotssumme: summe,
          emailFehlt: !email,
          ausgewaehlt: true,
          menge, preisProTonne: preis,
          // Der ECHTE Kunde: Rechnungs- und Lieferadresse landen sonst nicht im PDF.
          kunde,
        } as never,
        zeile.angebotsnummer ?? 'VORSCHAU',
        stammdaten,
        kampagne.saisonjahr
      );
      const pdf = await generiereAngebotPDF(daten, stammdaten);
      window.open(pdf.output('bloburl') as unknown as string, '_blank');
    } catch (error) {
      toast.error(`Vorschau fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`);
    } finally {
      setPdfLaedt(false);
    }
  };

  const ref = zeile.referenz;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Angebot für ${zeile.kundenname}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={schliessenVersuch}
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- Kopf: wer, und wie weit bin ich? ---------- */}
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-gray-900 dark:text-dark-text truncate">{zeile.kundenname}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {zeile.kundennummer ? `${zeile.kundennummer} · ` : ''}{zeile.produktprofil}
              {zeile.selbstabholer && ' · Selbstabholer'}
              {zeile.versendetAm && ' · bereits versendet'}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {position && (
              <span className="hidden sm:inline text-xs text-gray-500 dark:text-slate-400 tabular-nums mr-1">
                {position.nummer} von {position.gesamt}
              </span>
            )}
            {(onVorher || onNaechste) && (
              <>
                <button
                  onClick={() => onVorher && mitSchutz('Zum vorherigen Verein wechseln?', onVorher)}
                  disabled={!onVorher}
                  title="Vorheriger Verein"
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onNaechste && mitSchutz('Zum nächsten Verein wechseln?', onNaechste)}
                  disabled={!onNaechste}
                  title="Nächster Verein"
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={schliessenVersuch}
              title="Schließen (Esc)"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ---------- Körper: links nachschlagen, rechts handeln ---------- */}
        {/* Warum Flex und nicht Grid: Eine Grid-Zeile ist `auto` hoch und wächst
            mit ihrem Inhalt — die Spalten bekämen nie eine begrenzte Höhe und
            würden statt zu scrollen einfach abgeschnitten. Flex streckt seine
            Kinder dagegen auf die Containerhöhe, und genau daran greift
            `overflow-y-auto`. Unterhalb von `lg` scrollt der Container selbst,
            weil die Spalten dann untereinander stehen. */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:flex">

          {/* ===== Linke Spalte: die Fakten ===== */}
          <div className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto p-5 space-y-4">
            {/* Worauf beruht der Vorschlag? Die wichtigste Frage beim Durchgehen. */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 flex items-center gap-2">
                <Info className="w-4 h-4" /> Grundlage des Vorschlags
              </h4>
              <p className="text-sm text-gray-700 dark:text-slate-300">{zeile.herkunft}</p>
              {ref ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-1">
                  <dt className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Belegjahr</dt>
                  <dd className="text-gray-900 dark:text-slate-200">{ref.jahr ?? '—'}</dd>
                  <dt className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Belegart</dt>
                  <dd className="text-gray-900 dark:text-slate-200">{ref.typ}</dd>
                  {/* `tonnage` zählt ausschließlich lose Ware. Bei einem
                      Palettenkunden steht dort 0 — das liest sich wie „hat nichts
                      bestellt" und ist das Gegenteil der Wahrheit. */}
                  <dt className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Menge damals</dt>
                  <dd className="text-gray-900 dark:text-slate-200">
                    {zeile.produktprofil === 'paletten' && ref.tonnage === 0
                      ? 'Sackware (keine lose Ware)'
                      : `${ref.tonnage} t lose Ware`}
                  </dd>
                  <dt className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><Euro className="w-3.5 h-3.5" /> Wert damals</dt>
                  <dd className="text-gray-900 dark:text-slate-200">{ref.wert.toFixed(2)} €</dd>
                </dl>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Kein Referenzbeleg — Menge und Preis stammen aus der Kalkulation und sollten geprüft werden.
                </p>
              )}
              {zeile.warnungen.map((w) => (
                <p key={w} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {w}
                </p>
              ))}
            </section>

            {/* Geschäftshistorie */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2 flex items-center gap-2">
                <History className="w-4 h-4" /> Geschäftshistorie
              </h4>
              {historie === null ? (
                <p className="text-sm text-gray-400">Wird geladen…</p>
              ) : historie.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Kein einziger Vorgang gefunden — der Kunde hat bei uns noch nie bestellt.
                </p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 dark:text-slate-400">
                      <tr>
                        <th className="text-left font-medium pb-1">Jahr</th>
                        <th className="text-left font-medium pb-1">Beleg</th>
                        <th className="text-right font-medium pb-1">Menge</th>
                        <th className="text-right font-medium pb-1">€/t</th>
                        <th className="text-right font-medium pb-1">Summe</th>
                        <th className="text-left font-medium pb-1 pl-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {historie.map((h, i) => (
                        <tr key={`${h.jahr}-${h.belegNummer ?? i}`} className="text-gray-700 dark:text-slate-300">
                          <td className="py-1">{h.jahr}</td>
                          <td className="py-1">
                            {h.quelle === 'mosaik' ? (
                              <span className="text-gray-400 italic">Mosaik-Preis</span>
                            ) : (
                              <>
                                <span className="text-xs text-gray-400">{h.belegTyp ?? '—'}</span>
                                {h.belegNummer && (
                                  <span className="block text-xs">
                                    {/* Das PDF öffnen, wenn es eins gibt. In der Sandbox
                                        sind die Dateiverweise gekappt — dann bleibt die
                                        Nummer einfach Text statt eines toten Links. */}
                                    {h.dateiId ? (
                                      <a
                                        href={getFileViewUrl(h.dateiId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Damaliges PDF öffnen"
                                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                      >
                                        {h.belegNummer} <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      h.belegNummer
                                    )}
                                  </span>
                                )}
                                {h.herkunft === 'anfrage' && (
                                  <span className="block mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                                    <Inbox className="w-3 h-3" /> Anfrageformular
                                  </span>
                                )}
                                {h.herkunft === 'shop' && (
                                  <span className="block mt-0.5 text-[11px] text-orange-600 dark:text-orange-400">Onlineshop</span>
                                )}
                                {h.herkunft === 'platzbau' && (
                                  <span className="block mt-0.5 text-[11px] text-purple-600 dark:text-purple-400">über den Platzbau</span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-1 text-right whitespace-nowrap">{h.menge > 0 ? `${h.menge} t` : '—'}</td>
                          <td className="py-1 text-right whitespace-nowrap">{h.preisProTonne > 0 ? h.preisProTonne.toFixed(2) : '—'}</td>
                          <td className="py-1 text-right whitespace-nowrap">{h.summe > 0 ? `${h.summe.toFixed(2)} €` : '—'}</td>
                          <td className="py-1 pl-2">
                            {/* Bezahlt ist die Information, die zählt: Ein Kunde mit
                                offener Rechnung bekommt kein neues Angebot ohne Blick. */}
                            {h.bezahltAm || h.status === 'bezahlt' ? (
                              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs">
                                <BadgeEuro className="w-3 h-3" /> bezahlt
                              </span>
                            ) : h.status === 'angebot' ? (
                              <span className="text-xs text-gray-400">nur angeboten</span>
                            ) : h.status ? (
                              <span className="text-xs text-gray-500">{h.status}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Verdichtung: Was diese Zahlen in einem Satz bedeuten. */}
                  {(() => {
                    const bestellt = historie.filter((h) => h.menge > 0);
                    const bezahlt = historie.filter((h) => h.bezahltAm || h.status === 'bezahlt');
                    const nurAngebot = historie.filter((h) => h.status === 'angebot');
                    const gesamt = bestellt.reduce((s, h) => s + h.summe, 0);
                    return (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                        {bestellt.length} Bestellung(en) · {bezahlt.length} bezahlt
                        {nurAngebot.length > 0 && ` · ${nurAngebot.length} Angebot(e) ohne Auftrag`}
                        {gesamt > 0 && ` · insgesamt ${gesamt.toFixed(2)} € netto`}
                      </p>
                    );
                  })()}
                </>
              )}
            </section>

            {/* Adressen — sie stehen so auf dem Angebot. Fehlen sie, ist das Dokument
                unbrauchbar; das muss man vor dem Erzeugen sehen. */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Anschriften
              </h4>
              {!kunde ? (
                <p className="text-sm text-gray-400">Wird geladen…</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-slate-400 text-xs mb-0.5">Rechnung</p>
                    {kunde.rechnungsadresse?.strasse ? (
                      <p className="text-gray-900 dark:text-slate-200">
                        {kunde.rechnungsadresse.strasse}<br />
                        {kunde.rechnungsadresse.plz} {kunde.rechnungsadresse.ort}
                      </p>
                    ) : <p className="text-red-600 dark:text-red-400">fehlt</p>}
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-slate-400 text-xs mb-0.5">Lieferung</p>
                    {kunde.lieferadresse?.strasse ? (
                      <p className="text-gray-900 dark:text-slate-200">
                        {kunde.lieferadresse.strasse}<br />
                        {kunde.lieferadresse.plz} {kunde.lieferadresse.ort}
                      </p>
                    ) : <p className="text-amber-600 dark:text-amber-400">wie Rechnungsanschrift</p>}
                  </div>
                </div>
              )}
            </section>

            {/* Lieferkosten — dieselbe Rechnung wie in der Projektabwicklung.
                Abholer brauchen sie nicht: Sie kommen selbst. */}
            {zeile.selbstabholer ? (
              <section className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20 p-4">
                <p className="text-sm text-cyan-800 dark:text-cyan-300 flex items-center gap-2">
                  <Warehouse className="w-4 h-4" /> Selbstabholer — keine Lieferkosten, Werkspreis
                </p>
              </section>
            ) : (fracht.laedt || fracht.kosten !== undefined) && (
              <section className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Vorgeschlagene Lieferkosten
                </h4>
                {fracht.laedt ? (
                  <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Route wird berechnet…</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-gray-500 dark:text-slate-400">Ziel-PLZ: <span className="text-gray-900 dark:text-slate-200 font-medium">{fracht.plz}</span></span>
                      <span className="text-gray-500 dark:text-slate-400">Tonnage: <span className="text-gray-900 dark:text-slate-200 font-medium">{menge} t</span></span>
                      <span className="text-gray-500 dark:text-slate-400">Distanz: <span className="text-gray-900 dark:text-slate-200 font-medium">{fracht.distanz?.toFixed(0)} km</span></span>
                      <span className="text-gray-500 dark:text-slate-400">Fahrzeit: <span className="text-gray-900 dark:text-slate-200 font-medium">{Math.floor((fracht.minuten ?? 0) / 60)}h {Math.round((fracht.minuten ?? 0) % 60)}min</span></span>
                    </div>
                    <div className="border-t border-purple-200 dark:border-purple-700 pt-2 flex justify-between items-baseline">
                      <span className="text-gray-600 dark:text-slate-400">Lieferkosten (105 €/h)</span>
                      <span className="text-lg font-bold text-purple-700 dark:text-purple-300">{fracht.kosten?.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>Pro Tonne</span>
                      <span className="font-semibold text-purple-700 dark:text-purple-300">{menge > 0 ? ((fracht.kosten ?? 0) / menge).toFixed(2) : '—'} €/t</span>
                    </div>
                    {/* Der Deckungsgrad ist die eigentliche Frage: Trägt der Preis die Fracht? */}
                    {fracht.kosten !== undefined && menge > 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 pt-1 border-t border-purple-200 dark:border-purple-700">
                        Frachtanteil im Preis: <strong>{(preis - 98.7).toFixed(2)} €/t</strong> ·
                        {' '}Kosten: <strong>{((fracht.kosten ?? 0) / menge).toFixed(2)} €/t</strong>
                        {(preis - 98.7) * menge >= (fracht.kosten ?? 0)
                          ? <span className="text-green-700 dark:text-green-400"> · gedeckt</span>
                          : <span className="text-red-700 dark:text-red-400"> · unterdeckt um {(((fracht.kosten ?? 0) - (preis - 98.7) * menge)).toFixed(2)} €</span>}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 italic">Fremdlieferung ab Marktheidenfeld (Hin- und Rückfahrt)</p>
                  </div>
                )}
              </section>
            )}

            {/* Positionen des neuen Angebots — hier wird gerechnet.
                Bewusst dieselbe schlanke Zeile wie vorher: Nummer, Bezeichnung,
                Menge, Preis. Die Felder sind randlos und zeigen ihren Rahmen
                erst bei Hover oder Fokus, damit die Liste im Ruhezustand
                lesbar bleibt und nicht wie ein Formular wirkt. */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200">
                  Positionen des Angebots ({positionen.length})
                </h4>
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  netto <strong className="text-gray-900 dark:text-slate-200">{summe.toFixed(2)} €</strong>
                </span>
              </div>

              {positionen.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">Keine Positionen hinterlegt.</p>
              ) : (
                <ul className="text-sm divide-y divide-gray-100 dark:divide-slate-700/60">
                  {positionen.map((p, i) => (
                    <li key={p.id ?? i} className="group flex items-center gap-3 py-1.5">
                      <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
                        <span className="text-gray-400 flex-shrink-0">{p.artikelnummer}</span>
                        <span className="truncate text-gray-700 dark:text-slate-300">{p.bezeichnung}</span>
                        {p.istBedarfsposition && <span className="text-xs text-gray-400 flex-shrink-0">(Bedarf)</span>}
                        {/* Die Zeile, an der Menge und Preis oben hängen. Ohne
                            Kennzeichen wundert man sich, warum sie mitwandert. */}
                        {p.id === primaerId && (
                          <span className="text-[11px] text-gray-400 flex-shrink-0" title="Menge und Preis oben wirken auf diese Position">
                            · Hauptposition
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 whitespace-nowrap text-gray-700 dark:text-slate-300">
                        <input
                          type="number" step="0.5" value={p.menge} disabled={gesperrt}
                          onChange={(e) => aenderePosition(p.id, 'menge', Number(e.target.value))}
                          aria-label={`Menge ${p.bezeichnung}`}
                          className="w-16 text-right px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 dark:hover:border-slate-600 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none disabled:hover:border-transparent"
                        />
                        <span className="text-gray-400 w-8">{p.einheit}</span>
                        <span className="text-gray-300">·</span>
                        <input
                          type="number" step="0.01" value={p.einzelpreis} disabled={gesperrt}
                          onChange={(e) => aenderePosition(p.id, 'einzelpreis', Number(e.target.value))}
                          aria-label={`Einzelpreis ${p.bezeichnung}`}
                          className="w-20 text-right px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 dark:hover:border-slate-600 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none disabled:hover:border-transparent"
                        />
                        <span className="text-gray-400">€</span>
                      </span>
                      {!gesperrt && (
                        <button
                          onClick={() => entfernePosition(p.id)}
                          title={`${p.bezeichnung} entfernen`}
                          className="p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Hinzufügen: erst auf Klick, dann Suche im Artikelstamm. */}
              {!gesperrt && (artikelSuche === null ? (
                <button
                  onClick={() => setArtikelSuche('')}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-slate-200"
                >
                  <Plus className="w-4 h-4" /> Position hinzufügen
                </button>
              ) : (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      autoFocus value={artikelSuche}
                      onChange={(e) => setArtikelSuche(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setArtikelSuche(null); } }}
                      placeholder="Artikelnummer oder Bezeichnung"
                      className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    />
                    <button onClick={() => setArtikelSuche(null)}
                      className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-slate-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {artikel === null ? (
                    <p className="text-sm text-gray-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Artikel werden geladen…
                    </p>
                  ) : (() => {
                    const suche = artikelSuche.trim().toLowerCase();
                    const treffer = artikel.filter((a) =>
                      !suche
                      || a.artikelnummer.toLowerCase().includes(suche)
                      || a.bezeichnung.toLowerCase().includes(suche)
                    ).slice(0, 8);
                    if (treffer.length === 0) {
                      return <p className="text-sm text-gray-500 dark:text-slate-400">Kein Artikel passt zu „{artikelSuche}".</p>;
                    }
                    return (
                      <ul className="text-sm divide-y divide-gray-100 dark:divide-slate-700/60">
                        {treffer.map((a) => (
                          <li key={a.artikelnummer}>
                            <button
                              onClick={() => fuegeArtikelHinzu(a)}
                              className="w-full flex items-center gap-3 py-1.5 px-1 -mx-1 rounded text-left hover:bg-gray-50 dark:hover:bg-slate-800"
                            >
                              <span className="text-gray-400 flex-shrink-0">{a.artikelnummer}</span>
                              <span className="truncate flex-1 text-gray-700 dark:text-slate-300">{a.bezeichnung}</span>
                              <span className="whitespace-nowrap text-gray-500 dark:text-slate-400">
                                {Number(a.einzelpreis ?? 0).toFixed(2)} € / {a.einheit}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              ))}
            </section>
          </div>

          {/* ===== Rechte Spalte: die Werkbank ===== */}
          <div className="lg:w-[26rem] lg:flex-shrink-0 lg:overflow-y-auto p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-950/30">

            {/* Anpassen */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200">Angebot anpassen</h4>
              {/* Die Schnellstellschrauben für den Regelfall: lose Ware. Sie
                  schreiben in die Primärposition — mengenabhängige Nebenzeilen
                  wachsen mit. Fehlt eine solche Position (reines Instandsetzungs-
                  angebot), gäbe es nichts zu stellen; dann führt der Weg über die
                  Positionsliste. */}
              {primaer ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="block text-gray-600 dark:text-slate-400 mb-1">Menge (t)</span>
                    <input type="number" step="0.5" value={menge} disabled={gesperrt}
                      onChange={(e) => setzeMenge(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                  </label>
                  <label className="text-sm">
                    <span className="block text-gray-600 dark:text-slate-400 mb-1">Preis (€/t)</span>
                    <input type="number" step="0.01" value={preis} disabled={gesperrt}
                      onChange={(e) => setzePreis(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                  </label>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Keine Position in Tonnen — Menge und Preis stehen in der Positionsliste.
                </p>
              )}
              <label className="text-sm block">
                <span className="block text-gray-600 dark:text-slate-400 mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Empfänger</span>
                <input type="email" value={email} disabled={gesperrt}
                  onChange={(e) => setEmail(e.target.value)} placeholder="keine Adresse hinterlegt"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-600 dark:text-slate-400 mb-1">Notiz (wandert ins Projekt)</span>
                <textarea value={notiz} disabled={gesperrt} rows={2}
                  onChange={(e) => setNotiz(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </label>
            </section>

            {/* Anschreiben */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
              <button onClick={() => setZeigeEmail((v) => !v)}
                className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-slate-200">
                <span className="flex items-center gap-2"><MailIcon className="w-4 h-4" /> Anschreiben</span>
                <span className="text-xs font-normal text-gray-500">
                  {zeile.emailBetreff || zeile.emailText ? 'individuell angepasst' : 'Standardvorlage'} · {zeigeEmail ? 'zuklappen' : 'ansehen'}
                </span>
              </button>

              {zeigeEmail && (
                !vorlage ? (
                  <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Vorlage wird geladen…</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Von <strong>{vorlage.absender}</strong> an <strong>{email || '— keine Adresse —'}</strong>
                      {' · '}Anhang: Angebot als PDF
                    </p>
                    <label className="block text-sm">
                      <span className="block text-gray-600 dark:text-slate-400 mb-1">Betreff</span>
                      <input value={emailBetreff} disabled={gesperrt}
                        onChange={(e) => setEmailBetreff(e.target.value)}
                        placeholder={vorlage.betreff}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
                    </label>
                    <label className="block text-sm">
                      <span className="block text-gray-600 dark:text-slate-400 mb-1">Text</span>
                      <textarea value={emailText} disabled={gesperrt} rows={8}
                        onChange={(e) => setEmailText(e.target.value)}
                        placeholder={vorlage.text}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono leading-relaxed" />
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-gray-500 dark:text-slate-400 flex-1">
                        Leer lassen = die Standardvorlage geht raus (grau angedeutet). Was hier steht, gilt nur für diesen Verein.
                      </p>
                      {(emailBetreff || emailText) && !gesperrt && (
                        <button onClick={() => { setEmailBetreff(''); setEmailText(''); }}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-xs flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-slate-800">
                          <RotateCcw className="w-3.5 h-3.5" /> Auf Vorlage zurücksetzen
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </section>

            {/* Schnellaktionen — ein Klick, statt ein Menü aufzuklappen.
                Sie speichern die offenen Änderungen gleich mit. */}
            {!gesperrt && (
              <section>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-2">Entscheidung</h4>
                <div className="grid grid-cols-2 gap-2">
                  {SCHNELLAKTIONEN.map((a) => (
                    <button key={a.markierung} onClick={() => void speichern(a.markierung)} disabled={speichert}
                      className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 ${a.klasse}`}>
                      <a.icon className="w-4 h-4" /> {a.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Eine Entscheidung speichert offene Änderungen mit und schließt das Fenster.
                </p>
              </section>
            )}
          </div>
        </div>

        {/* ---------- Fuß: immer sichtbar, färbt sich bei offenen Änderungen ---------- */}
        <footer className={`flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t transition-colors ${
          geaendert && !gesperrt
            ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40'
            : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => void pdfAnsehen()} disabled={pdfLaedt}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 flex-shrink-0">
              {pdfLaedt ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span className="hidden sm:inline">Angebot als PDF ansehen</span>
              <span className="sm:hidden">PDF</span>
            </button>
            {/* Die Summe ist die Summe ALLER Positionen. `menge * preis` zeigte
                nur die Ware — bei einem Instandsetzungsangebot mit Anfahrt,
                Arbeitszeit und Folie war das ein Bruchteil des Auftragswerts. */}
            <p className="text-sm text-gray-600 dark:text-slate-400 truncate">
              Summe <strong className="text-gray-900 dark:text-slate-200">{summe.toFixed(2)} €</strong> netto
            </p>
          </div>

          {geaendert && !gesperrt ? (
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-green-800 dark:text-green-300">
                <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
                Nicht gespeichert
              </span>
              <button onClick={() => void speichern()} disabled={speichert}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50 shadow-sm">
                {speichert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Änderungen speichern
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {gesperrt ? 'Kampagne versendet — schreibgeschützt' : 'Alles gespeichert'}
            </span>
          )}
        </footer>
      </div>

      {/* ---------- Rückfrage, bevor Getipptes verschwindet ---------- */}
      {abfrage && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { e.stopPropagation(); setAbfrage(null); }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-slate-200">Nicht gespeicherte Änderungen</h4>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{abfrage.text}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button onClick={() => setAbfrage(null)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                Zurück zum Angebot
              </button>
              <button onClick={() => { const w = abfrage.weiter; setAbfrage(null); w(); }}
                className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-950/40">
                Änderungen verwerfen
              </button>
              <button onClick={() => { void speichern().then((ok) => { if (ok) { const w = abfrage.weiter; setAbfrage(null); w(); } }); }}
                disabled={speichert}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {speichert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern und weiter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
