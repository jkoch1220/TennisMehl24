import { SaisonKunde } from './saisonplanung';

/** Ein erkanntes Duplikat-Kandidatenpaar (zwei mutmaßlich identische saison_kunden). */
export interface DuplikatPaar {
  /** stabiler Schlüssel (sortierte ids) */
  id: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  aKundennummer?: string;
  bKundennummer?: string;
  plz: string;
  ort: string;
  /** 0..1 – Konfidenz, dass es dasselbe ist */
  score: number;
  signale: string[];
}

/** IDs aller Kind-Datensätze, die beim Merge auf den Survivor umgehängt wurden (für Restore). */
export interface MergeReferenzen {
  ansprechpartner: string[];
  saisonDaten: string[];
  saisonAktivitaeten: string[];
  kundenAktivitaeten: string[];
  siebanalysen: string[];
  beziehungenVerein: string[];
  beziehungenPlatzbauer: string[];
  projekte: string[];
  platzbauerProjekte: string[];
  instandsetzung: string[];
}

/** Zählung der Referenzen je Kunde (für die Vorschau). */
export interface ReferenzZaehlung {
  ansprechpartner: number;
  saisonDaten: number;
  aktivitaeten: number;
  beziehungen: number;
  projekte: number;
}

/** Kontext für die Merge-Vorschau: beide Kunden + Referenz-Zählungen. */
export interface MergeKontext {
  a: SaisonKunde;
  b: SaisonKunde;
  referenzenA: ReferenzZaehlung;
  referenzenB: ReferenzZaehlung;
}

/** Ergebnis eines Merges. */
export interface MergeErgebnis {
  archivId: string;
  survivorId: string;
  loserId: string;
  repointed: MergeReferenzen;
  konflikte: string[];
}

/** Archiv-Eintrag eines Merges (für Wiederherstellung). */
export interface MergeArchivEintrag {
  id: string;
  survivorId: string;
  loserId: string;
  survivorName: string;
  loserName: string;
  zeitpunkt: string;
  benutzer?: string;
  rueckgaengig: boolean;
}
