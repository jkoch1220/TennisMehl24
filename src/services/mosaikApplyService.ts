/**
 * Mosaik-Apply: schreibt eine Migrations-Entscheidung in die CRM-Collections.
 *
 * Zwei Pfade:
 *  - `applyZusammenfuehren` — aktualisiert einen bestehenden `saison_kunden`-Datensatz
 *    nur mit den vom Nutzer ausgewählten Feldern, niemals automatisch überschreibend.
 *  - `applyAnlegen` — legt einen neuen `saison_kunden`-Datensatz an.
 *
 * Beide Pfade können Mosaik-Ansprechpartner als `saison_ansprechpartner` mit anlegen.
 * Beide setzen `mosaikKurzname` auf dem CRM-Kunden → wiederholbar idempotent.
 */

import { saisonplanungService } from './saisonplanungService';
import { mosaikMigrationService } from './mosaikMigrationService';
import {
  SaisonKunde,
  NeuerSaisonKunde,
  NeuerAnsprechpartner,
  Telefonnummer,
  KundenTyp,
} from '../types/saisonplanung';
import { Adresse } from '../types/dispo';
import {
  MigrationKandidat,
  MosaikAnsprechpartner,
  MosaikKunde,
} from '../types/mosaik';
import { plzZuBundesland } from '../utils/plzBundesland';

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/** Mosaik-Gruppe → CRM-Kundentyp; im Zweifel 'verein' (Default). */
export function leiteKundentypAb(gruppe: string | null | undefined): KundenTyp {
  if (!gruppe) return 'verein';
  const g = gruppe.toLowerCase();
  if (
    g.includes('platzbau') ||
    g.includes('gala') ||
    g.includes('gärtner') ||
    g.includes('gaertner') ||
    g.includes('dachdecker')
  ) {
    return 'platzbauer';
  }
  return 'verein';
}

/** Mosaik-Telefonnummern → `Telefonnummer[]` für CRM */
export function extrahiereTelefonnummern(
  m: Pick<MosaikAnsprechpartner | MosaikKunde, 'Telefon' | 'Mobiltelefon' | 'Telefax'>
): Telefonnummer[] {
  const liste: Telefonnummer[] = [];
  const sauber = (s: string | null | undefined) => (s ? s.trim() : '');
  const tel = sauber(m.Telefon);
  const mob = sauber(m.Mobiltelefon);
  const fax = sauber(m.Telefax);
  if (tel) liste.push({ nummer: tel, typ: 'Festnetz' });
  if (mob) liste.push({ nummer: mob, typ: 'Mobil' });
  if (fax) liste.push({ nummer: fax, typ: 'Fax' });
  return liste;
}

/** Mosaik-Ansprechpartner → NeuerAnsprechpartner-Entwurf */
export function mosaikKontaktZuEntwurf(
  m: MosaikAnsprechpartner,
  kundeId: string
): NeuerAnsprechpartner {
  return {
    kundeId,
    name: (m.Ansprechpartner || '').trim() || 'Unbekannt',
    rolle: m.Position?.trim() || m.Abteilung?.trim() || undefined,
    email: m.Kommunikation?.trim() || undefined,
    telefonnummern: extrahiereTelefonnummern(m),
    notizen: m.Info?.trim() || undefined,
    aktiv: true,
  };
}

/** Mosaik-Adresse → CRM-Adresse mit aus PLZ abgeleitetem Bundesland */
export function mosaikAdresse(m: MosaikKunde): Adresse {
  return {
    strasse: m.Straße?.trim() || '',
    plz: m.PLZ?.trim() || '',
    ort: m.Ort?.trim() || '',
    bundesland: plzZuBundesland(m.PLZ) || '',
  };
}

// ============================================================
// APPLY: ZUSAMMENFÜHREN
// ============================================================

export interface ZusammenfuehrenPlan {
  kundeId: string;
  patch: Partial<SaisonKunde>;
  /** Mosaik-Kontakte, die mit angelegt werden sollen (Dubletten muss die UI vorher entfernen) */
  neueKontakte: MosaikAnsprechpartner[];
  notiz?: string;
}

export interface ApplyErgebnis {
  kandidatId: string;
  kundeId: string;
  angelegteKontakte: number;
  fehler?: string;
}

export const mosaikApplyService = {
  /**
   * Führt einen Mosaik-Kandidaten mit einem bestehenden CRM-Kunden zusammen.
   * Es werden NUR die im `patch` enthaltenen Felder geändert; alles andere bleibt.
   * `mosaikKurzname` wird gesetzt — die Migration ist damit wiederholbar.
   */
  async applyZusammenfuehren(
    kandidat: MigrationKandidat,
    plan: ZusammenfuehrenPlan,
    bearbeiter?: string
  ): Promise<ApplyErgebnis> {
    try {
      const aktuell = await saisonplanungService.loadKunde(plan.kundeId);
      if (!aktuell) {
        throw new Error(`Ziel-Kunde ${plan.kundeId} nicht gefunden`);
      }

      await saisonplanungService.updateKunde(plan.kundeId, {
        ...plan.patch,
        mosaikKurzname: kandidat.mosaikKurzname,
      });

      let angelegteKontakte = 0;
      for (const kontakt of plan.neueKontakte) {
        await saisonplanungService.createAnsprechpartner(
          mosaikKontaktZuEntwurf(kontakt, plan.kundeId)
        );
        angelegteKontakte++;
      }

      await mosaikMigrationService.update(kandidat.id, {
        status: 'angelegt',
        matchKundeId: plan.kundeId,
        bearbeitetAm: new Date().toISOString(),
        bearbeitetVon: bearbeiter,
        data: {
          ...kandidat.data,
          notiz: plan.notiz ?? kandidat.data.notiz,
        },
      });

      return { kandidatId: kandidat.id, kundeId: plan.kundeId, angelegteKontakte };
    } catch (error) {
      const meldung = error instanceof Error ? error.message : String(error);
      try {
        await mosaikMigrationService.update(kandidat.id, {
          status: 'fehler',
          bearbeitetAm: new Date().toISOString(),
          bearbeitetVon: bearbeiter,
          data: { ...kandidat.data, notiz: `Fehler beim Zusammenführen: ${meldung}` },
        });
      } catch {
        /* Status-Update darf das eigentliche Ergebnis nicht überschreiben */
      }
      return {
        kandidatId: kandidat.id,
        kundeId: plan.kundeId,
        angelegteKontakte: 0,
        fehler: meldung,
      };
    }
  },

  // ==========================================================
  // APPLY: NEU ANLEGEN
  // ==========================================================

  /**
   * Legt aus einem Mosaik-Kandidaten einen NEUEN `saison_kunden` an.
   * Die UI gibt einen vollständigen Entwurf mit (typ, name, Adressen, ...).
   * Idempotent: wenn der Kandidat bereits einen migrierten CRM-Kunden hat,
   * wird stattdessen ein Update versucht.
   */
  async applyAnlegen(
    kandidat: MigrationKandidat,
    entwurf: NeuerSaisonKunde,
    neueKontakte: MosaikAnsprechpartner[],
    bearbeiter?: string,
    notiz?: string
  ): Promise<ApplyErgebnis> {
    try {
      const kunde = await saisonplanungService.createKunde({
        ...entwurf,
        mosaikKurzname: kandidat.mosaikKurzname,
      });

      let angelegteKontakte = 0;
      for (const kontakt of neueKontakte) {
        await saisonplanungService.createAnsprechpartner(
          mosaikKontaktZuEntwurf(kontakt, kunde.id)
        );
        angelegteKontakte++;
      }

      await mosaikMigrationService.update(kandidat.id, {
        status: 'angelegt',
        matchKundeId: kunde.id,
        bearbeitetAm: new Date().toISOString(),
        bearbeitetVon: bearbeiter,
        data: {
          ...kandidat.data,
          notiz: notiz ?? kandidat.data.notiz,
        },
      });

      return { kandidatId: kandidat.id, kundeId: kunde.id, angelegteKontakte };
    } catch (error) {
      const meldung = error instanceof Error ? error.message : String(error);
      try {
        await mosaikMigrationService.update(kandidat.id, {
          status: 'fehler',
          bearbeitetAm: new Date().toISOString(),
          bearbeitetVon: bearbeiter,
          data: { ...kandidat.data, notiz: `Fehler beim Anlegen: ${meldung}` },
        });
      } catch {
        /* siehe oben */
      }
      return { kandidatId: kandidat.id, kundeId: '', angelegteKontakte: 0, fehler: meldung };
    }
  },

  // ==========================================================
  // APPLY: ÜBERSPRINGEN
  // ==========================================================

  async applyUeberspringen(
    kandidat: MigrationKandidat,
    notiz?: string,
    bearbeiter?: string
  ): Promise<void> {
    await mosaikMigrationService.update(kandidat.id, {
      status: 'uebersprungen',
      bearbeitetAm: new Date().toISOString(),
      bearbeitetVon: bearbeiter,
      data: { ...kandidat.data, notiz: notiz ?? kandidat.data.notiz },
    });
  },

  /**
   * Hilfsfunktion: erzeugt aus einem Kandidaten einen sinnvollen Default-Entwurf
   * für die Neuanlage. Die UI lässt den Nutzer das ergänzen / korrigieren.
   */
  entwurfFuerNeuanlage(kandidat: MigrationKandidat): NeuerSaisonKunde {
    const m = kandidat.data.rohdaten;
    const adresse = mosaikAdresse(m);
    const name = (m.Name2 || m.Name3 || m.Name1 || kandidat.mosaikKurzname).trim();
    return {
      typ: leiteKundentypAb(m.Gruppe),
      name,
      kundennummer: undefined, // wird vom saisonplanungService generiert
      rechnungsadresse: adresse,
      lieferadresse: adresse,
      email: m.Kommunikation?.trim() || undefined,
      notizen: m.Info?.trim() || undefined,
      aktiv: !(kandidat.mosaikInaktiv ?? false),
    };
  },
};
