// Gemeinsame UI-Bausteine des Massen-Angebots-Tools (Liste, Detail-Panel,
// Vorschlagsliste): Labels, Badges und Formatierung.
// Der Bestätigungsdialog liegt in MassenAngebotBestaetigungsDialog.tsx.

import {
  KandidatStatus,
  MassenAngebotKandidat,
  Produktprofil,
  ReferenzTyp,
} from '../../types/massenAngebot';

export const eur = (wert: number) =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const STATUS_BADGE: Record<KandidatStatus, { label: string; className: string }> = {
  neu: {
    label: 'neu',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  existiert: {
    label: 'existiert bereits',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  fehler: {
    label: 'Fehler/prüfen',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  manuell: {
    label: 'manuell prüfen',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

export const PROFIL_BADGE: Record<Produktprofil, { label: string; className: string }> = {
  schuettgut: {
    label: 'Schüttgut',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  paletten: {
    label: 'Paletten',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  },
  gemischt: {
    label: 'Gemischt',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
};

export const REFERENZ_TYP_LABEL: Record<ReferenzTyp, string> = {
  auftragsbestaetigung: 'AB',
  rechnung: 'Rechnung',
  angebot: 'Angebot',
  mosaik: 'Mosaik',
};

/** Quellen-Label inkl. Referenzjahr („alte Referenz (Mosaik 2023)" etc.). */
export function quelleLabel(kandidat: MassenAngebotKandidat): string {
  switch (kandidat.quelle) {
    case 'vorjahr':
      return kandidat.referenz?.jahr ? `Vorjahr ${kandidat.referenz.jahr}` : 'Vorjahr';
    case 'mosaik':
      return kandidat.referenz?.jahr
        ? `alte Referenz (Mosaik ${kandidat.referenz.jahr})`
        : 'alte Referenz (Mosaik)';
    case 'plz_kalkulation':
      return 'PLZ-Kalkulation';
    default:
      return '—';
  }
}

/** Kurzform der Referenz für die Liste, z.B. „2025 · 12 t · 1.480,00 € (AB)". */
export function referenzKurzLabel(kandidat: MassenAngebotKandidat): string | null {
  const referenz = kandidat.referenz;
  if (!referenz) return null;
  const teile: string[] = [];
  if (referenz.tonnage > 0) teile.push(`${referenz.tonnage.toLocaleString('de-DE')} t`);
  teile.push(eur(referenz.wert));
  const jahr = referenz.jahr ? `${referenz.jahr} · ` : '';
  return `${jahr}${teile.join(' · ')} (${REFERENZ_TYP_LABEL[referenz.typ]})`;
}

/**
 * Wo stehe ich beim Durchgehen, und wer sind die Nachbarn?
 *
 * Zwei Listen, mit Absicht getrennt:
 * - `zeilen` ist der volle Bestand. Die geöffnete Zeile kommt von hier, damit
 *   sie nicht verschwindet, sobald eine Bearbeitung sie aus dem aktiven Filter
 *   fallen lässt (E-Mail eintragen im Filter „Ohne E-Mail" ist der Normalfall,
 *   nicht die Ausnahme).
 * - `reihenfolge` ist der beim Öffnen eingefrorene Filterstand. Er bestimmt
 *   Position und Nachbarn und bleibt bis zum Schließen stabil.
 */
export function bestimmeDurchgang<T extends { id: string }>(
  zeilen: T[],
  reihenfolge: string[],
  detailId: string | null
): { zeile: T | null; nummer: number; gesamt: number; vorherId?: string; naechsteId?: string } {
  if (!detailId) return { zeile: null, nummer: 0, gesamt: reihenfolge.length };
  const zeile = zeilen.find((z) => z.id === detailId) ?? null;
  const index = reihenfolge.indexOf(detailId);
  return {
    zeile,
    nummer: index + 1,
    gesamt: reihenfolge.length,
    vorherId: index > 0 ? reihenfolge[index - 1] : undefined,
    naechsteId: index >= 0 && index < reihenfolge.length - 1 ? reihenfolge[index + 1] : undefined,
  };
}
