// Der Massen-Angebots-Lauf erzeugt im Herbst die Angebote für die kommende
// Frühjahrssaison. Alles, was dabei an ein Datum gekoppelt ist, muss deshalb am
// ZIELJAHR hängen und nicht am Tag der Erzeugung — sonst laufen die Angebote ab,
// bevor der Verein beauftragt, und sie tragen die Dieselklausel des Vorjahres.

import { describe, it, expect } from 'vitest';
import { _massenAngebotInternals as internals } from '../massenAngebotService';
import { MassenAngebotKandidat } from '../../types/massenAngebot';
import { Stammdaten } from '../../types/stammdaten';

const stammdaten = {
  firmenname: 'Tennismehl GmbH',
  firmenstrasse: 'Raiffeisenweg 1',
  firmenPlz: '97232',
  firmenOrt: 'Giebelstadt',
  firmenTelefon: '09334 000',
  firmenEmail: 'info@tennismehl.com',
} as unknown as Stammdaten;

const kandidat = {
  kundeId: 'kunde-1',
  kundenname: 'TC Musterstadt e.V.',
  kunde: {
    id: 'kunde-1',
    name: 'TC Musterstadt e.V.',
    kundennummer: '10442',
    rechnungsadresse: { strasse: 'Am Sandberg 1', plz: '97246', ort: 'Musterstadt' },
    lieferadresse: { strasse: 'Am Sandberg 1', plz: '97246', ort: 'Musterstadt' },
  },
  positionen: [],
  warnungen: [],
} as unknown as MassenAngebotKandidat;

describe('baueAngebotsDaten — Gültigkeit hängt am Saisonjahr', () => {
  it('setzt die Gültigkeit auf das Ende der Ziel-Liefersaison, nicht auf 30 Tage ab heute', () => {
    const daten = internals.baueAngebotsDaten(kandidat, 'ANG-2027-0001', stammdaten, 2027);

    expect(daten.gueltigBis).toBe('2027-05-31');
    // Ein im September 2026 erzeugtes Angebot darf nicht im Oktober 2026 ablaufen.
    expect(daten.gueltigBis > new Date().toISOString().split('T')[0]).toBe(true);
  });

  it('folgt dem Saisonjahr auch für andere Jahre', () => {
    expect(internals.baueAngebotsDaten(kandidat, 'ANG-2026-0001', stammdaten, 2026).gueltigBis).toBe(
      '2026-05-31'
    );
    expect(internals.baueAngebotsDaten(kandidat, 'ANG-2028-0001', stammdaten, 2028).gueltigBis).toBe(
      '2028-05-31'
    );
  });

  it('druckt für die Saison 2027 die Entfernungsstaffel statt der Pauschale', () => {
    // Die Dieselklausel wird über `gueltigBis` ausgewählt. Mit dem alten Verhalten
    // (30 Tage ab Erzeugung) landete ein September-Angebot im Oktober 2026 und traf
    // damit die Staffel bis 2026-12-31 — die kennt keine Entfernungsstaffel.
    const text2027 = internals.baueAngebotsDaten(kandidat, 'ANG-2027-0001', stammdaten, 2027)
      .dieselpreiszuschlagText;
    const text2026 = internals.baueAngebotsDaten(kandidat, 'ANG-2026-0001', stammdaten, 2026)
      .dieselpreiszuschlagText;

    expect(text2027).toBeTruthy();
    expect(text2027).toMatch(/entfernung/i);
    // Gegenprobe: Die Saison 2026 kennt die Entfernungsstaffel noch nicht.
    expect(text2026).not.toMatch(/entfernung/i);
  });

  it('reicht die Angebotsnummer unverändert durch', () => {
    const daten = internals.baueAngebotsDaten(kandidat, 'ANG-2027-0042', stammdaten, 2027);
    expect(daten.angebotsnummer).toBe('ANG-2027-0042');
  });
});
