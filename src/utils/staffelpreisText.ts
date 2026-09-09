/**
 * Staffelpreise im Platzbauer-Angebot: Abrechnungsmodell und erklärender Text.
 *
 * Fachlicher Hintergrund (Vorschlag „Hinweistext für Staffelpreisangebot", 09/2026):
 * Ein Platzbauer zahlt z. B. die ersten 300 t zu 120 €/t und ab 300 t nur noch
 * 110 €/t. Ohne eine klare Regel, ob der günstigere Preis rückwirkend gilt und
 * wie die Differenz zurückfließt, ist das Angebot nicht abrechenbar. Deshalb
 * wird das Modell explizit gewählt und der Text daraus erzeugt:
 *
 *  - saisonbonus:       laufend zum Preis der 1. Stufe, zum Stichtag eine
 *                       Gutschrift über die Differenz für die GESAMTE Menge.
 *                       Ein Beleg pro Saison, keine Nachbelastung. Standard.
 *  - sofortumstellung:  die Lieferung, die eine Stufe erreicht, wird schon
 *                       zum neuen Preis berechnet; die davor gelieferten
 *                       Tonnen werden per Ausgleichsgutschrift nachgezogen.
 *  - stufenpreis:       nur die Mehrmenge ab der Grenze wird günstiger,
 *                       keine Gutschrift.
 *
 * Grenzregel überall gleich: „ab 300 t" schließt 300 t ein (von ≤ Menge < bis).
 *
 * Der erzeugte Text ist ein Vorschlag: Der Sachbearbeiter kann ihn im Angebot
 * überschreiben (`hinweistext`). Leer = automatischer Text.
 */
import type {
  Preisstaffel,
  StaffelAbrechnungsmodell,
  StaffelKonditionen,
  StaffelMengenbasis,
} from '../types/platzbauer';

export interface StaffelArtikelFuerText {
  artikelnummer: string;
  bezeichnung: string;
  staffeln: Preisstaffel[];
}

export const STAFFEL_MODELLE: Array<{
  wert: StaffelAbrechnungsmodell;
  titel: string;
  kurz: string;
  empfohlen?: boolean;
}> = [
  {
    wert: 'saisonbonus',
    titel: 'Saisonbonus',
    kurz:
      'Jede Lieferung wird zum Preis der 1. Stufe berechnet. Zum Stichtag gibt es eine Gutschrift über die Differenz für die gesamte gelieferte Menge.',
    empfohlen: true,
  },
  {
    wert: 'sofortumstellung',
    titel: 'Sofortige Umstellung',
    kurz:
      'Die Lieferung, die eine Stufe erreicht, wird schon zum neuen Preis berechnet. Die vorher gelieferten Tonnen werden per Ausgleichsgutschrift nachgezogen.',
  },
  {
    wert: 'stufenpreis',
    titel: 'Stufenpreis',
    kurz: 'Nur die Mehrmenge ab der Stufengrenze wird günstiger. Es gibt keine Gutschrift.',
  },
];

export const STAFFEL_MENGENBASEN: Array<{ wert: StaffelMengenbasis; titel: string; kurz: string }> = [
  {
    wert: 'gesamt',
    titel: 'Alle Sorten zusammen',
    kurz: 'Für die Einstufung zählen alle angebotenen Ziegelmehl-Sorten zusammen.',
  },
  {
    wert: 'je-artikel',
    titel: 'Je Sorte getrennt',
    kurz: 'Jede Sorte wird für sich eingestuft.',
  },
];

/** Standardkonditionen für eine Saison: Bonusmodell, Zeitraum 1.1. bis 31.10. */
export const standardStaffelKonditionen = (saisonjahr: number): StaffelKonditionen => ({
  abrechnungsmodell: 'saisonbonus',
  mengenbasis: 'gesamt',
  zeitraumVon: `${saisonjahr}-01-01`,
  zeitraumBis: `${saisonjahr}-10-31`,
  gutschriftNurBeiZahlung: true,
});

// ==================== FORMATIERUNG ====================

const NBSP = '\u00a0';
const tonnenFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/**
 * „1.234,5 t" – deutsche Schreibweise, höchstens eine Nachkommastelle.
 * Zwischen Zahl und Einheit steht ein geschütztes Leerzeichen, damit jsPDF
 * „350" und „t" nicht auf zwei Zeilen verteilt (so wie Intl es beim Euro macht).
 */
export const formatTonnen = (menge: number): string => `${tonnenFormat.format(menge)}${NBSP}t`;

const euro = (betrag: number): string => euroFormat.format(betrag);
const euroProTonne = (betrag: number): string => `${euro(betrag)}/t`;

/** ISO-Datum (JJJJ-MM-TT) → TT.MM.JJJJ; alles andere unverändert. */
export const formatDatumDe = (iso?: string): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

// ==================== STAFFEL-LOGIK ====================

/** null, undefined und 0 bedeuten überall im Portal „unbegrenzt" (Eingabe „0" landet als 0). */
const istUnbegrenzt = (bis: number | null | undefined): boolean => !bis;

export const sortiereStaffeln = (staffeln: Preisstaffel[]): Preisstaffel[] =>
  [...staffeln].sort((a, b) => a.vonMenge - b.vonMenge);

/**
 * Welche Stufe gilt bei dieser Gesamtmenge? „Ab 300 t" heißt: 300 t gehören
 * schon zur Stufe (von ≤ Menge < bis). Unterhalb der ersten Grenze gilt die
 * erste Stufe.
 */
export const findeStaffel = (staffeln: Preisstaffel[], menge: number): Preisstaffel | undefined => {
  const sortiert = sortiereStaffeln(staffeln);
  if (sortiert.length === 0) return undefined;
  const treffer = sortiert.find(
    (s) => menge >= s.vonMenge && (istUnbegrenzt(s.bisMenge) || menge < (s.bisMenge as number))
  );
  if (treffer) return treffer;
  return menge < sortiert[0].vonMenge ? sortiert[0] : sortiert[sortiert.length - 1];
};

/** Stufenpreis-Modell: jede Tonne zum Preis ihrer Stufe. */
export const berechneStufenpreisAnteile = (
  staffeln: Preisstaffel[],
  menge: number
): Array<{ staffel: Preisstaffel; tonnen: number }> => {
  const sortiert = sortiereStaffeln(staffeln);
  const anteile: Array<{ staffel: Preisstaffel; tonnen: number }> = [];
  for (let i = 0; i < sortiert.length; i++) {
    const s = sortiert[i];
    const untergrenze = i === 0 ? 0 : s.vonMenge;
    const naechste = sortiert[i + 1];
    const obergrenze = !istUnbegrenzt(s.bisMenge)
      ? (s.bisMenge as number)
      : naechste
        ? naechste.vonMenge
        : Infinity;
    const tonnen = Math.max(0, Math.min(menge, obergrenze) - untergrenze);
    if (tonnen > 0) anteile.push({ staffel: s, tonnen });
  }
  return anteile;
};

/**
 * Staffeln müssen lückenlos aneinanderschließen: „bis" der einen Stufe = „ab"
 * der nächsten, nur die letzte offen. Mit Lücken (bis 300 t, dann ab 400 t) oder
 * Überlappungen ist nicht definiert, welcher Preis für 350 t gilt.
 */
export const staffelnLueckenlos = (staffeln: Preisstaffel[]): boolean => {
  const sortiert = sortiereStaffeln(staffeln);
  for (let i = 0; i < sortiert.length; i++) {
    const s = sortiert[i];
    const naechste = sortiert[i + 1];
    if (!naechste) return true; // letzte Stufe: offen oder begrenzt, beides erlaubt
    if (istUnbegrenzt(s.bisMenge)) return false; // offene Stufe darf nur die letzte sein
    if ((s.bisMenge as number) !== naechste.vonMenge) return false;
  }
  return true;
};

/**
 * Bei „alle Sorten zusammen" müssen die Stufengrenzen je Sorte gleich sein,
 * sonst ist nicht definiert, welche Grenze für die gemeinsame Einstufung gilt.
 */
export const staffelGrenzenIdentisch = (artikel: StaffelArtikelFuerText[]): boolean => {
  if (artikel.length < 2) return true;
  const signatur = (a: StaffelArtikelFuerText) =>
    sortiereStaffeln(a.staffeln)
      .map((s) => `${s.vonMenge}-${istUnbegrenzt(s.bisMenge) ? 'inf' : s.bisMenge}`)
      .join('|');
  const erste = signatur(artikel[0]);
  return artikel.every((a) => signatur(a) === erste);
};

// ==================== TEXTBAUSTEINE ====================

const zeitraumText = (k: StaffelKonditionen): string => {
  const bis = formatDatumDe(k.zeitraumBis);
  const von = formatDatumDe(k.zeitraumVon);
  if (von && bis) return `im Zeitraum ${von} bis ${bis}`;
  if (bis) return `bis zum ${bis}`;
  if (von) return `ab dem ${von}`;
  return 'während der Saison';
};

const hatZeitraum = (k: StaffelKonditionen): boolean => !!(k.zeitraumVon || k.zeitraumBis);

/** „Zum Stichtag 31.10.2026" bzw. ohne Datum „Nach Saisonende". */
const stichtagSatzanfang = (k: StaffelKonditionen): string => {
  const bis = formatDatumDe(k.zeitraumBis);
  return bis ? `Zum Stichtag ${bis}` : 'Nach Saisonende';
};

const mengenbasisText = (k: StaffelKonditionen, anzahlArtikel: number): string => {
  if (anzahlArtikel < 2) return '';
  return k.mengenbasis === 'je-artikel'
    ? ' Die Einstufung erfolgt für jede Sorte getrennt.'
    : ' Für die Einstufung zählen alle angebotenen Sorten zusammen. Der Preis je Sorte ergibt sich aus der jeweiligen Staffeltabelle.';
};

const GRENZREGEL = ' Eine Stufengrenze zählt bereits zur höheren Stufe.';

/**
 * Beispielmenge oberhalb der zweiten Stufengrenze, aber noch innerhalb der
 * zweiten Stufe. Sonst nennt die Prosa Stufe 2 und die Rechnung enthält Stufe 3.
 */
const waehleBeispielMenge = (stufe2: Preisstaffel): number => {
  const schritt = stufe2.vonMenge >= 200 ? 50 : stufe2.vonMenge >= 40 ? 10 : 2;
  const kandidat = stufe2.vonMenge + schritt;
  if (istUnbegrenzt(stufe2.bisMenge) || kandidat < (stufe2.bisMenge as number)) return kandidat;
  const breite = (stufe2.bisMenge as number) - stufe2.vonMenge;
  return breite > 1 ? stufe2.vonMenge + Math.floor(breite / 2) : stufe2.vonMenge;
};

/** Beispielrechnung aus den echten Staffeln des ersten Artikels mit mindestens zwei Stufen. */
export const erzeugeStaffelBeispiel = (
  k: StaffelKonditionen,
  artikel: StaffelArtikelFuerText[]
): string | null => {
  const kandidat = artikel.find((a) => sortiereStaffeln(a.staffeln).length >= 2);
  if (!kandidat) return null;
  const sortiert = sortiereStaffeln(kandidat.staffeln);
  const stufe1 = sortiert[0];
  const stufe2 = sortiert[1];
  if (!(stufe1.einzelpreis > stufe2.einzelpreis) || stufe2.vonMenge <= 0) return null;
  // Mit Lücken oder Überlappungen wäre jede Beispielrechnung angreifbar.
  if (!staffelnLueckenlos(sortiert)) return null;
  // Mit einer Mindestabnahme („ab 20 t") würde das Beispiel der Tabelle darüber
  // widersprechen: berechneStufenpreisAnteile rechnet die erste Stufe bewusst
  // ab 0 t, die gedruckte Tabelle beginnt bei der Untergrenze. Lieber kein
  // Beispiel als zwei verschiedene Zahlen auf demselben Angebot.
  if (stufe1.vonMenge > 0) return null;

  const beispielMenge = waehleBeispielMenge(stufe2);
  const differenz = stufe1.einzelpreis - stufe2.einzelpreis;
  const name = kandidat.bezeichnung || kandidat.artikelnummer;
  const kopf = `Beispiel (${name}):`;

  switch (k.abrechnungsmodell) {
    case 'saisonbonus': {
      const betrag = beispielMenge * differenz;
      return (
        `${kopf}\nBei einer Gesamtabnahme von ${formatTonnen(beispielMenge)} gilt der Staffelpreis ab ${formatTonnen(stufe2.vonMenge)} von ${euroProTonne(stufe2.einzelpreis)} für alle ${formatTonnen(beispielMenge)}. ` +
        `Die Differenz von ${euroProTonne(differenz)} zum zunächst berechneten Preis von ${euroProTonne(stufe1.einzelpreis)} schreiben wir Ihnen gut: ` +
        `${formatTonnen(beispielMenge)} × ${euro(differenz)} = ${euro(betrag)} netto.`
      );
    }
    case 'sofortumstellung': {
      // Die Grenzlieferung wird schon zum neuen Preis berechnet, gutgeschrieben
      // werden nur die Tonnen DAVOR – sonst zählt die Grenzlieferung doppelt.
      const lieferung = stufe2.vonMenge >= 200 ? 25 : stufe2.vonMenge >= 40 ? 5 : 1;
      const davor = Math.max(0, stufe2.vonMenge - lieferung + Math.ceil(lieferung / 5));
      const danach = davor + lieferung;
      const betrag = davor * differenz;
      return (
        `${kopf}\nSie haben bisher ${formatTonnen(davor)} erhalten, berechnet zu ${euroProTonne(stufe1.einzelpreis)}. ` +
        `Die nächste Lieferung über ${formatTonnen(lieferung)} bringt die Gesamtabnahme auf ${formatTonnen(danach)}. ` +
        `Diese Lieferung berechnen wir bereits vollständig zu ${euroProTonne(stufe2.einzelpreis)}, und für die ${formatTonnen(davor)} davor erhalten Sie ${euroProTonne(differenz)} gutgeschrieben: ` +
        `${formatTonnen(davor)} × ${euro(differenz)} = ${euro(betrag)} netto.`
      );
    }
    case 'stufenpreis': {
      const anteile = berechneStufenpreisAnteile(sortiert, beispielMenge);
      const summe = anteile.reduce((s, a) => s + a.tonnen * a.staffel.einzelpreis, 0);
      const rechnung = anteile.map((a) => `${formatTonnen(a.tonnen)} × ${euro(a.staffel.einzelpreis)}`).join(' + ');
      return (
        `${kopf}\nDie ersten ${formatTonnen(stufe2.vonMenge)} berechnen wir zu ${euroProTonne(stufe1.einzelpreis)}, jede weitere Tonne ab ${formatTonnen(stufe2.vonMenge)} zu ${euroProTonne(stufe2.einzelpreis)}. ` +
        `Bei ${formatTonnen(beispielMenge)} ergibt das ${rechnung} = ${euro(summe)} netto.`
      );
    }
  }
};

/**
 * Der komplette Hinweistext für das Angebots-PDF. Absätze sind durch Leerzeilen
 * getrennt; eine kurze erste Zeile mit Doppelpunkt ist eine Überschrift.
 */
export const erzeugeStaffelHinweistext = (
  k: StaffelKonditionen,
  artikel: StaffelArtikelFuerText[]
): string => {
  const zeitraum = zeitraumText(k);
  const basis = mengenbasisText(k, artikel.length);
  const ausserhalb = hatZeitraum(k)
    ? ' Lieferungen außerhalb dieses Zeitraums sind von dieser Staffelvereinbarung nicht erfasst.'
    : '';
  const jeSorte =
    artikel.length > 1 && k.mengenbasis === 'gesamt'
      ? ' Die Differenz ermitteln wir je Sorte aus deren Staffeltabelle.'
      : '';
  const gutschriftForm =
    ' Die Gutschrift weist die Umsatzsteuer aus, nennt die betroffenen Rechnungen und wird mit offenen Forderungen verrechnet. Ein verbleibender Betrag wird innerhalb von 14 Tagen nach Gutschriftsdatum ausgezahlt.';
  const absaetze: string[] = [];

  switch (k.abrechnungsmodell) {
    case 'saisonbonus':
      absaetze.push(
        `So funktioniert die Staffelung:\nMaßgeblich ist die Gesamtabnahmemenge ${zeitraum}. Die erreichte Preisstufe gilt rückwirkend für die gesamte in diesem Zeitraum gelieferte Menge, nicht nur für die Mehrmenge.${GRENZREGEL}${basis}${ausserhalb}`
      );
      absaetze.push(
        `Abrechnung:\nJede Lieferung berechnen wir zunächst zum Preis der ersten Stufe. ${stichtagSatzanfang(k)} stellen wir die Gesamtabnahmemenge fest. Liegt sie in einer höheren Stufe, erhalten Sie die Differenz zwischen dem berechneten Preis und dem erreichten Staffelpreis für alle gelieferten Tonnen als Gutschrift (Staffelbonus).${jeSorte}${gutschriftForm}`
      );
      break;
    case 'sofortumstellung':
      absaetze.push(
        `So funktioniert die Staffelung:\nMaßgeblich ist die Gesamtabnahmemenge ${zeitraum}. Die erreichte Preisstufe gilt rückwirkend für die gesamte in diesem Zeitraum gelieferte Menge.${GRENZREGEL}${basis}${ausserhalb}`
      );
      absaetze.push(
        `Abrechnung:\nJede Lieferung berechnen wir zum Preis der Stufe, die mit ihr erreicht ist. Die Lieferung, mit der die Gesamtabnahmemenge eine Stufengrenze erreicht oder überschreitet, berechnen wir bereits vollständig zum Preis der neuen Stufe. Für alle davor gelieferten Tonnen erhalten Sie die Differenz zum neuen Preis zeitnah als Ausgleichsgutschrift.${jeSorte}${gutschriftForm}`
      );
      break;
    case 'stufenpreis':
      absaetze.push(
        `So funktioniert die Staffelung:\nMaßgeblich ist die Gesamtabnahmemenge ${zeitraum}. Jede Preisstufe gilt für die Menge innerhalb dieser Stufe. Bereits gelieferte Mengen werden nicht nachträglich günstiger.${GRENZREGEL}${basis}${ausserhalb}`
      );
      absaetze.push(
        `Abrechnung:\nJede Lieferung berechnen wir zum Preis der Stufe, in die die jeweilige Tonne fällt. Überschreitet eine Lieferung eine Stufengrenze, berechnen wir die Tonnen bis zur Grenze zum bisherigen und die Tonnen ab der Grenze zum neuen Preis. Eine nachträgliche Gutschrift erfolgt nicht.`
      );
      break;
  }

  const beispiel = erzeugeStaffelBeispiel(k, artikel);
  if (beispiel) absaetze.push(beispiel);

  const schluss: string[] = ['Maßgeblich sind die tatsächlich gelieferten und berechneten Mengen laut Wiegeschein.'];
  if (k.abrechnungsmodell !== 'stufenpreis' && k.gutschriftNurBeiZahlung) {
    schluss.push(
      'Voraussetzung für die Gutschrift ist, dass die zugrunde liegenden Rechnungen bei Erstellung der Gutschrift vollständig bezahlt sind.'
    );
  }
  schluss.push('Alle Preise verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer.');
  absaetze.push(schluss.join(' '));

  return absaetze.join('\n\n');
};

/** Kopfzeile des Staffelblocks im PDF. */
export const staffelKopfzeile = (k: StaffelKonditionen): string =>
  k.abrechnungsmodell === 'stufenpreis'
    ? 'STAFFELPREISE - Stufenpreise nach Abnahmemenge'
    : 'STAFFELPREISE - Mengenrabatt nach Gesamtabnahme';

/**
 * Für welchen Beleg wird der Text erzeugt? Die Auftragsbestätigung bestätigt,
 * wo das Angebot anbietet – der Rest ist wortgleich, damit der Kunde Angebot
 * und AB nebeneinanderlegen kann.
 */
export type StaffelBelegart = 'angebot' | 'auftragsbestaetigung';

/** Einleitungssatz über den Staffeltabellen. */
export const staffelEinleitung = (
  k: StaffelKonditionen,
  belegart: StaffelBelegart = 'angebot'
): string =>
  belegart === 'auftragsbestaetigung'
    ? `Für Lieferungen ${zeitraumText(k)} gelten die folgenden Staffelpreise:`
    : `Die folgenden Staffelpreise gelten für Lieferungen ${zeitraumText(k)}:`;

/**
 * Bestätigungssatz der Auftragsbestätigung. Er sagt ausdrücklich, dass keine
 * Abnahmemenge vereinbart ist – sonst liest sich eine verbindliche Zusage wie
 * eine Abnahmeverpflichtung.
 */
export const staffelBestaetigungssatz = (
  k: StaffelKonditionen,
  hatVereinspositionen: boolean
): string => {
  if (hatVereinspositionen) {
    return 'vielen Dank für Ihre Beauftragung. Wir bestätigen Ihnen hiermit die nachstehenden Lieferungen sowie die für Ihre weiteren Abrufe geltende Staffelpreisvereinbarung.';
  }
  const zeitraum = hatZeitraum(k) ? ` für Ihre Abrufe ${zeitraumText(k)}` : ' für Ihre Abrufe';
  const schluss =
    k.abrechnungsmodell === 'stufenpreis'
      ? ' Eine feste Abnahmemenge ist nicht vereinbart; maßgeblich ist die Stufe, in die die jeweilige Tonne fällt.'
      : ' Eine feste Abnahmemenge ist nicht vereinbart; maßgeblich ist die tatsächliche Abnahme.';
  return `vielen Dank für Ihre Beauftragung. Hiermit bestätigen wir Ihnen verbindlich die nachstehende Staffelpreisvereinbarung${zeitraum}.${schluss}`;
};

/** Betreffzeile unter der Belegnummer. */
export const staffelBetreffzeile = (k: StaffelKonditionen, saisonjahr: number): string => {
  const jahr = k.zeitraumBis ? new Date(k.zeitraumBis).getFullYear() : saisonjahr;
  return `Staffelpreisvereinbarung Saison ${Number.isFinite(jahr) ? jahr : saisonjahr}`;
};

/** Zeilen für den Informationsblock des Belegs (nicht zu verwechseln mit „Gültig bis"). */
export const staffelInfoblockZeilen = (k: StaffelKonditionen): Array<{ label: string; wert: string }> => {
  const zeilen: Array<{ label: string; wert: string }> = [];
  const von = formatDatumDe(k.zeitraumVon);
  const bis = formatDatumDe(k.zeitraumBis);
  if (von && bis) zeilen.push({ label: 'Abnahmezeitraum:', wert: `${von} – ${bis}` });
  else if (bis) zeilen.push({ label: 'Abnahme bis:', wert: bis });
  if (bis && k.abrechnungsmodell !== 'stufenpreis') zeilen.push({ label: 'Stichtag:', wert: bis });
  return zeilen;
};

/** Lieferbedingungen einer Vereinbarung ohne feste Lieferliste. */
export const staffelAbrufhinweis = (k: StaffelKonditionen): string[] => [
  hatZeitraum(k)
    ? `Lieferung auf Abruf ${zeitraumText(k)}.`
    : 'Lieferung auf Abruf innerhalb der vereinbarten Saison.',
  'Die Einzeltermine werden je Abruf mit unserer Disposition abgestimmt.',
];

/** Titel der Box, die bei Staffelangeboten an die Stelle der Summe tritt. */
export const staffelKurzfassungTitel = (belegart: StaffelBelegart = 'angebot'): string =>
  belegart === 'auftragsbestaetigung' ? 'So wird abgerechnet' : 'Preisberechnung nach Staffel';

/** Zusatzzeile auf der Bestätigung: warum dort keine Summe steht. */
export const STAFFEL_KEINE_SUMME =
  'Eine Gesamtsumme wird nicht ausgewiesen, da keine feste Abnahmemenge vereinbart ist. Abgerechnet wird je Lieferung nach dem tatsächlichen Gewicht laut Wiegeschein.';

/** Zwei kurze Zeilen für die Box anstelle der Angebotssumme. */
export const staffelKurzfassung = (k: StaffelKonditionen): string[] => {
  switch (k.abrechnungsmodell) {
    case 'saisonbonus':
      return [
        'Jede Lieferung wird zum Preis der ersten Stufe berechnet.',
        `${stichtagSatzanfang(k)} erhalten Sie den Staffelbonus für die gesamte Menge als Gutschrift.`,
      ];
    case 'sofortumstellung':
      return [
        'Jede Lieferung wird zum Preis der mit ihr erreichten Stufe berechnet.',
        'Beim Erreichen einer neuen Stufe gleichen wir die davor gelieferten Tonnen per Gutschrift aus.',
      ];
    case 'stufenpreis':
      return [
        'Jede Tonne wird zum Preis ihrer Stufe berechnet.',
        'Der Gesamtbetrag ergibt sich aus der tatsächlichen Abnahmemenge. Es gibt keine nachträgliche Gutschrift.',
      ];
  }
};
