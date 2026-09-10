/**
 * Welcher Preis gilt für eine Lieferung, die über einen Platzbauer läuft?
 * (09/2026)
 *
 * Fachlicher Ablauf: Der Platzbauer sammelt die Bestellungen seiner Vereine.
 * Seine bisherige Gesamtabnahme bestimmt die Mengenstufe; innerhalb der Stufe
 * bestimmt die PLZ des belieferten Vereins die Region — die Fracht macht den
 * Unterschied. Beides steht in der Staffelvereinbarung seines Saisonangebots.
 *
 * Beispiel: Averbeck hat 400 t abgenommen. In der Stufe 400–500 t kostet die
 * Tonne in PLZ 97 150 €, in PLZ 90 120 €. Für den Verein in Aub (97..) sind
 * das 150 €/t — genau dieser Wert soll im Rechnungstab des Vereinsprojekts
 * stehen, ohne dass jemand nachschlägt.
 *
 * Bewusst ein Vorschlag, keine Festschreibung: Der Sachbearbeiter sieht den
 * Preis samt Begründung und kann ihn überschreiben. Was er bestätigt, wandert
 * über `preisHerkunft` auf den Beleg.
 */
import { Projekt } from '../types/projekt';
import { Preisstaffel } from '../types/platzbauer';
import { platzbauerverwaltungService } from './platzbauerverwaltungService';
import { ladeAktuellesDokument } from './platzbauerprojektabwicklungDokumentService';
import { leseStaffelStand } from '../utils/staffelUebernahme';
import { ermittleStaffelPreis, StaffelPreisTreffer } from '../utils/plzRegionen';

export interface PlatzbauerPreisVorschlag extends StaffelPreisTreffer {
  platzbauerId: string;
  platzbauerName: string;
  /** Bisherige Gesamtabnahme des Platzbauers in dieser Saison (t). */
  gesamtmenge: number;
  /** Sorte, aus deren Staffel der Preis stammt. */
  artikelnummer: string;
  bezeichnung: string;
  /** Nummer des Angebots, aus dem die Staffel stammt. */
  angebotsnummer?: string;
  /** PLZ, mit der die Region bestimmt wurde. */
  plz: string;
}

/**
 * Alles, was zur Preisermittlung eines Platzbauers gehört — einmal geladen.
 *
 * Eine Rechnung hat mehrere Positionen; jede einzeln nachzuladen hieße, das
 * Saisonangebot und alle Vereinsprojekte mehrfach zu lesen.
 */
export interface PlatzbauerPreisKontext {
  platzbauerId: string;
  platzbauerName: string;
  gesamtmenge: number;
  angebotsnummer?: string;
  plz: string;
  sorten: Array<{ artikelnummer: string; bezeichnung: string; staffeln: Preisstaffel[] }>;
}

/**
 * Läuft dieses Projekt über einen Platzbauer? Es zählt allein, ob ein
 * Platzbauer hinterlegt ist: Der Bezugsweg trägt je nach Entstehungsweg
 * „ueber_platzbauer", „platzbauer" oder gar nichts (siehe
 * `utils/platzbauerAnzeige.ts`). Ohne `platzbauerId` gibt es keine Staffel,
 * die sich lesen ließe.
 */
export const laeuftUeberPlatzbauer = (projekt?: Projekt | null): boolean => !!projekt?.platzbauerId;

/**
 * Lädt Staffelvereinbarung und bisherige Gesamtabnahme des Platzbauers.
 * `null`, wenn das Projekt nicht über einen Platzbauer läuft oder dieser für
 * die Saison kein Angebot mit Staffeln hat.
 */
export const ladePlatzbauerPreisKontext = async (
  projekt: Projekt
): Promise<PlatzbauerPreisKontext | null> => {
  if (!laeuftUeberPlatzbauer(projekt)) return null;
  const platzbauerId = projekt.platzbauerId as string;

  const projekte = await platzbauerverwaltungService.loadProjekteFuerPlatzbauer(
    platzbauerId,
    projekt.saisonjahr
  );
  if (projekte.length === 0) return null;

  const saisonprojekt = projekte.find((p) => p.typ === 'saisonprojekt') || projekte[0];
  const angebot = await ladeAktuellesDokument(saisonprojekt.id, 'angebot');
  if (!angebot?.daten) return null;

  const stand = leseStaffelStand(angebot.daten, projekt.saisonjahr);
  if (!stand.hatStaffel) return null;

  // Gesamtabnahme über ALLE Projekte der Saison (Saisonprojekt plus Nachträge):
  // Die Staffel misst die Abnahme des Platzbauers, nicht die eines Projekts.
  // Verlorene Vereinsprojekte zählen nicht mit — sie sind keine Bestellung.
  const positionsListen = await Promise.all(
    projekte.map((p) => platzbauerverwaltungService.aggregierePositionen(p.id))
  );
  const gesamtmenge = positionsListen
    .flat()
    .filter((p) => p.projektStatus !== 'verloren')
    .reduce((summe, p) => summe + (p.menge || 0), 0);

  return {
    platzbauerId,
    platzbauerName: saisonprojekt.platzbauerName,
    gesamtmenge: Math.round(gesamtmenge * 100) / 100,
    angebotsnummer: angebot.dokumentNummer,
    plz: projekt.lieferadresse?.plz || '',
    sorten: stand.staffelPositionen
      .filter((p) => (p.staffelpreise?.staffeln?.length ?? 0) > 0)
      .map((p) => ({
        artikelnummer: p.artikelnummer,
        bezeichnung: p.bezeichnung,
        staffeln: p.staffelpreise!.staffeln,
      })),
  };
};

/**
 * Der Preis für eine Sorte aus einem geladenen Kontext.
 *
 * Ohne passende Artikelnummer gilt die erste Staffel des Angebots — bei einem
 * Angebot mit nur einer Sorte ist das eindeutig, bei mehreren ist es der
 * dokumentierte Rückfall (die Herkunft nennt die verwendete Sorte).
 */
export const preisFuerArtikel = (
  kontext: PlatzbauerPreisKontext,
  artikelnummer?: string
): PlatzbauerPreisVorschlag | null => {
  const sorte =
    (artikelnummer && kontext.sorten.find((s) => s.artikelnummer === artikelnummer)) ||
    (artikelnummer ? null : kontext.sorten[0]);
  if (!sorte) return null;

  const treffer = ermittleStaffelPreis(sorte.staffeln, kontext.gesamtmenge, kontext.plz);
  if (!treffer) return null;

  return {
    ...treffer,
    platzbauerId: kontext.platzbauerId,
    platzbauerName: kontext.platzbauerName,
    gesamtmenge: kontext.gesamtmenge,
    artikelnummer: sorte.artikelnummer,
    bezeichnung: sorte.bezeichnung,
    angebotsnummer: kontext.angebotsnummer,
    plz: kontext.plz,
  };
};

/** Preisvorschlag für ein einzelnes Vereinsprojekt (lädt den Kontext selbst). */
export const ermittlePlatzbauerPreis = async (
  projekt: Projekt,
  artikelnummer?: string
): Promise<PlatzbauerPreisVorschlag | null> => {
  const kontext = await ladePlatzbauerPreisKontext(projekt);
  return kontext ? preisFuerArtikel(kontext, artikelnummer) : null;
};
