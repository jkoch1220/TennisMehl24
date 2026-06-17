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
  KundenZahlungsstatistik,
  ZusaetzlicheLieferadresse,
} from '../types/saisonplanung';
import { Adresse } from '../types/dispo';
import {
  MigrationKandidat,
  MosaikAnsprechpartner,
  MosaikKunde,
  MosaikKandidatData,
  MosaikZahlungsverhalten,
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

/** Mosaik-Geschlecht (0=unbekannt, 1=m, 2=w, 3=d) → Anrede-Wort */
function leiteAnredeAb(
  m: Pick<MosaikAnsprechpartner, 'Anrede' | 'Geschlecht'>
): string | undefined {
  const ausFeld = m.Anrede?.trim();
  if (ausFeld) return ausFeld;
  if (m.Geschlecht === 1) return 'Herr';
  if (m.Geschlecht === 2) return 'Frau';
  return undefined;
}

/** Mosaik-Datum (ISO-String mit Zeit oder leer) → ISO-Datum oder undefined */
function mosaikDatum(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  // Mosaik liefert "2018-04-12 00:00:00" → schneide die Zeit ab
  return trimmed.split(' ')[0];
}

/** Mosaik-Ansprechpartner → NeuerAnsprechpartner-Entwurf */
export function mosaikKontaktZuEntwurf(
  m: MosaikAnsprechpartner,
  kundeId: string
): NeuerAnsprechpartner {
  // Eigene Privatadresse nur, wenn mindestens ein Adressfeld gefüllt ist
  const hatPrivatAdresse = Boolean(m.Straße || m.PLZ || m.Ort);
  const privatAdresse: Adresse | undefined = hatPrivatAdresse
    ? {
        strasse: m.Straße?.trim() || '',
        plz: m.PLZ?.trim() || '',
        ort: m.Ort?.trim() || '',
        bundesland: plzZuBundesland(m.PLZ) || '',
      }
    : undefined;

  return {
    kundeId,
    name: (m.Ansprechpartner || '').trim() || 'Unbekannt',
    rolle: m.Position?.trim() || undefined,
    email: m.Kommunikation?.trim() || undefined,
    telefonnummern: extrahiereTelefonnummern(m),
    notizen: m.Info?.trim() || undefined,
    aktiv: true,
    anrede: leiteAnredeAb(m),
    namenszusatz: m.Namenszusatz?.trim() || undefined,
    abteilung: m.Abteilung?.trim() || undefined,
    geburtsdatum: mosaikDatum(m.Geburtsdatum),
    privatAdresse,
    mosaikKurzname: m.Kurzname,
  };
}

/** Mosaik-Adresse → CRM-Adresse mit aus PLZ abgeleitetem Bundesland */
export function mosaikAdresse(m: MosaikKunde): Adresse {
  return {
    strasse: m.Straße?.trim() || '',
    plz: m.PLZ?.trim() || '',
    ort: m.Ort?.trim() || '',
    bundesland: plzZuBundesland(m.PLZ) || '',
    land: m.Ländercode?.trim() || undefined,
  };
}

/** Mosaik sub_adressen → ZusaetzlicheLieferadresse[] */
export function mosaikLieferadressen(
  data: MosaikKandidatData
): ZusaetzlicheLieferadresse[] {
  return data.subAdressen.map(({ referenz, adresse }) => ({
    strasse: adresse.Straße?.trim() || '',
    plz: adresse.PLZ?.trim() || '',
    ort: adresse.Ort?.trim() || '',
    bundesland: plzZuBundesland(adresse.PLZ) || '',
    land: adresse.Ländercode?.trim() || undefined,
    bezeichnung:
      adresse.Name3?.trim() ||
      adresse.Gruppe?.trim() ||
      adresse.Name2?.trim() ||
      undefined,
    hinweis: adresse.Info?.trim() || undefined,
    mosaikKurzname: referenz.Referenz,
  }));
}

/** Mosaik zahlungsverhalten → KundenZahlungsstatistik */
export function mosaikZahlungsstatistik(
  z: MosaikZahlungsverhalten | undefined
): KundenZahlungsstatistik | undefined {
  if (!z) return undefined;
  return {
    anzahlBuchungen: z.anzahl_buchungen,
    maxMahnstufe: z.max_mahnstufe,
    letzteBuchung: mosaikDatum(z.letzte_buchung),
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

      // Erweiterte Mosaik-Stammdaten automatisch ergänzen (nur leere CRM-Felder),
      // damit beim manuellen Merge keine wertvollen Felder verloren gehen.
      // Nutzer-Auswahl (`plan.patch`) hat Vorrang — sie überschreibt das.
      const erweiterung = this.ergaenzungsPatch(kandidat, aktuell);
      await saisonplanungService.updateKunde(plan.kundeId, {
        ...erweiterung,
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
   *
   * Übernimmt alle wertvollen Mosaik-Felder, damit beim Migrationslauf nichts
   * verloren geht — auch wenn die UI sie heute noch nicht anzeigt.
   */
  entwurfFuerNeuanlage(kandidat: MigrationKandidat): NeuerSaisonKunde {
    const m = kandidat.data.rohdaten;
    const adresse = mosaikAdresse(m);
    const name = (m.Name2 || m.Name3 || m.Name1 || kandidat.mosaikKurzname).trim();
    const zusatzAdressen = mosaikLieferadressen(kandidat.data);
    return {
      typ: leiteKundentypAb(m.Gruppe),
      name,
      kundennummer: undefined, // wird vom saisonplanungService generiert
      rechnungsadresse: adresse,
      lieferadresse: adresse,
      email: m.Kommunikation?.trim() || undefined,
      notizen: m.Info?.trim() || undefined,
      aktiv: !(kandidat.mosaikInaktiv ?? false),
      // === Erweiterte Stammdaten (Paket A) ===
      gruppe: m.Gruppe?.trim() || undefined,
      branche: m.Branche?.trim() || undefined,
      herkunft: m.Herkunft?.trim() || undefined,
      matchcode: m.Matchcode?.trim() || undefined,
      telefon: m.Telefon?.trim() || undefined,
      mobiltelefon: m.Mobiltelefon?.trim() || undefined,
      postfach: m.Postfach?.trim() || undefined,
      postfachort: m.Postfachort?.trim() || undefined,
      laendercode: m.Ländercode?.trim() || undefined,
      // === Risiko / Zahlungsverhalten ===
      mahncode: typeof m.Mahncode === 'number' ? m.Mahncode : undefined,
      zahlungsstatistik: mosaikZahlungsstatistik(kandidat.data.zahlungsverhalten),
      // === Mehrere Lieferadressen ===
      lieferadressen: zusatzAdressen.length > 0 ? zusatzAdressen : undefined,
    };
  },

  /**
   * Berechnet ein Patch für `applyZusammenfuehren`, das ALLE erweiterten
   * Mosaik-Felder ergänzt — aber nur dort, wo das CRM-Feld noch leer ist.
   * Wird vom Pipeline-Orchestrator beim Auto-Merge genutzt; die manuelle
   * Merge-UI baut ihr Patch über die Diff-Auswahl.
   */
  ergaenzungsPatch(kandidat: MigrationKandidat, crm: SaisonKunde): Partial<SaisonKunde> {
    const m = kandidat.data.rohdaten;
    const patch: Partial<SaisonKunde> = {};
    const setze = <K extends keyof SaisonKunde>(key: K, wert: SaisonKunde[K] | undefined) => {
      if (wert === undefined || wert === null || wert === '') return;
      if (crm[key] !== undefined && crm[key] !== null && crm[key] !== '') return;
      patch[key] = wert;
    };
    setze('gruppe', m.Gruppe?.trim() || undefined);
    setze('branche', m.Branche?.trim() || undefined);
    setze('herkunft', m.Herkunft?.trim() || undefined);
    setze('matchcode', m.Matchcode?.trim() || undefined);
    setze('telefon', m.Telefon?.trim() || undefined);
    setze('mobiltelefon', m.Mobiltelefon?.trim() || undefined);
    setze('postfach', m.Postfach?.trim() || undefined);
    setze('postfachort', m.Postfachort?.trim() || undefined);
    setze('laendercode', m.Ländercode?.trim() || undefined);
    setze('mahncode', typeof m.Mahncode === 'number' ? m.Mahncode : undefined);
    // Zahlungsstatistik: nur setzen, wenn CRM noch nichts hat (Mosaik ist Snapshot)
    if (!crm.zahlungsstatistik) {
      const stat = mosaikZahlungsstatistik(kandidat.data.zahlungsverhalten);
      if (stat) patch.zahlungsstatistik = stat;
    }
    // Lieferadressen anhängen (nicht ersetzen) — Mosaik-Quellen werden idempotent
    // gehalten über `mosaikKurzname` auf der Adresse
    const zusatz = mosaikLieferadressen(kandidat.data);
    if (zusatz.length > 0) {
      const bestehend = crm.lieferadressen ?? [];
      const bestehendeKurznamen = new Set(
        bestehend.map((a) => a.mosaikKurzname).filter(Boolean)
      );
      const neu = zusatz.filter(
        (a) => !a.mosaikKurzname || !bestehendeKurznamen.has(a.mosaikKurzname)
      );
      if (neu.length > 0) patch.lieferadressen = [...bestehend, ...neu];
    }
    return patch;
  },
};
