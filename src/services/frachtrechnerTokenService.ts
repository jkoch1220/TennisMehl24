/**
 * frachtrechnerTokenService.ts
 *
 * Öffentlicher Frachtkostenrechner: Token-Verwaltung auf Client-Seite.
 *
 * Ein Kunde bekommt einen persönlichen Link auf
 *   <portal>/frachtrechner/<kundeId>?token=<token>
 * und rechnet sich dort selbst aus, was ihn eine Lieferung kostet (Paletten,
 * Körnung, Ziel-PLZ). Das Token wird hier erzeugt und im data-JSON des
 * Saison-Kunden gespeichert (frachtrechnerToken + frachtrechnerTokenErstelltAm).
 *
 * Die Validierung (Token-Gleichheit + Ablauf) passiert ausschließlich
 * serverseitig in netlify/functions/frachtrechner.ts — Muster identisch zum
 * QR-Liefernachweis (liefernachweisService.ts) und zur Datenprüfung
 * (datenpruefungService.ts). Hier liegt KEIN Secret außer dem Token selbst,
 * das der Kunde ohnehin bekommt.
 *
 * Gerechnet wird ebenfalls nur serverseitig: Basispreis, Zone, Gewichtsstufe,
 * Aufschlag und Speditionsname verlassen den Server nie, der Kunde sieht
 * ausschließlich seine Endsummen.
 */

import { SaisonKunde } from '../types/saisonplanung';
import { saisonplanungService } from './saisonplanungService';
import { getPortalPublicUrl } from './liefernachweisService';

/**
 * Gültigkeit des Tokens in Tagen (muss mit netlify/functions/frachtrechner.ts
 * übereinstimmen — dort wird der Ablauf geprüft, hier nur vorab erneuert).
 *
 * Ein Jahr, weil der Link beim Kunden liegen bleibt: Er bekommt ihn einmal mit
 * dem Saisonangebot und ruft ihn über die Saison hinweg immer wieder auf. Ein
 * kürzerer Ablauf hieße, dass der Rechner mitten in der Saison stumm 403
 * antwortet, ohne dass jemand davon erfährt.
 */
export const FRACHTRECHNER_TOKEN_GUELTIGKEIT_TAGE = 365;

/** Erzeugt ein zufälliges, nicht erratbares Token (UUID + 32 Zufallsbytes hex) */
export const generiereFrachtrechnerToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID().replace(/-/g, '')}${hex}`;
};

/** Prüft, ob ein Token-Erstellungsdatum älter als die Gültigkeitsdauer ist */
export const istFrachtrechnerTokenAbgelaufen = (erstelltAm?: string): boolean => {
  if (!erstelltAm) return true;
  const erstellt = new Date(erstelltAm).getTime();
  if (Number.isNaN(erstellt)) return true;
  const ablauf = erstellt + FRACHTRECHNER_TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000;
  return Date.now() > ablauf;
};

/**
 * Baut den öffentlichen Rechner-Link für den Kunden.
 *
 * Bewusst `getPortalPublicUrl()` (liefernachweisService) statt
 * `window.location.origin`: Der Link geht per E-Mail nach außen und darf nie
 * auf eine netlify.app-Preview- oder localhost-Adresse zeigen.
 * `VITE_PORTAL_PUBLIC_URL` legt die verbindliche Außenadresse fest, der Origin
 * ist nur der Rückfall, wenn die Variable fehlt.
 *
 * Kein Mock-Parameter (anders als beim QR-Liefernachweis): Der HTTP-Vertrag der
 * Function kennt nur `kundeId` und `token`, sie schlägt den Kunden also immer
 * in der Produktion nach. Ein in der Sandbox erzeugter Link findet den dortigen
 * Testkunden folglich nicht.
 */
export const baueFrachtrechnerUrl = (kundeId: string, token: string): string =>
  `${getPortalPublicUrl()}/frachtrechner/${kundeId}?token=${token}`;

/**
 * Stellt sicher, dass der Kunde ein gültiges (nicht abgelaufenes)
 * Frachtrechner-Token besitzt. Erzeugt bei Bedarf ein neues Token und
 * speichert es sofort am Kunden (im data-JSON), damit ein daraus gebauter Link
 * garantiert auf ein persistiertes Token zeigt.
 */
export const sichereFrachtrechnerToken = async (
  kunde: SaisonKunde
): Promise<{ kunde: SaisonKunde; token: string }> => {
  if (
    kunde.frachtrechnerToken &&
    !istFrachtrechnerTokenAbgelaufen(kunde.frachtrechnerTokenErstelltAm)
  ) {
    return { kunde, token: kunde.frachtrechnerToken };
  }

  const token = generiereFrachtrechnerToken();
  const aktualisiert = await saisonplanungService.updateKunde(kunde.id, {
    frachtrechnerToken: token,
    frachtrechnerTokenErstelltAm: new Date().toISOString(),
  });

  // Sicherheitsnetz: `updateKunde` schreibt den kompletten Kunden als data-JSON
  // und liest die Antwort wieder daraus. Steht das Token dort nicht, ist es
  // NICHT persistiert — der Link wäre tot und der Kunde bekäme beim Öffnen ein
  // 403, ohne zu wissen warum. Deshalb hier abbrechen: Der Aufrufer darf
  // lieber gar keinen Link ausgeben als einen, der aussieht wie ein
  // funktionierender.
  if (aktualisiert.frachtrechnerToken !== token) {
    throw new Error(
      'Frachtrechner-Token konnte nicht am Kunden gespeichert werden (data-Feld zu groß?)'
    );
  }

  return { kunde: aktualisiert, token };
};
