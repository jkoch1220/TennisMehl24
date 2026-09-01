import { useMemo, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, Archive, Truck, Clock, PauseCircle, Send,
  ArrowRightLeft, MailWarning, Search, PackageCheck, Loader2, FlaskConical,
  Warehouse, ChevronRight, X, Inbox, RefreshCw, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MassenAngebotZeile, MassenAngebotKampagne, ZeilenMarkierung,
  ZEILEN_MARKIERUNG_LABELS, MASSEN_ANGEBOT_TYP_LABELS,
} from '../../types/massenAngebot';
import { massenAngebotKampagnenService } from '../../services/massenAngebotKampagnenService';
import { massenAngebotService } from '../../services/massenAngebotService';
import { istMockModusAktiv } from '../../config/mockModus';
import { useAuth } from '../../contexts/AuthContext';
import MassenAngebotZeileDetail from './MassenAngebotZeileDetail';
import { bestimmeDurchgang } from './massenAngebotUi';
import MassenAngebotEmailKlaerung from './MassenAngebotEmailKlaerung';

/**
 * Arbeitsliste einer Kampagne — als Tabelle.
 *
 * Hier werden mehrere hundert Vereine durchgearbeitet. Karten kosten dabei zu
 * viel Platz: Man will viele Zeilen gleichzeitig sehen, vergleichen und in
 * einem Rutsch behandeln. Deshalb eine dichte Tabelle mit Mehrfachauswahl und
 * einer Aktionsleiste, die erst erscheint, wenn etwas ausgewählt ist.
 */

const MARKIERUNG_STIL: Record<ZeilenMarkierung, { klasse: string; icon: typeof CheckCircle2 }> = {
  offen: { klasse: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300', icon: Clock },
  geprueft: { klasse: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300', icon: CheckCircle2 },
  kompliziert: { klasse: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', icon: AlertTriangle },
  archivieren: { klasse: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300', icon: Archive },
  platzbauer: { klasse: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300', icon: Truck },
  zurueckgestellt: { klasse: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: PauseCircle },
};

interface Props {
  kampagne: MassenAngebotKampagne;
  zeilen: MassenAngebotZeile[];
  andereKampagnen: MassenAngebotKampagne[];
  onAktualisiert: () => void;
}

export default function MassenAngebotZeilenListe({ kampagne, zeilen, andereKampagnen, onAktualisiert }: Props) {
  const { user } = useAuth();
  const benutzer = user?.name || user?.email;
  const gesperrt = kampagne.status === 'versendet';
  // Sandbox: Der Empfänger wird serverseitig auf die Testadresse gezwungen —
  // unabhängig davon, welchen Knopf man drückt. Das muss man sehen, bevor man
  // „Scharf versenden" anklickt, nicht erst danach.
  const sandbox = useMemo(() => istMockModusAktiv(), []);

  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<ZeilenMarkierung | 'alle' | 'ohne_email' | 'versendet'>('alle');
  /**
   * Das Detailfenster hängt an der ID, nicht an einer Kopie der Zeile.
   *
   * Vorher hielt der State das Zeilen-Objekt fest: Nach dem Speichern zeigte
   * das offene Fenster noch die alten Werte, weil die neu geladene Liste es
   * nicht mehr erreichte. Über die ID löst sich die Zeile bei jedem Rendern
   * frisch auf — und das Blättern zum Nachbarn wird zu einem ID-Wechsel.
   */
  const [detailId, setDetailId] = useState<string | null>(null);
  /**
   * Die Durchgehreihenfolge, eingefroren beim Öffnen.
   *
   * Sie darf nicht am aktiven Filter hängen: Wer im Filter „Ohne E-Mail"
   * eine Adresse einträgt und speichert, fällt aus genau diesem Filter — das
   * offene Fenster verschwände mitten in der Arbeit. Die Liste wird deshalb
   * einmal beim Öffnen festgehalten und bleibt bis zum Schließen stabil.
   */
  const [reihenfolge, setReihenfolge] = useState<string[]>([]);
  /** Nacharbeit der fehlenden Empfänger — offen als eigenes Fenster über der Liste. */
  const [zeigeKlaerung, setZeigeKlaerung] = useState(false);
  const [ziehtNach, setZiehtNach] = useState(false);
  const [folieLaeuft, setFolieLaeuft] = useState(false);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState<{ text: string; erledigt: number; gesamt: number } | null>(null);
  const [einzelId, setEinzelId] = useState<string | null>(null);

  const zaehler = useMemo(() => {
    const z: Record<string, number> = {
      alle: zeilen.length,
      ohne_email: zeilen.filter((x) => !x.empfaengerEmail).length,
      versendet: zeilen.filter((x) => x.versendetAm).length,
    };
    for (const m of Object.keys(ZEILEN_MARKIERUNG_LABELS) as ZeilenMarkierung[]) {
      z[m] = zeilen.filter((x) => x.markierung === m).length;
    }
    return z;
  }, [zeilen]);

  const sichtbar = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return zeilen.filter((z) => {
      if (filter === 'ohne_email' && z.empfaengerEmail) return false;
      else if (filter === 'versendet' && !z.versendetAm) return false;
      else if (filter !== 'alle' && filter !== 'ohne_email' && filter !== 'versendet' && z.markierung !== filter) return false;
      if (!s) return true;
      return z.kundenname.toLowerCase().includes(s)
        || (z.kundennummer ?? '').toLowerCase().includes(s)
        || (z.empfaengerEmail ?? '').toLowerCase().includes(s);
    });
  }, [zeilen, filter, suche]);

  // Beim Öffnen gilt, was Filter und Suche gerade zeigen — alles andere wäre
  // beim Durchgehen eine Überraschung. Danach bleibt die Reihe stehen.
  const oeffneDetail = (id: string) => {
    setReihenfolge(sichtbar.map((z) => z.id));
    setDetailId(id);
  };
  const durchgang = bestimmeDurchgang(zeilen, reihenfolge, detailId);

  /**
   * Zeilen ohne Empfänger. Sie sind der stille Verlust des Laufs: Das Angebot
   * wird erzeugt, das Projekt steht im Kanban — aber niemand bekommt eine Mail,
   * und auffallen würde es erst nächste Saison.
   */
  const ohneEmail = useMemo(() => zeilen.filter((z) => !z.empfaengerEmail), [zeilen]);

  /**
   * Lose Ware ohne PE-Folie. Ohne sie kann nicht gekippt werden — fehlt die
   * Zeile im Angebot, steht der Fahrer vor dem Platz. Betrifft nur Zeilen aus
   * der Zeit vor dieser Regel; neu befüllte Kampagnen bringen sie schon mit.
   */
  const ohneFolie = useMemo(
    () => zeilen.filter((z) => !z.versendetAm && massenAngebotService.fehltPflichtFolie(z.positionen)),
    [zeilen]
  );

  const folieErgaenzen = async () => {
    setFolieLaeuft(true);
    try {
      const e = await massenAngebotKampagnenService.ergaenzeFolieInZeilen(kampagne.id, benutzer);
      toast.success(`PE-Folie in ${e.ergaenzt} Angebot(en) ergänzt — je 1 Stk zu ${e.preis.toFixed(2)} €`);
      onAktualisiert();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Folie konnte nicht ergänzt werden');
    } finally {
      setFolieLaeuft(false);
    }
  };

  const empfaengerNachziehen = async () => {
    setZiehtNach(true);
    try {
      const e = await massenAngebotKampagnenService.zieheEmpfaengerNach(kampagne.id, benutzer);
      if (e.gefuellt === 0) {
        toast.info('Im Kundenstamm steht für diese Zeilen keine Adresse — über „Adressen klären" nachtragen.');
      } else {
        toast.success(`${e.gefuellt} Empfänger übernommen${e.offen > 0 ? `, ${e.offen} weiter offen` : ''}`);
      }
      onAktualisiert();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nachziehen fehlgeschlagen');
    } finally {
      setZiehtNach(false);
    }
  };

  const gewaehlte = useMemo(() => zeilen.filter((z) => auswahl.has(z.id)), [zeilen, auswahl]);
  const alleSichtbarGewaehlt = sichtbar.length > 0 && sichtbar.every((z) => auswahl.has(z.id));

  // Merkt sich die zuletzt angeklickte Zeile für die Bereichsauswahl.
  const [letzteId, setLetzteId] = useState<string | null>(null);

  /**
   * Auswahl umschalten. Mit gedrückter Umschalttaste wird der Bereich zwischen
   * der zuletzt geklickten und dieser Zeile gesetzt — bei 87 Zeilen der
   * Unterschied zwischen einem Klick und siebenundachtzig.
   */
  const umschalten = (id: string, mitShift = false) => {
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (mitShift && letzteId) {
        const von = sichtbar.findIndex((z) => z.id === letzteId);
        const bis = sichtbar.findIndex((z) => z.id === id);
        if (von >= 0 && bis >= 0) {
          for (let i = Math.min(von, bis); i <= Math.max(von, bis); i++) neu.add(sichtbar[i].id);
          return neu;
        }
      }
      neu.has(id) ? neu.delete(id) : neu.add(id);
      return neu;
    });
    setLetzteId(id);
  };

  const alleUmschalten = () =>
    setAuswahl(alleSichtbarGewaehlt ? new Set() : new Set(sichtbar.map((z) => z.id)));

  // ---- Aktionen ----

  const sammelMarkierung = async (markierung: ZeilenMarkierung) => {
    if (gewaehlte.length === 0) return;
    setLaeuft({ text: `Setze „${ZEILEN_MARKIERUNG_LABELS[markierung]}"`, erledigt: 0, gesamt: gewaehlte.length });
    try {
      const e = await massenAngebotKampagnenService.setzeMarkierungFuerViele(gewaehlte, markierung, {
        benutzer,
        onFortschritt: (erledigt, gesamt) => setLaeuft({ text: `Setze „${ZEILEN_MARKIERUNG_LABELS[markierung]}"`, erledigt, gesamt }),
      });
      toast.success(`${e.erledigt} Zeilen markiert${e.fehler ? `, ${e.fehler} Fehler` : ''}`);
      setAuswahl(new Set());
      onAktualisiert();
    } finally { setLaeuft(null); }
  };

  /** Zeilen der Auswahl, die tatsächlich rausgehen können. */
  const versandbereit = useMemo(
    () => gewaehlte.filter((z) => z.empfaengerEmail && !z.versendetAm),
    [gewaehlte]
  );

  const sammelVersand = async (testModus: boolean) => {
    if (versandbereit.length === 0) return;
    const frage = testModus
      ? `${versandbereit.length} Angebote im TESTMODUS verschicken?\n\nAlle Mails gehen an die Testadresse.`
      : sandbox
      ? `${versandbereit.length} Angebote erzeugen und verschicken?\n\nSANDBOX — alle Mails gehen an jtatwcook@gmail.com. Kein Verein wird erreicht.`
      : `${versandbereit.length} Angebote SCHARF an die Vereine verschicken?\n\nDas lässt sich nicht rückgängig machen.`;
    if (!window.confirm(frage)) return;
    setLaeuft({ text: testModus ? 'Testversand' : 'Versand läuft', erledigt: 0, gesamt: versandbereit.length });
    let ok = 0; const fehler: string[] = [];
    for (const [index, z] of versandbereit.entries()) {
      try {
        const e = await massenAngebotKampagnenService.erzeugeUndVersendeZeile(kampagne, z, { testModus, benutzer });
        e.versendet ? ok++ : fehler.push(`${z.kundenname}: ${e.fehler}`);
      } catch (error) {
        fehler.push(`${z.kundenname}: ${error instanceof Error ? error.message : 'Fehler'}`);
      }
      setLaeuft({ text: testModus ? 'Testversand' : 'Versand läuft', erledigt: index + 1, gesamt: versandbereit.length });
    }
    setLaeuft(null);
    toast[fehler.length ? 'warning' : 'success'](
      testModus
        ? `${ok} Testmails verschickt — die Zeilen bleiben offen`
        : `${ok} verschickt${fehler.length ? `, ${fehler.length} Fehler` : ''}`
    );
    if (fehler.length) console.error('Versandfehler:', fehler);
    setAuswahl(new Set());
    onAktualisiert();
  };

  const sammelVerschieben = async (zielId: string) => {
    const ziel = andereKampagnen.find((k) => k.id === zielId);
    if (!ziel || gewaehlte.length === 0) return;
    if (!window.confirm(`${gewaehlte.length} Kunden nach „${ziel.name}" verschieben?`)) return;
    setLaeuft({ text: `Verschiebe nach „${ziel.name}"`, erledigt: 0, gesamt: gewaehlte.length });
    try {
      const e = await massenAngebotKampagnenService.verschiebeViele(gewaehlte, ziel, {
        benutzer,
        onFortschritt: (erledigt, gesamt) => setLaeuft({ text: `Verschiebe nach „${ziel.name}"`, erledigt, gesamt }),
      });
      toast[e.fehler.length ? 'warning' : 'success'](
        `${e.erledigt} verschoben${e.fehler.length ? `, ${e.fehler.length} übersprungen` : ''}`
      );
      setAuswahl(new Set());
      onAktualisiert();
    } finally { setLaeuft(null); }
  };

  /** Einzelne Zeile erzeugen und sofort verschicken. */
  const einzelVersand = async (z: MassenAngebotZeile, testModus: boolean) => {
    const frage = testModus
      ? `Angebot für ${z.kundenname} im TESTMODUS verschicken?`
      : sandbox
      ? `Angebot für ${z.kundenname} erzeugen und verschicken?\n\nSANDBOX — die Mail geht an jtatwcook@gmail.com, NICHT an ${z.empfaengerEmail}.`
      : `Angebot für ${z.kundenname} SCHARF an ${z.empfaengerEmail} verschicken?`;
    if (!window.confirm(frage)) return;
    setEinzelId(z.id);
    try {
      const e = await massenAngebotKampagnenService.erzeugeUndVersendeZeile(kampagne, z, { testModus, benutzer });
      if (e.versendet) {
        toast.success(
          testModus
            ? `${z.kundenname}: Testmail an die Testadresse — die Zeile bleibt offen`
            : `${z.kundenname}: ${e.angebotsnummer} verschickt`
        );
      }
      else toast.error(`${z.kundenname}: ${e.fehler}`);
      onAktualisiert();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Versand fehlgeschlagen');
    } finally { setEinzelId(null); }
  };

  if (zeilen.length === 0) return null;

  const FILTER: Array<{ wert: typeof filter; label: string }> = [
    { wert: 'alle', label: 'Alle' },
    { wert: 'offen', label: 'Offen' },
    { wert: 'geprueft', label: 'Geprüft' },
    { wert: 'kompliziert', label: 'Kompliziert' },
    { wert: 'ohne_email', label: 'Ohne E-Mail' },
    { wert: 'versendet', label: 'Versendet' },
    { wert: 'zurueckgestellt', label: 'Zurückgestellt' },
    { wert: 'archivieren', label: 'Ins Archiv' },
    { wert: 'platzbauer', label: 'Über Platzbauer' },
  ];

  return (
    <div className="space-y-3">
      {/* Fehlende Empfänger — der stille Verlust des Laufs.
          Zwei Wege, weil es zwei Ursachen gibt: Die Adresse steht schon am
          Kunden und fehlt nur in der Zeile (nachziehen), oder es gibt sie
          nirgends (klären — dort schlägt das System Adressen aus Rechnungen,
          Ansprechpartnern und Projekten vor). */}
      {ohneEmail.length > 0 && !gesperrt && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3 flex-wrap">
          <MailWarning className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-[16rem]">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {ohneEmail.length} {ohneEmail.length === 1 ? 'Verein hat' : 'Vereine haben'} keine Empfängeradresse
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
              Das Angebot wird erzeugt, die Mail geht nicht raus — auffallen würde es erst nächste Saison.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => void empfaengerNachziehen()}
              disabled={ziehtNach}
              title="Adressen übernehmen, die am Kunden schon gepflegt sind"
              className="px-3 py-2 rounded-lg text-sm border border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 bg-white/60 dark:bg-transparent hover:bg-white dark:hover:bg-amber-950/60 flex items-center gap-1.5 disabled:opacity-50"
            >
              {ziehtNach ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Aus Kundenstamm nachziehen
            </button>
            <button
              onClick={() => setZeigeKlaerung(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white"
            >
              Adressen klären
            </button>
          </div>
        </div>
      )}

      {/* Fehlende Pflicht-Folie bei loser Ware. */}
      {ohneFolie.length > 0 && !gesperrt && (
        <div className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-4 flex items-start gap-3 flex-wrap">
          <Layers className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-[16rem]">
            <p className="font-semibold text-sky-900 dark:text-sky-200">
              {ohneFolie.length} {ohneFolie.length === 1 ? 'Angebot' : 'Angebote'} mit loser Ware ohne PE-Folie
            </p>
            <p className="text-sm text-sky-800 dark:text-sky-300 mt-0.5">
              Ohne Folie kann nicht gekippt werden. Ergänzt je 1 Stk — Sackware auf Palette und
              BigBags bleiben unberührt.
            </p>
          </div>
          <button
            onClick={() => void folieErgaenzen()}
            disabled={folieLaeuft}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
          >
            {folieLaeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            Folie ergänzen
          </button>
        </div>
      )}

      {/* Filter + Suche */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER.map((f) => {
          const anzahl = zaehler[f.wert as string] ?? 0;
          if (f.wert !== 'alle' && anzahl === 0) return null;
          const aktiv = filter === f.wert;
          return (
            <button key={String(f.wert)} onClick={() => setFilter(f.wert)}
              className={`px-2.5 py-1 rounded-lg text-sm transition-colors ${
                aktiv ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50'
              }`}>
              {f.label} <span className="opacity-60">{anzahl}</span>
            </button>
          );
        })}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Verein, Nummer, E-Mail…"
            className="pl-8 pr-3 py-1.5 w-56 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
        </div>
      </div>

      {sandbox && !gesperrt && (
        <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Sandbox.</strong> Jede Mail geht an <strong>jtatwcook@gmail.com</strong> — auch bei
            „Absenden". Kein Verein kann von hier aus erreicht werden.
          </span>
        </p>
      )}

      {gesperrt && (
        <p className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 flex-shrink-0" />
          Versendet — schreibgeschützt. Was beim Verein im Postfach liegt, lässt sich nicht zurückholen.
        </p>
      )}

      {/* Aktionsleiste — fixiert am unteren Rand, NICHT im Dokumentfluss.
          Eine Leiste, die beim Anhaken erscheint und die Tabelle nach unten
          schiebt, verschiebt genau die Zeilen, die man als Nächstes anhaken
          will. Beim Auswählen von zwanzig Kunden trifft man dann daneben. */}
      {gewaehlte.length > 0 && !gesperrt && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(60rem,calc(100vw-2rem))] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-slate-100">{gewaehlte.length} ausgewählt</span>
            <button onClick={() => setAuswahl(new Set())} className="p-1 rounded text-gray-400 hover:text-gray-700" title="Auswahl aufheben">
              <X className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {gewaehlte.filter((z) => z.empfaengerEmail).length} mit E-Mail ·{' '}
              {gewaehlte.filter((z) => z.versendetAm).length} schon versendet ·{' '}
              <kbd className="px-1 rounded bg-gray-100 dark:bg-slate-700">Umschalt</kbd> für Bereiche
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => void sammelMarkierung('geprueft')} disabled={!!laeuft}
              className="px-3 py-1.5 rounded-lg text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Geprüft
            </button>
            <button onClick={() => void sammelMarkierung('kompliziert')} disabled={!!laeuft}
              className="px-3 py-1.5 rounded-lg text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300 disabled:opacity-50 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Kompliziert
            </button>
            <button onClick={() => void sammelMarkierung('zurueckgestellt')} disabled={!!laeuft}
              className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 disabled:opacity-50 flex items-center gap-1.5">
              <PauseCircle className="w-4 h-4" /> Zurückstellen
            </button>
            <button onClick={() => void sammelMarkierung('archivieren')} disabled={!!laeuft}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300 disabled:opacity-50 flex items-center gap-1.5">
              <Archive className="w-4 h-4" /> Ins Archiv
            </button>
            <span className="w-px h-6 bg-gray-200 dark:bg-slate-600 mx-1" />
            <button onClick={() => void sammelVersand(true)} disabled={!!laeuft || versandbereit.length === 0}
              title="Alle Ausgewählten an die Testadresse"
              className="px-3 py-1.5 rounded-lg text-sm border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 disabled:opacity-40 flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4" /> Test ({versandbereit.length})
            </button>
            <button onClick={() => void sammelVersand(false)} disabled={!!laeuft || versandbereit.length === 0}
              title={sandbox ? 'Sandbox: landet bei der Testadresse' : 'Scharf an die Vereine'}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 flex items-center gap-1.5">
              <Send className="w-4 h-4" /> Absenden ({versandbereit.length})
            </button>
            {andereKampagnen.length > 0 && (
              <select value="" onChange={(e) => e.target.value && void sammelVerschieben(e.target.value)} disabled={!!laeuft}
                aria-label="Ausgewählte verschieben"
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
                <option value="">→ verschieben nach…</option>
                {andereKampagnen.map((k) => (
                  <option key={k.id} value={k.id}>{MASSEN_ANGEBOT_TYP_LABELS[k.typ]} · {k.name}</option>
                ))}
              </select>
            )}
          </div>
          {laeuft && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                <span>{laeuft.text}</span><span>{laeuft.erledigt}/{laeuft.gesamt}</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-slate-700 dark:bg-slate-300 transition-all"
                  style={{ width: `${Math.round((laeuft.erledigt / Math.max(1, laeuft.gesamt)) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabelle */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800/70 text-gray-600 dark:text-slate-400">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={alleSichtbarGewaehlt} onChange={alleUmschalten}
                  disabled={gesperrt} aria-label="Alle sichtbaren auswählen"
                  className="w-4 h-4 rounded border-gray-300" />
              </th>
              <th className="text-left px-2 py-2 font-medium">Kunde</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Menge</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">€/t</th>
              <th className="text-left px-2 py-2 font-medium">Empfänger</th>
              <th className="text-left px-2 py-2 font-medium">Status</th>
              <th className="w-24 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {sichtbar.map((z) => {
              const St = MARKIERUNG_STIL[z.markierung];
              const gewaehlt = auswahl.has(z.id);
              const busy = einzelId === z.id;
              return (
                <tr key={z.id}
                  className={`transition-colors ${gewaehlt ? 'bg-slate-50 dark:bg-slate-700/40' : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/30'} ${busy ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={gewaehlt}
                      onChange={() => { /* Auswahl läuft über onClick — dort ist die Umschalttaste lesbar */ }}
                      onClick={(e) => umschalten(z.id, e.shiftKey)}
                      disabled={gesperrt} aria-label={`${z.kundenname} auswählen`}
                      className="w-4 h-4 rounded border-gray-300" />
                  </td>
                  <td className="px-2 py-2 cursor-pointer" onClick={() => oeffneDetail(z.id)}>
                    <span className="font-medium text-gray-900 dark:text-slate-100">{z.kundenname}</span>
                    {z.kundennummer && <span className="ml-1.5 text-xs text-gray-400">{z.kundennummer}</span>}
                    {z.selbstabholer && <Warehouse className="inline w-3.5 h-3.5 ml-1.5 text-cyan-600" aria-label="Selbstabholer" />}
                    {/* Wer sich selbst gemeldet hat, ist kein Kaltkontakt. */}
                    {/anfrageformular/i.test(z.herkunft) && (
                      <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 align-middle">
                        <Inbox className="w-3 h-3" /> Anfrage
                      </span>
                    )}
                    <span className="block text-xs text-gray-500 dark:text-slate-400 truncate max-w-md">{z.herkunft}</span>
                    {z.warnungen.length > 0 && (
                      <span className="block text-xs text-amber-600 dark:text-amber-400 truncate max-w-md">
                        <AlertTriangle className="inline w-3 h-3 mr-1" />{z.warnungen[0]}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-gray-700 dark:text-slate-300">{z.menge} t</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-gray-700 dark:text-slate-300">{z.preisProTonne.toFixed(2)}</td>
                  <td className="px-2 py-2 max-w-[14rem]">
                    {z.empfaengerEmail
                      ? <span className="text-gray-600 dark:text-slate-400 truncate block">{z.empfaengerEmail}</span>
                      : <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><MailWarning className="w-3.5 h-3.5" /> fehlt</span>}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${St.klasse}`}>
                      <St.icon className="w-3 h-3" /> {ZEILEN_MARKIERUNG_LABELS[z.markierung]}
                    </span>
                    {z.versendetAm && (
                      <span className="block text-xs text-green-600 dark:text-green-400 mt-0.5">
                        {z.angebotsnummer} versendet
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {!gesperrt && !z.versendetAm && z.empfaengerEmail && (
                        <>
                          <button onClick={() => void einzelVersand(z, true)} disabled={busy}
                            title="Nur an die Testadresse schicken"
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                          </button>
                          <button onClick={() => void einzelVersand(z, false)} disabled={busy}
                            title={sandbox ? 'Sandbox: landet bei der Testadresse' : 'Scharf an den Verein senden'}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40">
                            <Send className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button onClick={() => oeffneDetail(z.id)} title="Details, PDF, Lieferkosten"
                        className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-slate-200">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sichtbar.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-8">Keine Zeile passt zu Filter und Suche.</p>
        )}
      </div>

      {zeigeKlaerung && (
        <div
          role="dialog" aria-modal="true" aria-label="Empfängeradressen klären"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={() => { setZeigeKlaerung(false); void empfaengerNachziehen(); }}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Die Klärung prüft ALLE Kunden dieser Zeilen: Wer keine Adresse
                hat, bekommt Vorschläge; wer mehrere hat, wird entschieden. */}
            <MassenAngebotEmailKlaerung
              kundeIds={ohneEmail.map((z) => z.kundeId)}
              onFertig={() => {
                setZeigeKlaerung(false);
                // Die Klärung schreibt an den KUNDEN. Ohne diesen Schritt bliebe
                // die Zeile leer und der Versand überspränge sie weiterhin.
                void empfaengerNachziehen();
              }}
            />
          </div>
        </div>
      )}

      {durchgang.zeile && (
        <MassenAngebotZeileDetail
          // Neu aufbauen beim Blättern: Menge, Preis und Text sind lokaler
          // State im Fenster und würden sonst vom Vorgänger stehen bleiben.
          key={durchgang.zeile.id}
          zeile={durchgang.zeile} kampagne={kampagne}
          onSchliessen={() => setDetailId(null)}
          // Speichern hält das Fenster offen — nur die Liste wird frisch.
          onGespeichert={onAktualisiert}
          position={durchgang.nummer > 0 ? { nummer: durchgang.nummer, gesamt: durchgang.gesamt } : undefined}
          onVorher={durchgang.vorherId ? () => setDetailId(durchgang.vorherId!) : undefined}
          onNaechste={durchgang.naechsteId ? () => setDetailId(durchgang.naechsteId!) : undefined}
        />
      )}

      {/* Freiraum, solange die fixierte Leiste sichtbar ist — sonst verdeckt sie
          die letzten Tabellenzeilen. */}
      {gewaehlte.length > 0 && !gesperrt && <div className="h-28" aria-hidden />}

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <ArrowRightLeft className="w-3.5 h-3.5" />
        Wer in den Instandsetzungs- oder Abholer-Lauf verschoben wird, bekommt das Merkmal am Kunden
        nachgetragen — nächste Saison steht er von allein richtig.
      </p>
    </div>
  );
}
