/**
 * Prüft, dass Liefer- und Zahlungsbedingungen im Angebots-PDF wirklich
 * verschwinden, wenn sie im Anfrage-Dialog abgewählt werden — und dass ein
 * eigener Text bzw. abweichendes Zahlungsziel durchschlägt.
 *
 * Aufruf: npx vite-node scripts/test-angebot-bedingungen.ts
 * (vite-node statt tsx, weil die Services `import.meta.env` verwenden)
 *
 * Erzeugt echte PDFs im Speicher und liest die gezeichneten Textbefehle aus —
 * prüft also den tatsächlichen Generator, nicht eine Nachbildung.
 */
import { generiereAngebotPDF } from '../src/services/dokumentService';
import { STANDARD_LIEFERBEDINGUNGEN } from '../src/constants/vertragsklauseln';
import type { AngebotsDaten } from '../src/types/projektabwicklung';

const stammdaten: any = {
  firmenname: 'Tennismehl GmbH',
  firmenstrasse: 'Raiffeisenweg 1',
  firmenPlz: '97232',
  firmenOrt: 'Giebelstadt',
  firmenTelefon: '09391 98700',
  firmenEmail: 'info@tennismehl.com',
  firmenWebsite: 'www.tennismehl.com',
  geschaeftsfuehrer: ['Luca Ramos de la Rosa', 'Julian Tim Koch'],
  handelsregister: 'Wuerzburg HRB 18235',
  sitzGesellschaft: 'Giebelstadt',
  steuernummer: '',
  ustIdNr: '',
  bankname: '',
  iban: '',
  bic: '',
};

const basis: AngebotsDaten = {
  firmenname: 'Tennismehl GmbH',
  firmenstrasse: 'Raiffeisenweg 1',
  firmenPlzOrt: '97232 Giebelstadt',
  firmenTelefon: '09334 1234',
  firmenEmail: 'info@tennismehl.com',
  kundenname: 'TC Musterstadt',
  kundenstrasse: 'Sportweg 3',
  kundenPlzOrt: '97070 Würzburg',
  angebotsnummer: 'AN-TEST-1',
  angebotsdatum: '2026-08-05',
  gueltigBis: '2026-09-04',
  zahlungsziel: '14 Tage',
  positionen: [
    {
      id: '1',
      artikelnummer: 'TM-ZM-02',
      bezeichnung: 'Ziegelmehl 0-2 mm',
      menge: 10,
      einheit: 't',
      einzelpreis: 100,
      gesamtpreis: 1000,
    },
  ],
};

// jsPDF-Text auslesen: interne Seitenliste enthält die gezeichneten Strings
const pdfText = (pdf: any): string => {
  const seiten: string[] = [];
  const anzahl = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= anzahl; i++) {
    seiten.push(pdf.internal.pages[i].join('\n'));
  }
  return seiten.join('\n');
};

let fehler = 0;
const pruefe = (name: string, bedingung: boolean) => {
  if (!bedingung) fehler++;
  console.log(`${bedingung ? '✅' : '❌'} ${name}`);
};

const run = async () => {
  // --- Alles aktiv ---
  const mit = await generiereAngebotPDF(
    {
      ...basis,
      lieferbedingungenAktiviert: true,
      lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
      zahlungsbedingungenAusblenden: false,
    },
    stammdaten
  );
  const textMit = pdfText(mit);
  pruefe('Aktiv: Überschrift "Lieferbedingungen" im PDF', textMit.includes('Lieferbedingungen'));
  pruefe('Aktiv: Befahrbarkeits-Text im PDF', textMit.includes('Befahrbarkeit'));
  pruefe('Aktiv: Mindestabnahmemenge im PDF', textMit.includes('Mindestabnahmemenge'));
  pruefe('Aktiv: Überschrift "Zahlungsbedingungen" im PDF', textMit.includes('Zahlungsbedingungen'));
  pruefe('Aktiv: Zahlungsziel im PDF', textMit.includes('14 Tage'));

  // --- Beides abgewählt ---
  const ohne = await generiereAngebotPDF(
    {
      ...basis,
      lieferbedingungenAktiviert: false,
      lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
      zahlungsbedingungenAusblenden: true,
    },
    stammdaten
  );
  const textOhne = pdfText(ohne);
  pruefe('Abgewählt: KEINE Überschrift "Lieferbedingungen"', !textOhne.includes('Lieferbedingungen'));
  pruefe('Abgewählt: KEIN Befahrbarkeits-Text', !textOhne.includes('Befahrbarkeit'));
  pruefe('Abgewählt: KEINE Überschrift "Zahlungsbedingungen"', !textOhne.includes('Zahlungsbedingungen'));
  pruefe('Abgewählt: Positionen weiterhin im PDF', textOhne.includes('Ziegelmehl'));

  // --- Nur Zahlungsbedingungen abgewählt ---
  const nurLiefer = await generiereAngebotPDF(
    {
      ...basis,
      lieferbedingungenAktiviert: true,
      lieferbedingungen: STANDARD_LIEFERBEDINGUNGEN,
      zahlungsbedingungenAusblenden: true,
    },
    stammdaten
  );
  const textNurLiefer = pdfText(nurLiefer);
  pruefe('Nur Zahlung ab: Lieferbedingungen bleiben', textNurLiefer.includes('Befahrbarkeit'));
  pruefe('Nur Zahlung ab: KEINE Zahlungsbedingungen', !textNurLiefer.includes('Zahlungsbedingungen'));

  // --- Abweichendes Zahlungsziel ---
  const vorkasse = await generiereAngebotPDF(
    { ...basis, zahlungsziel: 'Vorkasse', zahlungsbedingungenAusblenden: false },
    stammdaten
  );
  pruefe('Zahlungsziel "Vorkasse" wird gedruckt', pdfText(vorkasse).includes('Vorkasse'));

  // --- Eigener Lieferbedingungs-Text ---
  const eigen = await generiereAngebotPDF(
    {
      ...basis,
      lieferbedingungenAktiviert: true,
      lieferbedingungen: 'Anlieferung ausschliesslich mit Kleinfahrzeug moeglich.',
    },
    stammdaten
  );
  const textEigen = pdfText(eigen);
  pruefe('Eigener Text wird gedruckt', textEigen.includes('Kleinfahrzeug'));
  pruefe('Standardtext ist dann weg', !textEigen.includes('Befahrbarkeit'));

  console.log(fehler === 0 ? '\n🎉 Alle PDF-Prüfungen bestanden' : `\n💥 ${fehler} Prüfung(en) fehlgeschlagen`);
  process.exit(fehler === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('Testlauf abgebrochen:', e);
  process.exit(2);
});
