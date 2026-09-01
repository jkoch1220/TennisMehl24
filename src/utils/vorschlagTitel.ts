/**
 * Titel eines Verbesserungsvorschlags aus der Beschreibung ableiten.
 *
 * Der Titel war ein Pflichtfeld: Wer den Vorschlag einfach in die Beschreibung
 * tippte und abschickte, bekam „Bitte füllen Sie den Titel aus." und musste
 * sich nachträglich eine Überschrift ausdenken. Bei einem Werkzeug, das
 * möglichst niedrigschwellig Rückmeldungen einsammeln soll, ist das die falsche
 * Hürde (Vorschlag [14]).
 *
 * Genommen wird der erste Satz oder die erste Zeile, je nachdem was zuerst
 * endet — und höchstens 70 Zeichen, damit die Karte in der Liste lesbar bleibt.
 */

const MAX_LAENGE = 70;

export const titelAusBeschreibung = (beschreibung: string): string => {
  const text = (beschreibung || '').trim();
  if (!text) return '';

  // Erste Zeile bzw. erster Satz — was früher kommt, gewinnt.
  const ersteZeile = text.split('\n')[0].trim();
  const satzEnde = ersteZeile.search(/[.!?](\s|$)/);
  let titel = satzEnde > 0 ? ersteZeile.slice(0, satzEnde) : ersteZeile;

  if (titel.length > MAX_LAENGE) {
    // An der letzten Wortgrenze vor dem Limit kürzen, nicht mitten im Wort.
    const gekuerzt = titel.slice(0, MAX_LAENGE);
    const letzteLuecke = gekuerzt.lastIndexOf(' ');
    titel = (letzteLuecke > 30 ? gekuerzt.slice(0, letzteLuecke) : gekuerzt) + '…';
  }

  return titel.trim();
};
