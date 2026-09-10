/**
 * Textbausteine der Platzbauer-Belege (10.09.2026).
 *
 * Anrede, Einleitung, Abschnittsüberschriften, Fußnoten und Grußformel standen
 * fest im PDF-Code. Wer eine Formulierung ändern wollte, brauchte einen
 * Entwickler — für einen Satz wie „gerne unterbreiten wir Ihnen folgendes
 * Angebot". Sie liegen jetzt hier als Vorlage und werden im Portal gepflegt
 * (Platzbauer-Verwaltung → Belegtexte), gespeichert als JSON im
 * Stammdaten-Feld `platzbauerBelegtexte`.
 *
 * Platzhalter werden beim Drucken ersetzt:
 *   {platzbauer}  Name des Platzbauers
 *   {saison}      Saisonjahr des Projekts
 *   {projekt}     Projektname
 *   {firma}       eigener Firmenname aus den Stammdaten
 *   {frachtrechner} Hinweis auf den öffentlichen Frachtkostenrechner (mit Adresse)
 * Ein unbekannter Platzhalter bleibt stehen, statt zu verschwinden — so fällt
 * ein Tippfehler beim Korrekturlesen auf und nicht erst beim Kunden.
 *
 * Die Bausteine `lieferbedingungen` und `bemerkung` sind VORBELEGUNGEN: Sie
 * füllen die Felder im Angebot bzw. in der AB vor und werden dort je Beleg
 * angepasst und mit dem Beleg gespeichert. Ein leerer Baustein heißt hier wie
 * überall „Vorlage gilt" — deshalb hat die Bemerkung eine leere Vorlage.
 *
 * NICHT hier: der Staffel-Hinweistext. Der hängt am Abrechnungsmodell und
 * wird in `utils/staffelpreisText.ts` erzeugt bzw. je Angebot überschrieben.
 */

/** Ein pflegbarer Baustein. */
export interface Belegtext {
  schluessel: BelegtextSchluessel;
  /** Was der Baustein im Beleg tut — steht als Hilfe an der Eingabe. */
  beschreibung: string;
  text: string;
}

export type BelegtextSchluessel =
  | 'anrede'
  | 'angebotEinleitung'
  | 'abEinleitung'
  | 'preislisteKennzeichnung'
  | 'preislisteTitel'
  | 'preislisteFussnote'
  | 'positionenTitel'
  | 'positionenTitelMitStaffel'
  | 'preiseJeVereinTitel'
  | 'bedarfHinweis'
  | 'grussformel'
  | 'grussformelKurz'
  | 'lieferbedingungen'
  | 'bemerkung';

/** Auslieferungszustand — gilt, solange in den Stammdaten nichts gepflegt ist. */
export const BELEGTEXTE_DEFAULT: Belegtext[] = [
  {
    schluessel: 'anrede',
    beschreibung: 'Anrede auf Angebot und Auftragsbestätigung',
    text: 'Sehr geehrte Damen und Herren,',
  },
  {
    schluessel: 'angebotEinleitung',
    beschreibung: 'Erster Satz des Angebots, unter der Anrede',
    text: 'gerne unterbreiten wir Ihnen folgendes Angebot für die Belieferung Ihrer Vereine:',
  },
  {
    schluessel: 'abEinleitung',
    beschreibung: 'Erster Satz der Auftragsbestätigung (nur bei Lieferpositionen)',
    text: 'vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Lieferungen:',
  },
  {
    schluessel: 'preislisteKennzeichnung',
    beschreibung: 'Kleine Kennzeichnung über den Zusatzleistungen',
    text: 'Für alle Abrufe gültig',
  },
  {
    schluessel: 'preislisteTitel',
    beschreibung: 'Überschrift der Zusatzleistungen',
    text: 'Zusatzleistungen – Preise je Einheit',
  },
  {
    schluessel: 'preislisteFussnote',
    beschreibung: 'Kleintext unter den Zusatzleistungen',
    text:
      'Alle Preise netto zzgl. gesetzlicher Umsatzsteuer. Die Zusatzleistungen werden nur berechnet, ' +
      'wenn sie tatsächlich abgerufen werden, und gelten für alle Lieferungen dieser Vereinbarung.',
  },
  {
    schluessel: 'positionenTitel',
    beschreibung: 'Überschrift der Positionsliste (Angebot ohne Staffel)',
    text: 'Positionen',
  },
  {
    schluessel: 'positionenTitelMitStaffel',
    beschreibung: 'Überschrift der Positionsliste, wenn es zusätzlich eine Staffel gibt',
    text: 'Standard- und Zusatzpositionen',
  },
  {
    schluessel: 'preiseJeVereinTitel',
    beschreibung: 'Überschrift, wenn das Angebot Preise je Verein statt Mengen führt',
    text: 'Preise je Verein',
  },
  {
    schluessel: 'bedarfHinweis',
    beschreibung: 'Kleintext unter den Bedarfspositionen',
    text:
      'Hinweis: Bedarfspositionen sind Schätzungen. Die tatsächliche Abrechnung erfolgt nach ' +
      'gelieferter Menge.',
  },
  {
    schluessel: 'grussformel',
    beschreibung: 'Schlusssatz im Angebot, vor dem Firmennamen (eine Zeile je Absatz)',
    text: 'Wir freuen uns auf Ihre Rückmeldung und verbleiben\nmit freundlichen Grüßen',
  },
  {
    schluessel: 'grussformelKurz',
    beschreibung: 'Schlusssatz auf AB, Rechnung, Proforma und Lieferschein',
    text: 'Mit freundlichen Grüßen',
  },
  {
    schluessel: 'lieferbedingungen',
    beschreibung: 'Vorbelegung der Lieferbedingungen im Angebot und in der AB (je Beleg änderbar)',
    text: 'Frei Baustelle, abgeladen\n\n{frachtrechner}',
  },
  {
    schluessel: 'bemerkung',
    beschreibung: 'Vorbelegung der Bemerkung im Angebot und in der AB (je Beleg änderbar)',
    text: '',
  },
];

/** Bausteine, die nur Felder vorbelegen und nicht direkt gedruckt werden. */
export const VORBELEGUNG_SCHLUESSEL: ReadonlySet<BelegtextSchluessel> = new Set<BelegtextSchluessel>([
  'lieferbedingungen',
  'bemerkung',
]);

/** Werte für die Platzhalter eines Belegs. */
export interface BelegtextWerte {
  platzbauer?: string;
  saison?: number | string;
  projekt?: string;
  firma?: string;
  frachtrechner?: string;
}

/**
 * Liest die gepflegten Texte aus dem Stammdaten-JSON und ergänzt fehlende
 * Bausteine aus der Vorlage. Ein kaputter String darf keinen Beleg ohne Anrede
 * erzeugen — deshalb wird nie die ganze Liste verworfen, sondern nur das, was
 * unlesbar ist.
 */
export const leseBelegtexte = (json?: string | null): Belegtext[] => {
  const gepflegt = new Map<string, string>();
  if (json?.trim()) {
    try {
      const roh = JSON.parse(json);
      if (Array.isArray(roh)) {
        for (const eintrag of roh) {
          if (!eintrag || typeof eintrag !== 'object') continue;
          const schluessel = String((eintrag as Record<string, unknown>).schluessel ?? '');
          const text = String((eintrag as Record<string, unknown>).text ?? '');
          if (schluessel && text.trim()) gepflegt.set(schluessel, text);
        }
      }
    } catch {
      /* unlesbares JSON: Vorlage gilt */
    }
  }
  return BELEGTEXTE_DEFAULT.map((vorlage) => ({
    ...vorlage,
    text: gepflegt.get(vorlage.schluessel) ?? vorlage.text,
  }));
};

/** Nachschlagetabelle Schlüssel → Text. */
export type Belegtexte = Record<BelegtextSchluessel, string>;

export const alsNachschlage = (texte: Belegtext[]): Belegtexte =>
  texte.reduce((map, eintrag) => {
    map[eintrag.schluessel] = eintrag.text;
    return map;
  }, {} as Belegtexte);

/** Platzhalter ersetzen; unbekannte bleiben stehen. */
export const fuelleBelegtext = (text: string, werte: BelegtextWerte = {}): string =>
  text.replace(/\{(platzbauer|saison|projekt|firma|frachtrechner)\}/g, (treffer, name: string) => {
    const wert = (werte as Record<string, unknown>)[name];
    return wert === undefined || wert === null || wert === '' ? treffer : String(wert);
  });

/** Bequemer Zugriff: Text holen und Platzhalter füllen. */
export const belegtext = (
  texte: Belegtexte,
  schluessel: BelegtextSchluessel,
  werte?: BelegtextWerte
): string => fuelleBelegtext(texte[schluessel] ?? '', werte);
