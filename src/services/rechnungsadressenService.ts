/**
 * Wer bekommt die Rechnung, und wohin ging die Ware?
 *
 * Beim Ziegelmehl fallen diese beiden Adressen regelmäßig auseinander, und zwar
 * auf zwei verschiedene Arten:
 *
 *   Bezugsweg Platzbauer  Der Verein bestellt, der Platzbauer zahlt. Rechnung an
 *                         den Platzbauer, Lieferung an den Verein.
 *   Platzbauerprojekt     Über die Platzbauerverwaltung angelegt. Die Rechnungs-
 *                         adresse steht bereits am Projekt (der Platzbauer), die
 *                         Lieferadresse kommt vom zugeordneten Verein.
 *   Direktgeschäft        Beides vom Kunden; die Lieferadresse steht nur dann in
 *                         der Rechnung, wenn sie wirklich abweicht.
 *
 * Diese Funktion ist die EINZIGE Stelle, die das entscheidet. Sie wurde aus dem
 * RechnungTab herausgezogen, als die Sammelfakturierung dazukam: Zwei Kopien
 * derselben Regeln hätten sich früher oder später unterschieden — und dann
 * bekäme derselbe Vorgang je nach Weg eine andere Rechnungsanschrift.
 */

import { Projekt } from '../types/projekt';
import { saisonplanungService } from './saisonplanungService';
import { formatAdresszeile } from './pdfHelpers';

export interface RechnungsAdressen {
  kundenname: string;
  kundenstrasse: string;
  kundenPlzOrt: string;
  kundennummer?: string;
  lieferadresseAbweichend: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;
  /** Welche Regel gegriffen hat — für Protokoll und Fehlersuche. */
  regel: 'bezugsweg_platzbauer' | 'platzbauerprojekt' | 'direkt' | 'nur_projektdaten';
}

/** Fallback-Werte, wenn der Kundendatensatz nichts hergibt. */
interface Basisdaten {
  kundenname?: string;
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  kundennummer?: string;
}

export async function ermittleRechnungsAdressen(
  projekt: Projekt,
  basis?: Basisdaten
): Promise<RechnungsAdressen> {
  let kundenname = projekt.kundenname || basis?.kundenname || '';
  let kundenstrasse = projekt.kundenstrasse || basis?.kundenstrasse || '';
  let kundenPlzOrt = projekt.kundenPlzOrt || basis?.kundenPlzOrt || '';
  let kundennummer = projekt.kundennummer || basis?.kundennummer;

  let lieferadresseAbweichend = !!projekt.lieferadresse;
  let lieferadresseName: string | undefined;
  let lieferadresseStrasse = projekt.lieferadresse?.strasse || undefined;
  let lieferadressePlzOrt = projekt.lieferadresse
    ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
    : undefined;

  const kunde = projekt.kundeId
    ? await saisonplanungService.loadKunde(projekt.kundeId).catch(() => null)
    : null;

  // FALL 1 — Bezugsweg Platzbauer: Der Platzbauer zahlt, der Verein bekommt die Ware.
  if (projekt.bezugsweg === 'platzbauer' && projekt.platzbauerId) {
    const pb = await saisonplanungService.loadKunde(projekt.platzbauerId).catch(() => null);
    if (pb?.rechnungsadresse) {
      kundenname = pb.name;
      kundennummer = pb.kundennummer;
      kundenstrasse = pb.rechnungsadresse.strasse || '';
      kundenPlzOrt = formatAdresszeile(
        pb.rechnungsadresse.plz || '',
        pb.rechnungsadresse.ort || '',
        pb.rechnungsadresse.land
      );

      if (kunde) {
        lieferadresseAbweichend = true;
        lieferadresseName = kunde.name;
        lieferadresseStrasse = kunde.lieferadresse?.strasse || projekt.lieferadresse?.strasse;
        lieferadressePlzOrt = kunde.lieferadresse
          ? formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land)
          : projekt.lieferadresse
          ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
          : undefined;
      }

      return {
        kundenname,
        kundenstrasse,
        kundenPlzOrt,
        kundennummer,
        lieferadresseAbweichend,
        lieferadresseName,
        lieferadresseStrasse,
        lieferadressePlzOrt,
        regel: 'bezugsweg_platzbauer',
      };
    }
  }

  // Ohne Kundendatensatz bleibt nur, was am Projekt steht. Das ist kein Fehler —
  // Shop-Projekte etwa führen ihre Adressen ausschließlich dort.
  if (!kunde) {
    return {
      kundenname,
      kundenstrasse,
      kundenPlzOrt,
      kundennummer,
      lieferadresseAbweichend,
      lieferadresseName,
      lieferadresseStrasse,
      lieferadressePlzOrt,
      regel: 'nur_projektdaten',
    };
  }

  // FALL 2 — Platzbauerprojekt: Die Rechnungsadresse steht schon am Projekt und
  // darf NICHT vom Kunden überschrieben werden; der Kunde ist hier der Verein.
  if (projekt.istPlatzbauerprojekt) {
    lieferadresseAbweichend = true;
    lieferadresseName = kunde.name;
    lieferadresseStrasse = projekt.lieferadresse?.strasse || kunde.lieferadresse?.strasse;
    lieferadressePlzOrt = projekt.lieferadresse
      ? formatAdresszeile(projekt.lieferadresse.plz, projekt.lieferadresse.ort, projekt.lieferadresse.land)
      : formatAdresszeile(kunde.lieferadresse.plz, kunde.lieferadresse.ort, kunde.lieferadresse.land);

    return {
      kundenname,
      kundenstrasse,
      kundenPlzOrt,
      kundennummer,
      lieferadresseAbweichend,
      lieferadresseName,
      lieferadresseStrasse,
      lieferadressePlzOrt,
      regel: 'platzbauerprojekt',
    };
  }

  // FALL 3 — Direktgeschäft: Rechnungsadresse vom Kunden, Lieferadresse nur dann
  // ausweisen, wenn sie tatsächlich abweicht. Sonst stünde auf jeder Rechnung
  // zweimal dieselbe Anschrift.
  kundenname = kunde.name;
  kundennummer = kunde.kundennummer;
  kundenstrasse = kunde.rechnungsadresse.strasse;
  kundenPlzOrt = formatAdresszeile(
    kunde.rechnungsadresse.plz,
    kunde.rechnungsadresse.ort,
    kunde.rechnungsadresse.land
  );

  const lieferAdresseIstAnders =
    kunde.lieferadresse.strasse !== kunde.rechnungsadresse.strasse ||
    kunde.lieferadresse.plz !== kunde.rechnungsadresse.plz;

  if (lieferAdresseIstAnders) {
    lieferadresseAbweichend = true;
    lieferadresseName = kunde.name;
    lieferadresseStrasse = kunde.lieferadresse.strasse;
    lieferadressePlzOrt = formatAdresszeile(
      kunde.lieferadresse.plz,
      kunde.lieferadresse.ort,
      kunde.lieferadresse.land
    );
  }

  return {
    kundenname,
    kundenstrasse,
    kundenPlzOrt,
    kundennummer,
    lieferadresseAbweichend,
    lieferadresseName,
    lieferadresseStrasse,
    lieferadressePlzOrt,
    regel: 'direkt',
  };
}
