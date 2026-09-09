/**
 * Adressänderungen über das Bestellportal (Vorschlag 6, 09/2026).
 *
 * Der Kunde ändert hier ohne Aufsicht die Anschrift, an die wir liefern und
 * fakturieren. Drei Regeln daraus sind heikel genug für eigene Tests
 * (Spiegel der Logik in netlify/functions/bestellung.ts — als Netlify-Function
 * nicht direkt importierbar):
 *
 *  1. Die Rechnungsanschrift muss dorthin geschrieben werden, wo AB und
 *     Rechnung sie lesen (`kundenstrasse`/`kundenPlzOrt`). Vorher landete sie in
 *     `projekt.rechnungsadresse` — einem Feld, das KEIN Portal-Code liest. Für
 *     den Kunden sah die Änderung erfolgreich aus und verpuffte.
 *  2. Nach der Rechnungsstellung und bei Bezugsweg „Platzbauer" darf sie NICHT
 *     mehr übernommen werden.
 *  3. „PLZ Ort" steht im Bestand in EINEM Feld und muss für die Anzeige sauber
 *     getrennt werden, sonst steht der Ort doppelt in der Adresse.
 */
import { describe, it, expect } from 'vitest';

interface Adresse { strasse?: string; plz?: string; ort?: string }
interface ProjektDaten {
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  rechnungsnummer?: string;
  bezugsweg?: string;
  istPlatzbauerprojekt?: boolean;
  lieferadresse?: Adresse;
}

const rechnungsadresseAenderbar = (daten: ProjektDaten): boolean => {
  if (daten.rechnungsnummer) return false;
  if (daten.bezugsweg === 'platzbauer' || daten.istPlatzbauerprojekt) return false;
  return true;
};

const vergleichbar = (s: string): string => s.replace(/\s+/g, ' ').trim();
const adressZeile = (a?: Adresse | null): string => {
  const teile = [a?.strasse, a?.plz, a?.ort].map((t) => vergleichbar(String(t ?? '')));
  const plzOrt = [teile[1], teile[2]].filter(Boolean).join(' ');
  return [teile[0], plzOrt].filter(Boolean).join(', ');
};

const trenneAdresse = (strasse?: string, plzOrt?: string): Adresse => {
  const rest = (plzOrt ?? '').trim();
  const treffer = /^(\d{4,5})\s+(.*)$/.exec(rest);
  return {
    strasse: strasse ?? '',
    plz: treffer ? treffer[1] : '',
    ort: treffer ? treffer[2] : rest,
  };
};

describe('rechnungsadresseAenderbar', () => {
  it('erlaubt die Änderung im Regelfall — vor der Bestellung ist der richtige Zeitpunkt', () => {
    expect(rechnungsadresseAenderbar({ kundenstrasse: 'Am Sportpark 4' })).toBe(true);
  });

  it('sperrt sie, sobald eine Rechnung existiert', () => {
    // Sonst liefen Rechnung und Beleg auseinander; Storno ist Bürosache.
    expect(rechnungsadresseAenderbar({ rechnungsnummer: 'RE-2026-1043' })).toBe(false);
  });

  it('sperrt sie bei Bezugsweg Platzbauer', () => {
    // Die Rechnung geht an den Platzbauer — der Verein darf dessen Anschrift
    // nicht überschreiben.
    expect(rechnungsadresseAenderbar({ bezugsweg: 'platzbauer' })).toBe(false);
    expect(rechnungsadresseAenderbar({ istPlatzbauerprojekt: true })).toBe(false);
  });
});

describe('trenneAdresse', () => {
  it('zerlegt die gewachsene Schreibweise „PLZ Ort"', () => {
    expect(trenneAdresse('Am Sportpark 4', '97070 Würzburg')).toEqual({
      strasse: 'Am Sportpark 4', plz: '97070', ort: 'Würzburg',
    });
  });

  it('hält mehrteilige Ortsnamen zusammen', () => {
    expect(trenneAdresse('Vereinsheim 12', '97072 Würzburg-Heidingsfeld').ort).toBe('Würzburg-Heidingsfeld');
    expect(trenneAdresse('X 1', '84028 Landshut an der Isar').ort).toBe('Landshut an der Isar');
  });

  it('nimmt vierstellige Auslands-PLZ mit', () => {
    expect(trenneAdresse('Hauptstr. 1', '4020 Linz')).toEqual({ strasse: 'Hauptstr. 1', plz: '4020', ort: 'Linz' });
  });

  it('wirft nichts weg, wenn das Format unbekannt ist', () => {
    // Lieber alles im Ortsfeld als ein verlorener Bestandteil.
    expect(trenneAdresse('Weg 2', 'Postfach 1234').ort).toBe('Postfach 1234');
    expect(trenneAdresse('Weg 2', 'Postfach 1234').plz).toBe('');
    expect(trenneAdresse('Weg 2', '').ort).toBe('');
    expect(trenneAdresse(undefined, undefined)).toEqual({ strasse: '', plz: '', ort: '' });
  });

  it('erzeugt keine Dopplung beim Hin- und Rückweg', () => {
    // Der Fehler, den die Trennung verhindert: „97070 Würzburg Würzburg".
    const zerlegt = trenneAdresse('Am Sportpark 4', '97070 Würzburg');
    const zurueck = [zerlegt.plz, zerlegt.ort].filter(Boolean).join(' ');
    expect(zurueck).toBe('97070 Würzburg');
  });
});

describe('Vollständigkeit', () => {
  // Ohne diese Prüfung leerte eine halb ausgefüllte Eingabe `kundenPlzOrt` —
  // also genau das Feld, aus dem Rechnung und AB ihren Empfänger nehmen.
  const vollstaendig = (a: Adresse) => !!a.strasse?.trim() && !!a.ort?.trim();

  it('lässt nur vollständige Anschriften durch', () => {
    expect(vollstaendig({ strasse: 'Am Sportpark 4', plz: '97070', ort: 'Würzburg' })).toBe(true);
    // PLZ darf im Ausland fehlen, Straße und Ort nicht.
    expect(vollstaendig({ strasse: 'Am Sportpark 4', ort: 'Würzburg' })).toBe(true);
  });

  it('weist halb ausgefüllte Eingaben ab, statt Felder zu leeren', () => {
    expect(vollstaendig({ strasse: 'Am Sportpark 4' })).toBe(false);
    expect(vollstaendig({ strasse: 'Am Sportpark 4', plz: '97070', ort: '   ' })).toBe(false);
    expect(vollstaendig({ ort: 'Würzburg' })).toBe(false);
    expect(vollstaendig({})).toBe(false);
  });
});

describe('Änderungsprotokoll', () => {
  const vergleiche = (vorherDaten: ProjektDaten, neueAdresse: Adresse) => {
    const vorher = adressZeile({ strasse: vorherDaten.kundenstrasse, ort: vorherDaten.kundenPlzOrt });
    const nachher = adressZeile(neueAdresse);
    return { vorher, nachher, geaendert: vorher !== nachher };
  };

  it('meldet keine Änderung bei bloßem Leerraum-Unterschied', () => {
    // `formatAdresszeile` baut „PLZ Ort" ohne Trimmen; fehlt die PLZ, bleibt ein
    // führendes Leerzeichen stehen. Ohne Normalisierung entstünde bei JEDEM
    // Speichern eine Notiz „geändert: X → X" samt Alarm-Mail.
    expect(vergleiche(
      { kundenstrasse: 'Am Sportpark 4', kundenPlzOrt: '97070  Würzburg' },
      { strasse: 'Am Sportpark 4', plz: '97070', ort: 'Würzburg' }
    ).geaendert).toBe(false);

    expect(vergleiche(
      { kundenstrasse: 'Am Sportpark 4 ', kundenPlzOrt: ' 97070 Würzburg' },
      { strasse: 'Am Sportpark 4', plz: '97070', ort: 'Würzburg' }
    ).geaendert).toBe(false);
  });

  it('erkennt eine echte Änderung', () => {
    const r = vergleiche(
      { kundenstrasse: 'Am Sportpark 4', kundenPlzOrt: '97070 Würzburg' },
      { strasse: 'Vereinsheim 12', plz: '97072', ort: 'Würzburg' }
    );
    expect(r.geaendert).toBe(true);
    expect(r.vorher).toBe('Am Sportpark 4, 97070 Würzburg');
    expect(r.nachher).toBe('Vereinsheim 12, 97072 Würzburg');
  });

  it('meldet nichts, wenn der Kunde dieselbe Adresse zurückschickt', () => {
    // Die Seite sendet die Adresse bei jedem Speichern mit — ohne diesen
    // Vergleich entstünde bei jedem Klick eine Notiz und eine Mail.
    const r = vergleiche(
      { kundenstrasse: 'Am Sportpark 4', kundenPlzOrt: '97070 Würzburg' },
      { strasse: 'Am Sportpark 4', plz: '97070', ort: 'Würzburg' }
    );
    expect(r.geaendert).toBe(false);
  });
});
