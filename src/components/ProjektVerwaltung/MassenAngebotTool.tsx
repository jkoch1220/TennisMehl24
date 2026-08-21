import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Calculator,
  Send,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FlaskConical,
  Play,
  Mail,
  Loader2,
  History,
  ShieldAlert,
  Undo2,
  Filter as FilterIcon,
  Info,
  MousePointerClick,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { massenAngebotService } from '../../services/massenAngebotService';
import { getPreisKonfiguration } from '../../services/stammdatenService';
import {
  MassenAngebotKandidat,
  ErzeugungsErgebnis,
  VersandKandidat,
  AngebotsLauf,
} from '../../types/massenAngebot';
import MassenAngebotDetailPanel from './MassenAngebotDetailPanel';
import MassenAngebotVorschlagsliste from './MassenAngebotVorschlagsliste';
import MassenAngebotEmailKlaerung from './MassenAngebotEmailKlaerung';
import BestaetigungsDialog from './MassenAngebotBestaetigungsDialog';
import {
  eur,
  PROFIL_BADGE,
  quelleLabel,
  referenzKurzLabel,
  STATUS_BADGE,
} from './massenAngebotUi';

type FilterTyp = 'alle' | 'vorjahr' | 'neukunden' | 'fehler' | 'manuell';

// Unterhalb dieser Zahl ist ein Frühjahrslauf mit hoher Wahrscheinlichkeit kein
// gewollter Teillauf, sondern ein vergessenes Opt-in: Wer nicht als
// „massenangebots-tauglich" markiert ist, erscheint gar nicht erst in der Liste.
// Der Bestand zählt mehrere hundert Vereine mit Vorjahresmenge.
const OPT_IN_ERWARTUNG = 50;

// Eine Zeile der (schlanken) Master-Liste: Name, Nummer, Profil, Quelle,
// Referenz, Summe, Status, E-Mail-Warnung. Klick öffnet das Detail-Panel.
const KandidatListenZeile = ({
  kandidat,
  aktiv,
  onToggle,
  onSelect,
}: {
  kandidat: MassenAngebotKandidat;
  aktiv: boolean;
  onToggle: (kundeId: string) => void;
  onSelect: (kundeId: string) => void;
}) => {
  const badge = STATUS_BADGE[kandidat.status];
  const profil = PROFIL_BADGE[kandidat.produktprofil];
  const referenzKurz = referenzKurzLabel(kandidat);
  return (
    <div
      onClick={() => onSelect(kandidat.kundeId)}
      className={`px-3 py-2.5 flex items-center gap-3 cursor-pointer border-l-2 transition-colors ${
        aktiv
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
          : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800/40'
      }`}
    >
      <input
        type="checkbox"
        checked={kandidat.ausgewaehlt}
        disabled={kandidat.status !== 'neu'}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(kandidat.kundeId)}
        className="h-4 w-4 text-purple-600 rounded border-gray-300 dark:border-slate-600 disabled:opacity-40 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-900 dark:text-slate-100 truncate">
            {kandidat.kundenname}
          </span>
          {kandidat.kundennummer && (
            <span className="text-xs text-gray-400 flex-shrink-0">{kandidat.kundennummer}</span>
          )}
          {kandidat.emailFehlt && kandidat.status === 'neu' && (
            <span title="Empfänger-E-Mail fehlt" className="flex-shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-slate-400 flex-wrap">
          <span
            className={`inline-block px-1.5 py-0.5 rounded-full font-semibold ${profil.className}`}
          >
            {profil.label}
          </span>
          <span>{quelleLabel(kandidat)}</span>
          {referenzKurz && <span className="text-gray-400">{referenzKurz}</span>}
          {kandidat.statusGrund && (
            <span className="text-amber-600 dark:text-amber-400">{kandidat.statusGrund}</span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-medium text-gray-900 dark:text-slate-100 text-sm">
          {kandidat.angebotssumme ? eur(kandidat.angebotssumme) : '—'}
        </div>
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
};

const MassenAngebotTool = ({ saisonjahr }: { saisonjahr: number }) => {
  const { user, isAdmin } = useAuth();
  const istTestumgebung = useMemo(() => massenAngebotService.istTestumgebung(), []);

  // Zieljahr des Laufs — bewusst getrennt von der Saison, die das Board anzeigt.
  // Die Frühjahrsangebote entstehen im Herbst der Vorsaison: Im September 2026
  // laufen die Angebote für die Instandsetzung 2027. Ohne eigene Wahl müsste man
  // dafür die Standardsaison des ganzen Portals hochstellen — das zieht den
  // Nummernkreis aller Belegarten mit, und die nächste Rechnung im Oktober hieße
  // RE-2027-0001.
  const [zielSaison, setZielSaison] = useState(saisonjahr);
  const zielSaisonManuell = useRef(false);

  // Folgt der Saisonwahl des Boards, solange hier nichts anderes eingestellt wurde.
  useEffect(() => {
    if (!zielSaisonManuell.current) setZielSaison(saisonjahr);
  }, [saisonjahr]);

  const [kandidaten, setKandidaten] = useState<MassenAngebotKandidat[]>([]);
  const [loading, setLoading] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [fehlerMeldung, setFehlerMeldung] = useState<string | null>(null);
  // Fortschritt des Dry-Runs („Lade Vorjahres-Projekte… 40 %")
  const [dryRunFortschritt, setDryRunFortschritt] = useState<{
    schritt: string;
    prozent: number;
  } | null>(null);

  const [testModus, setTestModus] = useState(true);
  const [filter, setFilter] = useState<FilterTyp>('alle');
  const [suchText, setSuchText] = useState('');
  // Kunde, dessen Detail-Panel rechts geöffnet ist
  const [auswahlKundeId, setAuswahlKundeId] = useState<string | null>(null);

  // Bereits angewandte Preisanpassung dieses Laufs (null = noch keine).
  const [angewandteAnpassung, setAngewandteAnpassung] = useState<{ typ: 'prozent' | 'fix'; wert: number } | null>(null);
  const [anpassungsTyp, setAnpassungsTyp] = useState<'prozent' | 'fix'>('prozent');
  const [anpassungsWert, setAnpassungsWert] = useState('');
  // Vorbelegung aus den Stammdaten (zentrale Preis-Konfiguration); pro Lauf überschreibbar.
  const [stammdatenPreisanpassung, setStammdatenPreisanpassung] = useState<number | null>(null);

  // Globale Preisanpassung aus den Stammdaten vorbelegen (nur solange der Nutzer
  // noch nichts eingegeben hat — der Wert bleibt pro Lauf frei überschreibbar).
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      try {
        const { saisonPreisanpassungProzent } = await getPreisKonfiguration();
        if (!aktiv) return;
        setStammdatenPreisanpassung(saisonPreisanpassungProzent);
        setAnpassungsWert((prev) => (prev === '' ? String(saisonPreisanpassungProzent) : prev));
      } catch (error) {
        console.warn('Preis-Konfiguration konnte nicht geladen werden:', error);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // Empfänger-Klärung: offen, solange der Nutzer sie nicht geschlossen hat.
  const [zeigeEmailKlaerung, setZeigeEmailKlaerung] = useState(false);

  const [limit, setLimit] = useState('');
  const [erzeugeBestaetigung, setErzeugeBestaetigung] = useState(false);
  const [erzeugung, setErzeugung] = useState<{ done: number; total: number; aktuell: string } | null>(null);
  const [ergebnis, setErgebnis] = useState<ErzeugungsErgebnis | null>(null);

  const [rollbackBestaetigung, setRollbackBestaetigung] = useState(false);
  // Gesetzt, wenn die Rücknahme aus dem Protokoll heraus angestoßen wird.
  const [rollbackBatchId, setRollbackBatchId] = useState<string | null>(null);
  const [rollbackInfo, setRollbackInfo] = useState<string | null>(null);
  const [rollbackLaeuft, setRollbackLaeuft] = useState(false);

  // Wird vom Stopp-Knopf gesetzt und vor jeder einzelnen Mail geprüft.
  const versandAbbruch = useRef(false);

  const [versandKandidaten, setVersandKandidaten] = useState<VersandKandidat[] | null>(null);
  // Batch, zu dem die aktuell geladene Versand-Liste gehört (überlebt auch den
  // Weg über das Protokoll nach einem Seiten-Reload).
  const [versandBatchId, setVersandBatchId] = useState<string | null>(null);
  // batchId, deren Versand-Liste gerade aus dem Protokoll geladen wird
  const [versandListeLaedt, setVersandListeLaedt] = useState<string | null>(null);
  const [versandBestaetigung, setVersandBestaetigung] = useState(false);
  const [versand, setVersand] = useState<{ done: number; total: number; aktuell: string } | null>(null);
  const [versandErgebnis, setVersandErgebnis] = useState<{
    gesendet: number;
    fehler: { kundenname: string; fehler: string }[];
    /** Versendet, aber der Statuswechsel scheiterte — nicht erneut senden. */
    nachzutragen?: { kundenname: string; hinweis: string }[];
    /** Gesetzt, wenn der Versand über den Anhalten-Knopf gestoppt wurde. */
    abgebrochen?: { offen: number };
  } | null>(null);

  const [laeufe, setLaeufe] = useState<AngebotsLauf[]>([]);

  const benutzer = (user as { name?: string; email?: string } | null)?.name
    || (user as { name?: string; email?: string } | null)?.email;

  const ladeLaeufe = useCallback(async () => {
    setLaeufe(await massenAngebotService.ladeLaeufe(zielSaison));
  }, [zielSaison]);

  const ladeKandidaten = useCallback(async () => {
    setLoading(true);
    setFehlerMeldung(null);
    setDryRunFortschritt({ schritt: 'Starte Berechnung…', prozent: 0 });
    try {
      const liste = await massenAngebotService.sammleKandidaten(zielSaison, (schritt, prozent) =>
        setDryRunFortschritt({ schritt, prozent })
      );
      setKandidaten(liste);
      setGeladen(true);
      setAuswahlKundeId(null);
      // Frische Liste = frische Preise. Die Anpassung muss erneut angewandt werden.
      setAngewandteAnpassung(null);
      await ladeLaeufe();
    } catch (error) {
      console.error('Fehler beim Sammeln der Kandidaten:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
      setDryRunFortschritt(null);
    }
  }, [zielSaison, ladeLaeufe]);

  useEffect(() => {
    void ladeLaeufe();
  }, [ladeLaeufe]);

  const zusammenfassung = useMemo(
    () => massenAngebotService.berechneZusammenfassung(kandidaten),
    [kandidaten]
  );

  const gefiltert = useMemo(() => {
    let liste: MassenAngebotKandidat[];
    switch (filter) {
      case 'vorjahr':
        liste = kandidaten.filter((k) => k.quelle === 'vorjahr');
        break;
      case 'neukunden':
        liste = kandidaten.filter((k) => k.quelle === 'plz_kalkulation' || k.quelle === 'mosaik');
        break;
      case 'fehler':
        liste = kandidaten.filter((k) => k.status === 'fehler');
        break;
      case 'manuell':
        liste = kandidaten.filter((k) => k.status === 'manuell' || k.status === 'existiert');
        break;
      default:
        liste = kandidaten;
    }
    const suche = suchText.trim().toLowerCase();
    if (!suche) return liste;
    return liste.filter(
      (k) =>
        k.kundenname.toLowerCase().includes(suche) ||
        (k.kundennummer || '').toLowerCase().includes(suche)
    );
  }, [kandidaten, filter, suchText]);

  const ausgewaehlteNeu = useMemo(
    () => kandidaten.filter((k) => k.status === 'neu' && k.ausgewaehlt),
    [kandidaten]
  );

  const auswahlKandidat = useMemo(
    () => (auswahlKundeId ? kandidaten.find((k) => k.kundeId === auswahlKundeId) ?? null : null),
    [kandidaten, auswahlKundeId]
  );

  // Kandidaten, die erzeugt würden, aber keinen Empfänger haben. Sie bekommen ein
  // Projekt und ein Angebot — nur eben keine Mail. Ohne Hinweis fällt das erst auf,
  // wenn im Frühjahr die Bestellung ausbleibt.
  const kandidatenOhneEmail = useMemo(
    () => ausgewaehlteNeu.filter((k) => k.emailFehlt),
    [ausgewaehlteNeu]
  );

  // Geprüft wird die ganze Auswahl, nicht nur die Kunden ohne Adresse: Auch wer
  // zwei widersprüchliche Adressen hat, gehört geklärt — dort entscheidet sonst
  // die Reihenfolge im Code, wer die Mail bekommt.
  const kandidatenFuerKlaerung = useMemo(
    () => ausgewaehlteNeu.map((k) => k.kundeId),
    [ausgewaehlteNeu]
  );

  const handleToggle = useCallback((kundeId: string) => {
    setKandidaten((prev) =>
      prev.map((k) => (k.kundeId === kundeId && k.status === 'neu' ? { ...k, ausgewaehlt: !k.ausgewaehlt } : k))
    );
  }, []);

  // Alle ab-/auswählen — wirkt nur auf die aktuell gefilterte Ansicht
  const handleAlleAuswaehlen = useCallback((ausgewaehlt: boolean, sichtbareIds?: Set<string>) => {
    setKandidaten((prev) =>
      prev.map((k) =>
        k.status === 'neu' && (!sichtbareIds || sichtbareIds.has(k.kundeId))
          ? { ...k, ausgewaehlt }
          : k
      )
    );
  }, []);

  // ===== DETAIL-PANEL-ÄNDERUNGEN (fließen in die Erzeugung ein) =====

  const handlePositionAendern = useCallback(
    (kundeId: string, positionId: string, menge: number, preis: number) => {
      setKandidaten((prev) =>
        prev.map((k) =>
          k.kundeId === kundeId
            ? massenAngebotService.aktualisierePosition(k, positionId, menge, preis)
            : k
        )
      );
    },
    []
  );

  const handlePositionEntfernen = useCallback((kundeId: string, positionId: string) => {
    setKandidaten((prev) =>
      prev.map((k) =>
        k.kundeId === kundeId ? massenAngebotService.entfernePosition(k, positionId) : k
      )
    );
  }, []);

  const handleEmailAendern = useCallback((kundeId: string, email: string) => {
    setKandidaten((prev) =>
      prev.map((k) =>
        k.kundeId === kundeId ? massenAngebotService.setzeEmpfaengerEmail(k, email) : k
      )
    );
  }, []);

  const handleNotizAendern = useCallback((kundeId: string, notiz: string) => {
    setKandidaten((prev) => prev.map((k) => (k.kundeId === kundeId ? { ...k, notiz } : k)));
  }, []);

  const handlePreisanpassung = useCallback(() => {
    const wert = Number(anpassungsWert);
    if (!Number.isFinite(wert) || wert === 0) return;
    setKandidaten((prev) =>
      massenAngebotService.wendePreisanpassungAn(prev, { typ: anpassungsTyp, wert })
    );
    // Merken, was angewandt wurde. Die Anpassung wirkt auf die bereits berechneten
    // Preise — ein zweiter Klick multipliziert erneut (aus +4 % würden +8,16 %).
    // Deshalb wird der Knopf danach gesperrt, bis die Liste neu berechnet ist.
    setAngewandteAnpassung({ typ: anpassungsTyp, wert });
  }, [anpassungsTyp, anpassungsWert]);

  const limitZahl = limit ? Math.max(0, Math.floor(Number(limit))) : 0;
  const anzahlZuErzeugen = limitZahl > 0 ? Math.min(limitZahl, ausgewaehlteNeu.length) : ausgewaehlteNeu.length;

  const bestaetigeErzeugung = useCallback(async () => {
    setErzeugeBestaetigung(false);
    setErgebnis(null);
    setErzeugung({ done: 0, total: anzahlZuErzeugen, aktuell: '' });
    try {
      const res = await massenAngebotService.erzeugeBatch(kandidaten, zielSaison, {
        benutzer,
        limit: limitZahl > 0 ? limitZahl : undefined,
        onFortschritt: (done, total, aktuell) => setErzeugung({ done, total, aktuell }),
      });
      setErgebnis(res);
      // Vorschau neu laden (erzeugte gelten jetzt als "existiert"), Versandliste vorbereiten
      await ladeKandidaten();
      const vk = await massenAngebotService.ladeVersandKandidaten(res.batchId);
      setVersandKandidaten(vk);
      setVersandBatchId(res.batchId);
    } catch (error) {
      console.error('Fehler bei der Erzeugung:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Erzeugung fehlgeschlagen');
    } finally {
      setErzeugung(null);
    }
  }, [anzahlZuErzeugen, kandidaten, zielSaison, benutzer, limitZahl, ladeKandidaten]);

  const bestaetigeRollback = useCallback(async () => {
    // Die Kennung kommt entweder aus dem gerade gelaufenen Ergebnis oder aus dem
    // Protokoll — nach einem Neuladen des Tabs gibt es nur noch letzteres.
    const batchId = rollbackBatchId ?? ergebnis?.batchId;
    if (!batchId) return;
    setRollbackBestaetigung(false);
    setRollbackLaeuft(true);
    setRollbackInfo(null);
    try {
      const res = await massenAngebotService.rollbackBatch(batchId);
      setRollbackInfo(
        `${res.geloescht} gelöscht, ${res.uebersprungenVersendet} behalten (versendet), ${res.fehler} Fehler.`
      );
      setErgebnis(null);
      setVersandKandidaten(null);
      setVersandBatchId(null);
      setRollbackBatchId(null);
      await ladeKandidaten();
    } catch (error) {
      console.error('Rollback fehlgeschlagen:', error);
      setRollbackInfo(`Rollback fehlgeschlagen: ${error instanceof Error ? error.message : 'Fehler'}`);
    } finally {
      setRollbackLaeuft(false);
    }
  }, [ergebnis, rollbackBatchId, ladeKandidaten]);

  const versandAuswahl = useMemo(
    () => (versandKandidaten ?? []).filter((v) => v.ausgewaehlt && v.empfaengerEmail) ,
    [versandKandidaten]
  );
  const versandAuswahlTest = useMemo(
    () => (versandKandidaten ?? []).filter((v) => v.ausgewaehlt),
    [versandKandidaten]
  );

  const bestaetigeVersand = useCallback(async () => {
    if (!versandKandidaten) return;
    setVersandBestaetigung(false);
    setVersandErgebnis(null);
    versandAbbruch.current = false;
    // Im Testmodus dürfen auch Zeilen ohne Kunden-E-Mail mit (gehen an Testadresse).
    const liste = testModus ? versandAuswahlTest : versandAuswahl;
    setVersand({ done: 0, total: liste.length, aktuell: '' });
    try {
      const res = await massenAngebotService.versendeBatch(
        liste,
        testModus,
        (done, total, aktuell) => setVersand({ done, total, aktuell }),
        { abbruchSignal: () => versandAbbruch.current }
      );
      setVersandErgebnis(res);
      if (!testModus && versandBatchId) {
        const vk = await massenAngebotService.ladeVersandKandidaten(versandBatchId);
        // Bewusst abgewählte Empfänger bleiben abgewählt. Die frisch geladene
        // Liste hakt sonst alles wieder an — auch die Zweifelsfälle, die vor dem
        // Lauf herausgenommen wurden. Nach einem Abbruch bei 150 von 290 bekämen
        // sie beim Weitermachen ihr Angebot doch.
        setVersandKandidaten((prev) => {
          const abgewaehlt = new Set(
            (prev ?? []).filter((v) => !v.ausgewaehlt).map((v) => v.projektId)
          );
          return vk.map((v) => (abgewaehlt.has(v.projektId) ? { ...v, ausgewaehlt: false } : v));
        });
      }
    } catch (error) {
      console.error('Versand fehlgeschlagen:', error);
      setFehlerMeldung(error instanceof Error ? error.message : 'Versand fehlgeschlagen');
    } finally {
      setVersand(null);
    }
  }, [versandKandidaten, testModus, versandAuswahl, versandAuswahlTest, versandBatchId]);

  const handleVersandToggle = useCallback((projektId: string) => {
    setVersandKandidaten((prev) =>
      prev
        ? prev.map((v) => (v.projektId === projektId ? { ...v, ausgewaehlt: !v.ausgewaehlt } : v))
        : prev
    );
  }, []);

  const handleVersandAlle = useCallback((wert: boolean) => {
    setVersandKandidaten((prev) => (prev ? prev.map((v) => ({ ...v, ausgewaehlt: wert })) : prev));
  }, []);

  // Versand-Liste eines früheren Laufs aus dem Protokoll öffnen — damit der
  // Versand-Schritt auch nach einem Seiten-Reload wieder erreichbar ist.
  const oeffneVersandListe = useCallback(async (batchId: string) => {
    setVersandListeLaedt(batchId);
    setFehlerMeldung(null);
    try {
      const vk = await massenAngebotService.ladeVersandKandidaten(batchId);
      setVersandKandidaten(vk);
      setVersandBatchId(batchId);
      setVersandErgebnis(null);
    } catch (error) {
      console.error('Versand-Liste konnte nicht geladen werden:', error);
      setFehlerMeldung(
        error instanceof Error ? error.message : 'Versand-Liste konnte nicht geladen werden'
      );
    } finally {
      setVersandListeLaedt(null);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-amber-800 dark:text-amber-300 flex items-center gap-3">
        <ShieldAlert className="w-6 h-6" />
        Das Massen-Angebots-Tool ist nur für Administratoren verfügbar.
      </div>
    );
  }

  const versandAnzahl = testModus ? versandAuswahlTest.length : versandAuswahl.length;

  return (
    <div className="space-y-5">
      {/* Kopf: Titel + Sicherheitshinweise */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
            <Calculator className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text">
                Frühjahrs-Angebote · Saison
              </h2>
              <select
                value={zielSaison}
                onChange={(e) => {
                  zielSaisonManuell.current = true;
                  setZielSaison(Number(e.target.value));
                  // Die geladene Liste gehört zum alten Zieljahr — sie würde sonst
                  // Kandidaten zeigen, die für das neue Jahr gar nicht gelten.
                  setKandidaten([]);
                  setGeladen(false);
                  setAuswahlKundeId(null);
                  setErgebnis(null);
                  setAngewandteAnpassung(null);
                }}
                className="px-2.5 py-1 text-lg font-bold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-input text-gray-900 dark:text-dark-text"
                aria-label="Saison, für die die Angebote erzeugt werden"
              >
                {[saisonjahr - 1, saisonjahr, saisonjahr + 1].map((jahr) => (
                  <option key={jahr} value={jahr}>
                    {jahr}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Erzeugt Angebote für alle aktiven Kunden mit Kennzeichen „Massenangebots-tauglich"
              (Opt-in).
            </p>
            {zielSaison !== saisonjahr && (
              <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Der Lauf erzeugt Angebote für <strong>{zielSaison}</strong>, während das Portal auf
                  Saison <strong>{saisonjahr}</strong> steht. Die Angebotsnummern lauten{' '}
                  <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/40">
                    ANG-{zielSaison}-…
                  </code>
                  ; Rechnungen und Lieferscheine behalten den Nummernkreis {saisonjahr}.
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Testmodus-Schalter mit klarer Konsequenz */}
        <button
          onClick={() => setTestModus((v) => !v)}
          className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 transition-colors ${
            testModus
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
          }`}
          title="Steuert den E-Mail-Versand"
        >
          <FlaskConical className="w-5 h-5" />
          <span className="font-semibold">Testmodus {testModus ? 'AN' : 'AUS'}</span>
        </button>
      </div>

      {/* Banner Testumgebung / Konsequenz */}
      {istTestumgebung && (
        <div className="bg-purple-100 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 rounded-lg px-4 py-2.5 text-purple-800 dark:text-purple-300 font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> TESTUMGEBUNG – Erzeugung schreibt in die Staging-Datenbank.
        </div>
      )}
      <div
        className={`rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${
          testModus
            ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
        }`}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        {testModus ? (
          <span>
            Testmodus AN: E-Mails gehen <strong>ausschließlich</strong> an die Testadresse
            (jtatwcook@gmail.com), kein Statuswechsel beim Kunden. Die Erzeugung legt echte Projekte an –
            erst nach Bestätigung.
          </span>
        ) : (
          <span>
            Testmodus AUS: E-Mails gehen an <strong>echte Kunden</strong>. Bitte besonders sorgfältig prüfen.
          </span>
        )}
      </div>

      {fehlerMeldung && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5 text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {fehlerMeldung}
        </div>
      )}

      {/* Schritt 0: Opt-in-Vorschlagsliste (VOR der Angebots-Vorschau) */}
      <MassenAngebotVorschlagsliste
        saisonjahr={zielSaison}
        onMarkiert={geladen ? () => void ladeKandidaten() : undefined}
      />

      {/* Fortschritt Dry-Run (Vorschau-Berechnung) */}
      {loading && dryRunFortschritt && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            {dryRunFortschritt.schritt} {dryRunFortschritt.prozent} %
          </div>
          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${dryRunFortschritt.prozent}%` }}
            />
          </div>
        </div>
      )}

      {/* Schritt 1: Vorschau berechnen */}
      {!geladen ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center">
          <p className="text-gray-600 dark:text-slate-400 mb-4">
            Probelauf (Dry-Run): berechnet alle Angebote und zeigt die Vorschau – es wird{' '}
            <strong>nichts</strong> gespeichert.
          </p>
          <button
            onClick={ladeKandidaten}
            disabled={loading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Vorschau berechnen
          </button>
        </div>
      ) : (
        <>
          {/* Empfänger klären — bevor der Lauf startet */}
          {kandidatenOhneEmail.length > 0 && !zeigeEmailKlaerung && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 flex-wrap">
              <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-[16rem]">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  {kandidatenOhneEmail.length}{' '}
                  {kandidatenOhneEmail.length === 1 ? 'Kunde hat' : 'Kunden haben'} keine
                  Empfängeradresse
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  Sie werden zwar angelegt, bekommen aber keine Mail — und fallen still aus dem
                  Lauf. Vor dem Erzeugen klären.
                </p>
              </div>
              <button
                onClick={() => setZeigeEmailKlaerung(true)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
              >
                Empfänger klären
              </button>
            </div>
          )}

          {zeigeEmailKlaerung && (
            <MassenAngebotEmailKlaerung
              kundeIds={kandidatenFuerKlaerung}
              onFertig={() => {
                setZeigeEmailKlaerung(false);
                // Nach dem Klären ist die Vorschau veraltet: Die Empfänger stehen
                // jetzt am Kunden, der Kandidat trägt aber noch den alten Stand.
                void ladeKandidaten();
              }}
            />
          )}

          {/* Warnung, wenn der Lauf unplausibel klein ausfällt */}
          {zusammenfassung.gesamt > 0 && zusammenfassung.gesamt < OPT_IN_ERWARTUNG && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <MousePointerClick className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  Nur {zusammenfassung.gesamt}{' '}
                  {zusammenfassung.gesamt === 1 ? 'Kunde ist' : 'Kunden sind'} freigeschaltet
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  Der Frühjahrslauf betrifft normalerweise mehrere hundert Vereine. Wer nicht als
                  „massenangebots-tauglich" markiert ist, taucht hier gar nicht erst auf — prüfe die
                  Vorschlagsliste oben, bevor du den Lauf startest.
                </p>
              </div>
            </div>
          )}

          {/* Zähler + Werkzeuge */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-semibold text-gray-900 dark:text-slate-100">
                {ausgewaehlteNeu.length} werden erzeugt
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600 dark:text-slate-400">{zusammenfassung.existiert} übersprungen</span>
              <span className="text-gray-400">·</span>
              <span className="text-amber-600 dark:text-amber-400">
                {zusammenfassung.fehler + zusammenfassung.manuell} benötigen Prüfung
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{zusammenfassung.gesamt} gesamt</span>
              <span className="text-gray-400">·</span>
              <button
                onClick={() => handleAlleAuswaehlen(true, new Set(gefiltert.map((k) => k.kundeId)))}
                className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs font-medium"
                title="Wählt alle Kandidaten der aktuellen (gefilterten) Ansicht aus"
              >
                Alle auswählen
              </button>
              <button
                onClick={() => handleAlleAuswaehlen(false, new Set(gefiltert.map((k) => k.kundeId)))}
                className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs font-medium"
                title="Wählt alle Kandidaten der aktuellen (gefilterten) Ansicht ab — z. B. um danach gezielt nur einen Kunden anzuhaken"
              >
                Alle abwählen
              </button>
              <button
                onClick={ladeKandidaten}
                disabled={loading}
                className="ml-auto px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Neu berechnen
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 dark:border-slate-700 pt-3">
              {/* Preisanpassung */}
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Preisanpassung:</span>
              <select
                value={anpassungsTyp}
                onChange={(e) => setAnpassungsTyp(e.target.value as 'prozent' | 'fix')}
                className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              >
                <option value="prozent">+/− Prozent</option>
                <option value="fix">fixer €/t</option>
              </select>
              <input
                type="number"
                value={anpassungsWert}
                onChange={(e) => setAnpassungsWert(e.target.value)}
                placeholder={anpassungsTyp === 'prozent' ? 'z.B. 5' : 'z.B. 99.50'}
                className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              />
              <button
                onClick={handlePreisanpassung}
                disabled={angewandteAnpassung !== null}
                title={
                  angewandteAnpassung
                    ? 'Bereits angewandt. Ein zweiter Klick würde erneut auf die schon angepassten Preise rechnen. Zum Ändern die Liste neu berechnen.'
                    : undefined
                }
                className="px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anwenden
              </button>
              {angewandteAnpassung && (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  angewandt:{' '}
                  {angewandteAnpassung.typ === 'prozent'
                    ? `${angewandteAnpassung.wert >= 0 ? '+' : ''}${angewandteAnpassung.wert.toLocaleString('de-DE')} %`
                    : `${eur(angewandteAnpassung.wert)} / t`}
                </span>
              )}
              {stammdatenPreisanpassung !== null && (
                <span
                  className="text-xs text-gray-500 dark:text-slate-400 inline-flex items-center gap-1"
                  title="Zentrale Preis-Konfiguration: Stammdaten → Saison-Einstellungen → Preis-Konfiguration. Pro Lauf überschreibbar."
                >
                  <Info className="w-3.5 h-3.5" />
                  Vorbelegt aus Stammdaten: {stammdatenPreisanpassung >= 0 ? '+' : ''}
                  {stammdatenPreisanpassung.toLocaleString('de-DE')} %
                </span>
              )}

              {/* Suche + Filter */}
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="text"
                  value={suchText}
                  onChange={(e) => setSuchText(e.target.value)}
                  placeholder="Kunde / Kundennr. suchen…"
                  className="w-52 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
                />
                <FilterIcon className="w-4 h-4 text-gray-400" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as FilterTyp)}
                  className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
                >
                  <option value="alle">Alle</option>
                  <option value="vorjahr">Nur Vorjahr</option>
                  <option value="neukunden">Nur Neukunden</option>
                  <option value="fehler">Nur mit Fehlern</option>
                  <option value="manuell">Nur Prüffälle</option>
                </select>
              </div>
            </div>
          </div>

          {/* Master-Detail: Liste links, Detail-Panel rechts */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="flex-1 min-w-0 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/60">
                {gefiltert.map((kandidat) => (
                  <KandidatListenZeile
                    key={kandidat.kundeId}
                    kandidat={kandidat}
                    aktiv={kandidat.kundeId === auswahlKundeId}
                    onToggle={handleToggle}
                    onSelect={setAuswahlKundeId}
                  />
                ))}
                {gefiltert.length === 0 && (
                  <div className="px-3 py-8 text-center text-gray-400">
                    Keine Kandidaten für diesen Filter.
                  </div>
                )}
              </div>
            </div>

            <div className="w-full lg:w-[420px] xl:w-[480px] flex-shrink-0 lg:sticky lg:top-4">
              {auswahlKandidat ? (
                <MassenAngebotDetailPanel
                  kandidat={auswahlKandidat}
                  onPositionAendern={handlePositionAendern}
                  onPositionEntfernen={handlePositionEntfernen}
                  onEmailAendern={handleEmailAendern}
                  onNotizAendern={handleNotizAendern}
                  onSchliessen={() => setAuswahlKundeId(null)}
                />
              ) : (
                <div className="bg-white dark:bg-slate-800 border border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-6 text-center text-sm text-gray-400 dark:text-slate-500 flex flex-col items-center gap-2">
                  <MousePointerClick className="w-6 h-6" />
                  Kunde in der Liste anklicken, um Referenz, Positionen, E-Mail und Notiz zu
                  bearbeiten.
                </div>
              )}
            </div>
          </div>

          {/* Schritt 2: Erzeugen */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-slate-400">Stufenweise (Limit):</label>
              <input
                type="number"
                value={limit}
                min={0}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="alle"
                className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100"
              />
            </div>
            <button
              onClick={() => setErzeugeBestaetigung(true)}
              disabled={anzahlZuErzeugen === 0 || !!erzeugung}
              className="ml-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-5 h-5" /> {anzahlZuErzeugen} Angebote erzeugen
            </button>
          </div>
        </>
      )}

      {/* Fortschritt Erzeugung */}
      {erzeugung && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            Erzeuge {erzeugung.done} von {erzeugung.total}… {erzeugung.aktuell}
          </div>
          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${erzeugung.total ? (erzeugung.done / erzeugung.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Ergebnis Erzeugung + Rollback + Versand-Einstieg */}
      {ergebnis && (
        <div
          className={`bg-white dark:bg-slate-800 border rounded-xl p-4 space-y-3 ${
            ergebnis.abgebrochen
              ? 'border-red-300 dark:border-red-800'
              : ergebnis.fehler.length > 0
              ? 'border-amber-300 dark:border-amber-800'
              : 'border-emerald-200 dark:border-emerald-800'
          }`}
        >
          {ergebnis.abgebrochen ? (
            <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
              <ShieldAlert className="w-5 h-5" /> Lauf abgebrochen
            </div>
          ) : ergebnis.fehler.length > 0 ? (
            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" /> Lauf beendet — mit Fehlern
            </div>
          ) : (
            <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" /> Lauf abgeschlossen
            </div>
          )}
          {ergebnis.abgebrochen && (
            <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3">
              Der Lauf wurde gestoppt, weil der Fehler nicht am einzelnen Kunden lag:{' '}
              {ergebnis.abgebrochen.grund}
              <div className="mt-1.5">
                <strong>{ergebnis.abgebrochen.offen}</strong> Kandidaten wurden gar nicht erst
                versucht — sie sind unberührt und können nach der Behebung erneut laufen.
              </div>
            </div>
          )}
          <div className="text-sm text-gray-700 dark:text-slate-300">
            {ergebnis.erzeugt.length} erzeugt · {ergebnis.uebersprungen.length} übersprungen ·{' '}
            {ergebnis.fehler.length} fehlerhaft · Batch <code className="text-xs">{ergebnis.batchId}</code>
          </div>
          {ergebnis.fehler.length > 0 && (
            <div className="text-xs text-red-600 dark:text-red-400 max-h-24 overflow-y-auto">
              {ergebnis.fehler.map((f) => (
                <div key={f.kundeId}>
                  {f.kundenname}: {f.fehler}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={() => setRollbackBestaetigung(true)}
              // Auch ein Lauf, der nur Fehler produziert hat, muss zurücknehmbar
              // sein — sonst bleiben angefangene Projekte liegen und sperren den
              // Kunden beim Wiederholungslauf als „existiert bereits".
              disabled={rollbackLaeuft || (ergebnis.erzeugt.length === 0 && ergebnis.fehler.length === 0)}
              className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg inline-flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              {rollbackLaeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              Letzten Lauf rückgängig machen
            </button>
            {versandKandidaten && versandKandidaten.length > 0 && (
              <button
                onClick={() => setVersandBestaetigung(true)}
                disabled={!!versand || versandAnzahl === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {versandAnzahl} Angebote versenden
              </button>
            )}
          </div>
          {rollbackInfo && <div className="text-sm text-gray-600 dark:text-slate-400">{rollbackInfo}</div>}
        </div>
      )}

      {/* Versand-Liste eines früheren Laufs (aus dem Protokoll geöffnet) */}
      {versandKandidaten && !ergebnis && (
        <div className="bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-400">
            <Mail className="w-5 h-5" /> Versand-Liste
            {versandBatchId && <code className="text-xs font-normal">{versandBatchId}</code>}
          </div>
          {versandKandidaten.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-slate-400">
              Keine unversendeten Angebote in diesem Lauf — alles bereits versendet oder gelöscht.
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-700 dark:text-slate-300">
                {versandKandidaten.length} Angebot{versandKandidaten.length === 1 ? '' : 'e'} noch
                nicht versendet
                {versandKandidaten.some((v) => v.emailFehlt) && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {' '}
                    ({versandKandidaten.filter((v) => v.emailFehlt).length} ohne E-Mail-Adresse)
                  </span>
                )}
              </span>
              <button
                onClick={() => handleVersandAlle(true)}
                disabled={!!versand}
                className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Alle
              </button>
              <button
                onClick={() => handleVersandAlle(false)}
                disabled={!!versand}
                className="px-2.5 py-1 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Keine
              </button>
              <button
                onClick={() => setVersandBestaetigung(true)}
                disabled={!!versand || versandAnzahl === 0}
                className="ml-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {versandAnzahl} Angebote versenden
              </button>
            </div>
          )}

          {/* Einzelne Empfänger abwählen — beim Massenversand an echte Kunden ist
              das der letzte Punkt, an dem ein Zweifelsfall noch herausfällt. */}
          {versandKandidaten.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg divide-y divide-gray-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
              {versandKandidaten.map((v) => (
                <label
                  key={v.projektId}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/40"
                >
                  <input
                    type="checkbox"
                    checked={v.ausgewaehlt}
                    disabled={!!versand}
                    onChange={() => handleVersandToggle(v.projektId)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-purple-600 disabled:opacity-40"
                  />
                  <span className="text-sm text-gray-900 dark:text-slate-100 truncate flex-1 min-w-0">
                    {v.kundenname}
                  </span>
                  {v.angebotsnummer && (
                    <code className="text-xs text-gray-400 flex-shrink-0">{v.angebotsnummer}</code>
                  )}
                  {v.emailFehlt ? (
                    <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0">
                      keine Adresse
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[16rem] flex-shrink-0">
                      {v.empfaengerEmail}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fortschritt / Ergebnis Versand */}
      {versand && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            Versende {versand.done} von {versand.total}… {versand.aktuell}
            <button
              onClick={() => {
                versandAbbruch.current = true;
              }}
              className="ml-auto px-3 py-1.5 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/40"
              title="Hält nach der laufenden Mail an. Bereits versendete lassen sich nicht zurückholen."
            >
              Anhalten
            </button>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all"
              style={{ width: `${versand.total ? (versand.done / versand.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {versandErgebnis && (
        <div className="bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-400 mb-1">
            <Mail className="w-4 h-4" />
            {versandErgebnis.abgebrochen ? 'Versand angehalten' : 'Versand abgeschlossen'}
            {testModus && <span className="text-xs font-normal">(Testmodus – nur Testadresse)</span>}
          </div>
          <div className="text-gray-700 dark:text-slate-300">
            {versandErgebnis.gesendet} gesendet · {versandErgebnis.fehler.length} fehlerhaft
            {versandErgebnis.abgebrochen && (
              <> · <strong>{versandErgebnis.abgebrochen.offen}</strong> nicht mehr angefasst</>
            )}
          </div>
          {versandErgebnis.abgebrochen && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Die offenen Empfänger stehen weiterhin in der Versand-Liste und können später
              nachgeholt werden.
            </p>
          )}
          {versandErgebnis.fehler.length > 0 && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-h-24 overflow-y-auto">
              {versandErgebnis.fehler.map((f, i) => (
                <div key={i}>
                  {f.kundenname}: {f.fehler}
                </div>
              ))}
            </div>
          )}
          {versandErgebnis.nachzutragen && versandErgebnis.nachzutragen.length > 0 && (
            <div className="mt-2 p-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <div className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {versandErgebnis.nachzutragen.length} versendet, Status nachzutragen — nicht erneut
                senden
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-1 max-h-24 overflow-y-auto">
                {versandErgebnis.nachzutragen.map((n, i) => (
                  <div key={i}>{n.kundenname}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Protokoll der letzten Läufe */}
      {laeufe.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-slate-300 mb-3">
            <History className="w-4 h-4" /> Protokoll
          </div>
          <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {laeufe.map((lauf) => (
              <div
                key={lauf.id}
                className="flex items-center gap-2 text-gray-600 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700/50 pb-1"
              >
                <span className="text-xs text-gray-400">
                  {new Date(lauf.zeitpunkt).toLocaleString('de-DE')}
                </span>
                <span>Saison {lauf.saisonjahr}</span>
                <span className="text-green-600 dark:text-green-400">{lauf.anzahlErzeugt} erzeugt</span>
                <span>{lauf.anzahlUebersprungen} übersprungen</span>
                {lauf.anzahlFehler > 0 && <span className="text-red-500">{lauf.anzahlFehler} Fehler</span>}
                {lauf.testModus && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                    Testumgebung
                  </span>
                )}
                {lauf.rueckgaengigGemacht && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">rückgängig</span>
                )}
                {lauf.benutzer && <span className="ml-auto text-xs text-gray-400">{lauf.benutzer}</span>}
                {!lauf.rueckgaengigGemacht && lauf.anzahlErzeugt > 0 && lauf.batchId && (
                  <button
                    onClick={() => void oeffneVersandListe(lauf.batchId)}
                    disabled={versandListeLaedt !== null || !!versand}
                    className={`${lauf.benutzer ? '' : 'ml-auto '}px-2.5 py-1 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-50 dark:hover:bg-purple-950/40 inline-flex items-center gap-1.5 disabled:opacity-50`}
                    title="Lädt die noch unversendeten Angebote dieses Laufs (z.B. nach einem Seiten-Reload)"
                  >
                    {versandListeLaedt === lauf.batchId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    Versand-Liste öffnen
                  </button>
                )}
                {!lauf.rueckgaengigGemacht && lauf.anzahlErzeugt > 0 && lauf.batchId && (
                  <button
                    onClick={() => {
                      setRollbackBatchId(lauf.batchId);
                      setRollbackBestaetigung(true);
                    }}
                    disabled={rollbackLaeuft}
                    className="px-2.5 py-1 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 disabled:opacity-50"
                    title="Nimmt die noch unversendeten Angebote dieses Laufs zurück — auch nach einem Seiten-Reload"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Rückgängig
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bestätigungsdialog Erzeugung */}
      {erzeugeBestaetigung && (
        <BestaetigungsDialog
          icon={<Play className="w-6 h-6 text-emerald-600" />}
          titel="Angebote erzeugen?"
          onAbbrechen={() => setErzeugeBestaetigung(false)}
          onBestaetigen={bestaetigeErzeugung}
          bestaetigenLabel={`${anzahlZuErzeugen} erzeugen`}
          bestaetigenClass="bg-emerald-600 hover:bg-emerald-700"
        >
          Es werden <strong>{anzahlZuErzeugen}</strong> neue Angebots-Projekte für Saison{' '}
          <strong>{zielSaison}</strong> angelegt
          {istTestumgebung ? ' (TESTUMGEBUNG)' : ''}. Bestehende Projekte werden nie verändert. Versand
          erfolgt erst später in einem separaten Schritt.
          {angewandteAnpassung ? (
            <span className="mt-3 block text-sm text-emerald-700 dark:text-emerald-300">
              Preisanpassung angewandt:{' '}
              <strong>
                {angewandteAnpassung.typ === 'prozent'
                  ? `${angewandteAnpassung.wert >= 0 ? '+' : ''}${angewandteAnpassung.wert.toLocaleString('de-DE')} %`
                  : `${eur(angewandteAnpassung.wert)} / t`}
              </strong>
            </span>
          ) : (
            <span className="mt-3 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Keine Preisanpassung angewandt.</strong> Die Angebote gehen mit den
                Vorjahrespreisen raus. Nach dem Versand ist das nicht mehr korrigierbar.
              </span>
            </span>
          )}
        </BestaetigungsDialog>
      )}

      {/* Bestätigungsdialog Rollback */}
      {rollbackBestaetigung && (rollbackBatchId || ergebnis) && (
        <BestaetigungsDialog
          icon={<Undo2 className="w-6 h-6 text-red-600" />}
          titel="Lauf rückgängig machen?"
          onAbbrechen={() => {
            setRollbackBestaetigung(false);
            setRollbackBatchId(null);
          }}
          onBestaetigen={bestaetigeRollback}
          bestaetigenLabel="Endgültig löschen"
          bestaetigenClass="bg-red-600 hover:bg-red-700"
        >
          {rollbackBatchId ? (
            <>
              Die noch nicht versendeten Angebote des Laufs{' '}
              <code className="text-xs">{rollbackBatchId}</code> werden gelöscht.
            </>
          ) : (
            <>
              Alle <strong>{ergebnis?.erzeugt.length ?? 0}</strong> noch nicht versendeten Angebote
              dieses Laufs werden gelöscht.
            </>
          )}{' '}
          Bereits versendete bleiben erhalten (GoBD).
        </BestaetigungsDialog>
      )}

      {/* Bestätigungsdialog Versand */}
      {versandBestaetigung && (
        <BestaetigungsDialog
          icon={<Send className="w-6 h-6 text-purple-600" />}
          titel={testModus ? 'Test-Versand starten?' : 'E-Mails an echte Kunden senden?'}
          onAbbrechen={() => setVersandBestaetigung(false)}
          onBestaetigen={bestaetigeVersand}
          bestaetigenLabel={`${versandAnzahl} senden`}
          bestaetigenClass={testModus ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'}
        >
          {testModus ? (
            <>
              <strong>{versandAnzahl}</strong> Test-E-Mails gehen ausschließlich an die Testadresse
              (jtatwcook@gmail.com). Kein Statuswechsel beim Kunden.
            </>
          ) : (
            <>
              <strong>{versandAnzahl}</strong> E-Mails gehen an <strong>echte Kunden</strong>. Dieser Schritt
              ist nicht umkehrbar.
            </>
          )}
        </BestaetigungsDialog>
      )}
    </div>
  );
};

export default MassenAngebotTool;
