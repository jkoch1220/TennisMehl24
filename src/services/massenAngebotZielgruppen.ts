/**
 * Zielgruppen-Ermittlung für Massen-Angebote.
 *
 * Wer landet in welchem Lauf? Die Regeln stehen bewusst hier als reine
 * Funktionen ohne Datenbankzugriff: Sie entscheiden über hunderte Angebote und
 * müssen einzeln testbar sein. Der aufrufende Service lädt die Daten und reicht
 * sie als `Kundenkontext` herein.
 *
 * Jeder Treffer trägt eine `herkunft` im Klartext. Ohne sie ist die Liste eine
 * Blackbox — wer 400 Vereine durchgeht, muss bei jedem sehen, worauf der
 * Vorschlag beruht.
 */
import { SaisonKunde, Bezugsweg } from '../types/saisonplanung';
import { Position } from '../types/projektabwicklung';
import { MassenAngebotTyp, Produktprofil, AngebotsQuelle, ReferenzTyp } from '../types/massenAngebot';

// Artikelgruppen. Quelle: Artikelstamm, siehe massenAngebotService.
const SCHUETTGUT = new Set(['TM-ZM-02', 'TM-ZM-03']);

/**
 * Echte Palettenware: Sackware, die palettiert geliefert wird.
 *
 * BigBags zählen mit — auch sie sind verpackte Ware mit eigener Disposition.
 */
const PALETTENWARE = new Set([
  'TM-ZM-02ST', 'TM-ZM-03ST',
  'TM-ZM-02BB', 'TM-ZM-03BB', 'TM-ZM-BIG-02', 'TM-ZM-BIG-03',
]);

/**
 * Beiladungs-Säcke — KEINE Palettenware.
 *
 * Sie fuhren als Beiware auf dem Schüttgut-LKW mit; ein solcher Kunde ist ein
 * Schüttgutkunde, der ein paar Säcke dazubekam. Ihn in den Paletten-Lauf zu
 * stecken hieße, ihm ein Angebot über eine Ware zu machen, die er nie bestellt
 * hat. Das Beiladen wird künftig ohnehin nicht mehr angeboten — stattdessen ein
 * BigBag plus eine Tonne mehr.
 */
const BEILADUNG_SACK = new Set(['TM-ZM-02S', 'TM-ZM-03S']);

/**
 * Verladepauschale „bei Abholung ab Werk" — der Beweis für einen Abholer.
 *
 * `belieferungsart` ist ein gepflegtes Kundenfeld und bei den meisten leer
 * (2033 von 2183 ohne Eintrag). Die Verladepauschale dagegen steht im
 * ABGERECHNETEN Beleg: Wer sie bezahlt hat, ist die Ware selbst holen gekommen.
 * Ein Beleg lügt nicht, ein leeres Stammdatenfeld sagt nur nichts.
 *
 * Aufgefallen an Eva Maria Lang: im Schüttgut-Lauf, obwohl ihr Vorjahresangebot
 * die Verladepauschale trägt. Ohne diese Regel bekäme sie ein Lieferangebot mit
 * Frachtkosten für Ware, die sie selbst abholt.
 */
const VERLADEPAUSCHALE = 'TM-VP';

/**
 * Frachtpositionen. Steht eine davon in IRGENDEINEM Beleg des Kunden, wurde
 * geliefert — dann ist er kein Abholer, egal was sonst im Beleg steht.
 *
 * Der Fall, der das nötig machte: TC Tauberbischofsheim hat zweimal bezogen —
 * 7 t geliefert (Frachtkostenpauschale + Dieselpreiszuschlag, 123,60 €/t) und
 * 2 t abgeholt (Verladepauschale, 98,70 €/t). Die Verladepauschale allein machte
 * ihn zum Abholer; er hätte ein Angebot ohne Frachtkosten bekommen.
 *
 * ACHTUNG: `TM-DZ` (Dieselpreiszuschlag) und `TM-F` (Frachtkosten) stehen in
 * Belegen, aber NICHT im Artikelstamm. Wer nur den Stamm abfragt, übersieht sie
 * — deshalb zusätzlich die Bezeichnungsprüfung unten.
 */
const FRACHT_ARTIKEL = new Set([
  'TM-FP',      // Frachtkostenpauschale
  'TM-FK',      // Frachtkosten
  'TM-F',       // Frachtkosten (Altbestand, nicht im Stamm)
  'TM-FKZ',     // Frachtzuschlag für Kleinmengen
  'TM-DZ',      // Dieselpreiszuschlag (nicht im Stamm)
  'TM-UV-VK',   // Pauschale Versandkosten (Universal)
  'TM-UV-SPZ',  // Sperrgutzuschlag
  'TM-HYC-V',   // Hydrocourt Versandpauschale
]);

/**
 * Fracht an der Bezeichnung erkennen — für Positionen ohne bekannte Nummer.
 * „An- und Abfahrt" ist bewusst NICHT dabei: Das ist die Anfahrt der
 * Instandsetzungskolonne, keine Warenfracht.
 */
const FRACHT_BEZEICHNUNG = /(fracht|diesel|spedition|versandkost|transportkost|zustellung|anlieferung)/i;

/** Trägt eine Position Frachtcharakter? */
function istFrachtPosition(p: Position): boolean {
  return FRACHT_ARTIKEL.has(String(p.artikelnummer ?? '').toUpperCase())
    || FRACHT_BEZEICHNUNG.test(String(p.bezeichnung ?? ''));
}

/**
 * Wurde dem Kunden je Fracht berechnet? Prüft ALLE Belege, nicht jeden einzeln:
 * Wer einmal geliefert bekam, ist im Zweifel Lieferkunde. Ein Lieferangebot mit
 * Frachtkosten ist der sichere Fehler — der Abholer meldet sich von selbst,
 * wenn er die Ware holen will.
 */
export function hatFrachtBezahlt(belege: Vorjahresbeleg[]): boolean {
  return belege.some((b) => b.positionen.some((p) => !p.istBedarfsposition && istFrachtPosition(p)));
}

/**
 * Positionen einer Instandsetzung: Wer sie im Beleg hat, gehört in den
 * Frühjahrsinstandsetzungs-Lauf — unabhängig davon, was am Kunden gepflegt ist.
 *
 * `standardBezugsweg: 'direkt_instandsetzung'` tragen nur 9 bis 10 Kunden; der
 * Lauf blieb dadurch fast leer, obwohl die Belege eindeutig sind. Aufgefallen an
 * TC Neuss-Weckhoven: 25 t Ziegelmehl, PE-Folie, sechs Positionen
 * „Tennisplatz Instandsetzung" und ein Facharbeiter — im Schüttgut-Lauf.
 */
const INSTANDSETZUNG_ARTIKEL = new Set([
  'TM-ISF',    // Tennisplatz Instandsetzung
  'ZM-FI',     // Instandsetzung des Tennisplatzes
  'ZM-FI-A',   // An- und Abfahrt der Geräte und Kolonne
  'TM-ZSH',    // Facharbeiter für Instandsetzungsarbeiten
  'ZM-FA',     // Facharbeiter für evtl. anfallende Zusatzarbeiten
  'ZM-LIN-M',  // Linien
]);
const INSTANDSETZUNG_BEZEICHNUNG = /(instandsetzung|facharbeiter|an- und abfahrt der ger)/i;

/** Trägt einer der Belege Instandsetzungsleistungen? */
export function hatInstandsetzung(belege: Vorjahresbeleg[]): boolean {
  return belege.some((b) => b.positionen.some((p) =>
    INSTANDSETZUNG_ARTIKEL.has(String(p.artikelnummer ?? '').toUpperCase())
    || INSTANDSETZUNG_BEZEICHNUNG.test(String(p.bezeichnung ?? ''))
  ));
}

/**
 * Werkspreise je Artikel (Artikelstamm, Stand 09/2026).
 *
 * Der Werkspreis ist der Preis AB WERK — ohne Fracht. Wer ihn bezahlt hat und
 * keine Frachtposition im Beleg trägt, hat die Ware selbst abgeholt: Die Fracht
 * steckt bei uns nämlich IM Tonnenpreis, nicht in einer eigenen Zeile. Eine
 * fehlende Frachtzeile allein beweist deshalb nichts — erst zusammen mit dem
 * Preis wird daraus ein Abholer.
 *
 * Als Parameter überschreibbar, damit eine Preisänderung im Stamm nicht
 * bedeutet, dass diese Datei nachgezogen werden muss.
 */
export const WERKSPREISE: Record<string, number> = {
  'TM-ZM-02': 98.7, 'TM-ZM-03': 98.7,          // Schüttgut, €/t
  'TM-ZM-02ST': 155, 'TM-ZM-03ST': 155,        // Sackware auf Palette, €/t
  'TM-ZM-02S': 8.5, 'TM-ZM-03S': 8.5,          // Einzelsack 40 kg, €/Stk
  'TM-ZM-BIG-02': 125.9, 'TM-ZM-BIG-03': 125.9, // BigBag, €/t
};

/** Kleine Luft nach oben: Rundungen und Cent-Beträge sollen nicht ausschließen. */
const WERKSPREIS_TOLERANZ = 1.02;

/**
 * Werkspreis bezahlt und keine Fracht berechnet — also selbst abgeholt.
 *
 * Beide Bedingungen zusammen, denn einzeln taugt keine: Ein günstiger Preis
 * kann ein Rabatt sein, und eine fehlende Frachtzeile ist der Normalfall bei
 * eingerechneter Fracht.
 */
export function zahltWerkspreisOhneFracht(
  belege: Vorjahresbeleg[],
  werkspreise: Record<string, number> = WERKSPREISE
): boolean {
  if (hatFrachtBezahlt(belege)) return false;
  const positionen = belege.flatMap((b) => b.positionen).filter((p) => !p.istBedarfsposition);

  const waren = positionen.filter((p) => werkspreise[String(p.artikelnummer ?? '').toUpperCase()] !== undefined);
  if (waren.length === 0) return false;

  return waren.every((p) => {
    const werk = werkspreise[String(p.artikelnummer ?? '').toUpperCase()];
    const gezahlt = Number(p.einzelpreis ?? 0);
    // Ein Preis von 0 ist ein unvollständiger Beleg, kein Werkspreis.
    return gezahlt > 0 && gezahlt <= werk * WERKSPREIS_TOLERANZ;
  });
}

/** Trägt einer der Belege die Verladepauschale? */
function hatVerladepauschale(belege: Vorjahresbeleg[]): boolean {
  return belege.some((b) =>
    b.positionen.some((p) => String(p.artikelnummer ?? '').toUpperCase() === VERLADEPAUSCHALE)
  );
}

/** Erkennt Universalartikel — die sind in JEDEM Massen-Angebot ausgeschlossen. */
export function istUniversalartikel(position: Position): boolean {
  const nr = String(position.artikelnummer ?? '').toUpperCase().trim();
  if (nr.startsWith('TM-UN') || nr.startsWith('TM-UNI')) return true;
  return /\buniversal\b/i.test(String(position.bezeichnung ?? ''));
}

export interface Vorjahresbeleg {
  /** Saisonjahr des Belegs. */
  jahr: number;
  positionen: Position[];
  /**
   * Belegart — entscheidet, wie belastbar der Vorschlag ist.
   *
   * „Angebot" heißt: Wir haben angeboten, der Verein hat NICHT bestellt. Das
   * als „bezogen" auszugeben, ist schlicht falsch und führt den Bearbeiter in
   * die Irre — er hält einen Interessenten für einen Bestandskunden.
   */
  typ?: ReferenzTyp;
  /** Belegdatum, falls bekannt (ISO). Für „zuletzt bestellt am …". */
  datum?: string;
  /** Herkunft des Vorgangs — `anfrage` heißt: Der Verein kam von selbst. */
  herkunft?: string;
}

/** War der Beleg eine echte Bestellung oder nur ein unbeantwortetes Angebot? */
export const istBestellung = (typ?: ReferenzTyp): boolean =>
  typ === 'auftragsbestaetigung' || typ === 'rechnung';

/** Formuliert die Belegart so, wie sie in der Liste stehen soll. */
export function belegBezeichnung(
  typ: ReferenzTyp | undefined,
  jahr: number | undefined,
  herkunft?: string
): string {
  const j = jahr ? ` ${jahr}` : '';
  // Ein Angebot, das aus einer Anfrage entstand, ist kein Kaltkontakt: Der
  // Verein hat sich selbst gemeldet. Das ändert, wie man ihn anspricht.
  const woher =
    herkunft === 'anfrage' ? ' · kam über das Anfrageformular'
    : herkunft === 'shop' ? ' · Onlineshop'
    : herkunft === 'platzbau' ? ' · über den Platzbau'
    : '';
  switch (typ) {
    case 'rechnung': return `Rechnung${j}${woher}`;
    case 'auftragsbestaetigung': return `Auftragsbestätigung${j}${woher}`;
    case 'angebot': return `nur Angebot${j} — nicht bestellt${woher}`;
    case 'mosaik': return `Mosaik-Historie${j}`;
    default: return `Beleg${j}${woher}`;
  }
}

/** Alles, was über einen Kunden für die Zuordnung bekannt ist. */
export interface Kundenkontext {
  kunde: SaisonKunde;
  /** Bezugsweg der Vorsaison; fällt auf `standardBezugsweg` zurück. */
  bezugswegVorjahr?: Bezugsweg;
  /** Belege der Vorsaison (AB, Rechnung, Angebot) — Basis fürs Produktprofil. */
  belege: Vorjahresbeleg[];
  /** Hat der Kunde in der Zielsaison schon ein Projekt? Dann nicht doppelt. */
  hatZielsaisonProjekt: boolean;
  /** Jahr des letzten Geschäfts aus Mosaik (Umsatzdatum/Preishistorie). */
  mosaikLetztesJahr?: number;
}

export interface Zuordnung {
  /** true = gehört in diesen Lauf. */
  passt: boolean;
  /** Klartext für die Liste: warum ist er drin, oder warum nicht. */
  herkunft: string;
  quelle: AngebotsQuelle;
  produktprofil: Produktprofil;
  selbstabholer: boolean;
  /** Gesetzt, wenn der Kunde generell nicht angeschrieben werden darf. */
  hartAusgeschlossen?: string;
  /**
   * Der Vorschlag beruht auf einem Angebot, das nie zu einer Bestellung wurde.
   * Der Kunde ist damit Interessent, nicht Bestandskunde — die Liste muss das
   * zeigen, sonst wird beides verwechselt.
   */
  nurAngebotKeineBestellung?: boolean;
}

/** Produktprofil aus den Belegpositionen der Vorsaison. */
export function bestimmeProfilAusBelegen(belege: Vorjahresbeleg[]): {
  profil: Produktprofil | 'keine_daten';
  hatUniversal: boolean;
  /** Nur Beiladungs-Säcke, kein loses Mehl — beim Abholer der Normalfall. */
  nurBeiladung: boolean;
} {
  let schuettgut = false;
  let paletten = false;
  let beiladung = false;
  let hatUniversal = false;
  for (const beleg of belege) {
    for (const pos of beleg.positionen) {
      if (pos.istBedarfsposition) continue;
      if (istUniversalartikel(pos)) { hatUniversal = true; continue; }
      const nr = String(pos.artikelnummer ?? '').toUpperCase().trim();
      if (SCHUETTGUT.has(nr)) schuettgut = true;
      else if (BEILADUNG_SACK.has(nr)) beiladung = true;
      else if (PALETTENWARE.has(nr)) paletten = true;
    }
  }
  // Beiladung allein macht keinen Palettenkunden: Sie fuhr auf dem Schüttgut-
  // LKW mit. Wer NUR Beiladung hat, ist typischerweise ein Abholer, der sich
  // ein paar Säcke mitgenommen hat.
  const nurBeiladung = beiladung && !schuettgut && !paletten;
  if (schuettgut && paletten) return { profil: 'gemischt', hatUniversal, nurBeiladung: false };
  if (schuettgut) return { profil: 'schuettgut', hatUniversal, nurBeiladung: false };
  if (paletten) return { profil: 'paletten', hatUniversal, nurBeiladung: false };
  if (beiladung) return { profil: 'schuettgut', hatUniversal, nurBeiladung };
  return { profil: 'keine_daten', hatUniversal, nurBeiladung: false };
}

/**
 * Entscheidet, ob ein Kunde in den Lauf gehört.
 *
 * Reihenfolge ist bewusst: Erst die harten Ausschlüsse (die gelten für JEDEN
 * Typ), dann die Zuordnung. Ein über den Platzbauer belieferter Verein darf
 * auch dann kein Direktangebot bekommen, wenn sein Produktprofil perfekt passt.
 */
export function ordneZu(kontext: Kundenkontext, typ: MassenAngebotTyp): Zuordnung {
  const { kunde } = kontext;
  /*
   * Zwei Wege zum Abholer, und der zweite ist der belastbarere:
   *   1. `belieferungsart` am Kunden — gepflegt, aber meistens leer.
   *   2. Verladepauschale im Vorjahresbeleg — bezahlt, also wahr.
   *   3. Werkspreis ohne Frachtposition — die Fracht steckt sonst IM
   *      Tonnenpreis; wer nur den Werkspreis zahlt, hat selbst geladen.
   * Eine ausdrückliche LIEFER-Belieferungsart schlägt die Pauschale allerdings:
   * Wer „nur Motorwagen" hinterlegt hat, bekommt geliefert; steht dann trotzdem
   * eine Verladepauschale im Beleg, ist das ein Widerspruch für den Menschen,
   * keine Entscheidung für den Algorithmus.
   */
  const wirdBeliefert = Boolean(kunde.belieferungsart) && kunde.belieferungsart !== 'abholung_ab_werk';
  // Fracht schlägt jedes Abholer-Signal: Wer je Frachtkosten oder einen
  // Dieselzuschlag bezahlt hat, wird beliefert.
  const abholerBeleg = hatFrachtBezahlt(kontext.belege)
    ? ''
    : hatVerladepauschale(kontext.belege)
      ? 'Verladepauschale im Beleg'
      : zahltWerkspreisOhneFracht(kontext.belege)
        ? 'Werkspreis ohne Frachtposition'
        : '';
  const selbstabholer = kunde.belieferungsart === 'abholung_ab_werk'
    || (!wirdBeliefert && abholerBeleg !== '');
  const { profil, hatUniversal, nurBeiladung } = bestimmeProfilAusBelegen(kontext.belege);
  const basis = { selbstabholer, quelle: 'vorjahr' as AngebotsQuelle, produktprofil: (profil === 'keine_daten' ? 'schuettgut' : profil) as Produktprofil };

  // ---- Harte Ausschlüsse: gelten für alle drei Läufe ----
  if (kunde.archiviert === true) {
    return { ...basis, passt: false, herkunft: 'Im Archiv', hartAusgeschlossen: 'Kunde ist archiviert' };
  }
  if (kunde.aktiv === false) {
    return { ...basis, passt: false, herkunft: 'Inaktiv', hartAusgeschlossen: 'Kunde ist inaktiv' };
  }
  if (kunde.automatischesAngebot !== true) {
    return { ...basis, passt: false, herkunft: 'Kein Opt-in', hartAusgeschlossen: 'Nicht massenangebots-tauglich' };
  }
  // Über den Platzbauer belieferte Vereine bekommen ihr Material über ihn —
  // ein Direktangebot unterläuft die Vereinbarung mit dem Platzbauer.
  if (kontext.bezugswegVorjahr === 'ueber_platzbauer' || kunde.beziehtUeberUnsPlatzbauer) {
    return { ...basis, passt: false, herkunft: 'Bezug über Platzbauer', hartAusgeschlossen: 'Wird über einen Platzbauer beliefert' };
  }
  if (kunde.typ === 'platzbauer') {
    return { ...basis, passt: false, herkunft: 'Ist selbst Platzbauer', hartAusgeschlossen: 'Platzbauer bekommen kein Serienangebot' };
  }
  if (hatUniversal) {
    return { ...basis, passt: false, herkunft: 'Universalartikel im Vorjahr', hartAusgeschlossen: 'Universalartikel sind ausgeschlossen' };
  }
  if (kontext.hatZielsaisonProjekt) {
    return { ...basis, passt: false, herkunft: 'Projekt für die Zielsaison existiert bereits', hartAusgeschlossen: 'Doppeltes Angebot vermeiden' };
  }

  // ---- Typ-Zuordnung ----
  const jahr = kontext.belege[0]?.jahr;
  const belegTyp = kontext.belege[0]?.typ;
  const belegHerkunft = kontext.belege[0]?.herkunft;
  const belegHinweis = jahr ? `Belege ${jahr}` : 'keine Belege der Vorsaison';

  // Abholung steht VOR dem Produktprofil.
  //
  // Wer ab Werk abholt, zahlt Werkspreise ohne Frachtanteil — das ist eine
  // andere Kalkulation, nicht nur ein anderer Transportweg. Und ein Abholer,
  // der sich ein paar Säcke mitnimmt, ist kein Palettenkunde: Er bekommt nichts
  // geliefert und wird nicht disponiert.
  if (typ === 'abholung') {
    const passt = selbstabholer;
    return {
      ...basis,
      passt,
      herkunft: passt
        ? `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · Abholung ab Werk`
          + (kunde.belieferungsart === 'abholung_ab_werk' || !abholerBeleg ? '' : ` (${abholerBeleg})`)
          + (nurBeiladung ? ', nur Sackware' : '')
        : 'Wird beliefert — kein Abholer',
      nurAngebotKeineBestellung: passt && kontext.belege.length > 0 && !istBestellung(belegTyp),
    };
  }
  // Abholer gehören in ihren eigenen Lauf und in keinen anderen.
  if (selbstabholer) {
    return { ...basis, passt: false, herkunft: 'Abholer ab Werk — gehört in den Abholer-Lauf' };
  }

  /*
   * Instandsetzung: zwei Wege, und der Beleg ist der belastbarere.
   *
   * Der gepflegte Bezugsweg `direkt_instandsetzung` steht bei 9 bis 10 Kunden —
   * der Lauf blieb dadurch fast leer, obwohl die Belege eindeutig sind. Wer
   * „Tennisplatz Instandsetzung", „An- und Abfahrt der Geräte und Kolonne" oder
   * einen Facharbeiter abgerechnet hat, hat die Arbeit am Platz beauftragt.
   * Aufgefallen an TC Neuss-Weckhoven: sechs Instandsetzungspositionen, im
   * Schüttgut-Lauf.
   */
  const instandsetzungAusBeleg = hatInstandsetzung(kontext.belege);
  if (typ === 'fruehjahrsinstandsetzung') {
    const perBezugsweg = kontext.bezugswegVorjahr === 'direkt_instandsetzung';
    const passt = perBezugsweg || instandsetzungAusBeleg;
    return {
      ...basis,
      passt,
      herkunft: passt
        ? perBezugsweg
          ? 'Bezugsweg „Instandsetzung direkt" — hat die Arbeit am Platz beauftragt'
          : `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · Instandsetzungsleistungen im Beleg`
        : `Keine Instandsetzung in Beleg oder Bezugsweg (${belegHinweis})`,
      nurAngebotKeineBestellung: passt && kontext.belege.length > 0 && !istBestellung(belegTyp),
    };
  }
  // Instandsetzungskunden gehören in ihren eigenen Lauf: Dort steht die Arbeit
  // am Platz im Angebot, nicht nur die Ware.
  if (instandsetzungAusBeleg) {
    return {
      ...basis,
      passt: false,
      herkunft: 'Instandsetzung im Vorjahresbeleg — gehört in den Instandsetzungs-Lauf',
    };
  }

  if (typ === 'paletten') {
    // Nur wer AUSSCHLIESSLICH Sackware bezogen hat. „Gemischt" gehört in den
    // Schüttgut-Lauf: Dort ist die lose Ware die Hauptposition, die Paletten
    // laufen als Beiladung mit.
    const passt = profil === 'paletten';
    return {
      ...basis,
      passt,
      produktprofil: 'paletten',
      herkunft: passt
        ? `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · nur Sackware/Paletten`
        : profil === 'gemischt'
        ? 'Lose Ware und Paletten — gehört in den Schüttgut-Lauf'
        : nurBeiladung
        ? 'Nur Beiladungs-Säcke — das ist keine Palettenware'
        : profil === 'schuettgut'
        ? 'Lose Ware — gehört in den Schüttgut-Lauf'
        : `Kein Produktprofil ermittelbar (${belegHinweis})`,
      nurAngebotKeineBestellung: passt && !istBestellung(belegTyp),
    };
  }

  // Schüttgut ist der Regelfall und fängt alles auf, was kein reiner
  // Palettenkunde und kein Instandsetzungskunde ist — auch Kunden ohne Belege
  // der Vorsaison. Für sie greift später die Mosaik-/PLZ-Kalkulation.
  if (kontext.bezugswegVorjahr === 'direkt_instandsetzung') {
    return { ...basis, passt: false, herkunft: 'Instandsetzungskunde — gehört in den Instandsetzungs-Lauf' };
  }
  if (profil === 'paletten') {
    return { ...basis, passt: false, produktprofil: 'paletten', herkunft: 'Reiner Palettenkunde — gehört in den Paletten-Lauf' };
  }
  const ohneBelege = profil === 'keine_daten';
  return {
    ...basis,
    passt: true,
    quelle: ohneBelege ? (kontext.mosaikLetztesJahr ? 'mosaik' : 'plz_kalkulation') : 'vorjahr',
    herkunft: ohneBelege
      ? kontext.mosaikLetztesJahr
        ? `Keine Belege der Vorsaison — Mosaik-Historie bis ${kontext.mosaikLetztesJahr}`
        : 'Keine Belege und keine Historie — Menge und Preis über die PLZ-Kalkulation'
      : profil === 'gemischt'
      ? `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · lose Ware und Paletten`
      : nurBeiladung
      ? `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · nur Beiladungs-Säcke, keine lose Ware`
      : `${belegBezeichnung(belegTyp, jahr, belegHerkunft)} · lose Ware`,
    nurAngebotKeineBestellung: !ohneBelege && !istBestellung(belegTyp),
  };
}
