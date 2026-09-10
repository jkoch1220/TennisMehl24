/**
 * Staffelgrenzen im Platzbauer-Angebot: ein Raster für alle Sorten (Vorschlag
 * „Automatisierung von Staffelpreisangeboten“, 09/2026).
 *
 * Ausgangslage: Jede Sorte trug ihre eigene Stufenleiter. Die Grenzen standen
 * damit n-mal im Modell und n-mal auf dem Bildschirm – bei drei Sorten mussten
 * dieselben Mengen dreimal getippt werden, und schon ein Zahlendreher löste die
 * Warnung „Stufengrenzen je Sorte unterschiedlich“ aus.
 *
 * Neu:
 *  1. Die Mengengrenzen werden einmal je Angebot gepflegt und auf alle Sorten
 *     gespiegelt (`spiegleGrenzen`). Die Preise bleiben je Sorte verschieden.
 *  2. „Ab“ wird nicht mehr eingegeben, sondern aus dem „unter“ der Vorstufe
 *     abgeleitet (`koppleGrenzen`). Eine Lücke kann dadurch nicht entstehen.
 *
 * Das Speicher- und Druckformat bleibt unverändert: Jede Position trägt weiter
 * ihre vollständigen `Preisstaffel[]`. Diese Datei erzeugt sie nur, sie ersetzt
 * sie nicht – Altbelege und der PDF-Renderer bleiben unberührt.
 *
 * Zwei Semantiken, die hier nie vermischt werden dürfen:
 *  - Preisstaffel: von ≤ Menge < bis („ab 300 t“ schließt 300 t ein).
 *  - `bisMenge` 0, null oder undefined bedeutet portalweit „unbegrenzt“
 *    (`istUnbegrenzt` in staffelpreisText.ts, PDF in platzbauerdokumentService.ts).
 *    Eine 0 darf deshalb nie als echte Obergrenze weitergereicht werden, sonst
 *    steht im Kundenangebot „unbegrenzt“ statt der Grenze.
 *
 * Alle Funktionen sind rein und geben bei unverändertem Ergebnis die IDENTISCHE
 * Referenz zurück. Das ist Funktionsanforderung, kein Feinschliff: Der Entwurf
 * speichert bei jeder neuen Array-Referenz erneut.
 */
import type { Preisstaffel, RegionPreis } from '../types/platzbauer';
import { findeStaffel } from './staffelpreisText';

/** Alles, was eine Stufenleiter trägt – im Tab die StaffelpreisPosition. */
export interface StaffelTraeger {
  staffeln: Preisstaffel[];
}

/** Eine Stufengrenze ohne Preis: das Raster, das für alle Sorten gilt. */
export interface Staffelgrenze {
  vonMenge: number;
  bisMenge: number | null;
}

/** Meldung des Grenzen-Angleichs für einen Altentwurf. */
export interface AngleichBefund {
  bezeichnung: string;
  alteGrenzen: string;
  neueGrenzen: string;
}

/** Standardabschlag je Stufe, wenn nichts anderes bekannt ist (€/t). */
export const ABSCHLAG_JE_STUFE = 5;
/** Standardbreite einer neu angehängten Stufe (t). */
export const STUFEN_SCHRITT = 50;

const runde2 = (wert: number): number => Math.round(wert * 100) / 100;

/**
 * Ist `bis` eine echte Obergrenze – also eine Zahl über 0 und über der eigenen
 * Untergrenze? 0 und null bedeuten „unbegrenzt“ und werden nie propagiert.
 */
export const istEchteObergrenze = (bis: number | null | undefined, von: number): boolean =>
  typeof bis === 'number' && Number.isFinite(bis) && bis > 0 && bis > von;

/**
 * Das Raster einer Stufenleiter: nur die Grenzen, ohne Preise. Eine 0 aus
 * Altbeständen wird dabei zu null – beide bedeuten „unbegrenzt", und nur so
 * lesen Signatur und Vergleich dasselbe.
 */
export const leseGrenzen = (staffeln: Preisstaffel[]): Staffelgrenze[] =>
  staffeln.map((s) => ({ vonMenge: s.vonMenge, bisMenge: s.bisMenge ? s.bisMenge : null }));

/** „0-50|50-100|100-inf“ – gleiche Bildungsregel wie `staffelGrenzenIdentisch`. */
export const grenzenSignatur = (staffeln: Preisstaffel[]): string =>
  staffeln.map((s) => `${s.vonMenge}-${s.bisMenge ? s.bisMenge : 'inf'}`).join('|');

/** Haben alle Positionen dasselbe Raster? */
export const grenzenEinheitlich = (positionen: StaffelTraeger[]): boolean => {
  if (positionen.length < 2) return true;
  const erste = grenzenSignatur(positionen[0].staffeln);
  return positionen.every((p) => grenzenSignatur(p.staffeln) === erste);
};

/**
 * Regionpreise zählen zur Identität einer Stufe: Ohne sie im Vergleich gälte
 * eine Stufe, an der nur ein PLZ-Gebiet geändert wurde, als unverändert — die
 * Änderung würde verworfen, weil hier die alte Referenz zurückkommt.
 */
const regionenGleich = (a?: RegionPreis[] | null, b?: RegionPreis[] | null): boolean => {
  const x = a ?? [];
  const y = b ?? [];
  return (
    x.length === y.length &&
    x.every(
      (r, i) =>
        r.plzGebiete === y[i].plzGebiete &&
        r.einzelpreis === y[i].einzelpreis &&
        (r.bezeichnung ?? '') === (y[i].bezeichnung ?? '')
    )
  );
};

const staffelnGleich = (a: Preisstaffel[], b: Preisstaffel[]): boolean =>
  a.length === b.length &&
  a.every(
    (s, i) =>
      s.vonMenge === b[i].vonMenge &&
      (s.bisMenge ?? null) === (b[i].bisMenge ?? null) &&
      s.einzelpreis === b[i].einzelpreis &&
      regionenGleich(s.regionPreise, b[i].regionPreise)
  );

/**
 * „Ab“ jeder Stufe = „unter“ der Vorstufe. Mehr passiert hier nicht.
 *
 * ACHTUNG, das ist die Bruchstelle des ganzen Entwurfs: Diese Funktion läuft
 * auch auf halb getippten Zwischenständen (3 → 30 → 300). Sie darf deshalb
 * NIEMALS ein `bisMenge` korrigieren, sortieren oder eine Stufe entfernen. Eine
 * später eingebaute „hilfreiche“ Zusatzkorrektur (etwa das „unter“ der Folge-
 * stufe hochziehen, wenn es unter dem neuen „ab“ liegt) würde beim Zwischen-
 * stand 3000 alle späteren Grenzen unwiederbringlich überschreiben.
 */
export const koppleGrenzen = (staffeln: Preisstaffel[]): Preisstaffel[] => {
  let geaendert = false;
  const ergebnis = staffeln.map((s, i) => {
    if (i === 0) return s;
    const vorher = staffeln[i - 1];
    if (!istEchteObergrenze(vorher.bisMenge, vorher.vonMenge)) return s;
    if (s.vonMenge === vorher.bisMenge) return s;
    geaendert = true;
    return { ...s, vonMenge: vorher.bisMenge as number };
  });
  return geaendert ? ergebnis : staffeln;
};

/**
 * Prüft eine Eingabe im „unter“-Feld beim Verlassen. Abgelehnt wird, was die
 * Kette kaputtmachen würde: eine Grenze auf oder unter dem eigenen „ab“ und
 * eine Grenze, die über die nächste feste Grenze hinausgeht.
 * `null`/0 sind erlaubt (= offen) und werden nicht propagiert.
 */
export const pruefeObergrenze = (
  staffeln: Preisstaffel[],
  stufenIndex: number,
  wert: number | null
): { gueltig: boolean; hinweis?: string } => {
  const stufe = staffeln[stufenIndex];
  if (!stufe) return { gueltig: false };
  if (wert === null || wert === 0) {
    // Eine offene Stufe in der Mitte ist eine Lücke: koppleGrenzen propagiert
    // 0/null bewusst nicht, das „ab" der Folgestufe bliebe stehen.
    return stufenIndex === staffeln.length - 1
      ? { gueltig: true }
      : { gueltig: false, hinweis: 'Nur die letzte Stufe darf offen bleiben' };
  }
  if (wert <= stufe.vonMenge) {
    return { gueltig: false, hinweis: `Muss größer als ${stufe.vonMenge} t sein` };
  }
  const naechsteFeste = staffeln
    .slice(stufenIndex + 1)
    .find((s) => istEchteObergrenze(s.bisMenge, s.vonMenge));
  if (naechsteFeste && wert >= (naechsteFeste.bisMenge as number)) {
    return {
      gueltig: false,
      hinweis: `Muss zwischen ${stufe.vonMenge} und ${naechsteFeste.bisMenge} t liegen`,
    };
  }
  return { gueltig: true };
};

/**
 * Prüft die Untergrenze der ersten Stufe (Mindestabnahme) beim Verlassen.
 * Sie darf nicht negativ sein und nicht auf oder über die eigene Obergrenze
 * rutschen – sonst entstünde eine Stufe der Breite 0, die gedruckt wird,
 * obwohl `findeStaffel` für diese Menge längst die nächste Stufe liefert.
 */
export const pruefeUntergrenze = (
  staffeln: Preisstaffel[],
  stufenIndex: number,
  wert: number
): { gueltig: boolean; hinweis?: string } => {
  const stufe = staffeln[stufenIndex];
  if (!stufe) return { gueltig: false };
  if (wert < 0) return { gueltig: false, hinweis: 'Darf nicht negativ sein' };
  if (istEchteObergrenze(stufe.bisMenge, 0) && wert >= (stufe.bisMenge as number)) {
    return { gueltig: false, hinweis: `Muss kleiner als ${stufe.bisMenge} t sein` };
  }
  return { gueltig: true };
};

/** Schreibt die Untergrenze einer Stufe (in der Praxis die Mindestabnahme in Stufe 1). */
export const setzeUntergrenze = <T extends StaffelTraeger>(
  positionen: T[],
  posIndex: number,
  stufenIndex: number,
  wert: number
): T[] =>
  bearbeite(positionen, posIndex, (staffeln) => {
    const stufe = staffeln[stufenIndex];
    if (!stufe || stufe.vonMenge === wert) return staffeln;
    const kopie = [...staffeln];
    kopie[stufenIndex] = { ...stufe, vonMenge: wert };
    return kopie;
  });

/**
 * Legt ein Raster auf eine Stufenleiter: Grenzen kommen aus dem Raster, Preise
 * bleiben bei der Sorte. Fehlende Stufen erben den Preis der letzten
 * vorhandenen (nie 0, nie undefined), überzählige entfallen von hinten.
 */
export const wendeRasterAn = (staffeln: Preisstaffel[], raster: Staffelgrenze[]): Preisstaffel[] => {
  if (raster.length === 0) return staffeln;
  const letzterPreis = staffeln.length ? staffeln[staffeln.length - 1].einzelpreis : 0;
  const ergebnis = raster.map((grenze, i) => {
    const alt = staffeln[i];
    return {
      vonMenge: grenze.vonMenge,
      bisMenge: grenze.bisMenge,
      einzelpreis: alt ? alt.einzelpreis : letzterPreis,
      // Die Regionpreise gehören zur Stufe, nicht zum Raster — beim Spiegeln
      // der Grenzen dürfen sie nicht verlorengehen.
      ...(alt?.regionPreise ? { regionPreise: alt.regionPreise } : {}),
    };
  });
  return staffelnGleich(ergebnis, staffeln) ? staffeln : ergebnis;
};

/**
 * Haben alle Sorten gleich viele Stufen? Nur dann ist es zulässig, ein Raster
 * indexweise zu übertragen (`spiegleGrenzen`): Stufe i bedeutet dann in jeder
 * Sorte dasselbe. Bei abweichender Stufenzahl gehört der Angleich in
 * `gleicheGrenzenAn`, das den Preis über die Menge holt.
 */
export const gleicheStufenzahl = (positionen: StaffelTraeger[]): boolean =>
  positionen.length < 2 ||
  positionen.every((p) => p.staffeln.length === positionen[0].staffeln.length);

/** Die Position mit den meisten Stufen gibt das Raster vor (bei Gleichstand die erste). */
export const waehleLeitIndex = (positionen: StaffelTraeger[]): number => {
  let index = 0;
  positionen.forEach((p, i) => {
    if (p.staffeln.length > positionen[index].staffeln.length) index = i;
  });
  return index;
};

/** Überträgt das Raster der Leitposition auf alle anderen Sorten. */
export const spiegleGrenzen = <T extends StaffelTraeger>(positionen: T[], leitIndex: number): T[] => {
  const leit = positionen[leitIndex];
  if (!leit || leit.staffeln.length === 0) return positionen;
  const raster = leseGrenzen(leit.staffeln);
  let geaendert = false;
  const ergebnis = positionen.map((pos, i) => {
    if (i === leitIndex) return pos;
    const staffeln = wendeRasterAn(pos.staffeln, raster);
    if (staffeln === pos.staffeln) return pos;
    geaendert = true;
    return { ...pos, staffeln };
  });
  return geaendert ? ergebnis : positionen;
};

const bearbeite = <T extends StaffelTraeger>(
  positionen: T[],
  nurPosition: number | undefined,
  aendere: (staffeln: Preisstaffel[]) => Preisstaffel[]
): T[] => {
  let geaendert = false;
  const ergebnis = positionen.map((pos, i) => {
    if (nurPosition !== undefined && i !== nurPosition) return pos;
    const staffeln = aendere(pos.staffeln);
    if (staffeln === pos.staffeln) return pos;
    geaendert = true;
    return { ...pos, staffeln };
  });
  return geaendert ? ergebnis : positionen;
};

/**
 * Hängt eine Stufe an – in allen Sorten an derselben Grenze. Die bisher letzte
 * Stufe wird auf diese Grenze begrenzt, nur die neue bleibt offen. Der Preis
 * der neuen Stufe leitet sich JE SORTE aus ihrem eigenen Vorstufenpreis ab.
 */
export const haengeStufeAn = <T extends StaffelTraeger>(
  positionen: T[],
  opts: { nurPosition?: number; schritt?: number; abschlag?: number } = {}
): T[] => {
  const { nurPosition, schritt = STUFEN_SCHRITT, abschlag = ABSCHLAG_JE_STUFE } = opts;
  const vorgabe = positionen[nurPosition ?? waehleLeitIndex(positionen)];
  if (!vorgabe) return positionen;
  // Sorte ganz ohne Stufen (nur aus Fremddaten möglich): erste Stufe anlegen,
  // sonst ließe sie sich über die Maske nie wieder reparieren.
  if (vorgabe.staffeln.length === 0) {
    return bearbeite(positionen, nurPosition, (staffeln) =>
      staffeln.length === 0 ? [{ vonMenge: 0, bisMenge: null, einzelpreis: 0 }] : staffeln
    );
  }
  const letzte = vorgabe.staffeln[vorgabe.staffeln.length - 1];
  const grenze = istEchteObergrenze(letzte.bisMenge, letzte.vonMenge)
    ? (letzte.bisMenge as number)
    : letzte.vonMenge + schritt;

  return bearbeite(positionen, nurPosition, (staffeln) => {
    if (staffeln.length === 0) return staffeln;
    const eigeneLetzte = staffeln[staffeln.length - 1];
    if (grenze <= eigeneLetzte.vonMenge) return staffeln;
    return koppleGrenzen([
      ...staffeln.slice(0, -1),
      { ...eigeneLetzte, bisMenge: grenze },
      {
        vonMenge: grenze,
        bisMenge: null,
        einzelpreis: Math.max(0, runde2(eigeneLetzte.einzelpreis - abschlag)),
      },
    ]);
  });
};

/**
 * Löscht eine Stufe – in allen Sorten dieselbe. Ihr Mengenbereich schlägt der
 * Stufe DARUNTER zu (0–50 / 50–100 / ab 100, Mitte gelöscht → 0–100 / ab 100):
 * Der teurere Preis gilt damit länger, was kaufmännisch die sichere Richtung
 * ist. Beim Löschen der ersten Stufe rückt die neue erste auf deren „ab“,
 * beim Löschen der letzten wird die neue letzte wieder offen – eine gedeckelte
 * letzte Stufe bleibt in allen anderen Fällen gedeckelt.
 */
export const loescheStufe = <T extends StaffelTraeger>(
  positionen: T[],
  stufenIndex: number,
  opts: { nurPosition?: number } = {}
): T[] =>
  bearbeite(positionen, opts.nurPosition, (staffeln) => {
    if (staffeln.length <= 1 || stufenIndex < 0 || stufenIndex >= staffeln.length) return staffeln;
    const geloescht = staffeln[stufenIndex];
    const rest = staffeln.filter((_, i) => i !== stufenIndex);
    if (stufenIndex === 0) {
      rest[0] = { ...rest[0], vonMenge: geloescht.vonMenge };
    } else {
      rest[stufenIndex - 1] = { ...rest[stufenIndex - 1], bisMenge: geloescht.bisMenge ?? null };
    }
    // Nur wenn die LETZTE Stufe gelöscht wurde, wird die neue letzte offen. Eine
    // bewusst gedeckelte letzte Stufe („unter 500 t") darf beim Löschen einer
    // anderen Stufe nicht stillschweigend zu „unbegrenzt" werden – das stünde
    // so im Kundenangebot.
    if (stufenIndex === staffeln.length - 1) {
      rest[rest.length - 1] = { ...rest[rest.length - 1], bisMenge: null };
    }
    return koppleGrenzen(rest);
  });

/**
 * Schreibt eine Obergrenze.
 *
 * `koppeln: false` ist der Tipp-Pfad: Während der Eingabe wird ausschließlich
 * die bearbeitete Zelle geschrieben, damit die Zwischenstände 3 → 30 → 300 die
 * Folgestufen nicht mitreißen. Gekoppelt (und gespiegelt) wird erst, wenn der
 * Nutzer das Feld verlässt.
 */
export const setzeObergrenze = <T extends StaffelTraeger>(
  positionen: T[],
  posIndex: number,
  stufenIndex: number,
  wert: number | null,
  opts: { koppeln?: boolean } = {}
): T[] =>
  bearbeite(positionen, posIndex, (staffeln) => {
    const stufe = staffeln[stufenIndex];
    if (!stufe) return staffeln;
    if ((stufe.bisMenge ?? null) === (wert === 0 ? null : wert)) {
      return opts.koppeln === false ? staffeln : koppleGrenzen(staffeln);
    }
    const kopie = [...staffeln];
    // Eine 0 wird nie gespeichert: Die Maske zeigte „0", das PDF druckte
    // „unbegrenzt". Gespeichert wird ausschließlich null.
    kopie[stufenIndex] = { ...stufe, bisMenge: wert === 0 ? null : wert };
    return opts.koppeln === false ? kopie : koppleGrenzen(kopie);
  });

/**
 * Stufenleiter für eine neu hinzugefügte Sorte: Grenzen aus dem Raster, Preise
 * aus dem Stammpreis plus den Preisabständen der Leitsorte (deren Staffelung
 * bildet ab, wie das Haus staffelt). Ohne Abstände greift der Standardabschlag.
 */
export const rasterFuerNeueSorte = (
  raster: Staffelgrenze[],
  basispreis: number,
  abstaende?: number[]
): Preisstaffel[] =>
  raster.map((grenze, i) => ({
    vonMenge: grenze.vonMenge,
    bisMenge: grenze.bisMenge,
    einzelpreis: Math.max(0, runde2(basispreis + (abstaende?.[i] ?? -(i * ABSCHLAG_JE_STUFE)))),
  }));

/** Preisabstände einer Stufenleiter zur ersten Stufe (immer ≤ 0 bei fallenden Preisen). */
export const preisAbstaende = (staffeln: Preisstaffel[]): number[] =>
  staffeln.map((s) => runde2(s.einzelpreis - (staffeln[0]?.einzelpreis ?? s.einzelpreis)));

/**
 * Gleicht Altdaten mit abweichenden Grenzen an das Raster der Leitposition an.
 * Der Preis je neuer Stufe ist der, den diese Sorte unter ihren ALTEN Grenzen
 * bei dieser Menge berechnet hätte (`findeStaffel`) – es wird keine Zahl
 * erfunden und keine zweite Preislogik aufgemacht.
 */
export const gleicheGrenzenAn = <T extends StaffelTraeger>(positionen: T[], leitIndex: number): T[] => {
  const leit = positionen[leitIndex];
  if (!leit || leit.staffeln.length === 0) return positionen;
  // Erst die Leitsorte selbst in Ordnung bringen: Ein Angleich darf keine Lücke
  // in alle Sorten kopieren, die anschließend den Submit sperrt.
  const leitStaffeln = koppleGrenzen(leit.staffeln);
  const raster = leseGrenzen(leitStaffeln);
  let geaendert = leitStaffeln !== leit.staffeln;
  const ergebnis = positionen.map((pos, i) => {
    if (i === leitIndex) return leitStaffeln === pos.staffeln ? pos : { ...pos, staffeln: leitStaffeln };
    const staffeln = raster.map((grenze, stufe) => {
      const passend =
        findeStaffel(pos.staffeln, grenze.vonMenge) ??
        pos.staffeln[Math.min(stufe, pos.staffeln.length - 1)];
      return {
        vonMenge: grenze.vonMenge,
        bisMenge: grenze.bisMenge,
        einzelpreis: passend?.einzelpreis ?? 0,
        // Regionpreise wandern mit der Stufe mit, aus der auch der Preis kommt.
        ...(passend?.regionPreise ? { regionPreise: passend.regionPreise } : {}),
      };
    });
    if (staffelnGleich(staffeln, pos.staffeln)) return pos;
    geaendert = true;
    return { ...pos, staffeln };
  });
  return geaendert ? ergebnis : positionen;
};

/** Was der Angleich an einer Altposition ändern würde – für die Rückfrage vor dem Klick. */
export const ermittleAngleichBefunde = <T extends StaffelTraeger & { artikelBezeichnung?: string }>(
  positionen: T[],
  leitIndex: number
): AngleichBefund[] => {
  const angeglichen = gleicheGrenzenAn(positionen, leitIndex);
  return positionen
    .map((pos, i) => ({ pos, neu: angeglichen[i], i }))
    .filter(({ pos, neu }) => pos !== neu)
    .map(({ pos, neu }) => ({
      bezeichnung: pos.artikelBezeichnung || 'Sorte',
      alteGrenzen: grenzenSignatur(pos.staffeln),
      neueGrenzen: grenzenSignatur(neu.staffeln),
    }));
};

/** Stufen ohne Preis (0,00 €/t) – in einer Preismatrix leicht zu übersehen. */
export const preisLuecken = <T extends StaffelTraeger & { artikelBezeichnung?: string }>(
  positionen: T[]
): Array<{ bezeichnung: string; stufenIndex: number; vonMenge: number }> =>
  positionen.flatMap((pos) =>
    pos.staffeln
      .map((s, stufenIndex) => ({
        bezeichnung: pos.artikelBezeichnung || 'Sorte',
        stufenIndex,
        vonMenge: s.vonMenge,
        preis: s.einzelpreis,
      }))
      .filter((z) => !(z.preis > 0))
      .map(({ bezeichnung, stufenIndex, vonMenge }) => ({ bezeichnung, stufenIndex, vonMenge }))
  );

let idZaehler = 0;
/**
 * Kollisionsfreie Positions-ID. `staffel-${Date.now()}` vergab bei zwei Klicks
 * in derselben Millisekunde dieselbe ID – und damit denselben Aufklapp-Zustand.
 */
export const neueStaffelId = (praefix = 'staffel'): string =>
  `${praefix}-${Date.now().toString(36)}-${(++idZaehler).toString(36)}`;
