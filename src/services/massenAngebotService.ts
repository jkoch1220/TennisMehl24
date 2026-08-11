// Massen-Angebots-Tool für die Frühjahrsinstandsetzung.
//
// Dieses Modul bestimmt je berechtigtem Kunden die Quelle des Angebots und berechnet
// einen Angebotsentwurf – OHNE in die Datenbank zu schreiben (Dry-Run/Vorschau).
// Die scharfe Erzeugung, Rollback und Protokoll bauen auf diesen Kandidaten auf
// (siehe erzeugeBatch/rollbackBatch weiter unten).
//
// BERECHTIGUNG (Opt-in): massenangebots-tauglich ist NUR, wer aktiv ist UND explizit
// automatischesAngebot === true gesetzt hat. undefined zählt als NICHT tauglich.
// Die Vorschlagsliste (sammleTauglichkeitsVorschlaege/markiereAlsTauglich) hilft,
// Vorjahres-Direktbesteller gesammelt als tauglich zu markieren.
//
// Quellen-Priorität pro Kunde:
//   1. Vorjahres-Referenz: GRÖSSTE Bestellung der Vorsaison über ALLE Projekte des
//      Kunden (Metrik: Schüttgut-Tonnage, bei 0 t bzw. Gleichstand Netto-Auftragswert;
//      Datenbasis je Projekt: AB > Rechnung > Angebot) → Positionen übernehmen,
//      Paletten-/Sackware auf halbe/ganze Paletten aufrunden
//   2. Historie/Mosaik (tonnenLetztesJahr + zuletztGezahlterPreis am Kunden, z.B. aus Migration)
//   3. PLZ-Preiskalkulation (echter Neukunde: Zone + Spedition + Aufschlag)
//   4. sonst: manuell prüfen (nicht automatisch erzeugen)

import { ID, Query } from 'appwrite';
import { SaisonKunde, SaisonDaten } from '../types/saisonplanung';
import { Position, AngebotsDaten, GespeichertesDokument } from '../types/projektabwicklung';
import { getKlauselVorlagen, initialisiereDokumentKlauseln } from '../constants/vertragsklauseln';
import {
  MassenAngebotKandidat,
  KandidatenZusammenfassung,
  Preisanpassung,
  Produktprofil,
  ReferenzInfo,
  ErzeugungsErgebnis,
  AngebotsLauf,
  VersandKandidat,
  TauglichkeitsVorschlag,
  MarkierungsErgebnis,
} from '../types/massenAngebot';
import { projektService } from './projektService';
import { saisonplanungService } from './saisonplanungService';
import {
  ladeDokumentNachTyp,
  ladeDokumentDaten,
  speichereAngebot,
  loescheDokumenteFuerProjekt,
} from './projektabwicklungDokumentService';
import { generiereNaechsteDokumentnummer } from './nummerierungService';
import { sendeEmailMitPdf, pdfZuBase64, wrapInEmailTemplate } from './emailSendService';
import { istMockModusAktiv } from '../config/mockModus';
import { generiereAngebotPDF } from './dokumentService';
import { getArtikelPreis, getStammdatenOderDefault, getPreisKonfiguration } from './stammdatenService';
import { generiereStandardEmail } from '../utils/emailHelpers';
import { Stammdaten } from '../types/stammdaten';
import { getZoneFromPLZ, berechneSpeditionskosten, AUFSCHLAEGE } from '../constants/pricing';
import { formatAdresszeile } from './pdfHelpers';
import {
  databases,
  DATABASE_ID,
  ANGEBOTS_LAEUFE_COLLECTION_ID,
  PROJECT_ID,
  PROJEKTE_COLLECTION_ID,
  SAISON_DATEN_COLLECTION_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
} from '../config/appwrite';
import { loadAllDocuments } from '../utils/appwritePagination';
import { auditService } from './auditService';

// Standard-Menge (Tonnen) für PLZ-Kalkulation, wenn keine Referenzmenge vorliegt.
export const STANDARD_MENGE_DEFAULT = 10;

const STANDARD_ARTIKEL = {
  nummer: 'TM-ZM-02',
  bezeichnung: 'Ziegelmehl 0–2 mm (lose, Schüttgut)',
  einheit: 't',
};

const STANDARD_LIEFERBEDINGUNGEN =
  'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und ' +
  'Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und ' +
  '4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\n' +
  'Mindestabnahmemenge für loses Material sind 3 Tonnen.';

let positionIdCounter = 0;
function naechstePositionId(): string {
  positionIdCounter += 1;
  return `pos-massen-${Date.now()}-${positionIdCounter}`;
}

function round2(wert: number): number {
  return Math.round(wert * 100) / 100;
}

function baueZiegelmehlPosition(menge: number, preisProTonne: number): Position {
  return {
    id: naechstePositionId(),
    artikelnummer: STANDARD_ARTIKEL.nummer,
    bezeichnung: STANDARD_ARTIKEL.bezeichnung,
    menge,
    einheit: STANDARD_ARTIKEL.einheit,
    einzelpreis: round2(preisProTonne),
    gesamtpreis: round2(menge * preisProTonne),
  };
}

// Positionen aus einem Vorjahres-Angebot übernehmen – neue ids, Preise verlustfrei neu gerechnet.
function klonePositionen(positionen: Position[]): Position[] {
  return positionen.map((pos) => ({
    ...pos,
    id: naechstePositionId(),
    gesamtpreis: round2((pos.menge ?? 0) * (pos.einzelpreis ?? 0)),
  }));
}

// ===== ARTIKEL-KLASSIFIKATION (Schüttgut vs. Paletten-/Sackware) =====
// Real im Code verwendete Artikelnummern (artikelPreise.ts + anfrageVerarbeitungService.ts):
//   Schüttgut (lose, t):            TM-ZM-02, TM-ZM-03
//   Sackware auf Palette (t):       TM-ZM-02St, TM-ZM-03St
//   Beiladungs-Säcke (Stk, 40 kg):  TM-ZM-02S, TM-ZM-03S
//   BigBag (t):                     TM-ZM-02BB, TM-ZM-03BB, TM-ZM-BIG-02, TM-ZM-BIG-03
//   Einwegpalette (Stk):            TM-PAL

const SCHUETTGUT_ARTIKEL = new Set(['TM-ZM-02', 'TM-ZM-03']);
const SACK_PALETTEN_ARTIKEL = new Set(['TM-ZM-02ST', 'TM-ZM-03ST']);
const BEILADUNG_SACK_ARTIKEL = new Set(['TM-ZM-02S', 'TM-ZM-03S']);
const BIGBAG_ARTIKEL = new Set(['TM-ZM-02BB', 'TM-ZM-03BB', 'TM-ZM-BIG-02', 'TM-ZM-BIG-03']);
const PALETTEN_ZUBEHOER_ARTIKEL = new Set(['TM-PAL']);

/** 25 Säcke × 40 kg = 1 t → 1 Palette ≙ 1 t, halbe Palette ≙ 0,5 t. */
const SAECKE_PRO_PALETTE = 25;
const SACK_GEWICHT_TONNEN = 0.04;

// ===== PLAUSIBILITÄTSBREMSE =====
// Die Umrechnung von Beiladungs-Säcken auf Palettenware (Menge × 0,04 t, Preis × 25)
// darf sich NICHT allein auf die Artikelnummer verlassen. Im Bestand stehen beide
// Fehlerrichtungen: Sack-Nummern mit Tonnenpreisen (bis 364,25 €) und Paletten-Nummern
// mit Sackpreisen (8,50 €). Rechnet man da blind um, entsteht aus 3 Stk à 364,25 €
// ein Angebot über 0,5 t zu 4.553 € statt 1.092 €. Deshalb: Einheit UND Preis müssen
// zur Artikelnummer passen, sonst geht der Kunde in die manuelle Prüfung.
/** Plausibler Preis für EINEN 40-kg-Sack (Stammpreis 8,50 €). Darüber ist es ein Tonnenpreis. */
const MAX_SACKPREIS_EURO = 30;
/** Plausibler Preis für eine TONNE Sackware (Stammpreis 155,00 €). Darunter ist es ein Sackpreis. */
const MIN_TONNENPREIS_EURO = 50;

function istStueckEinheit(einheit: string | undefined): boolean {
  const e = (einheit || '').trim().toLowerCase().replace(/\./g, '');
  return e === 'stk' || e === 'st' || e === 'stck' || e === 'stück' || e === 'stueck';
}

const euro = (wert: number): string =>
  wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Prüft, ob Einheit und Preis einer Sack-/Palettenposition zu ihrer Artikelnummer passen.
 * Rückgabe: Klartext-Grund, wenn NICHT — dann wird die Position unverändert übernommen
 * und der Kunde zur manuellen Prüfung ausgesteuert. `null` = plausibel.
 */
function pruefeSackPositionPlausibel(pos: Position, klasse: PositionsKlasse): string | null {
  const preis = pos.einzelpreis ?? 0;
  const bez = pos.bezeichnung || pos.artikelnummer || 'Position';

  if (preis < 0) {
    return `${bez}: negativer Einzelpreis (${euro(preis)} €) – vermutlich Gutschrift oder Storno`;
  }

  if (klasse === 'beiladung_sack') {
    if (!istStueckEinheit(pos.einheit)) {
      return `${bez}: Sack-Artikelnummer ${pos.artikelnummer}, aber Einheit „${pos.einheit}" (erwartet Stk)`;
    }
    if (preis > MAX_SACKPREIS_EURO) {
      return `${bez}: ${euro(preis)} € ist kein Preis je 40-kg-Sack (erwartet bis ${euro(
        MAX_SACKPREIS_EURO
      )} €) – sieht nach einem Tonnen- oder Palettenpreis aus`;
    }
  }

  if (klasse === 'sack_palette') {
    if (istStueckEinheit(pos.einheit)) {
      return `${bez}: Paletten-Artikelnummer ${pos.artikelnummer}, aber Einheit „${pos.einheit}" (erwartet t)`;
    }
    if (preis > 0 && preis < MIN_TONNENPREIS_EURO) {
      return `${bez}: ${euro(preis)} €/t ist kein plausibler Tonnenpreis (erwartet ab ${euro(
        MIN_TONNENPREIS_EURO
      )} €) – sieht nach einem Sackpreis aus`;
    }
  }

  return null;
}

type PositionsKlasse =
  | 'schuettgut'
  | 'sack_palette'
  | 'beiladung_sack'
  | 'bigbag'
  | 'paletten_zubehoer'
  | 'sonstig';

function klassifizierePosition(pos: Position): PositionsKlasse {
  const nr = (pos.artikelnummer || '').toUpperCase();
  if (SCHUETTGUT_ARTIKEL.has(nr)) return 'schuettgut';
  if (SACK_PALETTEN_ARTIKEL.has(nr)) return 'sack_palette';
  if (BEILADUNG_SACK_ARTIKEL.has(nr)) return 'beiladung_sack';
  if (BIGBAG_ARTIKEL.has(nr)) return 'bigbag';
  if (PALETTEN_ZUBEHOER_ARTIKEL.has(nr)) return 'paletten_zubehoer';
  if (nr.startsWith('TM-ZM')) {
    // Unbekannte TM-ZM-Variante: über Bezeichnung/Einheit zuordnen.
    const bez = (pos.bezeichnung || '').toLowerCase();
    if (bez.includes('bigbag') || bez.includes('big bag')) return 'bigbag';
    if (bez.includes('gesackt') || bez.includes('sack')) {
      return (pos.einheit || '').toLowerCase() === 'stk' ? 'beiladung_sack' : 'sack_palette';
    }
    return 'schuettgut';
  }
  return 'sonstig';
}

function istPalettenKlasse(klasse: PositionsKlasse): boolean {
  return (
    klasse === 'sack_palette' ||
    klasse === 'beiladung_sack' ||
    klasse === 'bigbag' ||
    klasse === 'paletten_zubehoer'
  );
}

/** Schüttgut-Tonnage (TM-ZM-02/-03) der verrechneten Positionen. */
function berechneSchuettgutTonnage(positionen: Position[]): number {
  return round2(
    positionen
      .filter((p) => !p.istBedarfsposition && klassifizierePosition(p) === 'schuettgut')
      .reduce((sum, p) => sum + (p.menge ?? 0), 0)
  );
}

/** Produktprofil aus den Referenz-Positionen: schuettgut | paletten | gemischt. */
function bestimmeProduktprofil(positionen: Position[]): Produktprofil {
  let hatSchuettgut = false;
  let hatPaletten = false;
  for (const pos of positionen) {
    if (pos.istBedarfsposition) continue;
    const klasse = klassifizierePosition(pos);
    if (klasse === 'schuettgut') hatSchuettgut = true;
    else if (klasse === 'sack_palette' || klasse === 'beiladung_sack' || klasse === 'bigbag') {
      hatPaletten = true;
    }
  }
  if (hatSchuettgut && hatPaletten) return 'gemischt';
  if (hatPaletten) return 'paletten';
  return 'schuettgut';
}

/** Rundet Tonnen auf halbe Paletten (0,5 t) AUF. */
function rundeAufHalbePaletten(tonnen: number): number {
  return Math.ceil(tonnen * 2 - 1e-9) / 2;
}

/** Bezeichnung der Pauschal-Position für den Anbruch-Aufschlag (transparent auf dem PDF). */
const ANBRUCH_AUFSCHLAG_BEZEICHNUNG = 'Aufschlag angebrochene Palette';
const ANBRUCH_AUFSCHLAG_EINHEIT = 'Pauschale';

/**
 * Erkennt die Anbruch-Aufschlagsposition. Sie ist ein fester Euro-Betrag aus den
 * Stammdaten und darf deshalb von keiner prozentualen Preisanpassung erfasst werden.
 */
function istAnbruchAufschlagPosition(pos: Position): boolean {
  return (
    pos.einheit === ANBRUCH_AUFSCHLAG_EINHEIT &&
    pos.bezeichnung === ANBRUCH_AUFSCHLAG_BEZEICHNUNG
  );
}

/**
 * Baut die separate Pauschal-Position für den Anbruch-Aufschlag.
 * Der Tonnenpreis der Ware bleibt unverändert — der Aufschlag steht als eigene,
 * klar benannte Zeile im Angebot.
 */
function baueAnbruchAufschlagPosition(anzahlAnbrueche: number, aufschlagEuro: number): Position {
  return {
    id: naechstePositionId(),
    bezeichnung: ANBRUCH_AUFSCHLAG_BEZEICHNUNG,
    beschreibung: 'Pauschaler Aufschlag je angebrochener (halber) Palette',
    menge: anzahlAnbrueche,
    einheit: ANBRUCH_AUFSCHLAG_EINHEIT,
    einzelpreis: round2(aufschlagEuro),
    gesamtpreis: round2(anzahlAnbrueche * aufschlagEuro),
  };
}

// Bereitet EINE Paletten-/Sack-Position der Referenz für das neue Angebot auf:
//  - Alt-Beiladungs-Säcke (Stk) werden auf Paletten-Sackware (t) umgestellt
//    (€/t = €/Sack × 25) und wie Sackware behandelt.
//  - Sackware (t) wird auf halbe/ganze Paletten aufgerundet; ein Anbruch (0,5 t)
//    wird als eigene 0,5-t-Position zum NORMALEN Tonnenpreis ausgewiesen. Der
//    Aufschlag selbst ist ein fester Euro-Betrag und wird von
//    baueAngebotsPositionenAusReferenz als eigene Pauschal-Position ergänzt —
//    dafür meldet diese Funktion die Anzahl der Anbrüche zurück (`anbrueche`).
//  - BigBags werden auf ganze Gebinde aufgerundet, Paletten-Zubehör 1:1 übernommen.
//  - Passen Einheit/Preis nicht zur Artikelnummer, wird NICHT gerechnet: die Position
//    geht unverändert ins Angebot und der Kunde in die manuelle Prüfung (`pruefungen`).
function bereitePalettenPositionAuf(
  pos: Position,
  klasse: PositionsKlasse
): { positionen: Position[]; warnungen: string[]; anbrueche: number; pruefungen: string[] } {
  const warnungen: string[] = [];

  if (klasse === 'paletten_zubehoer' || klasse === 'sonstig') {
    return { positionen: klonePositionen([pos]), warnungen, anbrueche: 0, pruefungen: [] };
  }

  if (klasse === 'bigbag') {
    const menge = Math.ceil((pos.menge ?? 0) - 1e-9);
    if (menge <= 0) return { positionen: [], warnungen, anbrueche: 0, pruefungen: [] };
    if (Math.abs(menge - (pos.menge ?? 0)) > 1e-9) {
      warnungen.push(`${pos.bezeichnung}: auf ${menge} ganze BigBags aufgerundet`);
    }
    return {
      positionen: [
        {
          ...pos,
          id: naechstePositionId(),
          menge,
          gesamtpreis: round2(menge * (pos.einzelpreis ?? 0)),
        },
      ],
      warnungen,
      anbrueche: 0,
      pruefungen: [],
    };
  }

  // Plausibilitätsbremse: lieber unverändert übernehmen als falsch umrechnen.
  const unplausibel = pruefeSackPositionPlausibel(pos, klasse);
  if (unplausibel) {
    return {
      positionen: klonePositionen([pos]),
      warnungen,
      anbrueche: 0,
      pruefungen: [unplausibel],
    };
  }

  // Sackware: auf Tonnen + €/t normalisieren
  let tonnen = pos.menge ?? 0;
  let preisProTonne = pos.einzelpreis ?? 0;
  let artikelnummer = pos.artikelnummer;
  let bezeichnung = pos.bezeichnung;

  if (klasse === 'beiladung_sack') {
    tonnen = (pos.menge ?? 0) * SACK_GEWICHT_TONNEN;
    preisProTonne = (pos.einzelpreis ?? 0) * SAECKE_PRO_PALETTE;
    const nr = (pos.artikelnummer || '').toUpperCase();
    artikelnummer = nr === 'TM-ZM-03S' ? 'TM-ZM-03St' : 'TM-ZM-02St';
    bezeichnung =
      nr === 'TM-ZM-03S' ? 'Tennismehl 0/3 mm gesackt' : 'Tennismehl 0/2 mm gesackt';
    warnungen.push(
      `${pos.bezeichnung}: Alt-Beiladungs-Säcke auf Palettenware umgestellt (€/t = €/Sack × ${SAECKE_PRO_PALETTE})`
    );
  }

  const gerundet = rundeAufHalbePaletten(tonnen);
  if (gerundet <= 0) return { positionen: [], warnungen, anbrueche: 0, pruefungen: [] };
  if (Math.abs(gerundet - tonnen) > 1e-9) {
    warnungen.push(
      `${pos.bezeichnung}: ${tonnen.toLocaleString('de-DE')} t auf ${gerundet.toLocaleString(
        'de-DE'
      )} t (halbe/ganze Paletten) aufgerundet`
    );
  }

  const ganze = Math.floor(gerundet + 1e-9);
  const hatAnbruch = gerundet - ganze > 0.25; // 0,5-Rest
  const positionen: Position[] = [];

  if (ganze > 0) {
    positionen.push({
      ...pos,
      id: naechstePositionId(),
      artikelnummer,
      bezeichnung,
      einheit: 't',
      menge: ganze,
      einzelpreis: round2(preisProTonne),
      gesamtpreis: round2(ganze * preisProTonne),
    });
  }
  if (hatAnbruch) {
    // Anbruch zum NORMALEN Tonnenpreis — der Aufschlag ist eine eigene Pauschal-Position.
    positionen.push({
      ...pos,
      id: naechstePositionId(),
      artikelnummer,
      bezeichnung: `${bezeichnung} – halbe Palette (Anbruch)`,
      einheit: 't',
      menge: 0.5,
      einzelpreis: round2(preisProTonne),
      gesamtpreis: round2(0.5 * preisProTonne),
    });
  }
  return { positionen, warnungen, anbrueche: hatAnbruch ? 1 : 0, pruefungen: [] };
}

// Baut die Angebots-Positionen aus den Referenz-Positionen auf:
// Schüttgut & Sonstiges 1:1 geklont, Paletten-Block über bereitePalettenPositionAuf.
// Gemischt = beide Blöcke in EINEM Angebot (Reihenfolge der Referenz bleibt erhalten).
//
// Anbruch-Aufschlag: fester Euro-Betrag je angebrochener (halber) Palette. Er wird
// NICHT in den Tonnenpreis eingerechnet, sondern als EINE klar benannte Pauschal-Position
// ans Ende gehängt (menge = Anzahl der Anbrüche im Angebot). Betrag 0 → keine Position,
// dafür eine Warnung „nicht konfiguriert".
function baueAngebotsPositionenAusReferenz(
  referenzPositionen: Position[],
  halbePaletteAufschlagEuro: number
): { positionen: Position[]; warnungen: string[]; pruefungen: string[] } {
  const positionen: Position[] = [];
  const warnungen: string[] = [];
  const pruefungen: string[] = [];
  let anbrueche = 0;
  for (const pos of referenzPositionen) {
    const klasse = klassifizierePosition(pos);
    if (istPalettenKlasse(klasse) && !pos.istBedarfsposition) {
      const aufbereitet = bereitePalettenPositionAuf(pos, klasse);
      positionen.push(...aufbereitet.positionen);
      warnungen.push(...aufbereitet.warnungen);
      pruefungen.push(...aufbereitet.pruefungen);
      anbrueche += aufbereitet.anbrueche;
    } else {
      positionen.push(...klonePositionen([pos]));
    }
  }

  if (anbrueche > 0) {
    if (halbePaletteAufschlagEuro > 0) {
      positionen.push(baueAnbruchAufschlagPosition(anbrueche, halbePaletteAufschlagEuro));
    } else {
      warnungen.push(
        `${anbrueche} angebrochene Palette(n) OHNE Aufschlag übernommen – der Aufschlag für angebrochene Paletten (€) ist in den Stammdaten nicht konfiguriert`
      );
    }
  }

  return { positionen, warnungen, pruefungen };
}

// Die editierbare Hauptposition: erste echte (nicht-Bedarfs-)Position, bevorzugt Ziegelmehl.
function findePrimaerPosition(positionen: Position[]): Position | undefined {
  const echte = positionen.filter((p) => !p.istBedarfsposition);
  const ziegelmehl = echte.find(
    (p) => p.artikelnummer?.toUpperCase().startsWith('TM-ZM') || p.einheit?.toLowerCase() === 't'
  );
  return ziegelmehl ?? echte[0] ?? positionen[0];
}

// Netto-Summe aller verrechneten (nicht-Bedarfs-)Positionen.
function berechneSumme(positionen: Position[]): number {
  return round2(
    positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((sum, p) => sum + (p.gesamtpreis ?? 0), 0)
  );
}

// PLZ-Kalkulation: Werkspreis + Aufschlag + Speditionskosten je Tonne.
function berechnePlzPreisProTonne(plz: string, menge: number, werkspreisProTonne: number): number {
  // Neukunden ohne Historie konservativ als Endkunde kalkulieren (höherer Aufschlag).
  const aufschlag = werkspreisProTonne * AUFSCHLAEGE.endkunde;
  const speditionGesamt = berechneSpeditionskosten(plz, menge * 1000);
  const speditionProTonne = speditionGesamt && menge > 0 ? speditionGesamt / menge : 0;
  return round2(werkspreisProTonne + aufschlag + speditionProTonne);
}

function ermittleEmpfaenger(kunde: SaisonKunde): string | undefined {
  return kunde.rechnungsEmail || kunde.email || undefined;
}

function ermittlePlz(kunde: SaisonKunde): string | undefined {
  return kunde.lieferadresse?.plz || kunde.rechnungsadresse?.plz || undefined;
}

// Flache Kundenadresse (Rechnungsadresse bevorzugt) für Projekt/Angebot.
function flacheKundenadresse(kunde: SaisonKunde): { strasse: string; plzOrt: string } {
  const rech = kunde.rechnungsadresse;
  const liefer = kunde.lieferadresse;
  const strasse = rech?.strasse || liefer?.strasse || '';
  const plzOrt = rech
    ? formatAdresszeile(rech.plz, rech.ort, rech.land)
    : liefer
    ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land)
    : '';
  return { strasse, plzOrt };
}

// Harte Validierung (blockiert Erzeugung) + weiche Hinweise. Setzt status/ausgewaehlt.
function validiere(kandidat: MassenAngebotKandidat): MassenAngebotKandidat {
  const fehler: string[] = [];
  if (!(kandidat.menge > 0)) fehler.push('Menge muss > 0 sein');
  if (!(kandidat.preisProTonne > 0)) fehler.push('Preis/Tonne muss > 0 sein');
  if (!ermittlePlz(kandidat.kunde)) fehler.push('Keine gültige Lieferadresse (PLZ fehlt)');

  const warnungen = [...kandidat.warnungen];
  if (kandidat.emailFehlt) warnungen.push('Empfänger-E-Mail fehlt – Versand nicht möglich');

  if (fehler.length > 0) {
    return { ...kandidat, fehler, warnungen, status: 'fehler', ausgewaehlt: false };
  }
  return { ...kandidat, fehler, warnungen, status: 'neu', ausgewaehlt: true };
}

function basisKandidat(kunde: SaisonKunde): MassenAngebotKandidat {
  const empfaenger = ermittleEmpfaenger(kunde);
  return {
    kundeId: kunde.id,
    kundenname: kunde.name,
    kundennummer: kunde.kundennummer,
    typ: kunde.typ,
    quelle: 'manuell',
    status: 'manuell',
    produktprofil: 'schuettgut',
    menge: 0,
    preisProTonne: 0,
    angebotssumme: 0,
    empfaengerEmail: empfaenger,
    emailFehlt: !empfaenger,
    positionen: [],
    fehler: [],
    warnungen: [],
    ausgewaehlt: false,
    kunde,
  };
}

// ===== BULK-DATENBESCHAFFUNG FÜR DEN DRY-RUN =====
// Statt 2–4 Queries PRO Kunde (N+1, bei ~2300 Kunden mehrere tausend Requests)
// werden alle benötigten Daten vorab in wenigen paginierten Bulk-Queries geladen
// und als Lookup-Maps an die (unveränderte) Kandidaten-Logik übergeben.

/** Fortschritts-Callback für den Dry-Run (Schrittbeschreibung + Prozent 0–100). */
export type SammelFortschritt = (schritt: string, prozent: number) => void;

// Minimale Projekt-Referenz (mehr braucht der Dry-Run nicht).
interface ProjektRef {
  id: string; // Appwrite-$id
  kundeId: string;
  status?: string; // Projekt-Status (z.B. 'verloren' → keine Bestellung)
}

// Referenz-Dokumente eines Vorjahres-Projekts (je Typ das neueste).
const REFERENZ_DOKUMENT_TYPEN = ['auftragsbestaetigung', 'rechnung', 'angebot'] as const;
type ReferenzDokumentTyp = (typeof REFERENZ_DOKUMENT_TYPEN)[number];
type ReferenzDokumente = Partial<Record<ReferenzDokumentTyp, GespeichertesDokument>>;

// Alle vorab geladenen Daten, aus denen die Kandidaten rein in-memory bestimmt werden.
interface KandidatenLookup {
  zielProjekte: Map<string, ProjektRef[]>; // kundeId → Projekte der Zielsaison
  vorjahrProjekte: Map<string, ProjektRef[]>; // kundeId → ALLE Projekte der Vorsaison
  vorjahrDokumente: Map<string, ReferenzDokumente>; // projektId → AB/Rechnung/Angebot
  zielSaisonDaten: Map<string, SaisonDaten>; // kundeId → SaisonDaten der Zielsaison
  vorjahrSaisonDaten: Map<string, SaisonDaten>; // kundeId → SaisonDaten der Vorsaison (Bezugsweg-Prüfung)
  halbePaletteAufschlagEuro: number; // Fester Anbruch-Aufschlag (€) aus der Preis-Konfiguration
}

// Bezieht der Kunde über einen Platzbauer? Dann darf KEIN automatisches
// Direkt-Angebot an den Verein gehen — der eigentliche Kunde ist der Platzbauer.
function beziehtUeberPlatzbauer(
  kunde: SaisonKunde,
  vorjahrSaison: SaisonDaten | undefined
): boolean {
  return (
    kunde.standardBezugsweg === 'ueber_platzbauer' ||
    vorjahrSaison?.bezugsweg === 'ueber_platzbauer' ||
    Boolean(vorjahrSaison?.platzbauerId)
  );
}

// Lädt ALLE Projekte eines Saisonjahrs paginiert und mappt kundeId → Projekt[].
// WICHTIG für den Referenz-Algorithmus: ein Kunde kann MEHRERE Projekte pro
// Saison haben — alle werden behalten (größte Bestellung entscheidet).
async function ladeProjekteFuerSaison(saisonjahr: number): Promise<Map<string, ProjektRef[]>> {
  const docs = await loadAllDocuments(DATABASE_ID, PROJEKTE_COLLECTION_ID, {
    queries: [Query.equal('saisonjahr', saisonjahr)],
  });
  const map = new Map<string, ProjektRef[]>();
  for (const doc of docs as unknown as Array<{ $id: string; kundeId?: string; status?: string }>) {
    if (!doc.kundeId) continue;
    const liste = map.get(doc.kundeId) ?? [];
    liste.push({ id: doc.$id, kundeId: doc.kundeId, status: doc.status });
    map.set(doc.kundeId, liste);
  }
  return map;
}

// Lädt AB-/Rechnungs-/Angebots-Dokumente der übergebenen Projekte in Batches
// (Query.equal mit bis zu 100 Werten) und behält je (Projekt, Typ) das NEUESTE
// (orderDesc $createdAt → erster Treffer), identisch zu ladeDokumentNachTyp.
async function ladeReferenzDokumenteFuerProjekte(
  projektIds: string[]
): Promise<Map<string, ReferenzDokumente>> {
  const map = new Map<string, ReferenzDokumente>();
  const BATCH = 100;
  for (let i = 0; i < projektIds.length; i += BATCH) {
    const ids = projektIds.slice(i, i + BATCH);
    if (ids.length === 0) continue;
    const docs = await loadAllDocuments(DATABASE_ID, BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, {
      queries: [
        Query.equal('dokumentTyp', [...REFERENZ_DOKUMENT_TYPEN]),
        Query.equal('projektId', ids),
        Query.orderDesc('$createdAt'),
      ],
    });
    for (const doc of docs as unknown as GespeichertesDokument[]) {
      if (!doc.projektId) continue;
      const typ = doc.dokumentTyp as ReferenzDokumentTyp;
      if (!(REFERENZ_DOKUMENT_TYPEN as readonly string[]).includes(typ)) continue;
      const eintrag = map.get(doc.projektId) ?? {};
      if (!eintrag[typ]) {
        eintrag[typ] = doc;
        map.set(doc.projektId, eintrag);
      }
    }
  }
  return map;
}

// ===== REFERENZ-AUSWAHL: „größte Bestellung des Jahres" =====

interface ReferenzKandidat {
  projekt: ProjektRef;
  typ: ReferenzDokumentTyp;
  positionen: Position[];
  tonnage: number; // Schüttgut-Tonnen
  wert: number; // Netto-Auftragswert
  bestaetigt: boolean; // AB/Rechnung (bestätigte Bestellung) vs. bloßes Angebot
  verloren: boolean;
}

// Datenbasis je Projekt: AB > Rechnung > Angebot (bestätigte Bestellung schlägt Angebot).
// Stornierte Rechnungen werden übersprungen.
function extrahiereReferenz(
  projekt: ProjektRef,
  dokumente: ReferenzDokumente | undefined
): ReferenzKandidat | null {
  if (!dokumente) return null;
  for (const typ of REFERENZ_DOKUMENT_TYPEN) {
    const dokument = dokumente[typ];
    if (!dokument) continue;
    if (typ === 'rechnung' && dokument.rechnungsStatus === 'storniert') continue;
    const daten = ladeDokumentDaten<{ positionen?: Position[] }>(dokument);
    if (daten?.positionen?.length) {
      return {
        projekt,
        typ,
        positionen: daten.positionen,
        tonnage: berechneSchuettgutTonnage(daten.positionen),
        wert: berechneSumme(daten.positionen),
        bestaetigt: typ !== 'angebot',
        verloren: projekt.status === 'verloren',
      };
    }
  }
  return null;
}

// Wählt über ALLE Vorjahres-Projekte des Kunden die größte Bestellung:
// primär Schüttgut-Tonnage, bei 0 t (reine Palettenkunden) bzw. Gleichstand
// der Netto-Auftragswert. Verlorene Projekte nur als letzter Ausweg.
function waehleGroessteBestellung(
  projekte: ProjektRef[],
  dokumente: Map<string, ReferenzDokumente>
): ReferenzKandidat | null {
  const kandidaten = projekte
    .map((p) => extrahiereReferenz(p, dokumente.get(p.id)))
    .filter((k): k is ReferenzKandidat => k !== null);
  if (kandidaten.length === 0) return null;
  const nichtVerloren = kandidaten.filter((k) => !k.verloren);
  const pool = nichtVerloren.length > 0 ? nichtVerloren : kandidaten;
  return [...pool].sort(
    (a, b) =>
      b.tonnage - a.tonnage || b.wert - a.wert || Number(b.bestaetigt) - Number(a.bestaetigt)
  )[0];
}

// Mosaik-Referenzjahr aus der Preishistorie am Kunden (neuestes Saisonjahr),
// soweit die Datenlage es hergibt — Mosaik speichert nur EINEN Vorjahreswert
// (tonnenLetztesJahr/zuletztGezahlterPreis), keine Bestellungen je Jahr.
function ermittleMosaikReferenzJahr(kunde: SaisonKunde): number | undefined {
  const historie = kunde.preisHistorie;
  if (!historie || historie.length === 0) return undefined;
  return historie.reduce((max, h) => Math.max(max, h.saisonjahr), 0) || undefined;
}

// Lädt alle SaisonDaten der Zielsaison paginiert (kundeId → geparste Nutzdaten
// aus dem data-JSON, analog saisonplanungService.loadAktuelleSaisonDaten).
async function ladeSaisonDatenFuerSaison(saisonjahr: number): Promise<Map<string, SaisonDaten>> {
  const docs = await loadAllDocuments(DATABASE_ID, SAISON_DATEN_COLLECTION_ID, {
    queries: [Query.equal('saisonjahr', saisonjahr)],
  });
  const map = new Map<string, SaisonDaten>();
  for (const doc of docs as unknown as Array<{ $id: string; kundeId?: string; data?: string }>) {
    if (!doc.kundeId || map.has(doc.kundeId)) continue;
    if (typeof doc.data !== 'string' || !doc.data) continue;
    try {
      map.set(doc.kundeId, JSON.parse(doc.data) as SaisonDaten);
    } catch {
      // Nicht parsebar → wie "keine SaisonDaten" behandeln (Fallback-Standardmenge)
    }
  }
  return map;
}

// Bestimmt für EINEN Kunden Quelle + Angebotsentwurf — rein in-memory aus den
// vorab geladenen Lookup-Maps.
function bestimmeKandidat(
  kunde: SaisonKunde,
  saisonjahr: number,
  werkspreisProTonne: number,
  lookup: KandidatenLookup
): MassenAngebotKandidat {
  const base = basisKandidat(kunde);

  // Idempotenz: existiert bereits ein Projekt für die Zielsaison? → niemals doppelt anlegen.
  const existierendes = lookup.zielProjekte.get(kunde.id)?.[0];
  if (existierendes) {
    return {
      ...base,
      status: 'existiert',
      statusGrund: `Projekt für Saison ${saisonjahr} existiert bereits`,
      existierendesProjektId: existierendes.id,
    };
  }

  // Platzbauer: Instandsetzungs-Angebot → bewusst manuell prüfen (andere Preislogik).
  if (kunde.typ === 'platzbauer') {
    return {
      ...base,
      status: 'manuell',
      statusGrund: 'Platzbauer – Instandsetzungs-Angebot manuell erstellen',
    };
  }

  // Verein bezieht über einen Platzbauer: ausschließen — das Angebot ging im
  // Vorjahr an den Platzbauer, ein automatisches Direkt-Angebot wäre falsch.
  if (beziehtUeberPlatzbauer(kunde, lookup.vorjahrSaisonDaten.get(kunde.id))) {
    return {
      ...base,
      status: 'manuell',
      statusGrund: 'Bezieht über Platzbauer – kein automatisches Direkt-Angebot',
    };
  }

  // 1) Vorjahres-Referenz: größte Bestellung über ALLE Projekte der Vorsaison
  const vorjahrProjekte = lookup.vorjahrProjekte.get(kunde.id) ?? [];
  if (vorjahrProjekte.length > 0) {
    const referenz = waehleGroessteBestellung(vorjahrProjekte, lookup.vorjahrDokumente);
    if (referenz) {
      const aufgebaut = baueAngebotsPositionenAusReferenz(
        referenz.positionen,
        lookup.halbePaletteAufschlagEuro
      );
      const warnungen = [...aufgebaut.warnungen];
      if (referenz.verloren) {
        warnungen.push('Referenz stammt aus einem VERLORENEN Vorjahres-Projekt – bitte prüfen');
      }
      // Einheit/Preis der Vorjahres-Position passen nicht zur Artikelnummer: hier wird
      // NICHT geraten. Der Kunde wird ausgesteuert, die Referenz bleibt unverändert
      // sichtbar, damit im Detail-Panel entschieden werden kann, was wirklich gemeint war.
      if (aufgebaut.pruefungen.length > 0) {
        const primaerUnplausibel = findePrimaerPosition(aufgebaut.positionen);
        return {
          ...base,
          quelle: 'vorjahr',
          status: 'manuell',
          statusGrund: 'Vorjahres-Position nicht plausibel – von Hand prüfen',
          produktprofil: bestimmeProduktprofil(referenz.positionen),
          positionen: aufgebaut.positionen,
          primaerPositionId: primaerUnplausibel?.id,
          menge: primaerUnplausibel?.menge ?? 0,
          preisProTonne: primaerUnplausibel?.einzelpreis ?? 0,
          angebotssumme: berechneSumme(aufgebaut.positionen),
          warnungen: [...warnungen, ...aufgebaut.pruefungen],
          referenz: {
            jahr: saisonjahr - 1,
            typ: referenz.typ,
            tonnage: referenz.tonnage,
            wert: referenz.wert,
            projektId: referenz.projekt.id,
            anzahlVorjahresProjekte: vorjahrProjekte.length,
            ausVerlorenemProjekt: referenz.verloren || undefined,
          },
        };
      }
      const referenzInfo: ReferenzInfo = {
        jahr: saisonjahr - 1,
        typ: referenz.typ,
        tonnage: referenz.tonnage,
        wert: referenz.wert,
        projektId: referenz.projekt.id,
        anzahlVorjahresProjekte: vorjahrProjekte.length,
        ausVerlorenemProjekt: referenz.verloren || undefined,
      };
      const primaer = findePrimaerPosition(aufgebaut.positionen);
      return validiere({
        ...base,
        quelle: 'vorjahr',
        produktprofil: bestimmeProduktprofil(referenz.positionen),
        referenz: referenzInfo,
        positionen: aufgebaut.positionen,
        primaerPositionId: primaer?.id,
        menge: primaer?.menge ?? 0,
        preisProTonne: primaer?.einzelpreis ?? 0,
        angebotssumme: berechneSumme(aufgebaut.positionen),
        warnungen,
      });
    }
  }

  // 2) Historie/Mosaik: am Kunden gespeicherte Vorjahreswerte (z.B. aus Migration backfilled).
  // Mosaik kennt nur EINEN aggregierten Vorjahreswert — „größte Bestellung je Jahr"
  // ist dort nicht rekonstruierbar; das Referenzjahr wird aus der Preishistorie abgeleitet.
  if (
    kunde.tonnenLetztesJahr &&
    kunde.tonnenLetztesJahr > 0 &&
    kunde.zuletztGezahlterPreis &&
    kunde.zuletztGezahlterPreis > 0
  ) {
    const menge = kunde.tonnenLetztesJahr;
    const preis = kunde.zuletztGezahlterPreis;
    const position = baueZiegelmehlPosition(menge, preis);
    return validiere({
      ...base,
      quelle: 'mosaik',
      produktprofil: 'schuettgut',
      referenz: {
        jahr: ermittleMosaikReferenzJahr(kunde),
        typ: 'mosaik',
        tonnage: menge,
        wert: round2(menge * preis),
      },
      positionen: [position],
      primaerPositionId: position.id,
      menge,
      preisProTonne: preis,
      angebotssumme: round2(menge * preis),
    });
  }

  // 3) PLZ-Preiskalkulation (echter Neukunde ohne Historie)
  const plz = ermittlePlz(kunde);
  const zone = plz ? getZoneFromPLZ(plz) : null;
  if (plz && zone) {
    const saisonDaten = lookup.zielSaisonDaten.get(kunde.id) ?? null;
    const menge =
      saisonDaten?.referenzmenge && saisonDaten.referenzmenge > 0
        ? saisonDaten.referenzmenge
        : STANDARD_MENGE_DEFAULT;
    const preis = berechnePlzPreisProTonne(plz, menge, werkspreisProTonne);
    const position = baueZiegelmehlPosition(menge, preis);
    const kandidat = validiere({
      ...base,
      quelle: 'plz_kalkulation',
      positionen: [position],
      primaerPositionId: position.id,
      menge,
      preisProTonne: preis,
      angebotssumme: round2(menge * preis),
    });
    kandidat.warnungen = [...kandidat.warnungen, 'Kalkuliert aus PLZ-Zone – Menge & Preis bitte prüfen'];
    return kandidat;
  }

  // 4) Keine verwertbare Quelle
  return {
    ...base,
    status: 'manuell',
    statusGrund: 'Keine Vorjahres-/Historien-/PLZ-Daten – manuell prüfen',
  };
}

/**
 * Sammelt alle Kandidaten für die Zielsaison (Dry-Run – schreibt nichts).
 * Opt-in: massenangebots-tauglich ist NUR aktiv && automatischesAngebot === true
 * (undefined zählt als false).
 *
 * Performance: die gesamte Datenbeschaffung läuft in wenigen paginierten
 * Bulk-Queries (statt 2–4 Queries pro Kunde). Optionaler Fortschritts-Callback
 * für die UI („Lade Vorjahres-Projekte… 40 %").
 */
async function sammleKandidaten(
  saisonjahr: number,
  onFortschritt?: SammelFortschritt
): Promise<MassenAngebotKandidat[]> {
  const melde = (schritt: string, prozent: number) => onFortschritt?.(schritt, prozent);

  melde('Lade Kundenstamm…', 5);
  const alleKunden = await saisonplanungService.loadAlleKunden();
  // Opt-in-Semantik: nur explizit als massenangebots-tauglich markierte aktive Kunden.
  const berechtigte = alleKunden.filter((k) => k.aktiv && k.automatischesAngebot === true);

  melde('Lade Werkspreis & Preis-Konfiguration…', 15);
  const werkspreisProTonne = await getArtikelPreis(STANDARD_ARTIKEL.nummer);
  const { halbePaletteAufschlagEuro } = await getPreisKonfiguration();

  melde(`Lade Projekte der Saison ${saisonjahr}…`, 25);
  const zielProjekte = await ladeProjekteFuerSaison(saisonjahr);

  melde(`Lade Vorjahres-Projekte (${saisonjahr - 1})…`, 40);
  const vorjahrProjekte = await ladeProjekteFuerSaison(saisonjahr - 1);

  melde('Lade Bezugswege der Vorsaison…', 50);
  const vorjahrSaisonDaten = await ladeSaisonDatenFuerSaison(saisonjahr - 1);

  // Referenz-Dokumente (AB/Rechnung/Angebot) nur für Vorjahres-Projekte laden,
  // deren Kunde die Quelle „Vorjahr" überhaupt erreichen kann (kein Zielprojekt,
  // kein Platzbauer, kein Bezug über Platzbauer). ALLE Projekte je Kunde.
  const relevanteVorjahrProjektIds = berechtigte
    .filter(
      (k) =>
        !zielProjekte.has(k.id) &&
        k.typ !== 'platzbauer' &&
        !beziehtUeberPlatzbauer(k, vorjahrSaisonDaten.get(k.id))
    )
    .flatMap((k) => (vorjahrProjekte.get(k.id) ?? []).map((p) => p.id));

  melde('Lade Vorjahres-Referenzen (AB/Rechnung/Angebot)…', 60);
  const vorjahrDokumente = await ladeReferenzDokumenteFuerProjekte(relevanteVorjahrProjektIds);

  melde('Lade Saisonplanungs-Daten…', 80);
  const zielSaisonDaten = await ladeSaisonDatenFuerSaison(saisonjahr);

  melde('Berechne Kandidaten…', 90);
  const lookup: KandidatenLookup = {
    zielProjekte,
    vorjahrProjekte,
    vorjahrDokumente,
    zielSaisonDaten,
    vorjahrSaisonDaten,
    halbePaletteAufschlagEuro,
  };
  const kandidaten = berechtigte.map((kunde) =>
    bestimmeKandidat(kunde, saisonjahr, werkspreisProTonne, lookup)
  );

  melde('Fertig', 100);

  // Sortierung: zu erzeugende zuerst, dann Prüffälle, dann existierende.
  const rang: Record<MassenAngebotKandidat['status'], number> = {
    neu: 0,
    fehler: 1,
    manuell: 2,
    existiert: 3,
  };
  return kandidaten.sort(
    (a, b) => rang[a.status] - rang[b.status] || a.kundenname.localeCompare(b.kundenname, 'de')
  );
}

// ===== OPT-IN-VORSCHLAGSLISTE =====

/**
 * Berechnet alle Kunden, die im Vorjahr DIREKT bestellt haben (mind. ein nicht
 * verlorenes Vorjahres-Projekt, kein Platzbauer, kein Bezug über Platzbauer,
 * E-Mail vorhanden) und noch NICHT als massenangebots-tauglich markiert sind.
 * Reine Leseoperation — schreibt nichts.
 */
async function sammleTauglichkeitsVorschlaege(
  saisonjahr: number,
  onFortschritt?: SammelFortschritt
): Promise<TauglichkeitsVorschlag[]> {
  const melde = (schritt: string, prozent: number) => onFortschritt?.(schritt, prozent);

  melde('Lade Kundenstamm…', 10);
  const alleKunden = await saisonplanungService.loadAlleKunden();

  melde(`Lade Vorjahres-Projekte (${saisonjahr - 1})…`, 45);
  const vorjahrProjekte = await ladeProjekteFuerSaison(saisonjahr - 1);

  melde('Lade Bezugswege der Vorsaison…', 75);
  const vorjahrSaisonDaten = await ladeSaisonDatenFuerSaison(saisonjahr - 1);

  melde('Berechne Vorschläge…', 90);
  const BESTELL_STATUS = new Set(['auftragsbestaetigung', 'lieferschein', 'rechnung', 'bezahlt']);
  const vorschlaege = alleKunden
    .filter(
      (k) =>
        k.aktiv &&
        k.automatischesAngebot !== true &&
        k.typ !== 'platzbauer' &&
        !beziehtUeberPlatzbauer(k, vorjahrSaisonDaten.get(k.id))
    )
    .map((kunde) => {
      const projekte = (vorjahrProjekte.get(kunde.id) ?? []).filter(
        (p) => p.status !== 'verloren'
      );
      return { kunde, projekte, email: ermittleEmpfaenger(kunde) };
    })
    .filter((e) => e.projekte.length > 0 && Boolean(e.email))
    .map(
      (e): TauglichkeitsVorschlag => ({
        kundeId: e.kunde.id,
        kundenname: e.kunde.name,
        kundennummer: e.kunde.kundennummer,
        email: e.email,
        anzahlVorjahresProjekte: e.projekte.length,
        hatBestellung: e.projekte.some((p) => p.status !== undefined && BESTELL_STATUS.has(p.status)),
        ausgewaehlt: true,
      })
    )
    .sort((a, b) => a.kundenname.localeCompare(b.kundenname, 'de'));

  melde('Fertig', 100);
  return vorschlaege;
}

/**
 * Markiert die übergebenen Kunden als massenangebots-tauglich
 * (automatischesAngebot: true) — in Batches à 5 parallelen Updates über den
 * saisonplanungService, mit Fortschritts-Callback und Fehlersammlung
 * (Einzelfehler brechen den Lauf NICHT ab). Bewusste Nutzer-Aktion im Tool.
 */
async function markiereAlsTauglich(
  vorschlaege: Pick<TauglichkeitsVorschlag, 'kundeId' | 'kundenname'>[],
  onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void
): Promise<MarkierungsErgebnis> {
  const BATCH = 5;
  let erledigt = 0;
  let erfolgreich = 0;
  const fehler: MarkierungsErgebnis['fehler'] = [];

  for (let i = 0; i < vorschlaege.length; i += BATCH) {
    const batch = vorschlaege.slice(i, i + BATCH);
    const ergebnisse = await Promise.allSettled(
      batch.map((v) =>
        saisonplanungService.updateKunde(v.kundeId, { automatischesAngebot: true })
      )
    );
    ergebnisse.forEach((res, idx) => {
      const vorschlag = batch[idx];
      erledigt += 1;
      if (res.status === 'fulfilled') {
        erfolgreich += 1;
      } else {
        fehler.push({
          kundeId: vorschlag.kundeId,
          kundenname: vorschlag.kundenname,
          fehler: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
      onFortschritt?.(erledigt, vorschlaege.length, vorschlag.kundenname);
    });
  }

  auditService.logAktion({
    action: 'update',
    entityType: 'saison_kunde',
    entityId: 'massenangebot-tauglichkeit',
    summary: `Massenangebots-Tauglichkeit gesetzt: ${erfolgreich} Kunden markiert, ${fehler.length} Fehler`,
  });
  return { erfolgreich, fehler };
}

function berechneZusammenfassung(kandidaten: MassenAngebotKandidat[]): KandidatenZusammenfassung {
  return {
    gesamt: kandidaten.length,
    neu: kandidaten.filter((k) => k.status === 'neu').length,
    existiert: kandidaten.filter((k) => k.status === 'existiert').length,
    fehler: kandidaten.filter((k) => k.status === 'fehler').length,
    manuell: kandidaten.filter((k) => k.status === 'manuell').length,
  };
}

// Aktualisiert Menge/Preis der Primärposition eines Kandidaten und re-validiert ihn.
function aktualisiereMengePreis(
  kandidat: MassenAngebotKandidat,
  menge: number,
  preisProTonne: number
): MassenAngebotKandidat {
  const positionen = kandidat.positionen.map((pos) =>
    pos.id === kandidat.primaerPositionId
      ? { ...pos, menge, einzelpreis: round2(preisProTonne), gesamtpreis: round2(menge * preisProTonne) }
      : pos
  );
  // War der Kandidat manuell/leer, eine Primärposition anlegen.
  const hatPrimaer = positionen.some((p) => p.id === kandidat.primaerPositionId);
  const finalePositionen = hatPrimaer ? positionen : [baueZiegelmehlPosition(menge, preisProTonne)];
  const primaerId = hatPrimaer ? kandidat.primaerPositionId : finalePositionen[0].id;

  // ausgewaehlt-Zustand des Nutzers erhalten, aber Fehlerstatus neu berechnen.
  const warFehler = kandidat.status === 'fehler';
  const revalidiert = validiere({
    ...kandidat,
    positionen: finalePositionen,
    primaerPositionId: primaerId,
    menge,
    preisProTonne: round2(preisProTonne),
    angebotssumme: berechneSumme(finalePositionen),
    warnungen: kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt')),
  });
  // Fehler → bleibt abgewählt; gerade behobener Fehler → automatisch anwählen; sonst Auswahl erhalten.
  const ausgewaehlt =
    revalidiert.status === 'fehler' ? false : warFehler ? true : kandidat.ausgewaehlt;
  return { ...revalidiert, ausgewaehlt };
}

// Re-validiert einen Kandidaten nach einer Positionsänderung aus dem Detail-Panel.
// Primärposition/Menge/Preis/Summe werden neu abgeleitet; Auswahl-Logik wie bei
// aktualisiereMengePreis (Fehler → abgewählt, behobener Fehler → angewählt).
function revalidiereNachPositionsAenderung(
  kandidat: MassenAngebotKandidat,
  positionen: Position[]
): MassenAngebotKandidat {
  const primaer =
    positionen.find((p) => p.id === kandidat.primaerPositionId) ?? findePrimaerPosition(positionen);
  const warFehler = kandidat.status === 'fehler';
  const revalidiert = validiere({
    ...kandidat,
    positionen,
    primaerPositionId: primaer?.id,
    menge: primaer?.menge ?? 0,
    preisProTonne: primaer?.einzelpreis ?? 0,
    angebotssumme: berechneSumme(positionen),
    warnungen: kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt')),
  });
  const ausgewaehlt =
    revalidiert.status === 'fehler' ? false : warFehler ? true : kandidat.ausgewaehlt;
  return { ...revalidiert, ausgewaehlt };
}

/** Aktualisiert Menge/Einzelpreis EINER Position (Detail-Panel) und re-validiert. */
function aktualisierePosition(
  kandidat: MassenAngebotKandidat,
  positionId: string,
  menge: number,
  einzelpreis: number
): MassenAngebotKandidat {
  const positionen = kandidat.positionen.map((pos) =>
    pos.id === positionId
      ? {
          ...pos,
          menge,
          einzelpreis: round2(einzelpreis),
          gesamtpreis: round2(menge * einzelpreis),
        }
      : pos
  );
  return revalidiereNachPositionsAenderung(kandidat, positionen);
}

/** Entfernt EINE Position (Detail-Panel) und re-validiert. */
function entfernePosition(
  kandidat: MassenAngebotKandidat,
  positionId: string
): MassenAngebotKandidat {
  const positionen = kandidat.positionen.filter((pos) => pos.id !== positionId);
  return revalidiereNachPositionsAenderung(kandidat, positionen);
}

/** Setzt die Empfänger-E-Mail (Detail-Panel) und aktualisiert die Versand-Warnung. */
function setzeEmpfaengerEmail(
  kandidat: MassenAngebotKandidat,
  email: string
): MassenAngebotKandidat {
  const bereinigt = email.trim();
  const emailFehlt = bereinigt.length === 0;
  const warnungen = kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt'));
  if (emailFehlt) warnungen.push('Empfänger-E-Mail fehlt – Versand nicht möglich');
  return {
    ...kandidat,
    empfaengerEmail: emailFehlt ? undefined : bereinigt,
    emailFehlt,
    warnungen,
  };
}

/**
 * Wendet eine globale Preisanpassung auf alle editierbaren Kandidaten (neu/fehler) an.
 * - prozent: skaliert jede verrechnete Position um (1 + X/100)
 * - fix:     setzt den €/t-Preis der Primärposition auf den fixen Wert
 * Existierende und manuelle Kandidaten bleiben unberührt.
 *
 * AUSNAHME: Der Anbruch-Aufschlag wird NICHT mitskaliert. Die Preisanpassung hebt
 * Vorjahrespreise auf das neue Saisonniveau; der Aufschlag ist dagegen ein heute
 * gepflegter Stammdaten-Betrag und steht bereits auf dem aktuellen Stand.
 * Ohne diese Ausnahme würden aus konfigurierten 25,00 € bei +4 % stillschweigend 26,00 €.
 */
function wendePreisanpassungAn(
  kandidaten: MassenAngebotKandidat[],
  anpassung: Preisanpassung
): MassenAngebotKandidat[] {
  if (!anpassung) return kandidaten;
  return kandidaten.map((kandidat) => {
    if (kandidat.status !== 'neu' && kandidat.status !== 'fehler') return kandidat;

    if (anpassung.typ === 'fix') {
      return aktualisiereMengePreis(kandidat, kandidat.menge, anpassung.wert);
    }

    // prozent: alle verrechneten Positionen skalieren (außer Bedarfs- und Aufschlagsposition)
    const faktor = 1 + anpassung.wert / 100;
    const positionen = kandidat.positionen.map((pos) =>
      pos.istBedarfsposition || istAnbruchAufschlagPosition(pos)
        ? pos
        : {
            ...pos,
            einzelpreis: round2((pos.einzelpreis ?? 0) * faktor),
            gesamtpreis: round2((pos.menge ?? 0) * (pos.einzelpreis ?? 0) * faktor),
          }
    );
    const primaer = positionen.find((p) => p.id === kandidat.primaerPositionId);
    const warFehler = kandidat.status === 'fehler';
    const revalidiert = validiere({
      ...kandidat,
      positionen,
      preisProTonne: primaer?.einzelpreis ?? round2((kandidat.preisProTonne) * faktor),
      angebotssumme: berechneSumme(positionen),
      warnungen: kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt')),
    });
    const ausgewaehlt =
      revalidiert.status === 'fehler' ? false : warFehler ? true : kandidat.ausgewaehlt;
    return { ...revalidiert, ausgewaehlt };
  });
}

// Baut aus einem Kandidaten die vollständige AngebotsDaten-Struktur (für die Erzeugung).
function baueAngebotsDaten(
  kandidat: MassenAngebotKandidat,
  angebotsnummer: string,
  stammdaten: Stammdaten
): AngebotsDaten {
  const kunde = kandidat.kunde;
  const heute = new Date().toISOString().split('T')[0];
  const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rech = kunde.rechnungsadresse;
  const liefer = kunde.lieferadresse;

  const kundenstrasse = rech?.strasse || liefer?.strasse || '';
  const kundenPlzOrt = rech
    ? formatAdresszeile(rech.plz, rech.ort, rech.land)
    : liefer
    ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land)
    : '';

  const lieferadresseAbweichend =
    !!liefer &&
    !!rech &&
    (liefer.strasse !== rech.strasse || liefer.plz !== rech.plz || liefer.ort !== rech.ort);

  return {
    kundennummer: kunde.kundennummer,
    kundenname: kunde.name,
    kundenstrasse,
    kundenPlzOrt,
    angebotsnummer,
    angebotsdatum: heute,
    gueltigBis,
    positionen: kandidat.positionen,
    zahlungsziel: kunde.zahlungsziel ? `${kunde.zahlungsziel} Tage` : '14 Tage',
    lieferbedingungenAktiviert: true,
    lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
    lieferadresseAbweichend,
    lieferadresseName: lieferadresseAbweichend ? kunde.name : undefined,
    lieferadresseStrasse: lieferadresseAbweichend ? liefer?.strasse : undefined,
    lieferadressePlzOrt:
      lieferadresseAbweichend && liefer ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land) : undefined,
    firmenname: stammdaten.firmenname,
    firmenstrasse: stammdaten.firmenstrasse,
    firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
    firmenTelefon: stammdaten.firmenTelefon,
    firmenEmail: stammdaten.firmenEmail,
    vertragsklauseln: initialisiereDokumentKlauseln(getKlauselVorlagen(stammdaten)),
    agbAnhaengen: true,
  };
}

// ===== SCHARFE ERZEUGUNG / ROLLBACK / PROTOKOLL =====

// Erkennt, ob die App gegen eine Appwrite-Testumgebung läuft (für Banner + Protokoll).
/**
 * Markiert einen Lauf im Protokoll (`angebots_laeufe.testModus`) als nicht-echt.
 *
 * Beide Signale werden verodert: die alte Testumgebungs-Erkennung (eigenes
 * Appwrite-Projekt für Tests) UND der Mock-Modus. Ohne das zweite Signal stünde
 * ein kompletter Sandbox-Lauf im Protokoll als scharfer Lauf — und wäre später
 * nicht mehr von einem echten zu unterscheiden.
 */
function istTestumgebung(): boolean {
  if (istMockModusAktiv()) return true;
  const flag = import.meta.env.VITE_APPWRITE_TESTUMGEBUNG;
  if (typeof flag === 'string') return flag === 'true' || flag === '1';
  const pid = (PROJECT_ID || '').toLowerCase();
  return pid.includes('test') || pid.includes('staging');
}

function neueBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function schreibeProtokoll(
  batchId: string,
  saisonjahr: number,
  ergebnis: ErzeugungsErgebnis,
  meta: { benutzer?: string }
): Promise<void> {
  try {
    await databases.createDocument(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, ID.unique(), {
      batchId,
      saisonjahr,
      zeitpunkt: new Date().toISOString(),
      benutzer: meta.benutzer,
      testModus: istTestumgebung(),
      anzahlErzeugt: ergebnis.erzeugt.length,
      anzahlUebersprungen: ergebnis.uebersprungen.length,
      anzahlFehler: ergebnis.fehler.length,
      rueckgaengigGemacht: false,
      data: JSON.stringify(ergebnis).slice(0, 99000),
    });
    auditService.logAktion({
      action: 'create',
      entityType: 'angebots_lauf',
      entityId: batchId,
      summary: `Massen-Angebots-Lauf ${saisonjahr}: ${ergebnis.erzeugt.length} erzeugt, ${ergebnis.uebersprungen.length} übersprungen, ${ergebnis.fehler.length} Fehler`,
    });
  } catch (error) {
    console.warn('Angebots-Lauf konnte nicht protokolliert werden:', error);
  }
}

/**
 * Erzeugt scharf Angebote für die ausgewählten, erzeugbaren Kandidaten (status 'neu').
 * SEQUENTIELL – die Dokumentnummern teilen sich einen Zähler, paralleles Generieren
 * würde doppelte Angebotsnummern erzeugen (GoBD-kritisch).
 * Einzelfehler werden gesammelt, der Lauf bricht NICHT ab. Jedes Projekt erhält die
 * erzeugungsBatchId für den Rollback. Der Lauf wird protokolliert.
 */
async function erzeugeBatch(
  kandidaten: MassenAngebotKandidat[],
  saisonjahr: number,
  optionen: {
    benutzer?: string;
    limit?: number;
    onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void;
  } = {}
): Promise<ErzeugungsErgebnis> {
  const batchId = neueBatchId();
  const stammdaten = await getStammdatenOderDefault();
  const ergebnis: ErzeugungsErgebnis = { batchId, erzeugt: [], uebersprungen: [], fehler: [] };

  const erzeugbar = kandidaten.filter((k) => k.status === 'neu' && k.ausgewaehlt);
  const zuErzeugen =
    optionen.limit && optionen.limit > 0 ? erzeugbar.slice(0, optionen.limit) : erzeugbar;
  const gesamt = zuErzeugen.length;

  let index = 0;
  for (const kandidat of zuErzeugen) {
    index += 1;
    try {
      // Doppelschutz: erneut prüfen, ob es das Zielsaison-Projekt schon gibt.
      const existiert = await projektService.getProjektFuerKunde(kandidat.kundeId, saisonjahr);
      if (existiert) {
        ergebnis.uebersprungen.push({
          kundeId: kandidat.kundeId,
          kundenname: kandidat.kundenname,
          grund: 'Projekt existiert bereits',
        });
        continue;
      }

      const adresse = flacheKundenadresse(kandidat.kunde);
      const projekt = await projektService.createProjekt(
        {
          projektName: kandidat.kundenname,
          kundeId: kandidat.kundeId,
          kundennummer: kandidat.kundennummer,
          kundenname: kandidat.kundenname,
          kundenstrasse: adresse.strasse,
          kundenPlzOrt: adresse.plzOrt,
          // Im Detail-Panel editierte Empfänger-E-Mail + Notiz fließen ins Projekt
          // (Versand nutzt kundenEmail bevorzugt, siehe ladeVersandKandidaten).
          kundenEmail: kandidat.empfaengerEmail,
          notizen: kandidat.notiz?.trim() || undefined,
          saisonjahr,
          status: 'angebot',
          automatischErzeugt: true,
          erzeugungsBatchId: batchId,
          preisProTonne: kandidat.preisProTonne,
        },
        // Im Massenlauf keine kaskadierende Platzbauer-Projekt-Zuordnung auslösen.
        { skipPlatzbauerProjektZuordnung: true }
      );

      const projektId = projekt.id;
      const angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
      const heute = new Date().toISOString().split('T')[0];
      await projektService.updateProjekt(projektId, { angebotsnummer, angebotsdatum: heute });

      const angebotsDaten = baueAngebotsDaten(kandidat, angebotsnummer, stammdaten);
      await speichereAngebot(projektId, angebotsDaten);

      ergebnis.erzeugt.push({
        kundeId: kandidat.kundeId,
        kundenname: kandidat.kundenname,
        projektId,
        angebotsnummer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Fehler bei Angebot für ${kandidat.kundenname}:`, error);
      ergebnis.fehler.push({
        kundeId: kandidat.kundeId,
        kundenname: kandidat.kundenname,
        fehler: message,
      });
    } finally {
      optionen.onFortschritt?.(index, gesamt, kandidat.kundenname);
    }
  }

  await schreibeProtokoll(batchId, saisonjahr, ergebnis, { benutzer: optionen.benutzer });
  return ergebnis;
}

async function markiereLaufRueckgaengig(batchId: string): Promise<void> {
  try {
    const res = await databases.listDocuments(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, [
      Query.equal('batchId', batchId),
      Query.limit(25),
    ]);
    for (const dok of res.documents) {
      await databases.updateDocument(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, dok.$id, {
        rueckgaengigGemacht: true,
      });
    }
    auditService.logAktion({
      action: 'update',
      entityType: 'angebots_lauf',
      entityId: batchId,
      summary: `Massen-Angebots-Lauf ${batchId} rückgängig gemacht`,
      changes: { rueckgaengigGemacht: { alt: false, neu: true } },
    });
  } catch (error) {
    console.warn('Lauf konnte nicht als rückgängig markiert werden:', error);
  }
}

/**
 * Macht einen kompletten Erzeugungslauf rückgängig: löscht alle Projekte (+ deren Dokumente/PDFs)
 * des Batches, die noch NICHT versendet wurden (status === 'angebot'). Versendete Angebote
 * bleiben aus GoBD-Gründen erhalten.
 */
async function rollbackBatch(
  batchId: string,
  optionen: { onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
): Promise<{ geloescht: number; uebersprungenVersendet: number; fehler: number }> {
  const projekte = await projektService.loadProjekteFuerBatch(batchId);
  let geloescht = 0;
  let uebersprungenVersendet = 0;
  let fehler = 0;

  let index = 0;
  for (const projekt of projekte) {
    index += 1;
    if (projekt.status !== 'angebot') {
      // Bereits versendet/weiter im Workflow → behalten (GoBD).
      uebersprungenVersendet += 1;
      optionen.onFortschritt?.(index, projekte.length);
      continue;
    }
    try {
      await loescheDokumenteFuerProjekt(projekt.$id || projekt.id);
      await projektService.deleteProjekt(projekt);
      geloescht += 1;
    } catch (error) {
      console.error('Rollback-Fehler:', error);
      fehler += 1;
    } finally {
      optionen.onFortschritt?.(index, projekte.length);
    }
  }

  await markiereLaufRueckgaengig(batchId);
  return { geloescht, uebersprungenVersendet, fehler };
}

// Lädt die letzten Protokoll-Einträge (optional nach Saison gefiltert).
async function ladeLaeufe(saisonjahr?: number): Promise<AngebotsLauf[]> {
  try {
    const queries = [Query.orderDesc('zeitpunkt'), Query.limit(50)];
    if (saisonjahr) queries.unshift(Query.equal('saisonjahr', saisonjahr));
    const res = await databases.listDocuments(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, queries);
    return (res.documents as unknown as Array<Record<string, unknown>>).map((d) => ({
      id: String(d.$id),
      batchId: String(d.batchId ?? ''),
      saisonjahr: Number(d.saisonjahr ?? 0),
      zeitpunkt: String(d.zeitpunkt ?? ''),
      benutzer: d.benutzer ? String(d.benutzer) : undefined,
      testModus: Boolean(d.testModus),
      anzahlErzeugt: Number(d.anzahlErzeugt ?? 0),
      anzahlUebersprungen: Number(d.anzahlUebersprungen ?? 0),
      anzahlFehler: Number(d.anzahlFehler ?? 0),
      rueckgaengigGemacht: Boolean(d.rueckgaengigGemacht),
    }));
  } catch (error) {
    console.warn('Angebots-Läufe konnten nicht geladen werden:', error);
    return [];
  }
}

// ===== HALBAUTOMATISCHER E-MAIL-VERSAND =====

const TEST_EMAIL = 'jtatwcook@gmail.com';
const ANGEBOT_ABSENDER = 'anfrage@tennismehl.com';

// Lädt die versandbereiten Angebote eines Batches (status === 'angebot', noch nicht versendet).
async function ladeVersandKandidaten(batchId: string): Promise<VersandKandidat[]> {
  const [projekte, alleKunden] = await Promise.all([
    projektService.loadProjekteFuerBatch(batchId),
    saisonplanungService.loadAlleKunden(),
  ]);
  const kundenMap = new Map(alleKunden.map((k) => [k.id, k]));

  return projekte
    .filter((p) => p.status === 'angebot')
    .map((p) => {
      const kunde = kundenMap.get(p.kundeId);
      // Bevorzugt die im Detail-Panel editierte Adresse (am Projekt gespeichert),
      // sonst die Stammdaten-Adresse des Kunden.
      const email = p.kundenEmail || (kunde ? ermittleEmpfaenger(kunde) : undefined);
      return {
        projektId: p.$id || p.id,
        kundeId: p.kundeId,
        kundenname: p.kundenname,
        angebotsnummer: p.angebotsnummer,
        empfaengerEmail: email,
        emailFehlt: !email,
        ausgewaehlt: !!email,
      };
    });
}

/**
 * Versendet das Angebot eines Projekts per E-Mail (PDF aus den gespeicherten Angebotsdaten).
 * testModus: Empfänger ist ausschließlich die Test-Adresse, kein Statuswechsel beim Kunden,
 * kein Versand-Protokoll (skipProtokoll). Nur bei echtem Versand → Status 'angebot_versendet'.
 */
async function versendeAngebot(
  projektId: string,
  realEmail: string | undefined,
  testModus: boolean
): Promise<{ success: boolean; testModeActive?: boolean; error?: string }> {
  const empfaenger = testModus ? TEST_EMAIL : realEmail;
  if (!empfaenger) {
    return { success: false, error: 'Keine Empfänger-E-Mail' };
  }

  const dokument = await ladeDokumentNachTyp(projektId, 'angebot');
  if (!dokument) return { success: false, error: 'Kein gespeichertes Angebot gefunden' };
  const daten = ladeDokumentDaten<AngebotsDaten>(dokument);
  if (!daten) return { success: false, error: 'Angebotsdaten nicht lesbar' };

  const stammdaten = await getStammdatenOderDefault();
  const pdf = await generiereAngebotPDF(daten, stammdaten);
  const pdfBase64 = pdfZuBase64(pdf);

  // Betreff/Text/Signatur aus der Stammdaten-E-Mail-Vorlage 'angebot'
  // (Platzhalter {dokumentNummer}/{kundenname}/{kundennummer} werden ersetzt) —
  // exakt wie in der Anfragen-Bearbeitung. Fallback auf den bisherigen
  // Standardtext NUR, wenn keine Vorlage konfiguriert ist.
  let betreff = `Ihr Angebot zur Frühjahrsinstandsetzung – ${daten.angebotsnummer}`;
  let text =
    `Sehr geehrte Damen und Herren,\n\n` +
    `anbei erhalten Sie unser Angebot ${daten.angebotsnummer} für die diesjährige ` +
    `Frühjahrsinstandsetzung Ihrer Tennisplätze.\n\n` +
    `Bei Fragen stehen wir Ihnen gerne zur Verfügung. Über Ihren Auftrag freuen wir uns.\n\n` +
    `Mit freundlichen Grüßen\nIhr TENNISMEHL-Team`;
  let signatur: string | undefined;
  try {
    const vorlage = await generiereStandardEmail(
      'angebot',
      daten.angebotsnummer,
      daten.kundenname,
      daten.kundennummer
    );
    if (vorlage.betreff) betreff = vorlage.betreff;
    if (vorlage.text) text = vorlage.text;
    signatur = vorlage.signatur;
  } catch (error) {
    console.warn(
      'Keine E-Mail-Vorlage "angebot" konfiguriert – Massenangebot verwendet den Standardtext:',
      error
    );
  }
  const htmlBody = wrapInEmailTemplate(text, signatur);

  const result = await sendeEmailMitPdf({
    empfaenger,
    absender: ANGEBOT_ABSENDER,
    betreff: `${testModus ? '[TEST] ' : ''}${betreff}`,
    htmlBody,
    pdfBase64,
    pdfDateiname: `Angebot_${daten.angebotsnummer.replace(/\//g, '-')}.pdf`,
    projektId,
    dokumentTyp: 'angebot',
    dokumentNummer: daten.angebotsnummer,
    testModus,
    skipProtokoll: testModus,
  });

  if (result.success && !testModus) {
    await projektService.updateProjektStatus(projektId, 'angebot_versendet');
  }
  return {
    success: result.success,
    testModeActive: result.testModeActive,
    error: result.success ? undefined : 'Versand fehlgeschlagen',
  };
}

// Versendet mehrere Angebote nacheinander (sequentiell, mit Fortschritt + Fehlersammlung).
async function versendeBatch(
  kandidaten: VersandKandidat[],
  testModus: boolean,
  onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void
): Promise<{ gesendet: number; fehler: { kundenname: string; fehler: string }[] }> {
  let gesendet = 0;
  const fehler: { kundenname: string; fehler: string }[] = [];
  let index = 0;
  for (const kandidat of kandidaten) {
    index += 1;
    try {
      const res = await versendeAngebot(kandidat.projektId, kandidat.empfaengerEmail, testModus);
      if (res.success) gesendet += 1;
      else fehler.push({ kundenname: kandidat.kundenname, fehler: res.error || 'Fehler' });
    } catch (error) {
      fehler.push({
        kundenname: kandidat.kundenname,
        fehler: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onFortschritt?.(index, kandidaten.length, kandidat.kundenname);
    }
  }
  return { gesendet, fehler };
}

/** NUR für Unit-Tests: reine Helfer der Referenz-/Paletten-Logik. */
export const _massenAngebotInternals = {
  ANBRUCH_AUFSCHLAG_BEZEICHNUNG,
  ANBRUCH_AUFSCHLAG_EINHEIT,
  baueAnbruchAufschlagPosition,
  klassifizierePosition,
  berechneSchuettgutTonnage,
  bestimmeProduktprofil,
  rundeAufHalbePaletten,
  bereitePalettenPositionAuf,
  baueAngebotsPositionenAusReferenz,
  waehleGroessteBestellung,
  ermittleMosaikReferenzJahr,
  findePrimaerPosition,
  berechneSumme,
  wendePreisanpassungAn,
};

export const massenAngebotService = {
  sammleKandidaten,
  sammleTauglichkeitsVorschlaege,
  markiereAlsTauglich,
  berechneZusammenfassung,
  aktualisiereMengePreis,
  aktualisierePosition,
  entfernePosition,
  setzeEmpfaengerEmail,
  wendePreisanpassungAn,
  baueAngebotsDaten,
  erzeugeBatch,
  rollbackBatch,
  ladeLaeufe,
  ladeVersandKandidaten,
  versendeAngebot,
  versendeBatch,
  istTestumgebung,
  getStammdaten: getStammdatenOderDefault,
};
