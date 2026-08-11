/**
 * wiegescheinService.ts
 *
 * Menschliche Prüfung der Wiegeschein-Menge.
 *
 * Der Fahrer fotografiert beim Abladen den Wiegeschein; die Netlify Function
 * netlify/functions/liefernachweis.ts legt das Foto ab und lässt es maschinell
 * vorlesen. Dieses Modul ist die Gegenseite: Erst wenn hier ein Mensch eine
 * Menge bestätigt, gilt sie — vorher ist `wiegeschein.ocr` nur ein Vorschlag.
 *
 * Ablauf:
 *   pruefStatus 'offen'  → erscheint in der Prüfliste (WiegescheinPruefliste)
 *   bestätigt/korrigiert → gepruefteMengeTonnen gesetzt, liefergewicht übernommen
 *   unlesbar             → dokumentiert, liefergewicht bleibt unangetastet
 *
 * Die Rechnungspositionen werden bewusst NICHT automatisch angepasst. Die
 * geprüfte Menge landet im Liefergewicht und wird beim Rechnungsschreiben
 * angezeigt — was daraus fakturiert wird, entscheidet weiterhin ein Mensch.
 */

import { Projekt, WiegescheinInfo, WiegescheinPruefStatus } from '../types/projekt';
import { projektService } from './projektService';

/**
 * Plausibilitätsfenster für eine LKW-Nettomenge in Tonnen.
 * Muss mit PLAUSIBEL_MIN_TONNEN/PLAUSIBEL_MAX_TONNEN in
 * netlify/functions/liefernachweis.ts übereinstimmen.
 */
export const PLAUSIBEL_MIN_TONNEN = 0.2;
export const PLAUSIBEL_MAX_TONNEN = 45;

/** Ab dieser Abweichung zur geplanten Menge wird im Portal gewarnt (10 %) */
export const ABWEICHUNG_WARNSCHWELLE = 0.1;

export interface Pruefer {
  id?: string;
  name?: string;
}

/**
 * Prüft eine eingegebene Menge, bevor sie gespeichert wird.
 * Gibt null zurück, wenn alles in Ordnung ist, sonst den Fehlertext.
 */
export const validiereMenge = (mengeTonnen: number): string | null => {
  if (!Number.isFinite(mengeTonnen)) return 'Bitte eine Menge in Tonnen eingeben.';
  if (mengeTonnen <= 0) return 'Die Menge muss größer als 0 sein.';
  if (mengeTonnen < PLAUSIBEL_MIN_TONNEN) {
    return `Die Menge ist ungewöhnlich klein (unter ${PLAUSIBEL_MIN_TONNEN} t). Bitte den Wiegeschein noch einmal ansehen.`;
  }
  if (mengeTonnen > PLAUSIBEL_MAX_TONNEN) {
    return `Die Menge ist ungewöhnlich groß (über ${PLAUSIBEL_MAX_TONNEN} t). Steht auf dem Schein vielleicht Kilogramm statt Tonnen?`;
  }
  return null;
};

/**
 * Relative Abweichung der geprüften Menge zur ursprünglich geplanten.
 * Gibt null zurück, wenn kein Vergleichswert existiert.
 */
export const berechneAbweichung = (
  gepruefteMengeTonnen: number,
  geplantesGewicht?: number
): number | null => {
  if (!geplantesGewicht || geplantesGewicht <= 0) return null;
  return (gepruefteMengeTonnen - geplantesGewicht) / geplantesGewicht;
};

/**
 * Speichert das Prüfergebnis am Projekt.
 *
 * Sicherheitsnetz: `projektService.updateProjekt` schreibt das data-JSON NICHT,
 * wenn es über dem Appwrite-Limit liegt (siehe MAX_DATA_FIELD_SIZE dort) — die
 * Änderung ginge dann still verloren. Bei einer abrechnungsrelevanten Menge darf
 * das nicht passieren, deshalb wird das Ergebnis nachgelesen und im Zweifel
 * geworfen, statt dem Prüfer ein erfolgreiches Speichern vorzuspielen.
 */
const speicherePruefung = async (
  projekt: Projekt,
  wiegeschein: WiegescheinInfo,
  weitereFelder: Partial<Projekt> = {}
): Promise<Projekt> => {
  const projektId = projekt.$id || projekt.id;
  const aktualisiert = await projektService.updateProjekt(projektId, {
    ...weitereFelder,
    wiegeschein,
  });

  if (aktualisiert.wiegeschein?.pruefStatus !== wiegeschein.pruefStatus) {
    throw new Error(
      'Das Prüfergebnis konnte nicht am Projekt gespeichert werden (Datenfeld zu groß). Bitte einen Administrator informieren — die Menge ist NICHT gespeichert.'
    );
  }

  return aktualisiert;
};

/**
 * Bestätigt die Menge eines Wiegescheins und übernimmt sie als Liefergewicht.
 *
 * Ob das als 'bestaetigt' (Vorschlag der Bilderkennung übernommen) oder
 * 'korrigiert' (Mensch hat eine andere Zahl eingetragen) protokolliert wird,
 * leitet der Service selbst aus dem Vergleich ab — nicht die Oberfläche.
 * So steht im Protokoll immer, was tatsächlich passiert ist.
 */
export const bestaetigeWiegescheinMenge = async (
  projekt: Projekt,
  mengeTonnen: number,
  pruefer: Pruefer,
  notiz?: string
): Promise<Projekt> => {
  const fehler = validiereMenge(mengeTonnen);
  if (fehler) throw new Error(fehler);

  const bisher = projekt.wiegeschein;
  const vorschlag = bisher?.ocr?.gelesen ? bisher.ocr.mengeTonnen : undefined;
  const status: WiegescheinPruefStatus =
    vorschlag !== undefined && Math.abs(vorschlag - mengeTonnen) < 0.0005
      ? 'bestaetigt'
      : 'korrigiert';

  const wiegeschein: WiegescheinInfo = {
    ...bisher,
    pruefStatus: status,
    gepruefteMengeTonnen: mengeTonnen,
    geprueftAm: new Date().toISOString(),
    geprueftVon: pruefer.id,
    geprueftVonName: pruefer.name,
    pruefNotiz: notiz?.trim() || undefined,
  };

  // Erst mit der Bestätigung wird aus der verwogenen Menge das Liefergewicht.
  return speicherePruefung(projekt, wiegeschein, { liefergewicht: mengeTonnen });
};

/**
 * Markiert den Wiegeschein als nicht auswertbar (unleserlich, falscher Beleg,
 * Foto unbrauchbar). Das Liefergewicht bleibt unverändert — lieber der geplante
 * Wert als eine erfundene Zahl. Die Notiz ist Pflicht, damit später
 * nachvollziehbar ist, warum keine Menge festgestellt wurde.
 */
export const markiereWiegescheinUnlesbar = async (
  projekt: Projekt,
  notiz: string,
  pruefer: Pruefer
): Promise<Projekt> => {
  const text = notiz.trim();
  if (!text) {
    throw new Error('Bitte kurz notieren, warum die Menge nicht feststellbar ist.');
  }

  const wiegeschein: WiegescheinInfo = {
    ...projekt.wiegeschein,
    pruefStatus: 'unlesbar',
    gepruefteMengeTonnen: undefined,
    geprueftAm: new Date().toISOString(),
    geprueftVon: pruefer.id,
    geprueftVonName: pruefer.name,
    pruefNotiz: text,
  };

  return speicherePruefung(projekt, wiegeschein);
};

/**
 * Setzt eine bereits erfolgte Prüfung zurück auf 'offen'.
 * Für den Fall, dass sich eine Menge im Nachhinein als falsch herausstellt
 * (z. B. Rückfrage bei der Waage). Das Liefergewicht bleibt stehen, bis erneut
 * bestätigt wird — die alte Notiz wird um den Rücksetz-Vermerk ergänzt.
 */
export const setzeWiegescheinPruefungZurueck = async (
  projekt: Projekt,
  grund: string,
  pruefer: Pruefer
): Promise<Projekt> => {
  const bisher = projekt.wiegeschein;
  if (!bisher) throw new Error('Zu diesem Projekt gibt es keinen Wiegeschein.');

  const vermerk = `Prüfung zurückgesetzt am ${new Date().toLocaleDateString('de-DE')}${
    pruefer.name ? ` durch ${pruefer.name}` : ''
  }: ${grund.trim() || 'ohne Angabe'}`;

  const wiegeschein: WiegescheinInfo = {
    ...bisher,
    pruefStatus: 'offen',
    gepruefteMengeTonnen: undefined,
    geprueftAm: undefined,
    geprueftVon: undefined,
    geprueftVonName: undefined,
    pruefNotiz: [bisher.pruefNotiz, vermerk].filter(Boolean).join(' | '),
  };

  return speicherePruefung(projekt, wiegeschein);
};

/** Hat das Projekt einen Wiegeschein, der noch auf eine Prüfung wartet? */
export const hatOffeneWiegescheinPruefung = (projekt: Projekt): boolean =>
  Boolean(projekt.wiegeschein?.fotoDateiId) && projekt.wiegeschein?.pruefStatus === 'offen';

/**
 * Lädt alle Projekte mit offener Wiegeschein-Prüfung, älteste zuerst
 * (was am längsten liegt, ist am dringendsten).
 *
 * Gefiltert wird im Client, weil `wiegeschein` im data-JSON liegt und für
 * Appwrite damit nicht abfragbar ist. Um die Menge überschaubar zu halten,
 * wird auf ein Saisonjahr eingegrenzt, sofern angegeben.
 */
export const ladeOffeneWiegescheine = async (saisonjahr?: number): Promise<Projekt[]> => {
  const projekte = await projektService.loadProjekte(saisonjahr ? { saisonjahr } : undefined);
  return projekte
    .filter(hatOffeneWiegescheinPruefung)
    .sort((a, b) => {
      const zeitA = a.wiegeschein?.erfasstAm || a.liefernachweisAm || '';
      const zeitB = b.wiegeschein?.erfasstAm || b.liefernachweisAm || '';
      return zeitA.localeCompare(zeitB);
    });
};
