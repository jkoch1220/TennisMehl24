/**
 * datenpruefungService.ts
 *
 * Datenprüfung zur Auftragsbestätigung: Token-Verwaltung + E-Mail-Block.
 *
 * Beim E-Mail-Versand der AB wird ein zufälliges, nicht erratbares Token
 * erzeugt und im data-JSON des Projekts gespeichert (datenpruefungToken +
 * datenpruefungTokenErstelltAm). Die AB-E-Mail enthält einen Prüf-Block mit
 * den im System hinterlegten Daten (Dispo-Kontakt, Menge, Lieferanschrift,
 * Rechnungsadresse, Rechnungs-E-Mail) und verlinkt auf die öffentliche Seite
 *   <origin>/daten-pruefung/<projektId>?token=<token>
 * Die Validierung (Token-Gleichheit + 90-Tage-Ablauf) passiert ausschließlich
 * serverseitig in der Netlify Function netlify/functions/datenpruefung.ts —
 * Muster identisch zum QR-Liefernachweis (liefernachweisService.ts).
 */

import { Projekt } from '../types/projekt';
import { AuftragsbestaetigungsDaten } from '../types/projektabwicklung';
import { projektService } from './projektService';

/** Gültigkeit des Tokens in Tagen (muss mit der Netlify Function übereinstimmen) */
export const DATENPRUEFUNG_TOKEN_GUELTIGKEIT_TAGE = 90;

/** Erzeugt ein zufälliges, nicht erratbares Token (UUID + 32 Zufallsbytes hex) */
export const generiereDatenpruefungToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID().replace(/-/g, '')}${hex}`;
};

/** Prüft, ob ein Token-Erstellungsdatum älter als die Gültigkeitsdauer ist */
export const istDatenpruefungTokenAbgelaufen = (erstelltAm?: string): boolean => {
  if (!erstelltAm) return true;
  const erstellt = new Date(erstelltAm).getTime();
  if (Number.isNaN(erstellt)) return true;
  const ablauf = erstellt + DATENPRUEFUNG_TOKEN_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000;
  return Date.now() > ablauf;
};

/** Baut den öffentlichen Formular-Link für die AB-E-Mail */
export const baueDatenpruefungUrl = (projektId: string, token: string): string => {
  const origin = window.location.origin;
  return `${origin}/daten-pruefung/${projektId}?token=${token}`;
};

/**
 * Stellt sicher, dass das Projekt ein gültiges (nicht abgelaufenes)
 * Datenprüfungs-Token besitzt. Erzeugt bei Bedarf ein neues Token und
 * speichert es sofort am Projekt (im data-JSON), damit der Link in der
 * E-Mail garantiert auf ein persistiertes Token zeigt.
 */
export const sichereDatenpruefungToken = async (
  projekt: Projekt
): Promise<{ projekt: Projekt; token: string }> => {
  if (
    projekt.datenpruefungToken &&
    !istDatenpruefungTokenAbgelaufen(projekt.datenpruefungTokenErstelltAm)
  ) {
    return { projekt, token: projekt.datenpruefungToken };
  }

  const token = generiereDatenpruefungToken();
  const aktualisiert = await projektService.updateProjekt(projekt.$id || projekt.id, {
    datenpruefungToken: token,
    datenpruefungTokenErstelltAm: new Date().toISOString(),
  });

  // Sicherheitsnetz: Bei übergroßem data-JSON schreibt updateProjekt nur die
  // Top-Level-Spalten — das Token wäre dann NICHT persistiert und der Link
  // würde ins Leere zeigen. In dem Fall E-Mail-Block ohne Link erzeugen.
  if (aktualisiert.datenpruefungToken !== token) {
    throw new Error(
      'Datenprüfungs-Token konnte nicht am Projekt gespeichert werden (data-Feld zu groß?)'
    );
  }

  return { projekt: aktualisiert, token };
};

/**
 * Convenience: Lädt das Projekt frisch (damit ein bereits persistiertes Token
 * wiederverwendet wird), sichert das Token und liefert die fertige
 * Formular-URL zurück. Gibt null zurück, wenn das Token nicht gespeichert
 * werden kann — die AB-E-Mail enthält den Prüf-Block dann ohne Formular-Link.
 */
export const holeDatenpruefungUrlFuerProjekt = async (
  projektId: string
): Promise<string | null> => {
  try {
    const projekt = await projektService.getProjekt(projektId);
    const { token } = await sichereDatenpruefungToken(projekt);
    return baueDatenpruefungUrl(projektId, token);
  } catch (error) {
    console.warn(
      'Datenprüfungs-Token konnte nicht gesichert werden — AB-E-Mail wird ohne Formular-Link erzeugt:',
      error
    );
    return null;
  }
};

// === E-Mail-Block für die AB-E-Mail ===

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const FEHLT = '<em>— bitte übermitteln —</em>';

const wert = (text?: string): string => (text?.trim() ? escapeHtml(text.trim()) : FEHLT);

/** Lieferanschrift: abweichende Lieferadresse aus der AB, sonst Kundenadresse */
const lieferanschriftText = (
  projekt: Projekt,
  abDaten: AuftragsbestaetigungsDaten
): string => {
  if (abDaten.lieferadresseAbweichend && (abDaten.lieferadresseStrasse || abDaten.lieferadressePlzOrt)) {
    return [abDaten.lieferadresseName, abDaten.lieferadresseStrasse, abDaten.lieferadressePlzOrt]
      .filter((t) => t?.trim())
      .join(', ');
  }
  if (projekt.lieferadresse?.strasse || projekt.lieferadresse?.ort) {
    return [
      projekt.lieferadresse.strasse,
      [projekt.lieferadresse.plz, projekt.lieferadresse.ort].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ');
  }
  return [abDaten.kundenstrasse, abDaten.kundenPlzOrt].filter((t) => t?.trim()).join(', ');
};

/**
 * Erzeugt den Datenprüfungs-Block für die AB-E-Mail:
 * Aufforderung zur Prüfung von Dispo-Kontakt, Menge & Lieferanschrift
 * (inkl. Befahrbarkeit) und Rechnungsadresse/Rechnungs-E-Mail — mit den im
 * System hinterlegten Daten vorausgefüllt und Link zum Änderungsformular.
 * Der Block landet editierbar im E-Mail-Formular (TipTap) vor der Signatur.
 */
export const erstelleAbDatenpruefungHtml = (
  projekt: Projekt,
  abDaten: AuftragsbestaetigungsDaten,
  formularUrl: string | null
): string => {
  const dispoName = projekt.dispoAnsprechpartner?.name || abDaten.dispoAnsprechpartner?.name || abDaten.ansprechpartner;
  const dispoTelefon =
    projekt.dispoAnsprechpartner?.telefon || abDaten.dispoAnsprechpartner?.telefon || projekt.kundenTelefon;
  const dispoEmail = projekt.dispoAnsprechpartner?.email || projekt.kundenEmail;

  const positionen = abDaten.positionen
    .filter((p) => !p.istBedarfsposition)
    .map((p) => `${escapeHtml(p.bezeichnung)}: <strong>${p.menge} ${escapeHtml(p.einheit)}</strong>`)
    .join('<br/>');

  const rechnungsadresse = [abDaten.kundenname, abDaten.kundenstrasse, abDaten.kundenPlzOrt]
    .filter((t) => t?.trim())
    .join(', ');
  const rechnungsEmail = projekt.rechnungsEmail || projekt.kundenEmail;

  const linkAbsatz = formularUrl
    ? `<p>Sind alle Angaben korrekt, müssen Sie nichts weiter tun. Fehlende oder geänderte Daten teilen Sie uns bitte bequem über unser Änderungsformular mit:<br/><a href="${formularUrl}"><strong>➜ Daten prüfen &amp; ändern</strong></a></p>`
    : `<p>Sind alle Angaben korrekt, müssen Sie nichts weiter tun. Fehlende oder geänderte Daten teilen Sie uns bitte per Antwort auf diese E-Mail mit.</p>`;

  return `<p><strong>Bitte prüfen Sie für eine reibungslose Abwicklung die folgenden Daten:</strong></p>
<p><strong>1. Ansprechpartner für die Dispositionsplanung</strong> (Terminabstimmung der Anlieferung) — bitte übermitteln Sie uns Telefonnummer und E-Mail-Adresse, sofern nicht oder nicht korrekt hinterlegt:<br/>
Name: ${wert(dispoName)}<br/>
Telefon: ${wert(dispoTelefon)}<br/>
E-Mail: ${wert(dispoEmail)}</p>
<p><strong>2. Menge &amp; Lieferanschrift</strong> — bitte prüfen Sie außerdem die Befahrbarkeit vor Ort (Zufahrt muss für LKW geeignet sein):<br/>
${positionen || FEHLT}<br/>
Lieferanschrift: ${wert(lieferanschriftText(projekt, abDaten))}</p>
<p><strong>3. Rechnungsadresse &amp; E-Mail für den Rechnungsversand:</strong><br/>
Rechnungsadresse: ${wert(rechnungsadresse)}<br/>
E-Mail für Rechnungen: ${wert(rechnungsEmail)}</p>
${linkAbsatz}`;
};
