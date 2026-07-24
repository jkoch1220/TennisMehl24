// Massen-Angebots-Tool für die Frühjahrsinstandsetzung.
//
// Dieses Modul bestimmt je berechtigtem Kunden (aktiv && automatischesAngebot) die Quelle
// des Angebots und berechnet einen Angebotsentwurf – OHNE in die Datenbank zu schreiben
// (Dry-Run/Vorschau). Die scharfe Erzeugung, Rollback und Protokoll bauen auf diesen
// Kandidaten auf (siehe createBatch/rollbackBatch weiter unten).
//
// Quellen-Priorität pro Kunde:
//   1. Vorjahres-Angebot (Projekt der Vorsaison → gespeichertes Angebot → Positionen kopieren)
//   2. Historie/Mosaik (tonnenLetztesJahr + zuletztGezahlterPreis am Kunden, z.B. aus Migration)
//   3. PLZ-Preiskalkulation (echter Neukunde: Zone + Spedition + Aufschlag)
//   4. sonst: manuell prüfen (nicht automatisch erzeugen)

import { ID, Query } from 'appwrite';
import { SaisonKunde } from '../types/saisonplanung';
import { Position, AngebotsDaten } from '../types/projektabwicklung';
import {
  MassenAngebotKandidat,
  KandidatenZusammenfassung,
  Preisanpassung,
  ErzeugungsErgebnis,
  AngebotsLauf,
  VersandKandidat,
} from '../types/massenAngebot';
import { projektService } from './projektService';
import { saisonplanungService } from './saisonplanungService';
import {
  ladeDokumentNachTyp,
  ladeDokumentDaten,
  speichereAngebot,
  loescheDokumenteFuerProjekt,
} from './projektabwicklungDokumentService';
import { generiereNaechsteDokumentnummer } from './nummerierungService';
import { sendeEmailMitPdf, pdfZuBase64, wrapInEmailTemplate } from './emailSendService';
import { generiereAngebotPDF } from './dokumentService';
import { getArtikelPreis, getStammdatenOderDefault } from './stammdatenService';
import { Stammdaten } from '../types/stammdaten';
import { getZoneFromPLZ, berechneSpeditionskosten, AUFSCHLAEGE } from '../constants/pricing';
import { formatAdresszeile } from './pdfHelpers';
import {
  databases,
  DATABASE_ID,
  ANGEBOTS_LAEUFE_COLLECTION_ID,
  PROJECT_ID,
} from '../config/appwrite';
import { auditService } from './auditService';

// Standard-Menge (Tonnen) für PLZ-Kalkulation, wenn keine Referenzmenge vorliegt.
export const STANDARD_MENGE_DEFAULT = 10;

const STANDARD_ARTIKEL = {
  nummer: 'TM-ZM-02',
  bezeichnung: 'Ziegelmehl 0–2 mm (lose, Schüttgut)',
  einheit: 't',
};

const STANDARD_LIEFERBEDINGUNGEN =
  'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t und ' +
  'Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m Breite und ' +
  '4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der Empfänger verantwortlich.\n\n' +
  'Mindestabnahmemenge für loses Material sind 3 Tonnen.';

let positionIdCounter = 0;
function naechstePositionId(): string {
  positionIdCounter += 1;
  return `pos-massen-${Date.now()}-${positionIdCounter}`;
}

function round2(wert: number): number {
  return Math.round(wert * 100) / 100;
}

function baueZiegelmehlPosition(menge: number, preisProTonne: number): Position {
  return {
    id: naechstePositionId(),
    artikelnummer: STANDARD_ARTIKEL.nummer,
    bezeichnung: STANDARD_ARTIKEL.bezeichnung,
    menge,
    einheit: STANDARD_ARTIKEL.einheit,
    einzelpreis: round2(preisProTonne),
    gesamtpreis: round2(menge * preisProTonne),
  };
}

// Positionen aus einem Vorjahres-Angebot übernehmen – neue ids, Preise verlustfrei neu gerechnet.
function klonePositionen(positionen: Position[]): Position[] {
  return positionen.map((pos) => ({
    ...pos,
    id: naechstePositionId(),
    gesamtpreis: round2((pos.menge ?? 0) * (pos.einzelpreis ?? 0)),
  }));
}

// Die editierbare Hauptposition: erste echte (nicht-Bedarfs-)Position, bevorzugt Ziegelmehl.
function findePrimaerPosition(positionen: Position[]): Position | undefined {
  const echte = positionen.filter((p) => !p.istBedarfsposition);
  const ziegelmehl = echte.find(
    (p) => p.artikelnummer?.toUpperCase().startsWith('TM-ZM') || p.einheit?.toLowerCase() === 't'
  );
  return ziegelmehl ?? echte[0] ?? positionen[0];
}

// Netto-Summe aller verrechneten (nicht-Bedarfs-)Positionen.
function berechneSumme(positionen: Position[]): number {
  return round2(
    positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((sum, p) => sum + (p.gesamtpreis ?? 0), 0)
  );
}

// PLZ-Kalkulation: Werkspreis + Aufschlag + Speditionskosten je Tonne.
function berechnePlzPreisProTonne(plz: string, menge: number, werkspreisProTonne: number): number {
  // Neukunden ohne Historie konservativ als Endkunde kalkulieren (höherer Aufschlag).
  const aufschlag = werkspreisProTonne * AUFSCHLAEGE.endkunde;
  const speditionGesamt = berechneSpeditionskosten(plz, menge * 1000);
  const speditionProTonne = speditionGesamt && menge > 0 ? speditionGesamt / menge : 0;
  return round2(werkspreisProTonne + aufschlag + speditionProTonne);
}

function ermittleEmpfaenger(kunde: SaisonKunde): string | undefined {
  return kunde.rechnungsEmail || kunde.email || undefined;
}

function ermittlePlz(kunde: SaisonKunde): string | undefined {
  return kunde.lieferadresse?.plz || kunde.rechnungsadresse?.plz || undefined;
}

// Flache Kundenadresse (Rechnungsadresse bevorzugt) für Projekt/Angebot.
function flacheKundenadresse(kunde: SaisonKunde): { strasse: string; plzOrt: string } {
  const rech = kunde.rechnungsadresse;
  const liefer = kunde.lieferadresse;
  const strasse = rech?.strasse || liefer?.strasse || '';
  const plzOrt = rech
    ? formatAdresszeile(rech.plz, rech.ort, rech.land)
    : liefer
    ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land)
    : '';
  return { strasse, plzOrt };
}

// Harte Validierung (blockiert Erzeugung) + weiche Hinweise. Setzt status/ausgewaehlt.
function validiere(kandidat: MassenAngebotKandidat): MassenAngebotKandidat {
  const fehler: string[] = [];
  if (!(kandidat.menge > 0)) fehler.push('Menge muss > 0 sein');
  if (!(kandidat.preisProTonne > 0)) fehler.push('Preis/Tonne muss > 0 sein');
  if (!ermittlePlz(kandidat.kunde)) fehler.push('Keine gültige Lieferadresse (PLZ fehlt)');

  const warnungen = [...kandidat.warnungen];
  if (kandidat.emailFehlt) warnungen.push('Empfänger-E-Mail fehlt – Versand nicht möglich');

  if (fehler.length > 0) {
    return { ...kandidat, fehler, warnungen, status: 'fehler', ausgewaehlt: false };
  }
  return { ...kandidat, fehler, warnungen, status: 'neu', ausgewaehlt: true };
}

function basisKandidat(kunde: SaisonKunde): MassenAngebotKandidat {
  const empfaenger = ermittleEmpfaenger(kunde);
  return {
    kundeId: kunde.id,
    kundenname: kunde.name,
    kundennummer: kunde.kundennummer,
    typ: kunde.typ,
    quelle: 'manuell',
    status: 'manuell',
    menge: 0,
    preisProTonne: 0,
    angebotssumme: 0,
    empfaengerEmail: empfaenger,
    emailFehlt: !empfaenger,
    positionen: [],
    fehler: [],
    warnungen: [],
    ausgewaehlt: false,
    kunde,
  };
}

// Bestimmt für EINEN Kunden Quelle + Angebotsentwurf. Schreibt nichts.
async function bestimmeKandidat(
  kunde: SaisonKunde,
  saisonjahr: number,
  werkspreisProTonne: number
): Promise<MassenAngebotKandidat> {
  const base = basisKandidat(kunde);

  // Idempotenz: existiert bereits ein Projekt für die Zielsaison? → niemals doppelt anlegen.
  const existierendes = await projektService.getProjektFuerKunde(kunde.id, saisonjahr);
  if (existierendes) {
    return {
      ...base,
      status: 'existiert',
      statusGrund: `Projekt für Saison ${saisonjahr} existiert bereits`,
      existierendesProjektId: existierendes.$id || existierendes.id,
    };
  }

  // Platzbauer: Instandsetzungs-Angebot → bewusst manuell prüfen (andere Preislogik).
  if (kunde.typ === 'platzbauer') {
    return {
      ...base,
      status: 'manuell',
      statusGrund: 'Platzbauer – Instandsetzungs-Angebot manuell erstellen',
    };
  }

  // 1) Vorjahres-Angebot
  const vorjahrProjekt = await projektService.getProjektFuerKunde(kunde.id, saisonjahr - 1);
  if (vorjahrProjekt) {
    const dokument = await ladeDokumentNachTyp(vorjahrProjekt.$id || vorjahrProjekt.id, 'angebot');
    if (dokument) {
      const daten = ladeDokumentDaten<AngebotsDaten>(dokument);
      if (daten?.positionen?.length) {
        const positionen = klonePositionen(daten.positionen);
        const primaer = findePrimaerPosition(positionen);
        return validiere({
          ...base,
          quelle: 'vorjahr',
          positionen,
          primaerPositionId: primaer?.id,
          menge: primaer?.menge ?? 0,
          preisProTonne: primaer?.einzelpreis ?? 0,
          angebotssumme: berechneSumme(positionen),
        });
      }
    }
  }

  // 2) Historie/Mosaik: am Kunden gespeicherte Vorjahreswerte (z.B. aus Migration backfilled)
  if (
    kunde.tonnenLetztesJahr &&
    kunde.tonnenLetztesJahr > 0 &&
    kunde.zuletztGezahlterPreis &&
    kunde.zuletztGezahlterPreis > 0
  ) {
    const menge = kunde.tonnenLetztesJahr;
    const preis = kunde.zuletztGezahlterPreis;
    const position = baueZiegelmehlPosition(menge, preis);
    return validiere({
      ...base,
      quelle: 'mosaik',
      positionen: [position],
      primaerPositionId: position.id,
      menge,
      preisProTonne: preis,
      angebotssumme: round2(menge * preis),
    });
  }

  // 3) PLZ-Preiskalkulation (echter Neukunde ohne Historie)
  const plz = ermittlePlz(kunde);
  const zone = plz ? getZoneFromPLZ(plz) : null;
  if (plz && zone) {
    const saisonDaten = await saisonplanungService.loadAktuelleSaisonDaten(kunde.id, saisonjahr);
    const menge =
      saisonDaten?.referenzmenge && saisonDaten.referenzmenge > 0
        ? saisonDaten.referenzmenge
        : STANDARD_MENGE_DEFAULT;
    const preis = berechnePlzPreisProTonne(plz, menge, werkspreisProTonne);
    const position = baueZiegelmehlPosition(menge, preis);
    const kandidat = validiere({
      ...base,
      quelle: 'plz_kalkulation',
      positionen: [position],
      primaerPositionId: position.id,
      menge,
      preisProTonne: preis,
      angebotssumme: round2(menge * preis),
    });
    kandidat.warnungen = [...kandidat.warnungen, 'Kalkuliert aus PLZ-Zone – Menge & Preis bitte prüfen'];
    return kandidat;
  }

  // 4) Keine verwertbare Quelle
  return {
    ...base,
    status: 'manuell',
    statusGrund: 'Keine Vorjahres-/Historien-/PLZ-Daten – manuell prüfen',
  };
}

/**
 * Sammelt alle Kandidaten für die Zielsaison (Dry-Run – schreibt nichts).
 * Opt-out: alle aktiven Kunden sind dabei, außer automatischesAngebot === false.
 */
async function sammleKandidaten(saisonjahr: number): Promise<MassenAngebotKandidat[]> {
  const alleKunden = await saisonplanungService.loadAlleKunden();
  // Opt-out-Semantik: standardmäßig sind alle aktiven Kunden dabei; nur explizit
  // abgewählte (automatischesAngebot === false) werden ausgeschlossen.
  const berechtigte = alleKunden.filter((k) => k.aktiv && k.automatischesAngebot !== false);

  const werkspreisProTonne = await getArtikelPreis(STANDARD_ARTIKEL.nummer);

  // Sequentiell mit kleiner Parallelität, um Appwrite nicht zu überlasten.
  const kandidaten: MassenAngebotKandidat[] = [];
  const BATCH = 5;
  for (let i = 0; i < berechtigte.length; i += BATCH) {
    const teil = berechtigte.slice(i, i + BATCH);
    const ergebnisse = await Promise.all(
      teil.map((kunde) => bestimmeKandidat(kunde, saisonjahr, werkspreisProTonne))
    );
    kandidaten.push(...ergebnisse);
  }

  // Sortierung: zu erzeugende zuerst, dann Prüffälle, dann existierende.
  const rang: Record<MassenAngebotKandidat['status'], number> = {
    neu: 0,
    fehler: 1,
    manuell: 2,
    existiert: 3,
  };
  return kandidaten.sort(
    (a, b) => rang[a.status] - rang[b.status] || a.kundenname.localeCompare(b.kundenname, 'de')
  );
}

function berechneZusammenfassung(kandidaten: MassenAngebotKandidat[]): KandidatenZusammenfassung {
  return {
    gesamt: kandidaten.length,
    neu: kandidaten.filter((k) => k.status === 'neu').length,
    existiert: kandidaten.filter((k) => k.status === 'existiert').length,
    fehler: kandidaten.filter((k) => k.status === 'fehler').length,
    manuell: kandidaten.filter((k) => k.status === 'manuell').length,
  };
}

// Aktualisiert Menge/Preis der Primärposition eines Kandidaten und re-validiert ihn.
function aktualisiereMengePreis(
  kandidat: MassenAngebotKandidat,
  menge: number,
  preisProTonne: number
): MassenAngebotKandidat {
  const positionen = kandidat.positionen.map((pos) =>
    pos.id === kandidat.primaerPositionId
      ? { ...pos, menge, einzelpreis: round2(preisProTonne), gesamtpreis: round2(menge * preisProTonne) }
      : pos
  );
  // War der Kandidat manuell/leer, eine Primärposition anlegen.
  const hatPrimaer = positionen.some((p) => p.id === kandidat.primaerPositionId);
  const finalePositionen = hatPrimaer ? positionen : [baueZiegelmehlPosition(menge, preisProTonne)];
  const primaerId = hatPrimaer ? kandidat.primaerPositionId : finalePositionen[0].id;

  // ausgewaehlt-Zustand des Nutzers erhalten, aber Fehlerstatus neu berechnen.
  const warFehler = kandidat.status === 'fehler';
  const revalidiert = validiere({
    ...kandidat,
    positionen: finalePositionen,
    primaerPositionId: primaerId,
    menge,
    preisProTonne: round2(preisProTonne),
    angebotssumme: berechneSumme(finalePositionen),
    warnungen: kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt')),
  });
  // Fehler → bleibt abgewählt; gerade behobener Fehler → automatisch anwählen; sonst Auswahl erhalten.
  const ausgewaehlt =
    revalidiert.status === 'fehler' ? false : warFehler ? true : kandidat.ausgewaehlt;
  return { ...revalidiert, ausgewaehlt };
}

/**
 * Wendet eine globale Preisanpassung auf alle editierbaren Kandidaten (neu/fehler) an.
 * - prozent: skaliert jede verrechnete Position um (1 + X/100)
 * - fix:     setzt den €/t-Preis der Primärposition auf den fixen Wert
 * Existierende und manuelle Kandidaten bleiben unberührt.
 */
function wendePreisanpassungAn(
  kandidaten: MassenAngebotKandidat[],
  anpassung: Preisanpassung
): MassenAngebotKandidat[] {
  if (!anpassung) return kandidaten;
  return kandidaten.map((kandidat) => {
    if (kandidat.status !== 'neu' && kandidat.status !== 'fehler') return kandidat;

    if (anpassung.typ === 'fix') {
      return aktualisiereMengePreis(kandidat, kandidat.menge, anpassung.wert);
    }

    // prozent: alle verrechneten Positionen skalieren
    const faktor = 1 + anpassung.wert / 100;
    const positionen = kandidat.positionen.map((pos) =>
      pos.istBedarfsposition
        ? pos
        : {
            ...pos,
            einzelpreis: round2((pos.einzelpreis ?? 0) * faktor),
            gesamtpreis: round2((pos.menge ?? 0) * (pos.einzelpreis ?? 0) * faktor),
          }
    );
    const primaer = positionen.find((p) => p.id === kandidat.primaerPositionId);
    const warFehler = kandidat.status === 'fehler';
    const revalidiert = validiere({
      ...kandidat,
      positionen,
      preisProTonne: primaer?.einzelpreis ?? round2((kandidat.preisProTonne) * faktor),
      angebotssumme: berechneSumme(positionen),
      warnungen: kandidat.warnungen.filter((w) => !w.startsWith('Empfänger-E-Mail fehlt')),
    });
    const ausgewaehlt =
      revalidiert.status === 'fehler' ? false : warFehler ? true : kandidat.ausgewaehlt;
    return { ...revalidiert, ausgewaehlt };
  });
}

// Baut aus einem Kandidaten die vollständige AngebotsDaten-Struktur (für die Erzeugung).
function baueAngebotsDaten(
  kandidat: MassenAngebotKandidat,
  angebotsnummer: string,
  stammdaten: Stammdaten
): AngebotsDaten {
  const kunde = kandidat.kunde;
  const heute = new Date().toISOString().split('T')[0];
  const gueltigBis = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rech = kunde.rechnungsadresse;
  const liefer = kunde.lieferadresse;

  const kundenstrasse = rech?.strasse || liefer?.strasse || '';
  const kundenPlzOrt = rech
    ? formatAdresszeile(rech.plz, rech.ort, rech.land)
    : liefer
    ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land)
    : '';

  const lieferadresseAbweichend =
    !!liefer &&
    !!rech &&
    (liefer.strasse !== rech.strasse || liefer.plz !== rech.plz || liefer.ort !== rech.ort);

  return {
    kundennummer: kunde.kundennummer,
    kundenname: kunde.name,
    kundenstrasse,
    kundenPlzOrt,
    angebotsnummer,
    angebotsdatum: heute,
    gueltigBis,
    positionen: kandidat.positionen,
    zahlungsziel: kunde.zahlungsziel ? `${kunde.zahlungsziel} Tage` : '14 Tage',
    lieferbedingungenAktiviert: true,
    lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
    lieferadresseAbweichend,
    lieferadresseName: lieferadresseAbweichend ? kunde.name : undefined,
    lieferadresseStrasse: lieferadresseAbweichend ? liefer?.strasse : undefined,
    lieferadressePlzOrt:
      lieferadresseAbweichend && liefer ? formatAdresszeile(liefer.plz, liefer.ort, liefer.land) : undefined,
    firmenname: stammdaten.firmenname,
    firmenstrasse: stammdaten.firmenstrasse,
    firmenPlzOrt: `${stammdaten.firmenPlz} ${stammdaten.firmenOrt}`,
    firmenTelefon: stammdaten.firmenTelefon,
    firmenEmail: stammdaten.firmenEmail,
  };
}

// ===== SCHARFE ERZEUGUNG / ROLLBACK / PROTOKOLL =====

// Erkennt, ob die App gegen eine Appwrite-Testumgebung läuft (für Banner + Protokoll).
function istTestumgebung(): boolean {
  const flag = import.meta.env.VITE_APPWRITE_TESTUMGEBUNG;
  if (typeof flag === 'string') return flag === 'true' || flag === '1';
  const pid = (PROJECT_ID || '').toLowerCase();
  return pid.includes('test') || pid.includes('staging');
}

function neueBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function schreibeProtokoll(
  batchId: string,
  saisonjahr: number,
  ergebnis: ErzeugungsErgebnis,
  meta: { benutzer?: string }
): Promise<void> {
  try {
    await databases.createDocument(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, ID.unique(), {
      batchId,
      saisonjahr,
      zeitpunkt: new Date().toISOString(),
      benutzer: meta.benutzer,
      testModus: istTestumgebung(),
      anzahlErzeugt: ergebnis.erzeugt.length,
      anzahlUebersprungen: ergebnis.uebersprungen.length,
      anzahlFehler: ergebnis.fehler.length,
      rueckgaengigGemacht: false,
      data: JSON.stringify(ergebnis).slice(0, 99000),
    });
    auditService.logAktion({
      action: 'create',
      entityType: 'angebots_lauf',
      entityId: batchId,
      summary: `Massen-Angebots-Lauf ${saisonjahr}: ${ergebnis.erzeugt.length} erzeugt, ${ergebnis.uebersprungen.length} übersprungen, ${ergebnis.fehler.length} Fehler`,
    });
  } catch (error) {
    console.warn('Angebots-Lauf konnte nicht protokolliert werden:', error);
  }
}

/**
 * Erzeugt scharf Angebote für die ausgewählten, erzeugbaren Kandidaten (status 'neu').
 * SEQUENTIELL – die Dokumentnummern teilen sich einen Zähler, paralleles Generieren
 * würde doppelte Angebotsnummern erzeugen (GoBD-kritisch).
 * Einzelfehler werden gesammelt, der Lauf bricht NICHT ab. Jedes Projekt erhält die
 * erzeugungsBatchId für den Rollback. Der Lauf wird protokolliert.
 */
async function erzeugeBatch(
  kandidaten: MassenAngebotKandidat[],
  saisonjahr: number,
  optionen: {
    benutzer?: string;
    limit?: number;
    onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void;
  } = {}
): Promise<ErzeugungsErgebnis> {
  const batchId = neueBatchId();
  const stammdaten = await getStammdatenOderDefault();
  const ergebnis: ErzeugungsErgebnis = { batchId, erzeugt: [], uebersprungen: [], fehler: [] };

  const erzeugbar = kandidaten.filter((k) => k.status === 'neu' && k.ausgewaehlt);
  const zuErzeugen =
    optionen.limit && optionen.limit > 0 ? erzeugbar.slice(0, optionen.limit) : erzeugbar;
  const gesamt = zuErzeugen.length;

  let index = 0;
  for (const kandidat of zuErzeugen) {
    index += 1;
    try {
      // Doppelschutz: erneut prüfen, ob es das Zielsaison-Projekt schon gibt.
      const existiert = await projektService.getProjektFuerKunde(kandidat.kundeId, saisonjahr);
      if (existiert) {
        ergebnis.uebersprungen.push({
          kundeId: kandidat.kundeId,
          kundenname: kandidat.kundenname,
          grund: 'Projekt existiert bereits',
        });
        continue;
      }

      const adresse = flacheKundenadresse(kandidat.kunde);
      const projekt = await projektService.createProjekt(
        {
          projektName: kandidat.kundenname,
          kundeId: kandidat.kundeId,
          kundennummer: kandidat.kundennummer,
          kundenname: kandidat.kundenname,
          kundenstrasse: adresse.strasse,
          kundenPlzOrt: adresse.plzOrt,
          saisonjahr,
          status: 'angebot',
          automatischErzeugt: true,
          erzeugungsBatchId: batchId,
          preisProTonne: kandidat.preisProTonne,
        },
        // Im Massenlauf keine kaskadierende Platzbauer-Projekt-Zuordnung auslösen.
        { skipPlatzbauerProjektZuordnung: true }
      );

      const projektId = projekt.id;
      const angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
      const heute = new Date().toISOString().split('T')[0];
      await projektService.updateProjekt(projektId, { angebotsnummer, angebotsdatum: heute });

      const angebotsDaten = baueAngebotsDaten(kandidat, angebotsnummer, stammdaten);
      await speichereAngebot(projektId, angebotsDaten);

      ergebnis.erzeugt.push({
        kundeId: kandidat.kundeId,
        kundenname: kandidat.kundenname,
        projektId,
        angebotsnummer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Fehler bei Angebot für ${kandidat.kundenname}:`, error);
      ergebnis.fehler.push({
        kundeId: kandidat.kundeId,
        kundenname: kandidat.kundenname,
        fehler: message,
      });
    } finally {
      optionen.onFortschritt?.(index, gesamt, kandidat.kundenname);
    }
  }

  await schreibeProtokoll(batchId, saisonjahr, ergebnis, { benutzer: optionen.benutzer });
  return ergebnis;
}

async function markiereLaufRueckgaengig(batchId: string): Promise<void> {
  try {
    const res = await databases.listDocuments(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, [
      Query.equal('batchId', batchId),
      Query.limit(25),
    ]);
    for (const dok of res.documents) {
      await databases.updateDocument(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, dok.$id, {
        rueckgaengigGemacht: true,
      });
    }
    auditService.logAktion({
      action: 'update',
      entityType: 'angebots_lauf',
      entityId: batchId,
      summary: `Massen-Angebots-Lauf ${batchId} rückgängig gemacht`,
      changes: { rueckgaengigGemacht: { alt: false, neu: true } },
    });
  } catch (error) {
    console.warn('Lauf konnte nicht als rückgängig markiert werden:', error);
  }
}

/**
 * Macht einen kompletten Erzeugungslauf rückgängig: löscht alle Projekte (+ deren Dokumente/PDFs)
 * des Batches, die noch NICHT versendet wurden (status === 'angebot'). Versendete Angebote
 * bleiben aus GoBD-Gründen erhalten.
 */
async function rollbackBatch(
  batchId: string,
  optionen: { onFortschritt?: (erledigt: number, gesamt: number) => void } = {}
): Promise<{ geloescht: number; uebersprungenVersendet: number; fehler: number }> {
  const projekte = await projektService.loadProjekteFuerBatch(batchId);
  let geloescht = 0;
  let uebersprungenVersendet = 0;
  let fehler = 0;

  let index = 0;
  for (const projekt of projekte) {
    index += 1;
    if (projekt.status !== 'angebot') {
      // Bereits versendet/weiter im Workflow → behalten (GoBD).
      uebersprungenVersendet += 1;
      optionen.onFortschritt?.(index, projekte.length);
      continue;
    }
    try {
      await loescheDokumenteFuerProjekt(projekt.$id || projekt.id);
      await projektService.deleteProjekt(projekt);
      geloescht += 1;
    } catch (error) {
      console.error('Rollback-Fehler:', error);
      fehler += 1;
    } finally {
      optionen.onFortschritt?.(index, projekte.length);
    }
  }

  await markiereLaufRueckgaengig(batchId);
  return { geloescht, uebersprungenVersendet, fehler };
}

// Lädt die letzten Protokoll-Einträge (optional nach Saison gefiltert).
async function ladeLaeufe(saisonjahr?: number): Promise<AngebotsLauf[]> {
  try {
    const queries = [Query.orderDesc('zeitpunkt'), Query.limit(50)];
    if (saisonjahr) queries.unshift(Query.equal('saisonjahr', saisonjahr));
    const res = await databases.listDocuments(DATABASE_ID, ANGEBOTS_LAEUFE_COLLECTION_ID, queries);
    return (res.documents as unknown as Array<Record<string, unknown>>).map((d) => ({
      id: String(d.$id),
      batchId: String(d.batchId ?? ''),
      saisonjahr: Number(d.saisonjahr ?? 0),
      zeitpunkt: String(d.zeitpunkt ?? ''),
      benutzer: d.benutzer ? String(d.benutzer) : undefined,
      testModus: Boolean(d.testModus),
      anzahlErzeugt: Number(d.anzahlErzeugt ?? 0),
      anzahlUebersprungen: Number(d.anzahlUebersprungen ?? 0),
      anzahlFehler: Number(d.anzahlFehler ?? 0),
      rueckgaengigGemacht: Boolean(d.rueckgaengigGemacht),
    }));
  } catch (error) {
    console.warn('Angebots-Läufe konnten nicht geladen werden:', error);
    return [];
  }
}

// ===== HALBAUTOMATISCHER E-MAIL-VERSAND =====

const TEST_EMAIL = 'jtatwcook@gmail.com';
const ANGEBOT_ABSENDER = 'anfrage@tennismehl.com';

// Lädt die versandbereiten Angebote eines Batches (status === 'angebot', noch nicht versendet).
async function ladeVersandKandidaten(batchId: string): Promise<VersandKandidat[]> {
  const [projekte, alleKunden] = await Promise.all([
    projektService.loadProjekteFuerBatch(batchId),
    saisonplanungService.loadAlleKunden(),
  ]);
  const kundenMap = new Map(alleKunden.map((k) => [k.id, k]));

  return projekte
    .filter((p) => p.status === 'angebot')
    .map((p) => {
      const kunde = kundenMap.get(p.kundeId);
      const email = kunde ? ermittleEmpfaenger(kunde) : undefined;
      return {
        projektId: p.$id || p.id,
        kundeId: p.kundeId,
        kundenname: p.kundenname,
        angebotsnummer: p.angebotsnummer,
        empfaengerEmail: email,
        emailFehlt: !email,
        ausgewaehlt: !!email,
      };
    });
}

/**
 * Versendet das Angebot eines Projekts per E-Mail (PDF aus den gespeicherten Angebotsdaten).
 * testModus: Empfänger ist ausschließlich die Test-Adresse, kein Statuswechsel beim Kunden,
 * kein Versand-Protokoll (skipProtokoll). Nur bei echtem Versand → Status 'angebot_versendet'.
 */
async function versendeAngebot(
  projektId: string,
  realEmail: string | undefined,
  testModus: boolean
): Promise<{ success: boolean; testModeActive?: boolean; error?: string }> {
  const empfaenger = testModus ? TEST_EMAIL : realEmail;
  if (!empfaenger) {
    return { success: false, error: 'Keine Empfänger-E-Mail' };
  }

  const dokument = await ladeDokumentNachTyp(projektId, 'angebot');
  if (!dokument) return { success: false, error: 'Kein gespeichertes Angebot gefunden' };
  const daten = ladeDokumentDaten<AngebotsDaten>(dokument);
  if (!daten) return { success: false, error: 'Angebotsdaten nicht lesbar' };

  const stammdaten = await getStammdatenOderDefault();
  const pdf = await generiereAngebotPDF(daten, stammdaten);
  const pdfBase64 = pdfZuBase64(pdf);

  const betreff = `${testModus ? '[TEST] ' : ''}Ihr Angebot zur Frühjahrsinstandsetzung – ${daten.angebotsnummer}`;
  const text =
    `Sehr geehrte Damen und Herren,\n\n` +
    `anbei erhalten Sie unser Angebot ${daten.angebotsnummer} für die diesjährige ` +
    `Frühjahrsinstandsetzung Ihrer Tennisplätze.\n\n` +
    `Bei Fragen stehen wir Ihnen gerne zur Verfügung. Über Ihren Auftrag freuen wir uns.\n\n` +
    `Mit freundlichen Grüßen\nIhr TENNISMEHL-Team`;
  const htmlBody = wrapInEmailTemplate(text);

  const result = await sendeEmailMitPdf({
    empfaenger,
    absender: ANGEBOT_ABSENDER,
    betreff,
    htmlBody,
    pdfBase64,
    pdfDateiname: `Angebot_${daten.angebotsnummer.replace(/\//g, '-')}.pdf`,
    projektId,
    dokumentTyp: 'angebot',
    dokumentNummer: daten.angebotsnummer,
    testModus,
    skipProtokoll: testModus,
  });

  if (result.success && !testModus) {
    await projektService.updateProjektStatus(projektId, 'angebot_versendet');
  }
  return {
    success: result.success,
    testModeActive: result.testModeActive,
    error: result.success ? undefined : 'Versand fehlgeschlagen',
  };
}

// Versendet mehrere Angebote nacheinander (sequentiell, mit Fortschritt + Fehlersammlung).
async function versendeBatch(
  kandidaten: VersandKandidat[],
  testModus: boolean,
  onFortschritt?: (erledigt: number, gesamt: number, aktueller: string) => void
): Promise<{ gesendet: number; fehler: { kundenname: string; fehler: string }[] }> {
  let gesendet = 0;
  const fehler: { kundenname: string; fehler: string }[] = [];
  let index = 0;
  for (const kandidat of kandidaten) {
    index += 1;
    try {
      const res = await versendeAngebot(kandidat.projektId, kandidat.empfaengerEmail, testModus);
      if (res.success) gesendet += 1;
      else fehler.push({ kundenname: kandidat.kundenname, fehler: res.error || 'Fehler' });
    } catch (error) {
      fehler.push({
        kundenname: kandidat.kundenname,
        fehler: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onFortschritt?.(index, kandidaten.length, kandidat.kundenname);
    }
  }
  return { gesendet, fehler };
}

export const massenAngebotService = {
  sammleKandidaten,
  berechneZusammenfassung,
  aktualisiereMengePreis,
  wendePreisanpassungAn,
  baueAngebotsDaten,
  erzeugeBatch,
  rollbackBatch,
  ladeLaeufe,
  ladeVersandKandidaten,
  versendeAngebot,
  versendeBatch,
  istTestumgebung,
  getStammdaten: getStammdatenOderDefault,
};
