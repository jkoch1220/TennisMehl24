/**
 * liefernachweisService.ts
 *
 * Digitaler QR-Liefernachweis: Token-Verwaltung auf Client-Seite.
 *
 * Beim Erstellen/Generieren eines Lieferschein-PDFs wird ein zufälliges,
 * nicht erratbares Token erzeugt und im data-JSON des Projekts gespeichert
 * (liefernachweisToken + liefernachweisTokenErstelltAm). Der QR-Code auf dem
 * Lieferschein verlinkt auf die öffentliche Seite
 *   <origin>/liefernachweis/<projektId>?token=<token>
 * Die Validierung (Token-Gleichheit + 30-Tage-Ablauf) passiert ausschließlich
 * serverseitig in der Netlify Function netlify/functions/liefernachweis.ts —
 * hier liegt KEIN Secret außer dem Token selbst (das bewusst auf dem
 * gedruckten Lieferschein landet).
 */

import { Projekt } from '../types/projekt';
import { projektService } from './projektService';

/** Gültigkeit des Tokens in Tagen (muss mit der Netlify Function übereinstimmen) */
export const LIEFERNACHWEIS_TOKEN_GUELTIGKEIT_TAGE = 30;

/** Erzeugt ein zufälliges, nicht erratbares Token (UUID + 32 Zufallsbytes hex) */
export const generiereLiefernachweisToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID().replace(/-/g, '')}${hex}`;
};

/** Prüft, ob ein Token-Erstellungsdatum älter als die Gültigkeitsdauer ist */
export const istLiefernachweisTokenAbgelaufen = (erstelltAm?: string): boolean => {
  if (!erstelltAm) return true;
  const erstellt = new Date(erstelltAm).getTime();
  if (Number.isNaN(erstellt)) return true;
  const ablauf = erstellt + LIEFERNACHWEIS_TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000;
  return Date.now() > ablauf;
};

/**
 * Öffentliche Basis-URL des Portals für nach außen gehende Links (QR-Codes).
 * Konfigurierbar über VITE_PORTAL_PUBLIC_URL (z. B. https://tennismehl-portal.online),
 * damit gedruckte QR-Codes nie auf netlify.app- oder localhost-Adressen zeigen.
 */
export const getPortalPublicUrl = (): string => {
  const konfiguriert = import.meta.env.VITE_PORTAL_PUBLIC_URL as string | undefined;
  return (konfiguriert || window.location.origin).replace(/\/+$/, '');
};

/** Baut den öffentlichen Bestätigungs-Link für den QR-Code */
export const baueLiefernachweisUrl = (
  projektId: string,
  token: string,
  testModus?: boolean
): string => {
  const testParam = testModus ? '&test=1' : '';
  return `${getPortalPublicUrl()}/liefernachweis/${projektId}?token=${token}${testParam}`;
};

/**
 * Stellt sicher, dass das Projekt ein gültiges (nicht abgelaufenes)
 * Liefernachweis-Token besitzt. Erzeugt bei Bedarf ein neues Token und
 * speichert es sofort am Projekt (im data-JSON), damit der QR-Code auf dem
 * PDF garantiert auf ein persistiertes Token zeigt.
 */
export const sichereLiefernachweisToken = async (
  projekt: Projekt
): Promise<{ projekt: Projekt; token: string }> => {
  if (
    projekt.liefernachweisToken &&
    !istLiefernachweisTokenAbgelaufen(projekt.liefernachweisTokenErstelltAm)
  ) {
    return { projekt, token: projekt.liefernachweisToken };
  }

  const token = generiereLiefernachweisToken();
  const aktualisiert = await projektService.updateProjekt(projekt.$id || projekt.id, {
    liefernachweisToken: token,
    liefernachweisTokenErstelltAm: new Date().toISOString(),
  });

  // Sicherheitsnetz: Bei übergroßem data-JSON schreibt updateProjekt nur die
  // Top-Level-Spalten — das Token wäre dann NICHT persistiert und der QR-Code
  // würde ins Leere zeigen. In dem Fall lieber ohne QR drucken (Papier-Fallback).
  if (aktualisiert.liefernachweisToken !== token) {
    throw new Error(
      'Liefernachweis-Token konnte nicht am Projekt gespeichert werden (data-Feld zu groß?)'
    );
  }

  return { projekt: aktualisiert, token };
};

/**
 * Convenience: Lädt das Projekt, sichert das Token und liefert die fertige
 * QR-URL zurück. Gibt null zurück, wenn das Projekt nicht geladen werden kann
 * (der Lieferschein wird dann ohne QR-Code generiert — Papier-Fallback).
 */
export const holeLiefernachweisUrlFuerProjekt = async (
  projektId: string,
  testModus?: boolean
): Promise<string | null> => {
  try {
    const projekt = await projektService.getProjekt(projektId);
    const { token } = await sichereLiefernachweisToken(projekt);
    return baueLiefernachweisUrl(projektId, token, testModus);
  } catch (error) {
    console.warn('Liefernachweis-Token konnte nicht gesichert werden — Lieferschein wird ohne QR-Code erzeugt:', error);
    return null;
  }
};
