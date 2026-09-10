/**
 * Vorbelegung von Lieferbedingungen und Bemerkung für Platzbauer-Belege (10.09.2026).
 *
 * Bis dahin stand „Frei Baustelle, abgeladen" fest im Angebots- und AB-Tab und
 * ließ sich je Beleg nicht ändern. Jetzt kommt der Text aus den Belegtexten
 * (Platzbauer-Verwaltung → Belegtexte), wird in die Formularfelder vorbelegt
 * und mit dem Beleg gespeichert.
 *
 * Eigene Datei, weil `constants/platzbauerBelegtexte.ts` keine Services
 * importieren soll (Portal-URL kommt aus liefernachweisService, Stammdaten aus
 * stammdatenService) — beide Tabs brauchen aber genau diese Zusammenführung.
 */
import { alsNachschlage, belegtext, leseBelegtexte } from '../constants/platzbauerBelegtexte';
import { frachtrechnerHinweis } from '../constants/vertragsklauseln';
import { getPortalPublicUrl } from '../services/liefernachweisService';
import { getStammdatenOderDefault } from '../services/stammdatenService';

export interface BelegVorbelegung {
  lieferbedingungen: string;
  bemerkung: string;
}

/** Liest die gepflegten Vorbelegungen; fällt bei Fehlern auf die Vorlage zurück. */
export const ladeBelegVorbelegung = async (): Promise<BelegVorbelegung> => {
  let json: string | undefined;
  try {
    json = (await getStammdatenOderDefault()).platzbauerBelegtexte;
  } catch (e) {
    console.warn('Belegtexte konnten nicht geladen werden, Vorlage gilt:', e);
  }
  const texte = alsNachschlage(leseBelegtexte(json));
  const werte = { frachtrechner: frachtrechnerHinweis(getPortalPublicUrl()) };
  return {
    lieferbedingungen: belegtext(texte, 'lieferbedingungen', werte),
    bemerkung: belegtext(texte, 'bemerkung', werte),
  };
};
