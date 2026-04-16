/**
 * Bank-Import-Parser: CSV (Sparkasse, Volksbank, DKB, Commerzbank, ING) und MT940
 * Erkennt automatisch das Format und liefert normalisierte Transaktionen.
 */

export interface BankTransaktion {
  id: string;              // stabile ID innerhalb Import (Hash aus Datum+Betrag+VWZ)
  datum: string;           // YYYY-MM-DD (Buchungsdatum)
  valutaDatum?: string;
  betrag: number;          // positiv = Eingang, negativ = Ausgang
  waehrung: string;
  auftraggeber?: string;   // Gegenkonto (creditorName/debtorName)
  iban?: string;
  verwendungszweck: string;
  rohzeile?: string;       // original row für Debug
}

export interface ParseErgebnis {
  transaktionen: BankTransaktion[];
  format: 'csv-sparkasse' | 'csv-generic' | 'mt940' | 'camt' | 'unknown';
  fehler: string[];
}

// Stabile ID aus den Feldern
const berechneId = (datum: string, betrag: number, vwz: string): string => {
  const raw = `${datum}|${betrag.toFixed(2)}|${vwz.substring(0, 80)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `tx_${Math.abs(hash).toString(36)}`;
};

// Deutsche Beträge: "1.234,56" oder "-1.234,56" → 1234.56
const parseDeutscherBetrag = (s: string): number => {
  if (!s) return 0;
  const bereinigt = s
    .replace(/\s/g, '')
    .replace(/[€$]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const n = parseFloat(bereinigt);
  return isNaN(n) ? 0 : n;
};

// Datum aus DD.MM.YYYY oder YYYY-MM-DD → YYYY-MM-DD
const normalisiereDatum = (s: string): string => {
  if (!s) return '';
  const trimmed = s.trim();
  // DD.MM.YYYY oder DD.MM.YY
  const dmYMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmYMatch) {
    let [, d, m, y] = dmYMatch;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // YYYY/MM/DD
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
  return trimmed;
};

// CSV-Zeile parsen (mit quoted fields)
const parseCsvZeile = (zeile: string, trenner: string): string[] => {
  const felder: string[] = [];
  let aktuell = '';
  let inQuotes = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inQuotes && zeile[i + 1] === '"') {
        aktuell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === trenner && !inQuotes) {
      felder.push(aktuell);
      aktuell = '';
    } else {
      aktuell += c;
    }
  }
  felder.push(aktuell);
  return felder.map(f => f.trim().replace(/^"|"$/g, ''));
};

// Erkenne Trenner (; oder ,)
const erkenneTrenner = (zeile: string): string => {
  const semi = (zeile.match(/;/g) || []).length;
  const komma = (zeile.match(/,/g) || []).length;
  return semi >= komma ? ';' : ',';
};

// Finde Index einer Spalte per Name (case-insensitive, fuzzy)
const findeSpalte = (header: string[], namen: string[]): number => {
  for (const name of namen) {
    const idx = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseCSV = (text: string): ParseErgebnis => {
  const zeilen = text.split(/\r?\n/).filter(z => z.trim().length > 0);
  if (zeilen.length < 2) {
    return { transaktionen: [], format: 'unknown', fehler: ['Leere oder zu kurze CSV-Datei'] };
  }

  // Bei Sparkasse/Volksbank stehen oft Kopfzeilen vor der eigentlichen Tabelle.
  // Finde die Zeile, die "Buchungstag" oder "Datum" UND "Betrag" enthält.
  let headerZeileIdx = -1;
  let trenner = ';';
  for (let i = 0; i < Math.min(zeilen.length, 15); i++) {
    const z = zeilen[i].toLowerCase();
    if (
      (z.includes('buchungstag') || z.includes('buchungsdatum') || z.includes('datum')) &&
      (z.includes('betrag') || z.includes('umsatz'))
    ) {
      headerZeileIdx = i;
      trenner = erkenneTrenner(zeilen[i]);
      break;
    }
  }
  if (headerZeileIdx < 0) {
    return {
      transaktionen: [],
      format: 'unknown',
      fehler: ['Keine Header-Zeile mit Datum/Betrag erkannt. Bitte Original-CSV aus dem Online-Banking verwenden.'],
    };
  }

  const header = parseCsvZeile(zeilen[headerZeileIdx], trenner);

  // Spalten-Mapping
  const idxDatum = findeSpalte(header, ['Buchungstag', 'Buchungsdatum', 'Valuta', 'Datum']);
  const idxValuta = findeSpalte(header, ['Valuta', 'Wertstellung']);
  const idxBetrag = findeSpalte(header, ['Betrag', 'Umsatz']);
  const idxSH = findeSpalte(header, ['Soll/Haben', 'S/H']); // alte Sparkasse
  const idxVwz = findeSpalte(header, ['Verwendungszweck', 'Verwendungszw', 'Beschreibung']);
  const idxAuftraggeber = findeSpalte(header, [
    'Beguenstigter',
    'Begünstigter',
    'Zahlungsempfänger',
    'Zahlungsempfaenger',
    'Auftraggeber',
    'Name',
    'Kontoinhaber',
  ]);
  const idxIban = findeSpalte(header, ['IBAN', 'Kontonummer']);
  const idxWaehrung = findeSpalte(header, ['Waehrung', 'Währung']);

  if (idxDatum < 0 || idxBetrag < 0) {
    return {
      transaktionen: [],
      format: 'unknown',
      fehler: [`Pflichtspalten nicht gefunden. Header: ${header.join(', ')}`],
    };
  }

  const istSparkasse = header.some(h => h.toLowerCase().includes('auftragskonto'));
  const format = istSparkasse ? 'csv-sparkasse' : 'csv-generic';

  const transaktionen: BankTransaktion[] = [];
  const fehler: string[] = [];

  for (let i = headerZeileIdx + 1; i < zeilen.length; i++) {
    const felder = parseCsvZeile(zeilen[i], trenner);
    if (felder.length < 2) continue;

    const datum = normalisiereDatum(felder[idxDatum] || '');
    if (!datum) continue;

    let betrag = parseDeutscherBetrag(felder[idxBetrag] || '0');
    if (idxSH >= 0) {
      const sh = (felder[idxSH] || '').toUpperCase();
      if (sh === 'S') betrag = -Math.abs(betrag);
      else if (sh === 'H') betrag = Math.abs(betrag);
    }

    const vwz = idxVwz >= 0 ? felder[idxVwz] || '' : '';
    const auftraggeber = idxAuftraggeber >= 0 ? felder[idxAuftraggeber] || '' : '';
    const iban = idxIban >= 0 ? felder[idxIban] || '' : '';
    const waehrung = idxWaehrung >= 0 && felder[idxWaehrung] ? felder[idxWaehrung] : 'EUR';
    const valutaDatum = idxValuta >= 0 ? normalisiereDatum(felder[idxValuta] || '') : undefined;

    transaktionen.push({
      id: berechneId(datum, betrag, vwz),
      datum,
      valutaDatum,
      betrag,
      waehrung,
      auftraggeber: auftraggeber || undefined,
      iban: iban || undefined,
      verwendungszweck: vwz,
      rohzeile: zeilen[i],
    });
  }

  return { transaktionen, format, fehler };
};

// MT940 Parser (SWIFT-Format, :61: = Umsatz, :86: = VWZ)
const parseMT940 = (text: string): ParseErgebnis => {
  const transaktionen: BankTransaktion[] = [];
  const fehler: string[] = [];

  // Zeilen-Join: in MT940 können 86: Blöcke über mehrere Zeilen gehen bis zum nächsten :tag:
  const bloecke = text.split(/\n(?=:)/);

  let aktuell: Partial<BankTransaktion> | null = null;

  for (const block of bloecke) {
    const m = block.match(/^:(\d{2}[A-Z]?):/);
    if (!m) continue;
    const tag = m[1];
    const rest = block.substring(m[0].length).trim().replace(/\n/g, ' ');

    if (tag === '61') {
      // Format: YYMMDD[MMDD]CR/DR[R]Betrag z.B. 240315C1234,56NTRFNONREF
      const um = rest.match(/^(\d{6})(\d{4})?([CD])R?(\d+,\d{2})/);
      if (um) {
        const [, jmd, , cd, betragStr] = um;
        const jahr = `20${jmd.substring(0, 2)}`;
        const monat = jmd.substring(2, 4);
        const tagD = jmd.substring(4, 6);
        const datum = `${jahr}-${monat}-${tagD}`;
        const betragNum = parseDeutscherBetrag(betragStr) * (cd === 'D' ? -1 : 1);
        if (aktuell) {
          aktuell.id = berechneId(aktuell.datum || '', aktuell.betrag || 0, aktuell.verwendungszweck || '');
          transaktionen.push(aktuell as BankTransaktion);
        }
        aktuell = {
          datum,
          betrag: betragNum,
          waehrung: 'EUR',
          verwendungszweck: '',
        };
      }
    } else if (tag === '86' && aktuell) {
      // Sub-Felder ?20-?29 = VWZ, ?32/?33 = Name
      const vwzTeile: string[] = [];
      const nameTeile: string[] = [];
      const subs = rest.split('?');
      for (const sub of subs) {
        const subTag = sub.substring(0, 2);
        const subInhalt = sub.substring(2).trim();
        if (/^2\d$/.test(subTag)) vwzTeile.push(subInhalt);
        else if (subTag === '32' || subTag === '33') nameTeile.push(subInhalt);
      }
      aktuell.verwendungszweck = vwzTeile.join(' ').trim();
      if (nameTeile.length > 0) aktuell.auftraggeber = nameTeile.join(' ').trim();
    }
  }

  if (aktuell) {
    aktuell.id = berechneId(aktuell.datum || '', aktuell.betrag || 0, aktuell.verwendungszweck || '');
    transaktionen.push(aktuell as BankTransaktion);
  }

  if (transaktionen.length === 0) {
    fehler.push('Keine Transaktionen in MT940-Datei gefunden.');
  }

  return { transaktionen, format: 'mt940', fehler };
};

export const parseBankImport = (text: string, dateiName?: string): ParseErgebnis => {
  const name = (dateiName || '').toLowerCase();

  // MT940 an Extension oder ":61:" im Content erkennen
  if (name.endsWith('.sta') || name.endsWith('.mt940') || /^:20:/m.test(text) || /\n:61:/m.test(text)) {
    return parseMT940(text);
  }

  return parseCSV(text);
};

// === MATCHING ===

export interface DebitorKandidat {
  projektId: string;
  rechnungsnummer?: string;
  kundenname: string;
  offenerBetrag: number;
}

export interface MatchErgebnis {
  transaktion: BankTransaktion;
  vorschlaege: Array<{
    debitor: DebitorKandidat;
    score: number;       // 0-100
    gruende: string[];   // "Betrag exakt", "Rechnungsnr. gefunden", ...
  }>;
}

const normalisiereText = (s: string | undefined): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim();

// Token-basiertes Überlappungs-Matching für Kundennamen
const nameUeberlappung = (a: string, b: string): number => {
  const ta = new Set(normalisiereText(a).split(' ').filter(w => w.length >= 3));
  const tb = new Set(normalisiereText(b).split(' ').filter(w => w.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let treffer = 0;
  for (const w of ta) if (tb.has(w)) treffer++;
  return treffer / Math.min(ta.size, tb.size);
};

export const matcheTransaktionen = (
  transaktionen: BankTransaktion[],
  debitoren: DebitorKandidat[]
): MatchErgebnis[] => {
  // Nur Eingänge matchen (positive Beträge)
  const eingaenge = transaktionen.filter(t => t.betrag > 0);

  return eingaenge.map((tx) => {
    const vwzNorm = normalisiereText(tx.verwendungszweck);
    const auftragsgeberNorm = normalisiereText(tx.auftraggeber);
    const kombiniert = `${vwzNorm} ${auftragsgeberNorm}`;

    const bewertet = debitoren
      .map((d) => {
        let score = 0;
        const gruende: string[] = [];

        // 1. Rechnungsnummer im VWZ (größter Score)
        if (d.rechnungsnummer) {
          const rn = d.rechnungsnummer.toLowerCase();
          const rnDigits = rn.replace(/[^0-9]/g, '');
          if (kombiniert.includes(rn)) {
            score += 60;
            gruende.push(`Rechnungsnr. ${d.rechnungsnummer} im Verwendungszweck`);
          } else if (rnDigits.length >= 4 && kombiniert.replace(/[^0-9]/g, '').includes(rnDigits)) {
            score += 45;
            gruende.push(`Rechnungsnr. ${d.rechnungsnummer} (Ziffern) im Verwendungszweck`);
          }
        }

        // 2. Betrag exakt = offener Betrag
        const diff = Math.abs(tx.betrag - d.offenerBetrag);
        if (diff < 0.01) {
          score += 35;
          gruende.push('Betrag exakt wie offener Betrag');
        } else if (diff < 1) {
          score += 20;
          gruende.push(`Betrag nahe offener Betrag (Δ ${diff.toFixed(2)} €)`);
        }

        // 3. Kundenname-Überlappung
        const namenUeberlappung = nameUeberlappung(d.kundenname, tx.auftraggeber || tx.verwendungszweck);
        if (namenUeberlappung >= 0.5) {
          score += Math.round(25 * namenUeberlappung);
          gruende.push(`Kundenname passt (${Math.round(namenUeberlappung * 100)}%)`);
        }

        return { debitor: d, score, gruende };
      })
      .filter((v) => v.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return { transaktion: tx, vorschlaege: bewertet };
  });
};
