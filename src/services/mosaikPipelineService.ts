/**
 * Mosaik-Migrations-Pipeline.
 *
 * End-to-end-Orchestrator: nimmt alle in der Staging-Collection liegenden
 * Kandidaten, klassifiziert sie deterministisch + per Fuzzy + bei Bedarf
 * per Claude-KI, und schreibt das Ergebnis nach Wunsch ins CRM.
 *
 * Zwei Modi:
 *   - 'dry-run'  → klassifiziert komplett, schreibt NICHTS ins CRM.
 *                  Resultat: Bilanz, damit der Mensch die Größenordnung sieht.
 *   - 'echt'     → klassifiziert + wendet automatisch an, wo es sicher ist.
 *                  Grenzfälle landen mit Status `review` in der UI-Queue.
 *
 * Schwellen (sieh MIGRATION_KONZEPT.md):
 *   ≥ 0.95          → sicher_match (auto-merge)
 *   0.85 ≤ s < 0.95 → wahrscheinlich_match (auto-merge mit Log)
 *   0.55 ≤ s < 0.85 → KI-Entscheidung (Haiku 4.5)
 *   < 0.55          → klare_neuanlage (auto-create)
 *
 * Bei KI:
 *   konfidenz ≥ 0.9        → auto-merge
 *   0.7 ≤ konfidenz < 0.9  → review (Mensch entscheidet)
 *   konfidenz < 0.7        → review mit Warnung
 *   kein_match             → klare_neuanlage
 *
 * Regel: CRM wird niemals überschrieben — nur leere Felder gefüllt, Notizen
 * werden mit `[Mosaik]`-Präfix angehängt. Idempotent über `mosaikKurzname`.
 */

import { runBatched } from '../utils/rateLimiter';
import { saisonplanungService } from './saisonplanungService';
import { mosaikMigrationService } from './mosaikMigrationService';
import { mosaikApplyService } from './mosaikApplyService';
import {
  berechneFeldDiff,
  findeTopMatches,
  MatchKandidat,
} from './mosaikMatchingService';
import {
  claudeMosaikMatchService,
  KiMatchAntwort,
} from './claudeMosaikMatchService';
import { MigrationKandidat, MosaikKunde } from '../types/mosaik';
import { SaisonKunde } from '../types/saisonplanung';
import { Adresse } from '../types/dispo';
import { plzZuBundesland } from '../utils/plzBundesland';

// ============================================================
// SCHWELLEN
// ============================================================

const SCHWELLE_SICHER = 0.95;
const SCHWELLE_WAHRSCHEINLICH = 0.85;
const SCHWELLE_GRAUBEREICH_UNTEN = 0.55;
const KI_KONFIDENZ_AUTO_MERGE = 0.9;
const KI_KONFIDENZ_REVIEW = 0.7;

// ============================================================
// TYPEN
// ============================================================

export type Klassifikation =
  | 'sicher_match'
  | 'wahrscheinlich_match'
  | 'graubereich'
  | 'klare_neuanlage'
  | 'bereits_erledigt';

export type FinaleAktion =
  | 'auto_merge'
  | 'auto_anlegen'
  | 'review_queue'
  | 'skip_erledigt';

export interface KlassifikationEintrag {
  kandidat: MigrationKandidat;
  klassifikation: Klassifikation;
  bestesMatch?: MatchKandidat;
  alleMatches: MatchKandidat[];
  /** Aktion nach optionaler KI-Bewertung */
  aktion: FinaleAktion;
  /** Falls KI gefragt wurde */
  kiAntwort?: KiMatchAntwort;
  begruendung: string;
}

export interface PipelineBilanz {
  gesamt: number;
  sicherMatch: number;
  wahrscheinlichMatch: number;
  graubereich: number;
  klareNeuanlage: number;
  bereitsErledigt: number;
  /** Verteilung NACH KI-Bewertung */
  nachAktion: Record<FinaleAktion, number>;
  ki: {
    aufrufe: number;
    match: number;
    keinMatch: number;
    fehler: number;
  };
  apply?: {
    gemerged: number;
    angelegt: number;
    fehler: number;
    fehlerListe: Array<{ kurzname: string; meldung: string }>;
  };
}

export interface PipelineFortschritt {
  phase: 'lade' | 'klassifiziere' | 'ki' | 'apply' | 'fertig';
  verarbeitet: number;
  gesamt: number;
  bilanz: PipelineBilanz;
}

export interface PipelineOptionen {
  modus: 'dry-run' | 'echt';
  /** Falls > 0: nur die ersten N Kandidaten verarbeiten (Pilot-Lauf) */
  limit?: number;
  /** Bearbeiter-Name für Audit */
  bearbeiter?: string;
  /** Mosaik-inaktive Kandidaten überspringen (Default: true) */
  inaktiveUeberspringen?: boolean;
  /** Live-Fortschritt für UI */
  onProgress?: (f: PipelineFortschritt) => void;
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

function leereBilanz(): PipelineBilanz {
  return {
    gesamt: 0,
    sicherMatch: 0,
    wahrscheinlichMatch: 0,
    graubereich: 0,
    klareNeuanlage: 0,
    bereitsErledigt: 0,
    nachAktion: { auto_merge: 0, auto_anlegen: 0, review_queue: 0, skip_erledigt: 0 },
    ki: { aufrufe: 0, match: 0, keinMatch: 0, fehler: 0 },
  };
}

function klassifiziereScore(score: number): Klassifikation {
  if (score >= SCHWELLE_SICHER) return 'sicher_match';
  if (score >= SCHWELLE_WAHRSCHEINLICH) return 'wahrscheinlich_match';
  if (score >= SCHWELLE_GRAUBEREICH_UNTEN) return 'graubereich';
  return 'klare_neuanlage';
}

/**
 * Berechnet das Auto-Merge-Patch:
 *   - leere CRM-Felder werden mit Mosaik-Werten gefüllt
 *   - Notizen werden angehängt (nie ersetzt)
 *   - alles andere bleibt
 */
function baueAutoMergePatch(
  mosaik: MosaikKunde,
  crm: SaisonKunde
): Partial<SaisonKunde> {
  const patch: Partial<SaisonKunde> = {};
  const r: Adresse = { ...(crm.rechnungsadresse ?? { strasse: '', plz: '', ort: '', bundesland: '' }) };
  const l: Adresse = { ...(crm.lieferadresse ?? r) };
  let adresseGeaendert = false;

  if (!crm.email && mosaik.Kommunikation) patch.email = mosaik.Kommunikation.trim();
  if (!crm.kundennummer && mosaik.Nummer) patch.kundennummer = mosaik.Nummer;

  if (mosaik.Info) {
    const mosaikText = mosaik.Info.trim();
    const crmText = (crm.notizen ?? '').trim();
    if (!crmText) patch.notizen = mosaikText;
    else if (!crmText.includes(mosaikText)) {
      patch.notizen = `${crmText}\n\n[Mosaik] ${mosaikText}`;
    }
  }

  if (!r.strasse && mosaik.Straße) {
    r.strasse = mosaik.Straße.trim();
    l.strasse = r.strasse;
    adresseGeaendert = true;
  }
  if (!r.plz && mosaik.PLZ) {
    r.plz = mosaik.PLZ.trim();
    l.plz = r.plz;
    adresseGeaendert = true;
  }
  if (!r.ort && mosaik.Ort) {
    r.ort = mosaik.Ort.trim();
    l.ort = r.ort;
    adresseGeaendert = true;
  }
  if (!r.bundesland) {
    const bl = plzZuBundesland(r.plz);
    if (bl) {
      r.bundesland = bl;
      l.bundesland = bl;
      adresseGeaendert = true;
    }
  }
  if (adresseGeaendert) {
    patch.rechnungsadresse = r;
    patch.lieferadresse = l;
  }
  return patch;
}

// ============================================================
// HAUPT-PIPELINE
// ============================================================

export const mosaikPipelineService = {
  /**
   * Klassifiziert alle Kandidaten (deterministisch + Fuzzy + KI im
   * Graubereich) und gibt eine vollständige Bilanz zurück.
   *
   * Im Modus 'echt' werden direkt im Anschluss die sicheren Fälle ins CRM
   * geschrieben — alles andere wandert in die Review-Queue.
   */
  async run(opts: PipelineOptionen): Promise<{
    bilanz: PipelineBilanz;
    entscheidungen: KlassifikationEintrag[];
  }> {
    const bilanz = leereBilanz();
    const fortschritt: PipelineFortschritt = {
      phase: 'lade',
      verarbeitet: 0,
      gesamt: 0,
      bilanz,
    };
    opts.onProgress?.({ ...fortschritt });

    // 1. Daten laden
    const [alleKandidaten, crmKunden] = await Promise.all([
      mosaikMigrationService.loadAlle(),
      saisonplanungService.loadAlleKunden(),
    ]);

    const inaktiveUeberspringen = opts.inaktiveUeberspringen ?? true;
    let arbeitsliste = alleKandidaten;
    if (inaktiveUeberspringen) {
      arbeitsliste = arbeitsliste.filter((k) => !k.mosaikInaktiv);
    }
    if (opts.limit && opts.limit > 0) {
      arbeitsliste = arbeitsliste.slice(0, opts.limit);
    }

    bilanz.gesamt = arbeitsliste.length;
    fortschritt.gesamt = arbeitsliste.length;

    // 2. Klassifizieren (deterministisch + Fuzzy)
    fortschritt.phase = 'klassifiziere';
    opts.onProgress?.({ ...fortschritt });

    const entscheidungen: KlassifikationEintrag[] = [];

    for (const kandidat of arbeitsliste) {
      // Schon abgeschlossen → skip
      if (
        kandidat.status === 'angelegt' ||
        kandidat.status === 'uebersprungen'
      ) {
        bilanz.bereitsErledigt++;
        entscheidungen.push({
          kandidat,
          klassifikation: 'bereits_erledigt',
          alleMatches: [],
          aktion: 'skip_erledigt',
          begruendung: `Status bereits ${kandidat.status}, wird nicht verändert.`,
        });
        fortschritt.verarbeitet++;
        continue;
      }

      const top = findeTopMatches(kandidat.data.rohdaten, crmKunden, 3);
      const bestes = top[0];
      const score = bestes?.score ?? 0;
      const klass = klassifiziereScore(score);

      let aktion: FinaleAktion;
      let begruendung: string;
      switch (klass) {
        case 'sicher_match':
          aktion = 'auto_merge';
          bilanz.sicherMatch++;
          begruendung = `Score ${(score * 100).toFixed(0)} % — sicher (${bestes.begruendung}).`;
          break;
        case 'wahrscheinlich_match':
          aktion = 'auto_merge';
          bilanz.wahrscheinlichMatch++;
          begruendung = `Score ${(score * 100).toFixed(0)} % — wahrscheinlich (${bestes.begruendung}).`;
          break;
        case 'graubereich':
          aktion = 'review_queue';
          bilanz.graubereich++;
          begruendung = `Score ${(score * 100).toFixed(0)} % — Graubereich, KI wird befragt.`;
          break;
        case 'klare_neuanlage':
          aktion = 'auto_anlegen';
          bilanz.klareNeuanlage++;
          begruendung = `Score ${(score * 100).toFixed(0)} % — kein verlässlicher Match, wird neu angelegt.`;
          break;
        default:
          aktion = 'review_queue';
          begruendung = 'unklarer Zustand';
      }

      entscheidungen.push({
        kandidat,
        klassifikation: klass,
        bestesMatch: bestes,
        alleMatches: top,
        aktion,
        begruendung,
      });

      fortschritt.verarbeitet++;
      if (fortschritt.verarbeitet % 25 === 0) {
        opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });
      }
    }
    opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });

    // 3. KI für Graubereich
    const graufaelle = entscheidungen.filter(
      (e) => e.klassifikation === 'graubereich'
    );
    if (graufaelle.length > 0) {
      fortschritt.phase = 'ki';
      fortschritt.gesamt = graufaelle.length;
      fortschritt.verarbeitet = 0;
      opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });

      await runBatched({
        items: graufaelle,
        concurrency: 3,
        paceMs: 500,
        maxRetries: 2,
        onProgress: (verarbeitet) => {
          fortschritt.verarbeitet = verarbeitet;
          opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });
        },
        operation: async (eintrag) => {
          bilanz.ki.aufrufe++;
          try {
            const antwort = await claudeMosaikMatchService.entscheide(
              eintrag.kandidat.data.rohdaten,
              eintrag.alleMatches.map((m) => m.kunde)
            );
            eintrag.kiAntwort = antwort;
            if (antwort.entscheidung === 'kein_match') {
              bilanz.ki.keinMatch++;
              eintrag.aktion = 'auto_anlegen';
              eintrag.begruendung = `KI: kein Match (${(antwort.konfidenz * 100).toFixed(0)} %): ${antwort.begruendung}`;
              return;
            }
            // match
            bilanz.ki.match++;
            const gewaehlt = eintrag.alleMatches.find(
              (m) => m.kunde.id === antwort.kandidat_id
            );
            if (gewaehlt) {
              eintrag.bestesMatch = gewaehlt;
            }
            if (antwort.konfidenz >= KI_KONFIDENZ_AUTO_MERGE) {
              eintrag.aktion = 'auto_merge';
              eintrag.begruendung = `KI: Match mit ${(antwort.konfidenz * 100).toFixed(0)} %: ${antwort.begruendung}`;
            } else if (antwort.konfidenz >= KI_KONFIDENZ_REVIEW) {
              eintrag.aktion = 'review_queue';
              eintrag.begruendung = `KI: Match unsicher (${(antwort.konfidenz * 100).toFixed(0)} %): ${antwort.begruendung}`;
            } else {
              eintrag.aktion = 'review_queue';
              eintrag.begruendung = `KI: Match mit niedriger Konfidenz (${(antwort.konfidenz * 100).toFixed(0)} %): ${antwort.begruendung}`;
            }
          } catch (e) {
            bilanz.ki.fehler++;
            const msg = e instanceof Error ? e.message : String(e);
            eintrag.aktion = 'review_queue';
            eintrag.begruendung = `KI-Aufruf fehlgeschlagen, manuell prüfen: ${msg}`;
            // KI-Fehler nicht hochwerfen — Pipeline läuft weiter
          }
        },
      });
    }

    // Re-aggregiere nachAktion (KI hat ggf. umverteilt)
    for (const e of entscheidungen) {
      bilanz.nachAktion[e.aktion]++;
    }

    // 4. Apply — nur im 'echt'-Modus
    if (opts.modus === 'echt') {
      fortschritt.phase = 'apply';
      const anzuwenden = entscheidungen.filter(
        (e) => e.aktion === 'auto_merge' || e.aktion === 'auto_anlegen'
      );
      fortschritt.gesamt = anzuwenden.length;
      fortschritt.verarbeitet = 0;
      bilanz.apply = {
        gemerged: 0,
        angelegt: 0,
        fehler: 0,
        fehlerListe: [],
      };
      opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });

      await runBatched({
        items: anzuwenden,
        concurrency: 1,
        paceMs: 400,
        maxRetries: 5,
        onProgress: (verarbeitet) => {
          fortschritt.verarbeitet = verarbeitet;
          opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });
        },
        operation: async (eintrag) => {
          const k = eintrag.kandidat;
          try {
            if (eintrag.aktion === 'auto_merge' && eintrag.bestesMatch) {
              const patch = baueAutoMergePatch(
                k.data.rohdaten,
                eintrag.bestesMatch.kunde
              );
              const ergebnis = await mosaikApplyService.applyZusammenfuehren(
                k,
                {
                  kundeId: eintrag.bestesMatch.kunde.id,
                  patch,
                  neueKontakte: k.data.ansprechpartner,
                  notiz: eintrag.begruendung,
                },
                opts.bearbeiter ?? 'pipeline-auto'
              );
              if (ergebnis.fehler) {
                bilanz.apply!.fehler++;
                if (bilanz.apply!.fehlerListe.length < 20) {
                  bilanz.apply!.fehlerListe.push({
                    kurzname: k.mosaikKurzname,
                    meldung: ergebnis.fehler,
                  });
                }
              } else {
                bilanz.apply!.gemerged++;
              }
            } else if (eintrag.aktion === 'auto_anlegen') {
              const entwurf = mosaikApplyService.entwurfFuerNeuanlage(k);
              const ergebnis = await mosaikApplyService.applyAnlegen(
                k,
                entwurf,
                k.data.ansprechpartner,
                opts.bearbeiter ?? 'pipeline-auto',
                eintrag.begruendung
              );
              if (ergebnis.fehler) {
                bilanz.apply!.fehler++;
                if (bilanz.apply!.fehlerListe.length < 20) {
                  bilanz.apply!.fehlerListe.push({
                    kurzname: k.mosaikKurzname,
                    meldung: ergebnis.fehler,
                  });
                }
              } else {
                bilanz.apply!.angelegt++;
              }
            }
          } catch (e) {
            bilanz.apply!.fehler++;
            const meldung = e instanceof Error ? e.message : String(e);
            if (bilanz.apply!.fehlerListe.length < 20) {
              bilanz.apply!.fehlerListe.push({
                kurzname: k.mosaikKurzname,
                meldung,
              });
            }
            throw e; // Rate-Limiter darf retry'en
          }
        },
      });

      // Review-Queue: Status explizit auf 'review' setzen
      const fuerReview = entscheidungen.filter((e) => e.aktion === 'review_queue');
      if (fuerReview.length > 0) {
        await runBatched({
          items: fuerReview,
          concurrency: 1,
          paceMs: 400,
          maxRetries: 5,
          operation: async (eintrag) => {
            const k = eintrag.kandidat;
            await mosaikMigrationService.update(k.id, {
              status: 'review',
              matchKundeId: eintrag.bestesMatch?.kunde.id,
              matchScore: eintrag.bestesMatch?.score,
              bearbeitetAm: new Date().toISOString(),
              bearbeitetVon: opts.bearbeiter ?? 'pipeline-auto',
              data: {
                ...k.data,
                matchBegruendung: eintrag.begruendung,
                feldDiff: eintrag.bestesMatch
                  ? berechneFeldDiff(k.data.rohdaten, eintrag.bestesMatch.kunde)
                  : [],
              },
            });
          },
        });
      }
    }

    fortschritt.phase = 'fertig';
    opts.onProgress?.({ ...fortschritt, bilanz: { ...bilanz } });
    return { bilanz, entscheidungen };
  },
};
