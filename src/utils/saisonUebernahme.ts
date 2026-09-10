/**
 * Eine Saisonvereinbarung ins Folgejahr übernehmen (09/2026).
 *
 * Ein Platzbauer wird jedes Jahr gleich bedient: dieselben Sorten, dieselbe
 * Stufenleiter, dieselben Zusatzkonditionen — nur Preise und Zeitraum ändern
 * sich. Bis jetzt startete das neue Saisonprojekt leer, und die Staffelmatrix
 * wurde aus dem Vorjahresangebot abgetippt. Das ist die Stelle, an der sich
 * Zahlendreher einschleichen, die erst die Abrechnung im Herbst findet.
 *
 * Übernommen wird der ANGEBOTSENTWURF, nicht ein fertiges Angebot: Preise
 * gehören geprüft, bevor sie rausgehen. Der Entwurf öffnet sich im
 * Angebotstab genau so, wie ihn der Sachbearbeiter dort verlassen hätte.
 *
 * Nicht übernommen werden die Vereinszeilen. Welche Vereine mitmachen und mit
 * welchen Mengen, entscheidet die neue Saison; der Angebotstab füllt sie aus
 * den Vereinszuordnungen und den Vorjahresmengen selbst.
 */
import type { AngebotsStand } from './staffelUebernahme';
import type { PlatzbauerAngebotPosition, StaffelKonditionen } from '../types/platzbauer';
import type { StaffelSorte } from './staffelUebernahme';

/** Der Entwurf, den der Angebotstab liest (`AngebotEntwurf` dort). */
export interface UebernommenerAngebotsEntwurf {
  vereinPositionen: never[];
  zusatzPositionen: PlatzbauerAngebotPosition[];
  preislistenPositionen: PlatzbauerAngebotPosition[];
  staffelpreisPositionen: StaffelSorte[];
  bedarfsPositionen: AngebotsStand['bedarfsPositionen'];
  angebotsModus: 'standard' | 'staffelpreis';
  staffelKonditionen: StaffelKonditionen;
  formData: {
    angebotsnummer: string;
    angebotsdatum: string;
    gueltigBis: string;
    zahlungsziel: string;
    lieferzeit: string;
    bemerkung: string;
  };
}

const iso = (datum: Date): string => datum.toISOString().split('T')[0];

/**
 * Verschiebt ein Datum um die Jahresdifferenz und behält Tag und Monat.
 * Ein 29.02. fällt dabei auf den 28.02. — die Alternative (1.3.) verschöbe
 * einen Stichtag über einen Monatswechsel.
 */
const verschiebeJahr = (isoDatum: string | undefined, jahresDifferenz: number): string | undefined => {
  if (!isoDatum) return undefined;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDatum);
  if (!treffer) return isoDatum;
  const jahr = Number(treffer[1]) + jahresDifferenz;
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(Math.min(tag, letzterTag)).padStart(2, '0')}`;
};

/**
 * Baut aus dem Stand des Vorjahresangebots den Entwurf für die neue Saison.
 *
 * Preise bleiben unverändert: Eine automatische Erhöhung wäre eine
 * Preisentscheidung, und die trifft kein Skript. Der Zeitraum der
 * Staffelkonditionen wandert um die Jahresdifferenz mit, sonst stünde im
 * Angebot 2027 der Stichtag 31.10.2026 — und die Staffel wäre am Tag der
 * Unterschrift bereits abgelaufen.
 */
export const baueUebernahmeEntwurf = (
  stand: AngebotsStand,
  vonSaison: number,
  nachSaison: number,
  heute: Date = new Date()
): UebernommenerAngebotsEntwurf => {
  const differenz = nachSaison - vonSaison;
  const gueltigBis = new Date(heute.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    vereinPositionen: [],
    zusatzPositionen: stand.zusatzPositionen,
    preislistenPositionen: stand.preislistenPositionen,
    staffelpreisPositionen: stand.staffelSorten,
    bedarfsPositionen: stand.bedarfsPositionen,
    angebotsModus: stand.angebotsModus,
    staffelKonditionen: {
      ...stand.konditionen,
      zeitraumVon: verschiebeJahr(stand.konditionen.zeitraumVon, differenz) ?? stand.konditionen.zeitraumVon,
      zeitraumBis: verschiebeJahr(stand.konditionen.zeitraumBis, differenz) ?? stand.konditionen.zeitraumBis,
      // Der Hinweistext wird neu erzeugt: Der eingefrorene Text des Vorjahres
      // nennt dessen Zeitraum und Beispielmengen.
      hinweistext: undefined,
    },
    formData: {
      // Die Nummer vergibt das Portal beim Erstellen — eine übernommene wäre
      // die des Vorjahresbelegs.
      angebotsnummer: '',
      angebotsdatum: iso(heute),
      gueltigBis: iso(gueltigBis),
      zahlungsziel: stand.formData.zahlungsziel,
      lieferzeit: stand.formData.lieferzeit,
      bemerkung: stand.formData.bemerkung,
    },
  };
};
