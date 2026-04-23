/**
 * vCard 3.0 Export
 *
 * Erzeugt einen vCard-String (.vcf) aus SaisonKunden + Ansprechpartnern.
 * Kompatibel mit iOS Contacts, Android (Google Contacts), macOS Kontakte.
 */

import type {
  Ansprechpartner,
  SaisonKunde,
  SaisonKundeMitDaten,
  Telefonnummer,
} from '../types/saisonplanung';
import type { Adresse } from '../types/dispo';

// RFC 2426: , ; \ und Newline müssen escaped werden
const escape = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

/**
 * Mappt unsere freien Telefon-Typen auf vCard-TYPE-Parameter.
 * Unbekannte Werte fallen auf VOICE zurück.
 */
const telTypeParam = (typ?: string): string => {
  const t = (typ || '').trim().toLowerCase();
  if (t.startsWith('mob') || t === 'handy' || t === 'cell') return 'CELL,VOICE';
  if (t.startsWith('büro') || t.startsWith('buero') || t === 'work' || t === 'arbeit') return 'WORK,VOICE';
  if (t.startsWith('fest') || t === 'home' || t === 'privat') return 'HOME,VOICE';
  if (t === 'fax') return 'FAX';
  return 'VOICE';
};

/**
 * "Max Mustermann" → { given: "Max", family: "Mustermann" }
 * "Dr. Anna Schmidt" → { given: "Dr. Anna", family: "Schmidt" }
 * "Cher" → { given: "", family: "Cher" }
 */
const parseName = (fullName: string): { given: string; family: string } => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { given: '', family: parts[0] };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
};

const formatAdresse = (adresse: Adresse | undefined, typ: 'WORK' | 'HOME'): string | null => {
  if (!adresse?.strasse && !adresse?.ort) return null;
  // ADR: PO Box ; Extended ; Street ; Locality ; Region ; Postal Code ; Country
  const parts = [
    '',
    '',
    escape(adresse.strasse || ''),
    escape(adresse.ort || ''),
    escape(adresse.bundesland || ''),
    escape(adresse.plz || ''),
    escape(adresse.land || 'DE'),
  ];
  return `ADR;TYPE=${typ}:${parts.join(';')}`;
};

const buildTelLines = (telefonnummern: Telefonnummer[] | undefined, fallback?: string): string[] => {
  const lines: string[] = [];
  if (telefonnummern?.length) {
    for (const tel of telefonnummern) {
      if (!tel.nummer?.trim()) continue;
      lines.push(`TEL;TYPE=${telTypeParam(tel.typ)}:${escape(tel.nummer.trim())}`);
    }
  }
  if (!lines.length && fallback?.trim()) {
    lines.push(`TEL;TYPE=VOICE:${escape(fallback.trim())}`);
  }
  return lines;
};

/**
 * Erzeugt eine vCard pro Ansprechpartner des Kunden.
 * Zusätzlich: Wenn der Kunde keine aktiven Ansprechpartner hat,
 * wird eine "Visitenkarte" für den Verein selbst erstellt
 * (sofern `includeKundenOhneAnsprechpartner` = true).
 */
const buildVCardsForKunde = (
  kunde: SaisonKunde,
  ansprechpartner: Ansprechpartner[],
  options: { nurAktive: boolean; includeKundenOhneAnsprechpartner: boolean },
): string[] => {
  const relevante = options.nurAktive ? ansprechpartner.filter((a) => a.aktiv) : ansprechpartner;
  const cards: string[] = [];

  const orgName = kunde.name || '(Ohne Name)';
  const adrLine = formatAdresse(kunde.lieferadresse || kunde.rechnungsadresse, 'WORK');

  for (const a of relevante) {
    if (!a.name?.trim()) continue;
    const { given, family } = parseName(a.name);

    const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push(`N:${escape(family)};${escape(given)};;;`);
    lines.push(`FN:${escape(a.name.trim())}`);
    lines.push(`ORG:${escape(orgName)}`);
    if (a.rolle?.trim()) lines.push(`TITLE:${escape(a.rolle.trim())}`);
    if (a.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escape(a.email.trim())}`);
    lines.push(...buildTelLines(a.telefonnummern));
    if (adrLine) lines.push(adrLine);
    if (a.notizen?.trim()) lines.push(`NOTE:${escape(a.notizen.trim())}`);
    lines.push(`UID:tm-ap-${a.id}`);
    if (a.geaendertAm) lines.push(`REV:${a.geaendertAm}`);
    lines.push('CATEGORIES:Tennismehl,' + (kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'));
    lines.push('END:VCARD');
    cards.push(lines.join('\r\n'));
  }

  if (!relevante.length && options.includeKundenOhneAnsprechpartner) {
    const dispoTel = kunde.dispoAnsprechpartner?.telefon?.trim();
    const hasContact = Boolean(kunde.email?.trim() || dispoTel);
    if (hasContact) {
      const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
      lines.push(`N:${escape(orgName)};;;;`);
      lines.push(`FN:${escape(orgName)}`);
      lines.push(`ORG:${escape(orgName)}`);
      if (kunde.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escape(kunde.email.trim())}`);
      if (dispoTel) lines.push(`TEL;TYPE=VOICE:${escape(dispoTel)}`);
      if (adrLine) lines.push(adrLine);
      lines.push(`UID:tm-kunde-${kunde.id}`);
      if (kunde.geaendertAm) lines.push(`REV:${kunde.geaendertAm}`);
      lines.push('CATEGORIES:Tennismehl,' + (kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'));
      lines.push('END:VCARD');
      cards.push(lines.join('\r\n'));
    }
  }

  return cards;
};

export interface VCardExportOptions {
  nurAktiveAnsprechpartner?: boolean;     // default: true
  typFilter?: 'alle' | 'verein' | 'platzbauer'; // default: 'alle'
  includeKundenOhneAnsprechpartner?: boolean; // default: true
}

export interface VCardExportStats {
  kundenGesamt: number;
  kundenMitExport: number;
  vcardsErstellt: number;
}

export interface VCardExportResult {
  vcf: string;
  stats: VCardExportStats;
}

/**
 * Hauptfunktion: Baut den kompletten .vcf-Inhalt zusammen.
 */
export const generiereVCardExport = (
  kundenMitDaten: SaisonKundeMitDaten[],
  options: VCardExportOptions = {},
): VCardExportResult => {
  const nurAktive = options.nurAktiveAnsprechpartner ?? true;
  const typFilter = options.typFilter ?? 'alle';
  const includeKundenOhneAnsprechpartner = options.includeKundenOhneAnsprechpartner ?? true;

  const gefiltert = kundenMitDaten.filter(({ kunde }) => {
    if (!kunde.aktiv) return false;
    if (typFilter === 'alle') return true;
    return kunde.typ === typFilter;
  });

  const allCards: string[] = [];
  let kundenMitExport = 0;

  for (const { kunde, ansprechpartner } of gefiltert) {
    const cards = buildVCardsForKunde(kunde, ansprechpartner, {
      nurAktive,
      includeKundenOhneAnsprechpartner,
    });
    if (cards.length > 0) {
      kundenMitExport += 1;
      allCards.push(...cards);
    }
  }

  return {
    vcf: allCards.join('\r\n') + (allCards.length ? '\r\n' : ''),
    stats: {
      kundenGesamt: gefiltert.length,
      kundenMitExport,
      vcardsErstellt: allCards.length,
    },
  };
};

/**
 * Triggert den Browser-Download einer .vcf-Datei.
 */
export const downloadVCard = (vcf: string, filename?: string): void => {
  const name = filename ?? `Tennismehl_Kontakte_${new Date().toISOString().split('T')[0]}.vcf`;
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
