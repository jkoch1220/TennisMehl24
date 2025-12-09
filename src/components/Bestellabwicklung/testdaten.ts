import { RechnungsDaten, AngebotsDaten, LieferscheinDaten } from '../../types/bestellabwicklung';

const baseFirmendaten = {
  firmenname: 'TennisMehl GmbH',
  firmenstrasse: 'Wertheimer Str. 13',
  firmenPlzOrt: '97959 Großrinderfeld',
  firmenTelefon: '+49 (0) 9391 9870-0',
  firmenEmail: 'info@tennismehl.com',
  firmenWebsite: 'www.tennismehl.com',
};

const baseKundendaten = {
  kundennummer: 'K-2024-001',
  projektnummer: 'P-2024-042',
  kundenname: 'TC Rot-Weiß Musterhausen e.V.',
  kundenstrasse: 'Sportplatzweg 15',
  kundenPlzOrt: '12345 Musterhausen',
  ansprechpartner: 'Max Mustermann',
  
  // Abweichende Lieferadresse
  lieferadresseAbweichend: true,
  lieferadresseName: 'TC Rot-Weiß Musterhausen e.V.',
  lieferadresseStrasse: 'Tennisweg 20',
  lieferadressePlzOrt: '12345 Musterhausen',
};

export const testAngebot: AngebotsDaten = {
  ...baseFirmendaten,
  ...baseKundendaten,
  
  angebotsnummer: 'ANG-2024-001',
  angebotsdatum: new Date().toISOString().split('T')[0],
  gueltigBis: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +30 Tage
  
  positionen: [
    {
      id: '1',
      artikelnummer: 'TM-PR-ROT',
      bezeichnung: 'Tennismehl Premium - Rot',
      menge: 100,
      einheit: 'kg',
      einzelpreis: 15.50,
      gesamtpreis: 1550.00
    },
    {
      id: '2',
      artikelnummer: 'TM-CL-BRN',
      bezeichnung: 'Tennismehl Classic - Braun',
      menge: 50,
      einheit: 'kg',
      einzelpreis: 12.00,
      gesamtpreis: 600.00
    }
  ],
  
  zahlungsziel: '14 Tage',
  zahlungsart: 'Überweisung',
  skontoAktiviert: true,
  skonto: {
    prozent: 2,
    tage: 7
  },
  
  lieferzeit: '2-3 Werktage',
  frachtkosten: 50.00,
  
  bemerkung: 'Vielen Dank für Ihre Anfrage! Gerne unterbreiten wir Ihnen folgendes Angebot.',
  agbHinweis: 'Es gelten unsere allgemeinen Geschäftsbedingungen.',
};

export const testLieferschein: LieferscheinDaten = {
  ...baseFirmendaten,
  ...baseKundendaten,
  
  lieferscheinnummer: 'LS-2024-001',
  lieferdatum: new Date().toISOString().split('T')[0],
  bestellnummer: 'BEST-2024-123',
  
  positionen: [
    {
      id: '1',
      artikel: 'Tennismehl Premium - Rot',
      menge: 100,
      einheit: 'kg',
      chargennummer: 'CH-2024-0501'
    },
    {
      id: '2',
      artikel: 'Tennismehl Classic - Braun',
      menge: 50,
      einheit: 'kg',
      chargennummer: 'CH-2024-0502'
    }
  ],
  
  empfangBestaetigt: false,
  bemerkung: 'Bitte überprüfen Sie die Ware bei Erhalt auf Vollständigkeit und Unversehrtheit.',
};

export const testRechnung: RechnungsDaten = {
  ...baseFirmendaten,
  ...baseKundendaten,
  
  rechnungsnummer: 'RE-2024-001',
  rechnungsdatum: new Date().toISOString().split('T')[0],
  leistungsdatum: new Date().toISOString().split('T')[0],
  
  bankname: 'Sparkasse Tauberfranken',
  iban: 'DE49 6735 0130 0000254019',
  bic: 'SOLADES1TBB',
  
  steuernummer: '123/456/78910',
  ustIdNr: 'DE 320 029 255',
  
  positionen: [
    {
      id: '1',
      artikelnummer: 'TM-PR-ROT',
      bezeichnung: 'Tennismehl Premium - Rot',
      menge: 100,
      einheit: 'kg',
      einzelpreis: 15.50,
      gesamtpreis: 1550.00
    },
    {
      id: '2',
      artikelnummer: 'TM-CL-BRN',
      bezeichnung: 'Tennismehl Classic - Braun',
      menge: 50,
      einheit: 'kg',
      einzelpreis: 12.00,
      gesamtpreis: 600.00
    }
  ],
  
  zahlungsziel: '14 Tage',
  skontoAktiviert: true,
  skonto: {
    prozent: 2,
    tage: 7
  },
  
  bemerkung: 'Vielen Dank für Ihren Auftrag! Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.',
};
