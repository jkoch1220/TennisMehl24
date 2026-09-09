/**
 * Sammelfakturierung — Rechnungen für viele gelieferte Aufträge auf einmal.
 *
 * In der Saison werden 25 bis 33 Lieferungen pro Woche gefahren. Jede Rechnung
 * einzeln über die Projektakte zu erzeugen heißt: Reiter öffnen, Positionen
 * prüfen, speichern, zurück, nächstes Projekt. Bei dreißig Vorgängen ist das ein
 * halber Arbeitstag für einen Vorgang, der aus denselben Daten besteht.
 *
 * GRUNDSATZ: Der Lauf macht nur das Eindeutige. Alles, was eine Entscheidung
 * braucht — fehlende Positionen, fehlender Wiegeschein, bereits vorhandene
 * Rechnung — wird NICHT geraten, sondern mit Begründung ausgewiesen und bleibt
 * Handarbeit in der Akte. Eine Rechnung, die falsch rausgeht, kostet mehr Zeit
 * als zehn, die man von Hand schreibt.
 *
 * Was der Lauf NICHT tut: versenden. Das ist ein zweiter, bewusster Schritt über
 * `rechnungVersandService` — erst erzeugen und prüfen, dann verschicken.
 */

import { Projekt } from '../types/projekt';
import { Position, RechnungsDaten } from '../types/projektabwicklung';
import { projektService } from './projektService';
import {
  ladePositionenVonVorherigem,
  ladeDokumentNachTyp,
  ladeDokumentDaten,
  ladeEntwurf,
  speichereRechnung,
} from './projektabwicklungDokumentService';
import { generiereNaechsteDokumentnummer } from './nummerierungService';
import { ermittleRechnungsAdressen } from './rechnungsadressenService';
import { berechneRechnungsSummen } from './rechnungService';
import { wiegescheinVorgesehen } from '../utils/abwicklungsweg';
import {
  berechneGesamtZuschlag,
  erstelleDieselZuschlagPosition,
  getBasisPreisConfig,
  istDieselZuschlagPosition,
} from '../utils/dieselZuschlag';
import { holeDieselPreisFuerDatum } from '../utils/dieselPreisAPI';
import { ermittleEntfernungAbWerkKm } from '../utils/lieferEntfernung';

/** Werk Marktheidenfeld — Ausgangspunkt für Dieselpreis und Entfernung. */
const WERK_PLZ = '97828';

/**
 * Dieselpreis je Leistungsdatum, einmal pro Lauf.
 *
 * `pruefeKandidat` läuft für JEDEN Vorgang der Liste; in der Saison sind das
 * 25 bis 33. Ohne diesen Puffer stünden ebenso viele Preisabrufe an (Appwrite →
 * Backend → Tankerkönig, jeder mit eigenem Zeitlimit) — die Vorschau bräuchte
 * Minuten. Die Leistungsdaten eines Laufs liegen typisch auf wenigen Tagen,
 * der Puffer greift also fast immer.
 */
const dieselPreisCache = new Map<string, Promise<number>>();
const dieselPreisGecacht = (leistungsdatum: string): Promise<number> => {
  const vorhanden = dieselPreisCache.get(leistungsdatum);
  if (vorhanden) return vorhanden;
  const abruf = holeDieselPreisFuerDatum(leistungsdatum, WERK_PLZ).then((r) => r.preis);
  dieselPreisCache.set(leistungsdatum, abruf);
  return abruf;
};

/**
 * Puffer verwerfen. Wird zu Beginn jedes Laufs gerufen.
 *
 * Ohne das Leeren hielte der Puffer für die Lebensdauer des Moduls: Wer das
 * Portal über Nacht offen lässt, bekäme am nächsten Tag den Dieselpreis von
 * gestern in eine frisch erzeugte Rechnung geschrieben.
 */
const leereDieselPreisPuffer = (): void => dieselPreisCache.clear();

/** Aus diesen Status heraus wird fakturiert: geliefert ist die Voraussetzung. */
export const FAKTURIERBARE_STATUS: Projekt['status'][] = ['lieferschein', 'geliefert'];

export type SperrGrund =
  | 'rechnung_vorhanden'
  | 'keine_positionen'
  | 'wiegeschein_fehlt'
  | 'kein_betrag'
  | 'keine_adresse';

export interface FakturaKandidat {
  projektId: string;
  projektName: string;
  kundenname: string;
  kundennummer?: string;
  /** Summe brutto, wie sie auf der Rechnung stünde. */
  betrag: number;
  positionen: number;
  /** Leer = kann erzeugt werden. Sonst der Grund, warum nicht. */
  sperren: SperrGrund[];
  /** Klartext für die Oberfläche. */
  hinweis?: string;
  /** Vorbereitete Daten; nur gesetzt, wenn keine Sperre vorliegt. */
  daten?: RechnungsDaten;
}

const SPERR_TEXT: Record<SperrGrund, string> = {
  rechnung_vorhanden: 'Es gibt bereits eine aktive Rechnung — erst stornieren.',
  keine_positionen: 'Keine Positionen aus der Auftragsbestätigung übernehmbar.',
  wiegeschein_fehlt: 'Wiegeschein fehlt — die gelieferte Menge ist nicht bestätigt.',
  kein_betrag: 'Rechnungsbetrag wäre 0,00 €.',
  keine_adresse: 'Keine Rechnungsanschrift ermittelbar.',
};

/**
 * Steuer- und Rabattoptionen der Auftragsbestätigung.
 *
 * Die Rechnung MUSS denselben Betrag ausweisen wie die bestätigte AB. Wer den
 * Gesamtrabatt oder die Steueroption hier verliert, stellt einen anderen Betrag
 * in Rechnung als zugesagt — das fällt spätestens beim Zahlungseingang auf, dann
 * aber als Reklamation.
 */
async function ladeAbOptionen(projektId: string): Promise<{
  gesamtrabattProzent?: number;
  gesamtrabattBezeichnung?: string;
  ohneMehrwertsteuer?: boolean;
  mehrwertsteuersatz?: number;
  kundenUstIdNr?: string;
}> {
  try {
    const finalisiert = await ladeDokumentNachTyp(projektId, 'auftragsbestaetigung');
    const daten = finalisiert
      ? ladeDokumentDaten<{
          gesamtrabattProzent?: number;
          gesamtrabattBezeichnung?: string;
          ohneMehrwertsteuer?: boolean;
          mehrwertsteuersatz?: number;
          kundenUstIdNr?: string;
        }>(finalisiert)
      : await ladeEntwurf(projektId, 'auftragsbestaetigungsDaten');
    return daten ?? {};
  } catch {
    return {};
  }
}

/** Trägt das Projekt bereits eine nicht stornierte Rechnung? */
async function hatAktiveRechnung(projektId: string): Promise<boolean> {
  try {
    const dok = await ladeDokumentNachTyp(projektId, 'rechnung');
    return !!dok && dok.rechnungsStatus !== 'storniert';
  } catch {
    // Im Zweifel sperren: Eine zweite Rechnung zum selben Vorgang ist schlimmer
    // als eine, die von Hand nachgeholt werden muss.
    return true;
  }
}

/**
 * Ergänzt den Dieselpreiszuschlag — genau wie es der Rechnungs-Tab tut.
 *
 * Die Sammelfakturierung übernimmt die Positionen aus der Auftragsbestätigung
 * und schreibt sie als finale Rechnung weg; eine eigene Zuschlagsberechnung gab
 * es hier nie. Solange das Angebot eine bezifferte TM-DZ-Position mitschleppte,
 * lief wenigstens der (veraltete) Angebotswert mit durch. Seit der Zuschlag
 * bewusst erst zur Rechnung entsteht (Vorschlag 4, 09/2026), stünde hier sonst
 * gar keiner mehr — bei rund 25 Lieferungen je Saisonwoche eine spürbare Lücke.
 *
 * Gerechnet wird zum LEISTUNGSDATUM, nicht zum Angebotstag. Schlägt der
 * Preisabruf fehl, bleiben die Positionen unverändert: Lieber eine Rechnung ohne
 * Zuschlag als gar keine — die Sperrgründe prüfen den Rest.
 */
async function ergaenzeDieselZuschlag(
  positionen: Position[],
  leistungsdatum: string,
  plz?: string
): Promise<Position[]> {
  if (positionen.length === 0) return positionen;
  const ohneZuschlag = positionen.filter((p) => !istDieselZuschlagPosition(p));
  try {
    const preis = await dieselPreisGecacht(leistungsdatum);
    // Die Entfernung fließt erst ab der Staffel 2027 in den Satz ein. Für alle
    // früheren Leistungsdaten wäre der Abruf ein Google-Aufruf ohne Wirkung —
    // bei dreißig Kandidaten dreißig Mal.
    const brauchtEntfernung = !!getBasisPreisConfig(leistungsdatum).entfernungsStaffel;
    const entfernung = brauchtEntfernung && plz ? await ermittleEntfernungAbWerkKm(plz) : null;
    const ergebnis = berechneGesamtZuschlag(ohneZuschlag, preis, leistungsdatum, entfernung?.km);
    if (!ergebnis.hatZuschlag || ergebnis.gesamtTonnen === 0) return ohneZuschlag;

    const zuschlag = erstelleDieselZuschlagPosition(ergebnis);
    // Vor die Frachtkostenpauschale, wie in Angebot und Rechnung.
    const fpIndex = ohneZuschlag.findIndex((p) => p.artikelnummer === 'TM-FP');
    const neu = [...ohneZuschlag];
    if (fpIndex !== -1) neu.splice(fpIndex, 0, zuschlag);
    else neu.push(zuschlag);
    return neu;
  } catch (fehler) {
    console.error('Sammelfakturierung: Dieselzuschlag konnte nicht berechnet werden', fehler);
    return positionen;
  }
}

/**
 * Bereitet einen einzelnen Vorgang vor, ohne etwas zu schreiben.
 *
 * Die Rechnungsnummer wird hier BEWUSST noch nicht gezogen: Zwischen Vorschau
 * und Erzeugung können Minuten liegen, und eine gezogene, dann verworfene Nummer
 * reißt eine Lücke in den fortlaufenden Kreis.
 */
export async function pruefeKandidat(projekt: Projekt): Promise<FakturaKandidat> {
  const projektId = projekt.$id || projekt.id;
  const sperren: SperrGrund[] = [];

  const kandidat: FakturaKandidat = {
    projektId,
    projektName: projekt.projektName || projekt.kundenname,
    kundenname: projekt.kundenname,
    kundennummer: projekt.kundennummer,
    betrag: 0,
    positionen: 0,
    sperren,
  };

  if (await hatAktiveRechnung(projektId)) {
    sperren.push('rechnung_vorhanden');
    kandidat.hinweis = SPERR_TEXT.rechnung_vorhanden;
    return kandidat;
  }

  // Der Wiegeschein bestätigt, was tatsächlich geliefert wurde. Ohne ihn steht
  // die Menge nicht fest — außer bei Ware, die gar nicht gewogen wird.
  if (wiegescheinVorgesehen(projekt) === true && !projekt.wiegeschein) {
    sperren.push('wiegeschein_fehlt');
  }

  const rohPositionen = await ladePositionenVonVorherigem(projektId, 'rechnung');
  const positionen = await ergaenzeDieselZuschlag(
    (rohPositionen ?? []) as Position[],
    projekt.liefernachweisAm?.split('T')[0] || new Date().toISOString().split('T')[0],
    projekt.lieferadresse?.plz || projekt.kundenPlzOrt
  );
  if (positionen.length === 0) {
    sperren.push('keine_positionen');
    kandidat.hinweis = sperren.map((s) => SPERR_TEXT[s]).join(' ');
    return kandidat;
  }
  kandidat.positionen = positionen.length;

  const [adressen, abOptionen] = await Promise.all([
    ermittleRechnungsAdressen(projekt),
    ladeAbOptionen(projektId),
  ]);

  if (!adressen.kundenname || !adressen.kundenstrasse) {
    sperren.push('keine_adresse');
  }

  const summen = berechneRechnungsSummen(
    positionen,
    abOptionen.ohneMehrwertsteuer,
    abOptionen.mehrwertsteuersatz
  );
  kandidat.betrag = summen.bruttobetrag;
  if (summen.bruttobetrag <= 0) {
    sperren.push('kein_betrag');
  }

  if (sperren.length > 0) {
    kandidat.hinweis = sperren.map((s) => SPERR_TEXT[s]).join(' ');
    return kandidat;
  }

  const heute = new Date().toISOString().split('T')[0];
  kandidat.daten = {
    // Die Nummer kommt erst beim Erzeugen dazu.
    rechnungsnummer: '',
    rechnungsdatum: heute,
    leistungsdatum: projekt.liefernachweisAm?.split('T')[0] || heute,
    kundenname: adressen.kundenname,
    kundenstrasse: adressen.kundenstrasse,
    kundenPlzOrt: adressen.kundenPlzOrt,
    kundennummer: adressen.kundennummer,
    ansprechpartner: projekt.ansprechpartner,
    lieferadresseAbweichend: adressen.lieferadresseAbweichend,
    lieferadresseName: adressen.lieferadresseName,
    lieferadresseStrasse: adressen.lieferadresseStrasse,
    lieferadressePlzOrt: adressen.lieferadressePlzOrt,
    positionen,
    gesamtrabattProzent: abOptionen.gesamtrabattProzent,
    gesamtrabattBezeichnung: abOptionen.gesamtrabattBezeichnung,
    ohneMehrwertsteuer: abOptionen.ohneMehrwertsteuer,
    mehrwertsteuersatz: abOptionen.mehrwertsteuersatz,
    kundenUstIdNr: abOptionen.kundenUstIdNr,
  } as RechnungsDaten;

  return kandidat;
}

/**
 * Alle fakturierbaren Vorgänge einer Saison, geprüft und sortiert.
 *
 * Gesperrte Kandidaten werden mitgeliefert, nicht weggefiltert: Dass acht
 * Lieferungen wegen fehlender Wiegescheine nicht abgerechnet werden können, ist
 * die wichtigere Information — eine Liste, die sie verschweigt, sieht erledigt
 * aus.
 */
export async function sammleFakturierbare(
  saisonjahr?: number,
  onFortschritt?: (geprueft: number, gesamt: number) => void
): Promise<FakturaKandidat[]> {
  // Frischer Lauf, frische Preise.
  leereDieselPreisPuffer();

  const projekte = await projektService.loadProjekte({
    status: FAKTURIERBARE_STATUS,
    saisonjahr,
  });

  const kandidaten: FakturaKandidat[] = [];
  for (let i = 0; i < projekte.length; i += 1) {
    kandidaten.push(await pruefeKandidat(projekte[i]));
    onFortschritt?.(i + 1, projekte.length);
  }

  // Erzeugbare zuerst, darin die größten Beträge oben — wer abbricht, hat dann
  // das meiste Geld schon abgerechnet.
  return kandidaten.sort((a, b) => {
    const aOffen = a.sperren.length === 0;
    const bOffen = b.sperren.length === 0;
    if (aOffen !== bOffen) return aOffen ? -1 : 1;
    return b.betrag - a.betrag;
  });
}

export interface FakturaErgebnis {
  erzeugt: { projektId: string; rechnungsnummer: string; betrag: number; kundenname: string }[];
  fehler: { projektId: string; kundenname: string; grund: string }[];
  abgebrochen: boolean;
}

/**
 * Erzeugt die Rechnungen. Ein Fehler stoppt den Lauf NICHT — er wird notiert und
 * der nächste Vorgang bearbeitet.
 *
 * Die Nummer wird pro Vorgang unmittelbar vor dem Speichern gezogen. Scheitert
 * das Speichern, ist die Nummer verbraucht; das ist der Preis dafür, dass zwei
 * Rechnungen niemals dieselbe Nummer bekommen. `speichereRechnung` prüft die
 * Eindeutigkeit zusätzlich global.
 */
export async function erzeugeRechnungen(
  kandidaten: FakturaKandidat[],
  optionen: {
    onFortschritt?: (fertig: number, gesamt: number, aktuell: string) => void;
    abbruchSignal?: () => boolean;
  } = {}
): Promise<FakturaErgebnis> {
  const ergebnis: FakturaErgebnis = { erzeugt: [], fehler: [], abgebrochen: false };
  const machbar = kandidaten.filter((k) => k.sperren.length === 0 && k.daten);

  for (let i = 0; i < machbar.length; i += 1) {
    if (optionen.abbruchSignal?.()) {
      ergebnis.abgebrochen = true;
      break;
    }

    const k = machbar[i];
    optionen.onFortschritt?.(i, machbar.length, k.kundenname);

    try {
      const nummer = await generiereNaechsteDokumentnummer('rechnung');
      const daten = { ...(k.daten as RechnungsDaten), rechnungsnummer: nummer };
      await speichereRechnung(k.projektId, daten);

      // Der Statuswechsel ist die zweite Achse. Scheitert er, ist die Rechnung
      // trotzdem in der Welt — deshalb getrennt behandeln und NICHT als Fehler
      // des Belegs melden.
      try {
        await projektService.updateProjektStatus(k.projektId, 'rechnung');
      } catch (statusFehler) {
        console.warn(
          `Rechnung ${nummer} erzeugt, Statuswechsel scheiterte für ${k.kundenname}:`,
          statusFehler
        );
      }

      ergebnis.erzeugt.push({
        projektId: k.projektId,
        rechnungsnummer: nummer,
        betrag: k.betrag,
        kundenname: k.kundenname,
      });
    } catch (error) {
      ergebnis.fehler.push({
        projektId: k.projektId,
        kundenname: k.kundenname,
        grund: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
    }
  }

  optionen.onFortschritt?.(machbar.length, machbar.length, '');
  return ergebnis;
}

/** Zusammenfassung für die Kopfzeile der Oberfläche. */
export function fasseZusammen(kandidaten: FakturaKandidat[]): {
  erzeugbar: number;
  gesperrt: number;
  summe: number;
  proSperre: Record<string, number>;
} {
  let erzeugbar = 0;
  let gesperrt = 0;
  let summe = 0;
  const proSperre: Record<string, number> = {};

  for (const k of kandidaten) {
    if (k.sperren.length === 0) {
      erzeugbar += 1;
      summe += k.betrag;
    } else {
      gesperrt += 1;
      for (const s of k.sperren) proSperre[s] = (proSperre[s] || 0) + 1;
    }
  }

  return { erzeugbar, gesperrt, summe, proSperre };
}

export const sperrText = (grund: SperrGrund): string => SPERR_TEXT[grund];

/** Nur für Tests. */
export const _internals = { ladeAbOptionen, hatAktiveRechnung, SPERR_TEXT, leereDieselPreisPuffer };
