/**
 * Auswertung eines Platzbauers: Was wurde über ihn bestellt, von wem, wohin —
 * und wo steht er in seiner Preisstaffel (09/2026).
 *
 * Der Platzbauer bündelt die Bestellungen seiner Vereine. Bis jetzt zeigte das
 * Portal davon nur zwei Zahlen (Gesamtmenge, Umsatz) am Projekt. Für die Frage
 * „in welche Regionen liefern wir über wen?" musste man die Vereinsliste
 * abtippen — und ob die nächste Staffelstufe in Reichweite ist, konnte niemand
 * sagen, ohne die Mengen zusammenzuzählen.
 *
 * Diese Datei rechnet nur. Sie kennt weder Appwrite noch React, damit die
 * Regeln im Node-Test prüfbar sind (das Repo hat kein jsdom).
 *
 * Mengenbegriffe, die hier nie vermischt werden:
 *  - `bestellt`   – alles, was zugeordnet ist, unabhängig vom Status.
 *  - `geliefert`  – nur Positionen mit Lieferschein. Das ist die Zahl, die für
 *                   die Staffel zählt: Die Staffel bemisst sich an der
 *                   gelieferten Menge, nicht an der bestellten.
 *  - `storniert`  – verlorene Projekte zählen nirgends mit.
 */
import type { PlatzbauerPosition, Preisstaffel } from '../types/platzbauer';
import { findeStaffel, sortiereStaffeln } from './staffelpreisText';

/** Eine Region der Auswertung: PLZ-Leitregion (zwei Stellen). */
export interface RegionAuswertung {
  /** „90" – die ersten beiden Stellen der PLZ; '??' wenn keine PLZ bekannt ist. */
  leitregion: string;
  /** Orte in dieser Leitregion, alphabetisch, ohne Duplikate. */
  orte: string[];
  anzahlVereine: number;
  mengeBestellt: number;
  mengeGeliefert: number;
  umsatz: number;
  /** Anteil an der bestellten Gesamtmenge (0–1). */
  anteil: number;
}

export interface VereinAuswertung {
  vereinId: string;
  vereinsname: string;
  plz: string;
  ort: string;
  menge: number;
  einzelpreis: number;
  umsatz: number;
  geliefert: boolean;
  status?: string;
}

export interface StaffelStandAuswertung {
  /** Menge, die für die Einstufung zählt (geliefert). */
  massgeblicheMenge: number;
  aktuelleStufe?: Preisstaffel;
  naechsteStufe?: Preisstaffel;
  /** Tonnen bis zur nächsten Stufe; 0, wenn die höchste Stufe erreicht ist. */
  tonnenBisNaechsteStufe: number;
  /** Ersparnis je Tonne, die die nächste Stufe bringt. */
  ersparnisJeTonne: number;
}

export interface PlatzbauerAuswertung {
  anzahlVereine: number;
  mengeBestellt: number;
  mengeGeliefert: number;
  umsatzBestellt: number;
  umsatzGeliefert: number;
  /** Durchschnittlicher Preis je Tonne über alle Positionen mit Menge. */
  durchschnittspreis: number;
  regionen: RegionAuswertung[];
  vereine: VereinAuswertung[];
}

const runde2 = (wert: number): number => Math.round(wert * 100) / 100;

/**
 * Positionen eines Platzbauerprojekts auswerten.
 *
 * Verlorene Projekte werden ausgeschlossen: Sie stehen als Zuordnung noch am
 * Platzbauer, sind aber keine Bestellung. Sie mitzuzählen hätte die
 * Staffeleinstufung geschönt.
 */
export const werteAus = (positionen: PlatzbauerPosition[]): PlatzbauerAuswertung => {
  const gueltig = positionen.filter((p) => p.projektStatus !== 'verloren');

  const vereine: VereinAuswertung[] = gueltig.map((p) => ({
    vereinId: p.vereinId,
    vereinsname: p.vereinsname,
    plz: p.lieferadresse?.plz?.trim() || '',
    ort: p.lieferadresse?.ort?.trim() || '',
    menge: p.menge || 0,
    einzelpreis: p.einzelpreis || 0,
    umsatz: p.gesamtpreis || 0,
    geliefert: !!p.lieferscheinErstellt,
    status: p.projektStatus,
  }));

  const mengeBestellt = runde2(vereine.reduce((s, v) => s + v.menge, 0));
  const mengeGeliefert = runde2(
    vereine.filter((v) => v.geliefert).reduce((s, v) => s + v.menge, 0)
  );
  const umsatzBestellt = runde2(vereine.reduce((s, v) => s + v.umsatz, 0));
  const umsatzGeliefert = runde2(
    vereine.filter((v) => v.geliefert).reduce((s, v) => s + v.umsatz, 0)
  );

  const gruppen = new Map<string, VereinAuswertung[]>();
  for (const verein of vereine) {
    // Zwei Stellen sind die Leitregion. Eine Stelle wäre zu grob (ganz
    // Süddeutschland als „9"), die volle PLZ zu fein für eine Übersicht.
    const leitregion = /^\d{2}/.test(verein.plz) ? verein.plz.slice(0, 2) : '??';
    const liste = gruppen.get(leitregion);
    if (liste) liste.push(verein);
    else gruppen.set(leitregion, [verein]);
  }

  const regionen: RegionAuswertung[] = [...gruppen.entries()]
    .map(([leitregion, liste]) => {
      const menge = runde2(liste.reduce((s, v) => s + v.menge, 0));
      return {
        leitregion,
        orte: [...new Set(liste.map((v) => v.ort).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, 'de')
        ),
        anzahlVereine: liste.length,
        mengeBestellt: menge,
        mengeGeliefert: runde2(liste.filter((v) => v.geliefert).reduce((s, v) => s + v.menge, 0)),
        umsatz: runde2(liste.reduce((s, v) => s + v.umsatz, 0)),
        anteil: mengeBestellt > 0 ? menge / mengeBestellt : 0,
      };
    })
    .sort((a, b) => b.mengeBestellt - a.mengeBestellt || a.leitregion.localeCompare(b.leitregion));

  const mitMenge = vereine.filter((v) => v.menge > 0);
  const durchschnittspreis =
    mengeBestellt > 0 ? runde2(mitMenge.reduce((s, v) => s + v.umsatz, 0) / mengeBestellt) : 0;

  return {
    anzahlVereine: vereine.length,
    mengeBestellt,
    mengeGeliefert,
    umsatzBestellt,
    umsatzGeliefert,
    durchschnittspreis,
    regionen,
    vereine: [...vereine].sort((a, b) => b.menge - a.menge),
  };
};

/**
 * Wo steht der Platzbauer in seiner Staffel? Maßgeblich ist die gelieferte
 * Menge — dieselbe Regel, die der Hinweistext dem Kunden zusagt.
 *
 * Ohne Staffeln (Direktpreise) gibt es keinen Stand: dann `null`.
 */
export const werteStaffelAus = (
  staffeln: Preisstaffel[],
  massgeblicheMenge: number
): StaffelStandAuswertung | null => {
  if (!staffeln || staffeln.length === 0) return null;
  const sortiert = sortiereStaffeln(staffeln);
  const aktuelleStufe = findeStaffel(sortiert, massgeblicheMenge);
  const index = aktuelleStufe ? sortiert.indexOf(aktuelleStufe) : -1;
  const naechsteStufe = index >= 0 ? sortiert[index + 1] : undefined;

  return {
    massgeblicheMenge: runde2(massgeblicheMenge),
    aktuelleStufe,
    naechsteStufe,
    tonnenBisNaechsteStufe: naechsteStufe
      ? Math.max(0, runde2(naechsteStufe.vonMenge - massgeblicheMenge))
      : 0,
    ersparnisJeTonne:
      naechsteStufe && aktuelleStufe
        ? Math.max(0, runde2(aktuelleStufe.einzelpreis - naechsteStufe.einzelpreis))
        : 0,
  };
};
