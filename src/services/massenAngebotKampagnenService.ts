/**
 * Kampagnen-Verwaltung für Massen-Angebote.
 *
 * Ein Massen-Angebot ist kein Knopfdruck, sondern ein Vorgang über Tage: mehrere
 * hundert Vereine, E-Mails klären, Mengen prüfen, Sonderfälle nachfragen. Bisher
 * lebte diese Arbeit im Browser-State — ein geschlossenes Fenster warf sie weg.
 *
 * Deshalb hier Kopf und Zeilen getrennt:
 *   massen_angebote        Kampagne (Typ, Saison, Status, Zähler)
 *   massen_angebot_zeilen  eine Zeile je Kunde
 *
 * Eine Zeile zu speichern schreibt wenige hundert Byte. Ein einziges großes
 * Dokument hätte bei jedem Häkchen ein Megabyte neu geschrieben — und zwei
 * offene Tabs hätten sich gegenseitig überschrieben.
 */
import { ID, Query } from 'appwrite';
import {
  databases,
  DATABASE_ID,
  MASSEN_ANGEBOTE_COLLECTION_ID,
  MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID,
  SAISON_DATEN_COLLECTION_ID,
  PROJEKTE_COLLECTION_ID,
  BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID,
} from '../config/appwrite';
import {
  MassenAngebotKampagne,
  MassenAngebotZeile,
  MassenAngebotTyp,
  KampagnenStatus,
  ZeilenMarkierung,
  MASSEN_ANGEBOT_TYP_LABELS,
} from '../types/massenAngebot';
import { auditService } from './auditService';
import { massenAngebotService, ermittleEmpfaenger } from './massenAngebotService';
import { getArtikelPreis } from './stammdatenService';
import { saisonplanungService } from './saisonplanungService';
import { ordneZu, Kundenkontext } from './massenAngebotZielgruppen';
import { MassenAngebotKandidat, ErzeugungsErgebnis } from '../types/massenAngebot';
import { Bezugsweg } from '../types/saisonplanung';

/** Ein Jahr Geschäftsgeschichte eines Kunden. */
export interface BelegHistorieEintrag {
  quelle: 'portal' | 'mosaik';
  jahr: number;
  datum?: string;
  belegTyp?: string;
  belegNummer?: string;
  status: string;
  bezahltAm?: string;
  menge: number;
  preisProTonne: number;
  summe: number;
  /**
   * Woher der Vorgang kam: Anfrageportal, Shop, Platzbau oder direkt.
   *
   * Ein Verein, der über das Formular angefragt und dann nicht bestellt hat,
   * ist etwas anderes als eine tote Karteileiche — er hat sich von selbst
   * gemeldet. Das gehört sichtbar an die Zeile.
   */
  herkunft?: string;
  /**
   * Verweis auf das gespeicherte PDF.
   *
   * Leer, wenn keins existiert — in der Sandbox der Regelfall, weil dorthin die
   * Dokumentzeilen kopiert werden, die Dateien aber bewusst nicht.
   */
  dateiId?: string;
}

/**
 * Die Position, an der Menge und Tonnenpreis hängen.
 *
 * Bevorzugt die gespeicherte `primaerPositionId`; fehlt sie (Zeilen aus einem
 * früheren Lauf), gilt die erste Ziegelmehl-Position mit Tonnen-Einheit.
 */
const zielPosition = (zeile: MassenAngebotZeile): string | undefined =>
  zeile.primaerPositionId ??
  zeile.positionen.find(
    (p) =>
      !p.istBedarfsposition &&
      /^TM-ZM-0[23]$/i.test(String(p.artikelnummer ?? '')) &&
      /^(t|to)$/i.test(String(p.einheit ?? ''))
  )?.id ??
  zeile.positionen.find((p) => !p.istBedarfsposition && /^(t|to)$/i.test(String(p.einheit ?? '')))?.id;

/** Rohform eines Appwrite-Dokuments: bekannte Meta-Felder plus freie Spalten. */
type Dokument = Record<string, unknown> & { $id: string; $createdAt?: string };

/** Felder, die als echte Spalten existieren — der Rest wandert ins data-JSON. */
const ZEILEN_SPALTEN = [
  'kampagneId', 'kundeId', 'kundenname', 'kundennummer', 'markierung', 'ausgewaehlt',
  'menge', 'preisProTonne', 'basisPreisProTonne', 'empfaengerEmail', 'selbstabholer',
  'projektId', 'angebotsnummer', 'versendetAm', 'geaendertAm', 'geaendertVon',
] as const;

function zeileZuPayload(z: Partial<MassenAngebotZeile>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, wert] of Object.entries(z)) {
    if (key === 'id') continue;
    if ((ZEILEN_SPALTEN as readonly string[]).includes(key)) payload[key] = wert;
    else rest[key] = wert;
  }
  payload.data = JSON.stringify(rest);
  return payload;
}

function payloadZuZeile(doc: Dokument): MassenAngebotZeile {
  let rest: Record<string, unknown> = {};
  try {
    rest = doc.data ? (JSON.parse(String(doc.data)) as Record<string, unknown>) : {};
  } catch {
    // Kaputtes JSON darf keine ganze Kampagne unlesbar machen — die echten
    // Spalten (Kunde, Menge, Preis, Markierung) reichen zum Weiterarbeiten.
    rest = {};
  }
  return {
    id: String(doc.$id),
    kampagneId: String(doc.kampagneId ?? ''),
    kundeId: String(doc.kundeId ?? ''),
    kundenname: String(doc.kundenname ?? ''),
    kundennummer: doc.kundennummer ? String(doc.kundennummer) : undefined,
    markierung: (doc.markierung as ZeilenMarkierung) ?? 'offen',
    ausgewaehlt: doc.ausgewaehlt !== false,
    menge: Number(doc.menge ?? 0),
    preisProTonne: Number(doc.preisProTonne ?? 0),
    basisPreisProTonne: doc.basisPreisProTonne != null ? Number(doc.basisPreisProTonne) : undefined,
    empfaengerEmail: doc.empfaengerEmail ? String(doc.empfaengerEmail) : undefined,
    selbstabholer: Boolean(doc.selbstabholer),
    projektId: doc.projektId ? String(doc.projektId) : undefined,
    angebotsnummer: doc.angebotsnummer ? String(doc.angebotsnummer) : undefined,
    versendetAm: doc.versendetAm ? String(doc.versendetAm) : undefined,
    geaendertAm: doc.geaendertAm ? String(doc.geaendertAm) : undefined,
    geaendertVon: doc.geaendertVon ? String(doc.geaendertVon) : undefined,
    herkunft: String((rest.herkunft as string) ?? ''),
    quelle: (rest.quelle as MassenAngebotZeile['quelle']) ?? 'manuell',
    produktprofil: (rest.produktprofil as MassenAngebotZeile['produktprofil']) ?? 'schuettgut',
    referenz: rest.referenz as MassenAngebotZeile['referenz'],
    positionen: (rest.positionen as MassenAngebotZeile['positionen']) ?? [],
    primaerPositionId: rest.primaerPositionId as string | undefined,
    notiz: rest.notiz as string | undefined,
    emailBetreff: rest.emailBetreff as string | undefined,
    emailText: rest.emailText as string | undefined,
    fehler: (rest.fehler as string[]) ?? [],
    warnungen: (rest.warnungen as string[]) ?? [],
  };
}

function dokZuKampagne(doc: Dokument): MassenAngebotKampagne {
  return {
    id: String(doc.$id),
    name: String(doc.name ?? ''),
    typ: (doc.typ as MassenAngebotTyp) ?? 'schuettgut',
    saisonjahr: Number(doc.saisonjahr ?? 0),
    status: (doc.status as KampagnenStatus) ?? 'entwurf',
    erstelltAm: String(doc.erstelltAm ?? doc.$createdAt ?? ''),
    erstelltVon: doc.erstelltVon ? String(doc.erstelltVon) : undefined,
    geaendertAm: doc.geaendertAm ? String(doc.geaendertAm) : undefined,
    versendetAm: doc.versendetAm ? String(doc.versendetAm) : undefined,
    batchId: doc.batchId ? String(doc.batchId) : undefined,
    notiz: doc.notiz ? String(doc.notiz) : undefined,
    preisanpassungProzent: doc.preisanpassungProzent != null ? Number(doc.preisanpassungProzent) : undefined,
    preisanpassungAngewendetAm: doc.preisanpassungAngewendetAm ? String(doc.preisanpassungAngewendetAm) : undefined,
    anzahlZeilen: Number(doc.anzahlZeilen ?? 0),
    anzahlGeprueft: Number(doc.anzahlGeprueft ?? 0),
    anzahlKompliziert: Number(doc.anzahlKompliziert ?? 0),
    anzahlVersendet: Number(doc.anzahlVersendet ?? 0),
  };
}

/** Alle Dokumente einer Abfrage — Appwrite liefert maximal 100 pro Seite. */
async function ladeAlle(collection: string, queries: string[]): Promise<Dokument[]> {
  const raus: Dokument[] = [];
  let cursor: string | undefined;
  for (;;) {
    const q = [...queries, Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DATABASE_ID, collection, q);
    const docs = res.documents as unknown as Dokument[];
    raus.push(...docs);
    if (docs.length < 100) break;
    cursor = String(docs[docs.length - 1].$id);
  }
  return raus;
}

export const massenAngebotKampagnenService = {
  /** Kampagnen einer Saison, neueste zuerst. */
  async ladeKampagnen(saisonjahr?: number): Promise<MassenAngebotKampagne[]> {
    try {
      const queries = [Query.orderDesc('$createdAt')];
      if (saisonjahr) queries.unshift(Query.equal('saisonjahr', saisonjahr));
      const docs = await ladeAlle(MASSEN_ANGEBOTE_COLLECTION_ID, queries);
      return docs.map(dokZuKampagne);
    } catch (error) {
      console.warn('Kampagnen konnten nicht geladen werden:', error);
      return [];
    }
  },

  async ladeKampagne(id: string): Promise<MassenAngebotKampagne | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, MASSEN_ANGEBOTE_COLLECTION_ID, id);
      return dokZuKampagne(doc as unknown as Dokument);
    } catch {
      return null;
    }
  },

  /**
   * Legt eine Kampagne an. Der Name ist frei wählbar; ohne Angabe entsteht
   * „Schüttgut 2027" — eindeutig genug, solange es pro Typ und Saison nur eine
   * gibt, und sonst vom Nutzer überschreibbar.
   */
  async erstelleKampagne(eingabe: {
    typ: MassenAngebotTyp;
    saisonjahr: number;
    name?: string;
    notiz?: string;
    benutzer?: string;
  }): Promise<MassenAngebotKampagne> {
    const jetzt = new Date().toISOString();
    const name = eingabe.name?.trim() || `${MASSEN_ANGEBOT_TYP_LABELS[eingabe.typ]} ${eingabe.saisonjahr}`;
    const doc = await databases.createDocument(
      DATABASE_ID,
      MASSEN_ANGEBOTE_COLLECTION_ID,
      ID.unique(),
      {
        name,
        typ: eingabe.typ,
        saisonjahr: eingabe.saisonjahr,
        status: 'entwurf' as KampagnenStatus,
        erstelltAm: jetzt,
        erstelltVon: eingabe.benutzer,
        geaendertAm: jetzt,
        notiz: eingabe.notiz,
        anzahlZeilen: 0,
        anzahlGeprueft: 0,
        anzahlKompliziert: 0,
        anzahlVersendet: 0,
      }
    );
    auditService.logAktion({
      action: 'create',
      entityType: 'massen_angebot',
      entityId: doc.$id,
      summary: `Massen-Angebot „${name}" angelegt (${MASSEN_ANGEBOT_TYP_LABELS[eingabe.typ]}, Saison ${eingabe.saisonjahr})`,
    });
    return dokZuKampagne(doc as unknown as Dokument);
  },

  async aktualisiereKampagne(
    id: string,
    patch: Partial<Omit<MassenAngebotKampagne, 'id'>>
  ): Promise<void> {
    await databases.updateDocument(DATABASE_ID, MASSEN_ANGEBOTE_COLLECTION_ID, id, {
      ...patch,
      geaendertAm: new Date().toISOString(),
    });
  },

  /**
   * Löscht eine Kampagne samt ihrer Zeilen.
   *
   * Erlaubt nur, solange nichts versendet wurde: Was beim Verein im Postfach
   * liegt, muss nachvollziehbar bleiben. Versendete Kampagnen werden
   * `abgebrochen`, nicht gelöscht.
   */
  async loescheKampagne(
    id: string,
    optionen: { onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
  ): Promise<void> {
    const kampagne = await this.ladeKampagne(id);
    if (kampagne?.status === 'versendet') {
      throw new Error('Eine versendete Kampagne kann nicht gelöscht werden.');
    }
    const zeilen = await ladeAlle(MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, [Query.equal('kampagneId', id)]);

    // Gedrosselt löschen. Appwrite Cloud drosselt schreibende Zugriffe; 89
    // Löschbefehle ohne Pause laufen in ein HTTP 429, und die Kampagne bleibt
    // halb gelöscht zurück — löschbar nur noch über die Konsole.
    let geloescht = 0;
    for (const [index, z] of zeilen.entries()) {
      for (let versuch = 1; versuch <= 4; versuch++) {
        try {
          await databases.deleteDocument(DATABASE_ID, MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, String(z.$id));
          geloescht++;
          break;
        } catch (error) {
          const status = (error as { code?: number })?.code;
          // 404: schon weg (etwa aus einem abgebrochenen Vorlauf) — kein Fehler.
          if (status === 404) break;
          if (status === 429 && versuch < 4) {
            await new Promise((r) => setTimeout(r, versuch * 2000));
            continue;
          }
          if (versuch === 4) throw error;
        }
      }
      optionen.onFortschritt?.(index + 1, zeilen.length);
      await new Promise((r) => setTimeout(r, 320));
    }

    await databases.deleteDocument(DATABASE_ID, MASSEN_ANGEBOTE_COLLECTION_ID, id);
    auditService.logAktion({
      action: 'delete',
      entityType: 'massen_angebot',
      entityId: id,
      summary: `Massen-Angebot „${kampagne?.name ?? id}" mit ${geloescht} von ${zeilen.length} Zeilen gelöscht`,
    });
  },

  /**
   * Ermittelt die Zielgruppe und legt die Zeilen an.
   *
   * Die Mengen- und Preisberechnung kommt unverändert aus `sammleKandidaten` —
   * dort steckt die gesamte Referenzlogik („größte Bestellung des Jahres",
   * Preisanpassung, PLZ-Kalkulation). Neu ist nur der Filter: Welcher Kunde
   * gehört in DIESEN Lauf.
   *
   * Bereits vorhandene Zeilen bleiben unangetastet. Ein zweiter Aufruf ergänzt
   * nur Kunden, die noch fehlen — sonst wären drei Tage Handarbeit weg.
   */
  async befuelleKampagne(
    kampagne: MassenAngebotKampagne,
    optionen: {
      benutzer?: string;
      onFortschritt?: (schritt: string, prozent: number) => void;
    } = {}
  ): Promise<{ aufgenommen: number; uebersprungen: number; bereitsVorhanden: number; aufgefrischt: number; ausschlussGruende: Record<string, number> }> {
    const melde = optionen.onFortschritt ?? (() => {});

    const kandidaten = await massenAngebotService.sammleKandidaten(kampagne.saisonjahr, melde);

    // Bezugsweg der Vorsaison — das einzige Signal für den Instandsetzungs-Lauf.
    // `sammleKandidaten` lädt ihn intern, gibt ihn aber nicht heraus.
    melde('Lade Bezugswege der Vorsaison…', 92);
    const bezugswege = new Map<string, Bezugsweg>();
    try {
      const docs = await ladeAlle(SAISON_DATEN_COLLECTION_ID, [
        Query.equal('saisonjahr', kampagne.saisonjahr - 1),
      ]);
      for (const d of docs) {
        try {
          const daten = JSON.parse(String(d.data ?? '{}')) as { bezugsweg?: Bezugsweg };
          if (daten.bezugsweg) bezugswege.set(String(d.kundeId), daten.bezugsweg);
        } catch {
          // Eine unlesbare Saisonzeile darf den ganzen Lauf nicht kippen.
        }
      }
    } catch (error) {
      console.warn('Bezugswege konnten nicht geladen werden:', error);
    }

    // Herkunft der Referenzprojekte — „kam über das Anfrageformular" macht aus
    // einer stillen Zeile einen Verein, der sich selbst gemeldet hat.
    melde('Lade Herkunft der Vorjahres-Projekte…', 94);
    const herkunftJeProjekt = new Map<string, string>();
    try {
      const projekte = await ladeAlle(PROJEKTE_COLLECTION_ID, [
        Query.equal('saisonjahr', kampagne.saisonjahr - 1),
      ]);
      for (const p of projekte) {
        if (p.herkunft) herkunftJeProjekt.set(String(p.$id), String(p.herkunft));
      }
    } catch (error) {
      console.warn('Herkunft konnte nicht geladen werden:', error);
    }

    /**
     * Absenderadressen aus dem Anfrageportal.
     *
     * Das Feld `projekt.herkunft` gibt es erst seit Kurzem — bei 359 der 592
     * Vorjahresprojekte steht es gar nicht, und `anfragen.kundeId` und
     * `.projektId` sind durchweg leer.
     *
     * Die Adresse steht in `extrahierteDaten.email`, NICHT in `emailAbsender`:
     * Dort steht bei jeder Anfrage `mail@tennismehl.com`, weil das
     * Kontaktformular der Website die Nachricht weiterleitet. Wer darauf
     * matcht, findet genau nichts.
     *
     * Bewusst eine Heuristik — sie ergänzt die gepflegte Herkunft, ersetzt sie
     * nicht.
     */
    const anfrageAbsender = new Set<string>();
    try {
      const anfragen = await ladeAlle('anfragen', []);
      for (const a of anfragen) {
        let email = '';
        try {
          const extrahiert = JSON.parse(String(a.extrahierteDaten ?? '{}')) as { email?: string };
          email = String(extrahiert.email ?? '');
        } catch {
          // Unlesbare Anfrage — der Rückfall unten sucht im Rohtext.
        }
        if (!email) {
          const imText = String(a.emailText ?? '').match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g) ?? [];
          email = imText.find((m) => !/tennismehl/i.test(m)) ?? '';
        }
        if (email) anfrageAbsender.add(email.toLowerCase().trim());
      }
    } catch (error) {
      console.warn('Anfragen konnten nicht geladen werden:', error);
    }

    melde('Ordne Kunden dem Sortiment zu…', 95);
    const vorhandene = await this.ladeZeilen(kampagne.id);

    const neueZeilen: Array<Partial<MassenAngebotZeile>> = [];
    const ausschlussGruende: Record<string, number> = {};
    let uebersprungen = 0;
    let bereitsVorhanden = 0;

    // Vorhandene Zeilen: Nur die abgeleiteten Angaben auffrischen (Herkunft,
    // Warnungen), niemals die Eingaben des Bearbeiters. Sonst trüge eine Liste
    // nach einer Regeländerung weiter die alte, womöglich falsche Begründung —
    // und „Bezog 2026" stünde da, wo in Wahrheit nur ein Angebot lag.
    const vorhandeneNachKunde = new Map(vorhandene.map((z) => [z.kundeId, z]));
    const aufzufrischen: Array<Partial<MassenAngebotZeile>> = [];

    for (const kandidat of kandidaten) {
      const alteZeile = vorhandeneNachKunde.get(kandidat.kundeId);
      if (alteZeile) {
        bereitsVorhanden++;
        const kontextAlt: Kundenkontext = {
          kunde: kandidat.kunde,
          bezugswegVorjahr: bezugswege.get(kandidat.kundeId) ?? kandidat.kunde.standardBezugsweg,
          belege: kandidat.referenz
            ? [{ jahr: kandidat.referenz.jahr ?? kampagne.saisonjahr - 1, positionen: kandidat.positionen, typ: kandidat.referenz.typ }]
            : [],
          hatZielsaisonProjekt: kandidat.status === 'existiert',
          mosaikLetztesJahr: kandidat.quelle === 'mosaik' ? kandidat.referenz?.jahr : undefined,
        };
        const neu = ordneZu(kontextAlt, kampagne.typ);
        const neueWarnungen = neu.nurAngebotKeineBestellung
          ? [...kandidat.warnungen, 'Nur ein Angebot im Vorjahr — es kam zu keiner Bestellung']
          : kandidat.warnungen;
        if (alteZeile.herkunft !== neu.herkunft || alteZeile.warnungen.join('|') !== neueWarnungen.join('|')) {
          aufzufrischen.push({ ...alteZeile, herkunft: neu.herkunft, warnungen: neueWarnungen, referenz: kandidat.referenz });
        }
        continue;
      }

      const kontext: Kundenkontext = {
        kunde: kandidat.kunde,
        bezugswegVorjahr: bezugswege.get(kandidat.kundeId) ?? kandidat.kunde.standardBezugsweg,
        // Die Positionen des Kandidaten sind aus den Vorjahresbelegen abgeleitet
        // und tragen deren Artikelnummern — sie taugen als Produktprofil-Basis.
        belege: kandidat.referenz
          ? [{
              jahr: kandidat.referenz.jahr ?? kampagne.saisonjahr - 1,
              positionen: kandidat.positionen,
              typ: kandidat.referenz.typ,
              herkunft:
                herkunftJeProjekt.get(kandidat.referenz.projektId ?? '') ??
                (kandidat.empfaengerEmail &&
                anfrageAbsender.has(kandidat.empfaengerEmail.split(',')[0].trim().toLowerCase())
                  ? 'anfrage'
                  : undefined),
            }]
          : [],
        hatZielsaisonProjekt: kandidat.status === 'existiert',
        mosaikLetztesJahr: kandidat.quelle === 'mosaik' ? kandidat.referenz?.jahr : undefined,
      };

      const zuordnung = ordneZu(kontext, kampagne.typ);
      if (!zuordnung.passt) {
        uebersprungen++;
        const grund = zuordnung.hartAusgeschlossen ?? zuordnung.herkunft;
        ausschlussGruende[grund] = (ausschlussGruende[grund] ?? 0) + 1;
        continue;
      }

      neueZeilen.push({
        kundeId: kandidat.kundeId,
        kundenname: kandidat.kundenname,
        kundennummer: kandidat.kundennummer,
        markierung: 'offen',
        ausgewaehlt: kandidat.fehler.length === 0,
        menge: kandidat.menge,
        preisProTonne: kandidat.preisProTonne,
        // Der Vorjahrespreis bleibt erhalten — er ist die Basis jeder späteren
        // Preisanpassung und beantwortet die Frage „was zahlte er zuletzt?".
        basisPreisProTonne: kandidat.preisProTonne,
        empfaengerEmail: kandidat.empfaengerEmail,
        selbstabholer: zuordnung.selbstabholer,
        herkunft: zuordnung.herkunft,
        quelle: zuordnung.quelle,
        produktprofil: zuordnung.produktprofil,
        referenz: kandidat.referenz,
        positionen: kandidat.positionen,
        primaerPositionId: kandidat.primaerPositionId,
        notiz: kandidat.notiz,
        fehler: kandidat.fehler,
        // Ein Angebot ohne Bestellung ist kein Bezug. Die Warnung steht an der
        // Zeile, damit sie beim Durchgehen auffällt statt erst beim Versand.
        warnungen: zuordnung.nurAngebotKeineBestellung
          ? [...kandidat.warnungen, 'Nur ein Angebot im Vorjahr — es kam zu keiner Bestellung']
          : kandidat.warnungen,
      });
    }

    if (aufzufrischen.length > 0) {
      melde(`Frische ${aufzufrischen.length} Begründungen auf…`, 96);
      await this.speichereZeilen(kampagne.id, aufzufrischen, { benutzer: optionen.benutzer });
    }

    if (neueZeilen.length > 0) {
      await this.speichereZeilen(kampagne.id, neueZeilen, {
        benutzer: optionen.benutzer,
        onFortschritt: (erledigt, gesamt) =>
          melde(`Speichere Zeilen… ${erledigt}/${gesamt}`, 95 + Math.round((erledigt / gesamt) * 5)),
      });
    }

    if (kampagne.status === 'entwurf' && neueZeilen.length > 0) {
      await this.aktualisiereKampagne(kampagne.id, { status: 'in_bearbeitung' });
    }

    auditService.logAktion({
      action: 'update',
      entityType: 'massen_angebot',
      entityId: kampagne.id,
      summary: `„${kampagne.name}": ${neueZeilen.length} Kunden aufgenommen, ${uebersprungen} nicht zugeordnet`,
    });

    melde('Fertig', 100);
    return { aufgenommen: neueZeilen.length, uebersprungen, bereitsVorhanden, aufgefrischt: aufzufrischen.length, ausschlussGruende };
  },

  /**
   * Schreibt die Preissteigerung der Kampagne auf alle offenen Zeilen.
   *
   * Rechnet IMMER vom gespeicherten Vorjahrespreis aus, nie vom aktuellen.
   * Zweimal 4 % ergeben so 4 % und nicht 8,16 % — und wer den Prozentsatz von
   * 4 auf 6 korrigiert, bekommt 6 % statt 10,24 %.
   *
   * Versendete Zeilen bleiben unberührt: Der Verein hat den Preis schwarz auf
   * weiß, den ändert kein nachträglicher Lauf mehr.
   */
  async wendePreisanpassungAn(
    kampagne: MassenAngebotKampagne,
    prozent: number,
    optionen: { benutzer?: string; onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
  ): Promise<{ angepasst: number; uebersprungen: number }> {
    const zeilen = await this.ladeZeilen(kampagne.id);
    const zuAendern = zeilen.filter((z) => !z.versendetAm && (z.basisPreisProTonne ?? z.preisProTonne) > 0);
    const faktor = 1 + prozent / 100;
    let angepasst = 0;

    for (const [index, z] of zuAendern.entries()) {
      const basis = z.basisPreisProTonne ?? z.preisProTonne;
      const neuerPreis = Math.round(basis * faktor * 100) / 100;
      // NUR die Primärposition — Einwegpalette, Entladung und Frachtpauschale
      // haben eigene Preise und dürfen den Tonnenpreis nicht erben.
      const primaer = zielPosition(z);
      const positionen = z.positionen.map((pos) =>
        pos.id === primaer
          ? { ...pos, einzelpreis: neuerPreis, gesamtpreis: Math.round((pos.menge ?? 0) * neuerPreis * 100) / 100 }
          : pos
      );
      try {
        await this.speichereZeile(
          { ...z, basisPreisProTonne: basis, preisProTonne: neuerPreis, positionen },
          optionen.benutzer
        );
        angepasst++;
      } catch (error) {
        console.error(`Preisanpassung für ${z.kundenname} fehlgeschlagen:`, error);
      }
      optionen.onFortschritt?.(index + 1, zuAendern.length);
      await new Promise((r) => setTimeout(r, 320));
    }

    await this.aktualisiereKampagne(kampagne.id, {
      preisanpassungProzent: prozent,
      preisanpassungAngewendetAm: new Date().toISOString(),
    });
    auditService.logAktion({
      action: 'update',
      entityType: 'massen_angebot',
      entityId: kampagne.id,
      summary: `„${kampagne.name}": Preisanpassung ${prozent > 0 ? '+' : ''}${prozent} % auf ${angepasst} Zeilen`,
    });
    return { angepasst, uebersprungen: zeilen.length - zuAendern.length };
  },

  /**
   * Erzeugt und versendet EINE Zeile.
   *
   * Der Weg durch mehrere hundert Vereine ist selten ein Rutsch: Man klärt
   * einen Fall, will ihn loswerden und zum nächsten. Ohne Einzelversand müsste
   * man bis zum Ende aller Prüfungen warten, bevor die erste Mail rausgeht.
   */
  async erzeugeUndVersendeZeile(
    kampagne: MassenAngebotKampagne,
    zeile: MassenAngebotZeile,
    optionen: { testModus: boolean; benutzer?: string }
  ): Promise<{ angebotsnummer?: string; versendet: boolean; fehler?: string }> {
    if (kampagne.status === 'versendet') throw new Error('Kampagne ist bereits abgeschlossen.');
    if (!zeile.empfaengerEmail) throw new Error('Keine Empfänger-Adresse hinterlegt.');

    let projektId = zeile.projektId;
    let angebotsnummer = zeile.angebotsnummer;

    // Erzeugen, falls noch kein Projekt existiert.
    if (!projektId) {
      const ergebnis = await this.erzeugeAusKampagne(kampagne, {
        benutzer: optionen.benutzer,
        nurZeilenIds: [zeile.id],
      });
      const treffer = ergebnis.erzeugt.find((e) => e.kundeId === zeile.kundeId);
      if (!treffer) {
        const grund = ergebnis.fehler.find((f) => f.kundeId === zeile.kundeId)?.fehler
          ?? ergebnis.uebersprungen.find((u) => u.kundeId === zeile.kundeId)?.grund
          ?? 'Angebot konnte nicht erzeugt werden.';
        throw new Error(grund);
      }
      projektId = treffer.projektId;
      angebotsnummer = treffer.angebotsnummer;
      // Kurz warten: Das Angebotsdokument wird direkt nach dem Projekt
      // geschrieben; ein sofortiger Lesezugriff findet es sonst noch nicht.
      await new Promise((r) => setTimeout(r, 800));
    }

    const ergebnis = await massenAngebotService.versendeBatch(
      [{
        projektId: projektId!, kundeId: zeile.kundeId, kundenname: zeile.kundenname,
        angebotsnummer, empfaengerEmail: zeile.empfaengerEmail, emailFehlt: false, ausgewaehlt: true,
        emailBetreff: zeile.emailBetreff, emailText: zeile.emailText,
      }],
      optionen.testModus
    );
    const fehler = ergebnis.fehler[0]?.fehler;
    if (!fehler) {
      // Ein Testversand ist kein Versand: Beim Verein kommt nichts an, und die
      // Zeile muss offen bleiben. Würde sie hier auf „versendet/geprüft"
      // springen, verschwände sie aus dem Arbeitsvorrat — und der Verein bekäme
      // sein Angebot nie, weil die Liste behauptet, es sei erledigt.
      //
      // Die Angebotsnummer wird trotzdem festgehalten: Das Projekt IST erzeugt,
      // und ein zweiter Lauf darf es nicht doppelt anlegen.
      await this.speichereZeile(
        optionen.testModus
          ? { ...zeile, projektId, angebotsnummer }
          : { ...zeile, projektId, angebotsnummer, versendetAm: new Date().toISOString(), markierung: 'geprueft' },
        optionen.benutzer
      );
    }
    await this.aktualisiereZaehler(kampagne.id);
    return { angebotsnummer, versendet: !fehler, fehler };
  },

  /**
   * Setzt eine Markierung auf viele Zeilen gleichzeitig.
   *
   * Gedrosselt wie jede Schreiboperation hier: Appwrite quittiert schnelle
   * Serien mit HTTP 429, und eine halb angewandte Sammelaktion ist schlimmer
   * als gar keine — man weiß hinterher nicht, was gilt.
   */
  async setzeMarkierungFuerViele(
    zeilen: MassenAngebotZeile[],
    markierung: ZeilenMarkierung,
    optionen: { benutzer?: string; onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
  ): Promise<{ erledigt: number; fehler: number }> {
    let erledigt = 0, fehler = 0;
    for (const [index, z] of zeilen.entries()) {
      try {
        await this.speichereZeile(
          { ...z, markierung, ausgewaehlt: markierung === 'geprueft' },
          optionen.benutzer
        );
        erledigt++;
      } catch (error) {
        fehler++;
        console.error(`Markierung für ${z.kundenname} fehlgeschlagen:`, error);
      }
      optionen.onFortschritt?.(index + 1, zeilen.length);
      await new Promise((r) => setTimeout(r, 320));
    }
    if (zeilen[0]) await this.aktualisiereZaehler(zeilen[0].kampagneId);
    return { erledigt, fehler };
  },

  /** Verschiebt mehrere Zeilen in eine andere Kampagne. */
  async verschiebeViele(
    zeilen: MassenAngebotZeile[],
    zielKampagne: MassenAngebotKampagne,
    optionen: { benutzer?: string; onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
  ): Promise<{ erledigt: number; fehler: Array<{ kundenname: string; grund: string }> }> {
    let erledigt = 0;
    const fehler: Array<{ kundenname: string; grund: string }> = [];
    for (const [index, z] of zeilen.entries()) {
      try {
        await this.verschiebeZeile(z, zielKampagne, { benutzer: optionen.benutzer, bezugswegNachtragen: true });
        erledigt++;
      } catch (error) {
        fehler.push({ kundenname: z.kundenname, grund: error instanceof Error ? error.message : 'Unbekannt' });
      }
      optionen.onFortschritt?.(index + 1, zeilen.length);
      await new Promise((r) => setTimeout(r, 320));
    }
    return { erledigt, fehler };
  },

  /**
   * Nimmt einen Kunden von Hand in die Kampagne auf.
   *
   * Die automatische Zuordnung kann nur aus Daten schließen, die da sind. Bei
   * einem reinen Palettenkunden, dessen Vorjahresbelege fehlen, gibt es nichts
   * zu erkennen — er muss von Hand dazu. Menge und Preis kommen aus der
   * normalen Kandidatenberechnung, damit die Zeile denselben Stand hat wie eine
   * automatisch gefundene.
   *
   * Der Zuordnungsfilter wird dabei bewusst übergangen: Der Mensch weiß es
   * besser als die Regel. Die Herkunft hält fest, dass es eine Handentscheidung
   * war — sonst sieht die Zeile später aus wie ein Automatikfund.
   */
  async fuegeKundenHinzu(
    kampagne: MassenAngebotKampagne,
    kundeId: string,
    optionen: { benutzer?: string } = {}
  ): Promise<MassenAngebotZeile> {
    if (kampagne.status === 'versendet') {
      throw new Error('Diese Kampagne ist bereits versendet.');
    }
    const vorhandene = await this.ladeZeilen(kampagne.id);
    if (vorhandene.some((z) => z.kundeId === kundeId)) {
      throw new Error('Dieser Kunde steht bereits in der Liste.');
    }

    const kandidaten = await massenAngebotService.sammleKandidaten(kampagne.saisonjahr);
    const kandidat = kandidaten.find((k) => k.kundeId === kundeId);

    // Ohne Kandidat (kein Opt-in, keine Referenz) trotzdem aufnehmen — nur eben
    // mit den Stammdaten des Kunden und ohne berechnete Menge. Ein Kunde, den
    // der Bearbeiter bewusst sucht, darf nicht an einer Regel scheitern.
    const kunde = kandidat?.kunde ?? (await saisonplanungService.loadKunde(kundeId));
    if (!kunde) throw new Error('Kunde nicht gefunden');

    const zeile: Partial<MassenAngebotZeile> = {
      kundeId,
      kundenname: kunde.name,
      kundennummer: kunde.kundennummer,
      markierung: 'offen',
      ausgewaehlt: false, // bewusst abgewählt: erst prüfen, dann mitschicken
      menge: kandidat?.menge ?? 0,
      preisProTonne: kandidat?.preisProTonne ?? 0,
      // Dieselbe Regel wie im Versand: Der gepflegte Angebots-Verteiler
      // (`angebotsEmails`) hat Vorrang. Wer hier nur `rechnungsEmail || email`
      // liest, übersieht genau die Adressen, die in der Empfänger-Klärung
      // eingetragen wurden — die Zeile bliebe leer, obwohl sie geklärt ist.
      empfaengerEmail: kandidat?.empfaengerEmail ?? ermittleEmpfaenger(kunde),
      selbstabholer: kunde.belieferungsart === 'abholung_ab_werk',
      herkunft: `Von Hand hinzugefügt${optionen.benutzer ? ` von ${optionen.benutzer}` : ''}` +
        (kandidat ? ` · berechnet aus ${kandidat.quelle}` : ' · keine Vorjahresdaten, Menge und Preis prüfen'),
      quelle: 'manuell',
      produktprofil: kandidat?.produktprofil ?? 'schuettgut',
      referenz: kandidat?.referenz,
      positionen: kandidat?.positionen ?? [],
      fehler: [],
      warnungen: kandidat ? kandidat.warnungen : ['Ohne Vorjahresbezug aufgenommen — Menge und Preis prüfen'],
    };

    await this.speichereZeilen(kampagne.id, [zeile], { benutzer: optionen.benutzer });
    auditService.logAktion({
      action: 'update',
      entityType: 'massen_angebot',
      entityId: kampagne.id,
      summary: `„${kampagne.name}": ${kunde.name} von Hand aufgenommen`,
    });
    const neu = await this.ladeZeilen(kampagne.id);
    return neu.find((z) => z.kundeId === kundeId)!;
  },

  /**
   * Verschiebt einen Kunden in einen anderen Lauf.
   *
   * Das ist der Weg, über den der Kundenstamm besser wird: Fällt beim
   * Durchgehen auf, dass ein Verein eigentlich die Instandsetzung beauftragt
   * hat, wandert er nicht nur in die richtige Liste — der Bezugsweg wird am
   * Kunden nachgetragen. Nächste Saison steht er von allein richtig.
   */
  async verschiebeZeile(
    zeile: MassenAngebotZeile,
    zielKampagne: MassenAngebotKampagne,
    optionen: { benutzer?: string; bezugswegNachtragen?: boolean } = {}
  ): Promise<void> {
    if (zielKampagne.status === 'versendet') {
      throw new Error('In ein bereits versendetes Massen-Angebot kann nicht verschoben werden.');
    }
    const vorhandene = await this.ladeZeilen(zielKampagne.id);
    if (vorhandene.some((z) => z.kundeId === zeile.kundeId)) {
      throw new Error(`${zeile.kundenname} steht dort bereits.`);
    }

    const herkunft = `Aus „${zeile.kundenname}"-Zuordnung verschoben · vorher: ${zeile.herkunft}`;
    await databases.updateDocument(DATABASE_ID, MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, zeile.id, {
      kampagneId: zielKampagne.id,
      markierung: 'offen',
      geaendertAm: new Date().toISOString(),
      geaendertVon: optionen.benutzer,
      data: JSON.stringify({
        herkunft,
        quelle: zeile.quelle,
        produktprofil: zeile.produktprofil,
        referenz: zeile.referenz,
        positionen: zeile.positionen,
        notiz: zeile.notiz,
        fehler: zeile.fehler,
        warnungen: zeile.warnungen,
      }),
    });

    // Rückschreibung in den Kundenstamm — der eigentliche Gewinn.
    //
    // Beide Felder sind heute praktisch ungepflegt: `direkt_instandsetzung`
    // steht bei 10 Kunden, `abholung_ab_werk` bei keinem einzigen. Die
    // automatische Zuordnung kann daraus nichts erkennen. Trägt aber jede
    // Handentscheidung das Merkmal am Kunden nach, füllen sich die Läufe von
    // Jahr zu Jahr von allein.
    if (optionen.bezugswegNachtragen) {
      try {
        if (zielKampagne.typ === 'fruehjahrsinstandsetzung') {
          await saisonplanungService.updateKunde(zeile.kundeId, {
            standardBezugsweg: 'direkt_instandsetzung',
          });
        } else if (zielKampagne.typ === 'abholung') {
          await saisonplanungService.updateKunde(zeile.kundeId, {
            belieferungsart: 'abholung_ab_werk',
          });
        }
      } catch (error) {
        console.warn('Merkmal konnte nicht am Kunden nachgetragen werden:', error);
      }
    }

    await this.aktualisiereZaehler(zeile.kampagneId);
    await this.aktualisiereZaehler(zielKampagne.id);
  },

  /**
   * Erzeugt aus den angewählten Zeilen Projekte samt Angebot.
   *
   * Die eigentliche Arbeit macht unverändert `erzeugeBatch` — Belegnummer
   * ziehen, Projekt anlegen, Angebot speichern, Protokoll schreiben. Neu ist
   * nur, dass das Ergebnis in die Zeilen zurückfließt: Danach steht an jeder
   * Zeile, welches Projekt und welche Angebotsnummer daraus wurde.
   *
   * Zeilen mit Markierung `archivieren`, `platzbauer` oder `zurueckgestellt`
   * bleiben außen vor — sie wurden bewusst beiseitegelegt.
   */
  async erzeugeAusKampagne(
    kampagne: MassenAngebotKampagne,
    optionen: {
      benutzer?: string;
      limit?: number;
      /**
       * Nur diese Zeilen erzeugen.
       *
       * Ohne die Einschränkung nimmt der Lauf die ersten offenen Zeilen — bei
       * einem Einzelversand entstünde ein Angebot für den falschen Verein, und
       * der anschließende Versand fände für den gewünschten kein Dokument.
       */
      nurZeilenIds?: string[];
      onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void;
    } = {}
  ): Promise<ErzeugungsErgebnis & { zeilenAktualisiert: number }> {
    if (kampagne.status === 'versendet') {
      throw new Error('Diese Kampagne ist bereits versendet.');
    }
    const zeilen = await this.ladeZeilen(kampagne.id);
    const beiseite = new Set(['archivieren', 'platzbauer', 'zurueckgestellt']);
    const nurDiese = optionen.nurZeilenIds ? new Set(optionen.nurZeilenIds) : null;
    const offen = zeilen.filter(
      (z) =>
        (nurDiese ? nurDiese.has(z.id) : z.ausgewaehlt) &&
        !z.projektId &&
        !beiseite.has(z.markierung) &&
        z.fehler.length === 0
    );
    if (offen.length === 0) {
      throw new Error('Keine Zeile ist zur Erzeugung bereit — nichts angewählt oder alles schon erzeugt.');
    }

    // Der volle Kundendatensatz steckt bewusst nicht in der Zeile (zu groß) —
    // für die Erzeugung wird er hier einmal nachgeladen.
    const alleKunden = await saisonplanungService.loadAlleKunden();
    const kundenMap = new Map(alleKunden.map((k) => [k.id, k]));

    const kandidaten: MassenAngebotKandidat[] = [];
    const ohneKunde: string[] = [];
    for (const z of offen) {
      const kunde = kundenMap.get(z.kundeId);
      if (!kunde) { ohneKunde.push(z.kundenname); continue; }
      kandidaten.push({
        kundeId: z.kundeId,
        kundenname: z.kundenname,
        kundennummer: z.kundennummer,
        typ: kunde.typ,
        quelle: z.quelle,
        status: 'neu',
        menge: z.menge,
        preisProTonne: z.preisProTonne,
        // Summe ALLER Positionen ohne Bedarf — nicht `menge * preisProTonne`.
        // Bei einem Instandsetzungsangebot (Anfahrt, Arbeitszeit, Folie) wäre
        // das nur der Warenanteil und damit ein Bruchteil des Auftragswerts.
        angebotssumme: Number(
          z.positionen
            .filter((p) => !p.istBedarfsposition)
            .reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0)
            .toFixed(2)
        ),
        empfaengerEmail: z.empfaengerEmail,
        emailFehlt: !z.empfaengerEmail,
        produktprofil: z.produktprofil,
        referenz: z.referenz,
        notiz: z.notiz,
        positionen: z.positionen,
        fehler: [],
        warnungen: z.warnungen,
        ausgewaehlt: true,
        kunde,
      });
    }
    if (ohneKunde.length > 0) {
      console.warn('Zeilen ohne Kundendatensatz übersprungen:', ohneKunde);
    }

    const ergebnis = await massenAngebotService.erzeugeBatch(kandidaten, kampagne.saisonjahr, {
      benutzer: optionen.benutzer,
      limit: optionen.limit,
      onFortschritt: optionen.onFortschritt,
    });

    // Ergebnis zurück in die Zeilen — sonst wüsste beim nächsten Öffnen niemand,
    // was schon erzeugt wurde, und ein zweiter Lauf legte alles doppelt an.
    const zeileNachKunde = new Map(offen.map((z) => [z.kundeId, z]));
    let zeilenAktualisiert = 0;
    for (const e of ergebnis.erzeugt) {
      const z = zeileNachKunde.get(e.kundeId);
      if (!z) continue;
      try {
        await this.speichereZeile(
          { ...z, projektId: e.projektId, angebotsnummer: e.angebotsnummer, markierung: 'geprueft' },
          optionen.benutzer
        );
        zeilenAktualisiert++;
      } catch (error) {
        console.error(`Zeile ${z.kundenname} konnte nicht fortgeschrieben werden:`, error);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    await this.aktualisiereKampagne(kampagne.id, {
      batchId: ergebnis.batchId,
      status: 'in_bearbeitung',
    });
    await this.aktualisiereZaehler(kampagne.id);

    auditService.logAktion({
      action: 'create',
      entityType: 'massen_angebot',
      entityId: kampagne.id,
      summary: `„${kampagne.name}": ${ergebnis.erzeugt.length} Angebote erzeugt, ${ergebnis.fehler.length} Fehler`,
    });

    return { ...ergebnis, zeilenAktualisiert };
  },

  /**
   * Versendet die erzeugten Angebote der Kampagne.
   *
   * Setzt die Kampagne danach auf `versendet` — aber nur, wenn nichts mehr
   * offen ist. Ein Teilversand darf den Rest nicht aussperren.
   */
  async versendeAusKampagne(
    kampagne: MassenAngebotKampagne,
    optionen: {
      testModus: boolean;
      benutzer?: string;
      onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void;
      abbruchSignal?: () => boolean;
    }
  ): Promise<{ gesendet: number; fehler: { kundenname: string; fehler: string }[]; abgeschlossen: boolean }> {
    if (!kampagne.batchId) {
      throw new Error('Für diese Kampagne wurden noch keine Angebote erzeugt.');
    }
    const zeilen = await this.ladeZeilen(kampagne.id);
    const versandbereit = zeilen.filter((z) => z.projektId && !z.versendetAm && z.empfaengerEmail);
    if (versandbereit.length === 0) {
      throw new Error('Keine Zeile ist versandbereit — kein Angebot erzeugt oder alle schon verschickt.');
    }

    const kandidaten = versandbereit.map((z) => ({
      projektId: z.projektId!,
      kundeId: z.kundeId,
      kundenname: z.kundenname,
      angebotsnummer: z.angebotsnummer,
      empfaengerEmail: z.empfaengerEmail,
      emailFehlt: false,
      ausgewaehlt: true,
      emailBetreff: z.emailBetreff,
      emailText: z.emailText,
    }));

    const ergebnis = await massenAngebotService.versendeBatch(
      kandidaten,
      optionen.testModus,
      optionen.onFortschritt,
      { abbruchSignal: optionen.abbruchSignal }
    );

    // Nur die tatsächlich gesendeten fortschreiben. Wer eine Mail bekommen hat,
    // darf in keinem Wiederholungslauf ein zweites Mal angeschrieben werden.
    const gescheitert = new Set(ergebnis.fehler.map((f) => f.kundenname));
    const jetzt = new Date().toISOString();
    for (const z of versandbereit) {
      if (gescheitert.has(z.kundenname)) continue;
      try {
        await this.speichereZeile({ ...z, versendetAm: jetzt }, optionen.benutzer);
      } catch (error) {
        console.error(`Versanddatum für ${z.kundenname} nicht gespeichert:`, error);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    await this.aktualisiereZaehler(kampagne.id);
    const nachher = await this.ladeZeilen(kampagne.id);
    const nochOffen = nachher.some((z) => z.projektId && !z.versendetAm);
    if (!nochOffen && !optionen.testModus) {
      await this.aktualisiereKampagne(kampagne.id, { status: 'versendet', versendetAm: jetzt });
    }

    auditService.logAktion({
      action: 'update',
      entityType: 'massen_angebot',
      entityId: kampagne.id,
      summary: `„${kampagne.name}": ${ergebnis.gesendet} Angebote versendet${optionen.testModus ? ' (Testmodus)' : ''}, ${ergebnis.fehler.length} Fehler`,
    });

    return { gesendet: ergebnis.gesendet, fehler: ergebnis.fehler, abgeschlossen: !nochOffen };
  },

  /**
   * Die Geschäftshistorie eines Kunden — was er wann zu welchem Preis bekam.
   *
   * Der Referenzbeleg allein beantwortet die Frage nicht, die vor dem Angebot
   * steht: Ist das ein treuer Kunde oder einer, der einmal angefragt und nie
   * bestellt hat? Bezahlt er? Ist der Preis über die Jahre gestiegen? Dafür
   * braucht es die Kette, nicht den einzelnen Beleg.
   *
   * Zwei Quellen, weil das Portal erst 2026 lief: eigene Projekte samt Belegen
   * und die aus Mosaik übernommene Preishistorie für die Jahre davor.
   */
  async ladeBelegHistorie(kundeId: string, preisHistorie: Array<{ saisonjahr: number; preisProTonne: number }> = []): Promise<BelegHistorieEintrag[]> {
    const eintraege: BelegHistorieEintrag[] = [];

    try {
      const projekte = await ladeAlle(PROJEKTE_COLLECTION_ID, [Query.equal('kundeId', kundeId)]);
      for (const p of projekte) {
        const projektId = String(p.$id);
        let belege: Dokument[] = [];
        try {
          belege = await ladeAlle(BESTELLABWICKLUNG_DOKUMENTE_COLLECTION_ID, [Query.equal('projektId', projektId)]);
        } catch {
          // Ohne Belege bleibt der Projekteintrag trotzdem stehen — er zeigt
          // wenigstens, dass es einen Vorgang gab.
        }

        // Der aussagekräftigste Beleg gewinnt: Rechnung schlägt AB schlägt Angebot.
        const rang = { rechnung: 3, auftragsbestaetigung: 2, lieferschein: 2, angebot: 1 } as Record<string, number>;
        const beste = belege
          .filter((b) => rang[String(b.dokumentTyp)] !== undefined)
          .sort((a, b) => (rang[String(b.dokumentTyp)] ?? 0) - (rang[String(a.dokumentTyp)] ?? 0))[0];

        let menge = 0;
        let preisProTonne = 0;
        let summe = 0;
        const dateiId = beste?.dateiId ? String(beste.dateiId) : undefined;
        if (beste) {
          try {
            const daten = JSON.parse(String(beste.daten ?? '{}')) as { positionen?: Array<Record<string, unknown>> };
            for (const pos of daten.positionen ?? []) {
              if (pos.istBedarfsposition) continue;
              const einheit = String(pos.einheit ?? '').toLowerCase();
              const m = Number(pos.menge ?? 0);
              const ep = Number(pos.einzelpreis ?? 0);
              summe += Number(pos.gesamtpreis ?? m * ep);
              if (einheit === 't' || einheit === 'to') { menge += m; if (!preisProTonne) preisProTonne = ep; }
            }
          } catch { /* unlesbarer Beleg — Eintrag bleibt ohne Zahlen */ }
        }

        const daten = (() => { try { return JSON.parse(String(p.data ?? '{}')) as Record<string, unknown>; } catch { return {}; } })();
        eintraege.push({
          quelle: 'portal',
          jahr: Number(p.saisonjahr ?? 0),
          datum: String(p.$createdAt ?? '').slice(0, 10),
          belegTyp: beste ? String(beste.dokumentTyp) : undefined,
          belegNummer: beste ? String(beste.dokumentNummer ?? '') : undefined,
          status: String(p.status ?? ''),
          bezahltAm: (daten.bezahltAm as string) || undefined,
          menge, preisProTonne, summe, dateiId,
          herkunft: (p.herkunft as string) || (daten.herkunft as string) || undefined,
        });
      }
    } catch (error) {
      console.warn('Belege konnten nicht geladen werden:', error);
    }

    // Mosaik-Jahre ergänzen, die das Portal nicht kennt.
    const bekannteJahre = new Set(eintraege.map((e) => e.jahr));
    for (const h of preisHistorie) {
      if (bekannteJahre.has(h.saisonjahr)) continue;
      eintraege.push({
        quelle: 'mosaik', jahr: h.saisonjahr, preisProTonne: h.preisProTonne,
        menge: 0, summe: 0, status: '',
      });
    }

    return eintraege.sort((a, b) => b.jahr - a.jahr || (b.datum ?? '').localeCompare(a.datum ?? ''));
  },

  async ladeZeilen(kampagneId: string): Promise<MassenAngebotZeile[]> {
    const docs = await ladeAlle(MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, [
      Query.equal('kampagneId', kampagneId),
    ]);
    return docs.map(payloadZuZeile);
  },

  /**
   * Schreibt Zeilen in Batches. `onFortschritt` meldet den Stand — bei 500
   * Vereinen dauert das spürbar, und ein Fortschrittsbalken ist der Unterschied
   * zwischen „läuft" und „hängt".
   */
  async speichereZeilen(
    kampagneId: string,
    zeilen: Array<Partial<MassenAngebotZeile>>,
    optionen: { benutzer?: string; onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
  ): Promise<{ erstellt: number; aktualisiert: number; fehler: number }> {
    const jetzt = new Date().toISOString();
    let erstellt = 0, aktualisiert = 0, fehler = 0;
    // 4 parallel alle 600 ms ≈ 400 Schreibzugriffe/Minute Spitze — Appwrite
    // Cloud drosselt darüber mit HTTP 429. Ein 429 mitten in einem Lauf über
    // 700 Zeilen hinterlässt eine halb befüllte Kampagne, deshalb zusätzlich
    // Wiederholung mit wachsender Wartezeit.
    const BATCH = 4;

    const mitRetry = async (aufgabe: () => Promise<unknown>): Promise<void> => {
      for (let versuch = 1; versuch <= 4; versuch++) {
        try { await aufgabe(); return; }
        catch (error) {
          const status = (error as { code?: number })?.code;
          if (status === 429 && versuch < 4) {
            await new Promise((r) => setTimeout(r, versuch * 2000));
            continue;
          }
          throw error;
        }
      }
    };

    for (let i = 0; i < zeilen.length; i += BATCH) {
      const teil = zeilen.slice(i, i + BATCH);
      const ergebnisse = await Promise.allSettled(
        teil.map((z) => {
          const payload = zeileZuPayload({
            ...z,
            kampagneId,
            geaendertAm: jetzt,
            geaendertVon: optionen.benutzer,
          });
          return mitRetry(() =>
            z.id
              ? databases.updateDocument(DATABASE_ID, MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, z.id, payload)
              : databases.createDocument(DATABASE_ID, MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID, ID.unique(), payload)
          );
        })
      );
      ergebnisse.forEach((r, idx) => {
        if (r.status === 'rejected') {
          fehler++;
          console.error('Zeile konnte nicht gespeichert werden:', r.reason);
        } else if (teil[idx].id) aktualisiert++;
        else erstellt++;
      });
      optionen.onFortschritt?.(Math.min(i + BATCH, zeilen.length), zeilen.length);
      await new Promise((r) => setTimeout(r, 600));
    }

    await this.aktualisiereZaehler(kampagneId);
    return { erstellt, aktualisiert, fehler };
  },

  /** Speichert eine einzelne Zeile — der Normalfall beim Durcharbeiten. */
  /**
   * Holt nachgetragene Empfängeradressen aus dem Kundenstamm in die Zeilen.
   *
   * Die Zeile trägt eine eigene Kopie der Adresse — das ist Absicht, damit ein
   * Lauf reproduzierbar bleibt und man je Verein abweichen kann. Der Preis
   * dafür: Wer die Adresse anderswo pflegt (Empfänger-Klärung, Kundenliste,
   * Telefonat), sieht sie hier nicht von allein. Genau das holt diese Funktion
   * nach — für Zeilen, die noch KEINE Adresse tragen. Eine bewusst
   * eingetragene abweichende Adresse wird nie überschrieben.
   */
  async zieheEmpfaengerNach(
    kampagneId: string,
    benutzer?: string
  ): Promise<{ gefuellt: number; offen: number }> {
    const zeilen = await this.ladeZeilen(kampagneId);
    const ohne = zeilen.filter((z) => !z.empfaengerEmail);
    if (ohne.length === 0) return { gefuellt: 0, offen: 0 };

    const alleKunden = await saisonplanungService.loadAlleKunden({ mitArchivierten: true });
    const kundenMap = new Map(alleKunden.map((k) => [k.id, k]));

    let gefuellt = 0;
    for (const z of ohne) {
      const kunde = kundenMap.get(z.kundeId);
      const email = kunde ? ermittleEmpfaenger(kunde) : undefined;
      if (!email) continue;
      try {
        await this.speichereZeile({ ...z, empfaengerEmail: email }, benutzer);
        gefuellt++;
      } catch (error) {
        console.error(`Empfänger für ${z.kundenname} nicht übernommen:`, error);
      }
      // Appwrite drosselt bei ~240 Schreibvorgängen je Minute.
      await new Promise((r) => setTimeout(r, 120));
    }
    await this.aktualisiereZaehler(kampagneId);
    return { gefuellt, offen: ohne.length - gefuellt };
  },

  /**
   * Trägt die PE-Folie in bestehenden Zeilen nach.
   *
   * Neu befüllte Kampagnen bringen sie von allein mit; die Zeilen, die vor
   * dieser Regel entstanden, tragen sie nur, wenn sie schon im Vorjahresbeleg
   * stand. Ohne Folie kann nicht gekippt werden — die Zeile fehlt dann im
   * Angebot und der Fahrer steht vor dem Platz.
   *
   * Fasst nur Zeilen an, die lose Ware führen und noch keine Folie haben.
   * Versendete Zeilen bleiben unberührt: Dort ist das Angebot beim Verein.
   */
  async ergaenzeFolieInZeilen(
    kampagneId: string,
    benutzer?: string
  ): Promise<{ ergaenzt: number; preis: number }> {
    const folienPreis = await getArtikelPreis('TM-PE');
    if (folienPreis <= 0) {
      throw new Error('Für TM-PE ist im Artikelstamm kein Preis hinterlegt — bitte dort nachtragen.');
    }
    const zeilen = await this.ladeZeilen(kampagneId);
    const betroffen = zeilen.filter(
      (z) => !z.versendetAm && massenAngebotService.fehltPflichtFolie(z.positionen)
    );

    let ergaenzt = 0;
    for (const z of betroffen) {
      const positionen = massenAngebotService.ergaenzePflichtFolie(z.positionen, folienPreis);
      try {
        await this.speichereZeile({ ...z, positionen }, benutzer);
        ergaenzt++;
      } catch (error) {
        console.error(`Folie für ${z.kundenname} nicht ergänzt:`, error);
      }
      // Appwrite drosselt bei ~240 Schreibvorgängen je Minute.
      await new Promise((r) => setTimeout(r, 120));
    }
    if (ergaenzt > 0) {
      auditService.logAktion({
        action: 'update',
        entityType: 'massen_angebot',
        entityId: kampagneId,
        summary: `PE-Folie in ${ergaenzt} Zeile(n) nachgetragen (${folienPreis.toFixed(2)} €)`,
      });
    }
    return { ergaenzt, preis: folienPreis };
  },

  async speichereZeile(zeile: Partial<MassenAngebotZeile> & { id: string }, benutzer?: string): Promise<void> {
    await databases.updateDocument(
      DATABASE_ID,
      MASSEN_ANGEBOT_ZEILEN_COLLECTION_ID,
      zeile.id,
      zeileZuPayload({ ...zeile, geaendertAm: new Date().toISOString(), geaendertVon: benutzer })
    );
  },

  /**
   * Zählt die Zeilen neu und schreibt die Stände in den Kopf.
   *
   * Die Liste soll „128 von 340 geprüft" zeigen, ohne alle Zeilen zu laden —
   * deshalb liegen die Zähler als Spalten am Kopf und werden hier fortgeschrieben.
   */
  async aktualisiereZaehler(kampagneId: string): Promise<void> {
    try {
      const zeilen = await this.ladeZeilen(kampagneId);
      await databases.updateDocument(DATABASE_ID, MASSEN_ANGEBOTE_COLLECTION_ID, kampagneId, {
        anzahlZeilen: zeilen.length,
        anzahlGeprueft: zeilen.filter((z) => z.markierung === 'geprueft').length,
        anzahlKompliziert: zeilen.filter((z) => z.markierung === 'kompliziert').length,
        anzahlVersendet: zeilen.filter((z) => !!z.versendetAm).length,
        geaendertAm: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Zähler konnten nicht aktualisiert werden:', error);
    }
  },
};
