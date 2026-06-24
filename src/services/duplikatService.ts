// Duplikat-Erkennung und sicheres Zusammenführen (Merge) von saison_kunden.
//
// Sicherheitsprinzip "KEINE DATEN VERLOREN":
//   1. Vor dem Löschen wird der komplette Verlierer-Datensatz + der Survivor-Stand
//      VORHER + alle umgehängten Kind-IDs in `kunden_merge_archiv` gesichert.
//   2. Alle Kind-Referenzen (Ansprechpartner, Saisondaten, Beziehungen, Aktivitäten,
//      Siebanalysen, Projekte, Platzbauer-Projekte, Instandsetzung) werden auf den
//      Survivor umgehängt – nichts wird gelöscht außer dem (leeren) Verlierer-Kunden.
//   3. Felder werden vereinigt (Arrays Union, leere Felder gefüllt, Konflikte als
//      Notiz festgehalten). Erst danach wird der Verlierer entfernt.
//   4. Jeder Merge ist über das Archiv vollständig wiederherstellbar.

import { ID, Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  SAISON_KUNDEN_COLLECTION_ID,
  SAISON_ANSPRECHPARTNER_COLLECTION_ID,
  SAISON_DATEN_COLLECTION_ID,
  SAISON_AKTIVITAETEN_COLLECTION_ID,
  SAISON_BEZIEHUNGEN_COLLECTION_ID,
  KUNDEN_AKTIVITAETEN_COLLECTION_ID,
  SIEBANALYSEN_COLLECTION_ID,
  PROJEKTE_COLLECTION_ID,
  PLATZBAUER_PROJEKTE_COLLECTION_ID,
  INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID,
  KUNDEN_MERGE_ARCHIV_COLLECTION_ID,
} from '../config/appwrite';
import { SaisonKunde } from '../types/saisonplanung';
import {
  DuplikatPaar,
  MergeReferenzen,
  MergeKontext,
  MergeErgebnis,
  ReferenzZaehlung,
  MergeArchivEintrag,
} from '../types/duplikat';
import { saisonplanungService } from './saisonplanungService';
import { projektService } from './projektService';
import { normalisiereName } from './mosaikMatchingService';
import { stringSimilarity } from '../utils/fuzzySearch';

// ===== ERKENNUNG =====

interface ErkennItem {
  id: string;
  name: string;
  nname: string;
  plz: string;
  ort: string;
  kundennummer?: string;
  mosaikKurzname?: string;
}

function toErkennItem(k: SaisonKunde): ErkennItem {
  return {
    id: k.id,
    name: k.name || '',
    nname: normalisiereName(k.name),
    plz: k.lieferadresse?.plz || k.rechnungsadresse?.plz || '',
    ort: k.lieferadresse?.ort || k.rechnungsadresse?.ort || '',
    kundennummer: k.kundennummer,
    mosaikKurzname: k.mosaikKurzname,
  };
}

/**
 * Findet Duplikat-Kandidatenpaare. Blocking nach normalisiertem Namen und PLZ
 * (vermeidet O(n²) über den gesamten Bestand), Scoring per Namensähnlichkeit + PLZ/Ort.
 */
async function findeDuplikate(minScore = 0.75): Promise<DuplikatPaar[]> {
  const kunden = await saisonplanungService.loadAlleKunden();
  const items = kunden.map(toErkennItem);

  const byName = new Map<string, ErkennItem[]>();
  const byPlz = new Map<string, ErkennItem[]>();
  for (const it of items) {
    if (it.nname) {
      const arr = byName.get(it.nname) || [];
      arr.push(it);
      byName.set(it.nname, arr);
    }
    if (it.plz) {
      const arr = byPlz.get(it.plz) || [];
      arr.push(it);
      byPlz.set(it.plz, arr);
    }
  }

  const paare = new Map<string, DuplikatPaar>();
  const add = (a: ErkennItem, b: ErkennItem, score: number, signale: string[]) => {
    if (a.id === b.id) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const vorhanden = paare.get(key);
    if (vorhanden && vorhanden.score >= score) return;
    paare.set(key, {
      id: key,
      aId: a.id,
      bId: b.id,
      aName: a.name,
      bName: b.name,
      aKundennummer: a.kundennummer,
      bKundennummer: b.kundennummer,
      plz: a.plz || b.plz,
      ort: a.ort || b.ort,
      score: Math.min(score, 1),
      signale,
    });
  };

  // 1) exakt gleicher normalisierter Name
  for (const gruppe of byName.values()) {
    if (gruppe.length < 2) continue;
    for (let i = 0; i < gruppe.length; i++) {
      for (let j = i + 1; j < gruppe.length; j++) {
        const a = gruppe[i];
        const b = gruppe[j];
        const signale = ['gleicher Name'];
        let score = 0.8;
        if (a.plz && a.plz === b.plz) {
          score += 0.15;
          signale.push('gleiche PLZ');
        }
        if (a.mosaikKurzname && a.mosaikKurzname === b.mosaikKurzname) {
          score = 1;
          signale.push('gleicher Kurzname');
        }
        add(a, b, score, signale);
      }
    }
  }

  // 2) innerhalb gleicher PLZ: hohe Namensähnlichkeit
  for (const gruppe of byPlz.values()) {
    if (gruppe.length < 2 || gruppe.length > 400) continue;
    for (let i = 0; i < gruppe.length; i++) {
      for (let j = i + 1; j < gruppe.length; j++) {
        const a = gruppe[i];
        const b = gruppe[j];
        if (!a.nname || !b.nname) continue;
        const sim = stringSimilarity(a.nname, b.nname);
        if (sim >= 0.7) {
          add(a, b, Math.min(0.6 + sim * 0.35, 0.99), [
            `Name ${Math.round(sim * 100)}% ähnlich`,
            'gleiche PLZ',
          ]);
        }
      }
    }
  }

  return [...paare.values()].filter((p) => p.score >= minScore).sort((x, y) => y.score - x.score);
}

// ===== REFERENZ-ZÄHLUNG (für Vorschau) =====

async function zaehleReferenzen(kundeId: string): Promise<ReferenzZaehlung> {
  const [ap, sd, akt, bezV, bezP, proj] = await Promise.all([
    saisonplanungService.loadAnsprechpartnerFuerKunde(kundeId).catch(() => []),
    saisonplanungService.loadSaisonDatenFuerKunde(kundeId).catch(() => []),
    saisonplanungService.loadAktivitaetenFuerKunde(kundeId).catch(() => []),
    saisonplanungService.loadBeziehungenFuerVerein(kundeId).catch(() => []),
    saisonplanungService.loadBeziehungenFuerPlatzbauer(kundeId).catch(() => []),
    projektService.loadProjekteFuerKundeId(kundeId).catch(() => []),
  ]);
  return {
    ansprechpartner: ap.length,
    saisonDaten: sd.length,
    aktivitaeten: akt.length,
    beziehungen: bezV.length + bezP.length,
    projekte: proj.length,
  };
}

async function ladeMergeKontext(aId: string, bId: string): Promise<MergeKontext> {
  const [a, b, referenzenA, referenzenB] = await Promise.all([
    saisonplanungService.loadKunde(aId),
    saisonplanungService.loadKunde(bId),
    zaehleReferenzen(aId),
    zaehleReferenzen(bId),
  ]);
  if (!a || !b) throw new Error('Kunde nicht gefunden');
  return { a, b, referenzenA, referenzenB };
}

// ===== MERGE-PATCH (Felder vereinen) =====

function istLeer(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function unionBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

const SKALAR_FELDER: (keyof SaisonKunde)[] = [
  'kundennummer', 'email', 'rechnungsEmail', 'zuletztGezahlterPreis', 'tonnenLetztesJahr',
  'standardBezugsweg', 'standardPlatzbauerId', 'beziehtUeberUnsPlatzbauer', 'abwerkspreis',
  'automatischesAngebot', 'zahlungsziel', 'schuettstellenAnzahl', 'belieferungsart',
  'anfahrtshinweise', 'wunschLieferwoche', 'mosaikKurzname', 'gruppe', 'branche', 'herkunft',
  'matchcode', 'telefon', 'mobiltelefon', 'postfach', 'postfachort', 'laendercode', 'mahncode',
];

/**
 * Baut den Patch, der den Verlierer in den Survivor faltet:
 * - Skalare: Survivor gewinnt, leere Survivor-Felder werden vom Verlierer gefüllt.
 * - Abweichende Skalare → als Notiz festgehalten (kein Datenverlust).
 * - Arrays werden vereinigt (dedupliziert), Notizen verkettet.
 */
function baueMergePatch(survivor: SaisonKunde, loser: SaisonKunde): {
  patch: Partial<SaisonKunde>;
  konflikte: string[];
} {
  const patch: Record<string, unknown> = {};
  const konflikte: string[] = [];

  for (const f of SKALAR_FELDER) {
    const sv = survivor[f];
    const lv = loser[f];
    if (istLeer(sv) && !istLeer(lv)) {
      patch[f] = lv;
    } else if (!istLeer(sv) && !istLeer(lv) && sv !== lv) {
      konflikte.push(`${String(f)}: behalte "${String(sv)}", Duplikat hatte "${String(lv)}"`);
    }
  }

  // Adressen: Survivor bevorzugt, sonst Verlierer (wenn Survivor keine Straße hat)
  if (!survivor.rechnungsadresse?.strasse && loser.rechnungsadresse?.strasse) {
    patch.rechnungsadresse = loser.rechnungsadresse;
  }
  if (!survivor.lieferadresse?.strasse && loser.lieferadresse?.strasse) {
    patch.lieferadresse = loser.lieferadresse;
  }
  if (!survivor.dispoAnsprechpartner && loser.dispoAnsprechpartner) {
    patch.dispoAnsprechpartner = loser.dispoAnsprechpartner;
  }
  if (!survivor.koordinaten && loser.koordinaten) patch.koordinaten = loser.koordinaten;
  if (!survivor.standardLieferzeitfenster && loser.standardLieferzeitfenster) {
    patch.standardLieferzeitfenster = loser.standardLieferzeitfenster;
  }
  if (!survivor.zahlungsstatistik && loser.zahlungsstatistik) {
    patch.zahlungsstatistik = loser.zahlungsstatistik;
  }

  // Arrays vereinigen
  const preisHistorie = unionBy(
    [...(survivor.preisHistorie || []), ...(loser.preisHistorie || [])],
    (e) => String(e.saisonjahr)
  );
  if (preisHistorie.length) patch.preisHistorie = preisHistorie;

  const zusatzbemerkungen = unionBy(
    [...(survivor.zusatzbemerkungen || []), ...(loser.zusatzbemerkungen || [])],
    (e) => e.id || JSON.stringify(e)
  );
  if (zusatzbemerkungen.length) patch.zusatzbemerkungen = zusatzbemerkungen;

  const lieferadressen = unionBy(
    [...(survivor.lieferadressen || []), ...(loser.lieferadressen || [])],
    (e) => e.mosaikKurzname || JSON.stringify(e)
  );
  if (lieferadressen.length) patch.lieferadressen = lieferadressen;

  if (survivor.saisonpreise || loser.saisonpreise) {
    patch.saisonpreise = { ...(loser.saisonpreise || {}), ...(survivor.saisonpreise || {}) };
  }

  // Verlierer reaktiviert Survivor, falls dieser inaktiv war
  if (!survivor.aktiv && loser.aktiv) patch.aktiv = true;

  // Notizen: verketten + Konflikte als Notiz sichern (nichts geht verloren)
  const notizTeile: string[] = [];
  if (survivor.notizen) notizTeile.push(survivor.notizen);
  if (loser.notizen) notizTeile.push(`[Aus Duplikat ${loser.kundennummer || loser.id}] ${loser.notizen}`);
  for (const k of konflikte) notizTeile.push(`[Merge-Konflikt] ${k}`);
  if (notizTeile.length) patch.notizen = notizTeile.join('\n');

  return { patch: patch as Partial<SaisonKunde>, konflikte };
}

// ===== RE-POINT von Kind-Referenzen =====

interface DocMitData {
  $id: string;
  data?: string;
}

// Hängt alle Dokumente einer Collection, deren `field` auf loserId zeigt, auf survivorId um.
// Aktualisiert die top-level Spalte UND den Wert im JSON `data`. Gibt die umgehängten IDs zurück.
async function repointFeld(
  collectionId: string,
  field: string,
  loserId: string,
  survivorId: string,
  dataPatch: Record<string, unknown> = {},
  topPatch: Record<string, unknown> = {}
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    let res;
    try {
      res = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.equal(field, loserId),
        Query.limit(100),
        Query.offset(offset),
      ]);
    } catch (error) {
      console.warn(`Re-Point übersprungen (${collectionId}.${field}):`, error);
      break;
    }
    const docs = res.documents as unknown as DocMitData[];
    for (const doc of docs) {
      let data: Record<string, unknown> = {};
      try {
        data = doc.data ? JSON.parse(doc.data) : {};
      } catch {
        data = {};
      }
      data[field] = survivorId;
      Object.assign(data, dataPatch);
      await databases.updateDocument(DATABASE_ID, collectionId, doc.$id, {
        [field]: survivorId,
        ...topPatch,
        data: JSON.stringify(data),
      });
      ids.push(doc.$id);
    }
    if (docs.length < 100) break;
    offset += 100;
  }
  return ids;
}

// Setzt für konkrete Dokument-IDs `field` zurück auf einen Wert (für Restore).
async function setzeRefFuerIds(
  collectionId: string,
  field: string,
  ids: string[],
  wert: string,
  dataPatch: Record<string, unknown> = {},
  topPatch: Record<string, unknown> = {}
): Promise<void> {
  for (const id of ids) {
    try {
      const doc = (await databases.getDocument(DATABASE_ID, collectionId, id)) as unknown as DocMitData;
      let data: Record<string, unknown> = {};
      try {
        data = doc.data ? JSON.parse(doc.data) : {};
      } catch {
        data = {};
      }
      data[field] = wert;
      Object.assign(data, dataPatch);
      await databases.updateDocument(DATABASE_ID, collectionId, id, {
        [field]: wert,
        ...topPatch,
        data: JSON.stringify(data),
      });
    } catch (error) {
      console.warn(`Restore-Re-Point fehlgeschlagen (${collectionId}/${id}):`, error);
    }
  }
}

// ===== MERGE DURCHFÜHREN =====

/**
 * Führt loser in survivor zusammen. Reihenfolge ist sicherheitskritisch:
 * Re-Point der Kinder → Felder vereinen → Archiv schreiben → erst dann Verlierer löschen.
 */
async function fuehreMergeDurch(
  survivorId: string,
  loserId: string,
  benutzer?: string
): Promise<MergeErgebnis> {
  if (survivorId === loserId) throw new Error('Survivor und Duplikat sind identisch');

  const survivor = await saisonplanungService.loadKunde(survivorId);
  const loser = await saisonplanungService.loadKunde(loserId);
  if (!survivor || !loser) throw new Error('Kunde nicht gefunden');

  const survivorVorher = JSON.stringify(survivor);
  const loserKundeJson = JSON.stringify(loser);
  const { patch, konflikte } = baueMergePatch(survivor, loser);

  // 1) Kind-Referenzen auf den Survivor umhängen
  const repointed: MergeReferenzen = {
    ansprechpartner: await repointFeld(SAISON_ANSPRECHPARTNER_COLLECTION_ID, 'kundeId', loserId, survivorId),
    saisonDaten: await repointFeld(SAISON_DATEN_COLLECTION_ID, 'kundeId', loserId, survivorId),
    saisonAktivitaeten: await repointFeld(SAISON_AKTIVITAETEN_COLLECTION_ID, 'kundeId', loserId, survivorId),
    kundenAktivitaeten: await repointFeld(KUNDEN_AKTIVITAETEN_COLLECTION_ID, 'kundeId', loserId, survivorId),
    siebanalysen: await repointFeld(SIEBANALYSEN_COLLECTION_ID, 'kundeId', loserId, survivorId),
    beziehungenVerein: await repointFeld(SAISON_BEZIEHUNGEN_COLLECTION_ID, 'vereinId', loserId, survivorId),
    beziehungenPlatzbauer: await repointFeld(SAISON_BEZIEHUNGEN_COLLECTION_ID, 'platzbauerId', loserId, survivorId),
    platzbauerProjekte: await repointFeld(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'platzbauerId', loserId, survivorId),
    instandsetzung: await repointFeld(INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID, 'platzbauerId', loserId, survivorId),
    projekte: await repointFeld(
      PROJEKTE_COLLECTION_ID,
      'kundeId',
      loserId,
      survivorId,
      { kundenname: survivor.name, kundennummer: survivor.kundennummer },
      { kundenname: survivor.name }
    ),
  };

  // 2) Survivor-Felder vereinen
  await saisonplanungService.updateKunde(survivorId, patch);

  // 3) Archiv-Snapshot schreiben (Sicherheitsnetz – VOR dem Löschen)
  const archiv = await databases.createDocument(DATABASE_ID, KUNDEN_MERGE_ARCHIV_COLLECTION_ID, ID.unique(), {
    survivorId,
    loserId,
    survivorName: survivor.name,
    loserName: loser.name,
    zeitpunkt: new Date().toISOString(),
    benutzer,
    loserKunde: loserKundeJson,
    survivorVorher,
    repointed: JSON.stringify(repointed),
    rueckgaengig: false,
  });

  // 4) Verlierer löschen (Kinder sind umgehängt, Snapshot liegt im Archiv)
  await databases.deleteDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, loserId);

  return { archivId: archiv.$id, survivorId, loserId, repointed, konflikte };
}

// ===== ARCHIV / RESTORE =====

async function ladeArchiv(limit = 50): Promise<MergeArchivEintrag[]> {
  try {
    const res = await databases.listDocuments(DATABASE_ID, KUNDEN_MERGE_ARCHIV_COLLECTION_ID, [
      Query.orderDesc('zeitpunkt'),
      Query.limit(limit),
    ]);
    return (res.documents as unknown as Array<Record<string, unknown>>).map((d) => ({
      id: String(d.$id),
      survivorId: String(d.survivorId ?? ''),
      loserId: String(d.loserId ?? ''),
      survivorName: String(d.survivorName ?? ''),
      loserName: String(d.loserName ?? ''),
      zeitpunkt: String(d.zeitpunkt ?? ''),
      benutzer: d.benutzer ? String(d.benutzer) : undefined,
      rueckgaengig: Boolean(d.rueckgaengig),
    }));
  } catch (error) {
    console.warn('Merge-Archiv konnte nicht geladen werden:', error);
    return [];
  }
}

/** Macht einen Merge vollständig rückgängig (Verlierer wiederherstellen, Kinder zurück, Survivor zurücksetzen). */
async function macheMergeRueckgaengig(archivId: string): Promise<void> {
  const a = (await databases.getDocument(
    DATABASE_ID,
    KUNDEN_MERGE_ARCHIV_COLLECTION_ID,
    archivId
  )) as unknown as Record<string, string | boolean>;
  if (a.rueckgaengig) throw new Error('Dieser Merge wurde bereits rückgängig gemacht');

  const loserId = String(a.loserId);
  const survivorId = String(a.survivorId);
  const loserKunde = JSON.parse(String(a.loserKunde)) as SaisonKunde;
  const survivorVorher = String(a.survivorVorher);
  const repointed = JSON.parse(String(a.repointed)) as MergeReferenzen;

  // 1) Verlierer-Kunden mit Original-ID wiederherstellen
  await databases.createDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, loserId, {
    data: JSON.stringify(loserKunde),
  });

  // 2) Kind-Referenzen zurück auf den Verlierer
  await setzeRefFuerIds(SAISON_ANSPRECHPARTNER_COLLECTION_ID, 'kundeId', repointed.ansprechpartner, loserId);
  await setzeRefFuerIds(SAISON_DATEN_COLLECTION_ID, 'kundeId', repointed.saisonDaten, loserId);
  await setzeRefFuerIds(SAISON_AKTIVITAETEN_COLLECTION_ID, 'kundeId', repointed.saisonAktivitaeten, loserId);
  await setzeRefFuerIds(KUNDEN_AKTIVITAETEN_COLLECTION_ID, 'kundeId', repointed.kundenAktivitaeten, loserId);
  await setzeRefFuerIds(SIEBANALYSEN_COLLECTION_ID, 'kundeId', repointed.siebanalysen, loserId);
  await setzeRefFuerIds(SAISON_BEZIEHUNGEN_COLLECTION_ID, 'vereinId', repointed.beziehungenVerein, loserId);
  await setzeRefFuerIds(SAISON_BEZIEHUNGEN_COLLECTION_ID, 'platzbauerId', repointed.beziehungenPlatzbauer, loserId);
  await setzeRefFuerIds(PLATZBAUER_PROJEKTE_COLLECTION_ID, 'platzbauerId', repointed.platzbauerProjekte, loserId);
  await setzeRefFuerIds(INSTANDSETZUNGSAUFTRAEGE_COLLECTION_ID, 'platzbauerId', repointed.instandsetzung, loserId);
  await setzeRefFuerIds(
    PROJEKTE_COLLECTION_ID,
    'kundeId',
    repointed.projekte,
    loserId,
    { kundenname: loserKunde.name, kundennummer: loserKunde.kundennummer },
    { kundenname: loserKunde.name }
  );

  // 3) Survivor auf den Stand vor dem Merge zurücksetzen
  await databases.updateDocument(DATABASE_ID, SAISON_KUNDEN_COLLECTION_ID, survivorId, {
    data: survivorVorher,
  });

  // 4) Archiv markieren
  await databases.updateDocument(DATABASE_ID, KUNDEN_MERGE_ARCHIV_COLLECTION_ID, archivId, {
    rueckgaengig: true,
  });
}

export const duplikatService = {
  findeDuplikate,
  ladeMergeKontext,
  baueMergePatch,
  fuehreMergeDurch,
  ladeArchiv,
  macheMergeRueckgaengig,
};
