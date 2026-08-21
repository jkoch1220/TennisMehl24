/**
 * Die Herkunft eines Projekts kam bis 08/2026 aus Namensmustern: `kundeId`
 * beginnt mit `shop-`, die AB-Nummer mit `SHOP-`, der Projektname mit `Shop #`.
 * Wer ein Projekt umbenannte, änderte damit seinen Kanal.
 *
 * Seit Schema v44 gibt es die Spalte `herkunft`. Diese Tests halten fest, wer
 * gegen wen gewinnt — die Reihenfolge ist der eigentliche Inhalt der Änderung.
 */
import { describe, it, expect } from 'vitest';
import {
  getProjektHerkunft,
  istShopProjekt,
  istAnfrageProjekt,
  getShopBestellnummer,
} from '../projektHerkunft';
import { Projekt } from '../../types/projekt';

const projekt = (teil: Partial<Projekt>): Projekt =>
  ({ id: 'p1', status: 'angebot', saisonjahr: 2026, ...teil } as Projekt);

describe('gepflegte Spalte schlägt Namensmuster', () => {
  it('führt ein umbenanntes Shop-Projekt weiterhin als Shop', () => {
    // Der Grund für die Spalte: „Shop #171" → „TC Musterstadt 2026" darf den
    // Auftrag nicht aus der Shop-Herkunft fallen lassen.
    const p = projekt({ herkunft: 'shop', projektName: 'TC Musterstadt 2026' });
    expect(istShopProjekt(p)).toBe(true);
    expect(getProjektHerkunft(p)).toBe('shop');
  });

  it('glaubt auch dem NEIN der Spalte', () => {
    // Ein von Hand angelegtes Projekt, das zufällig „Shop #..." heißt, ist keine
    // Shop-Bestellung. Ohne diese Regel würde das Muster die Spalte überstimmen.
    const p = projekt({ herkunft: 'direkt', projektName: 'Shop #171 nachgebaut' });
    expect(istShopProjekt(p)).toBe(false);
    expect(getProjektHerkunft(p)).toBeNull();
  });

  it('erkennt Altbestand ohne Spalte weiter am Muster', () => {
    expect(istShopProjekt(projekt({ projektName: 'Shop #173' }))).toBe(true);
    expect(istShopProjekt(projekt({ kundeId: 'shop-173-eigen' }))).toBe(true);
    expect(istShopProjekt(projekt({ auftragsbestaetigungsnummer: 'SHOP-173-E' }))).toBe(true);
  });

  it('nimmt die Bestellnummer aus dem Feld statt aus der AB-Nummer', () => {
    const p = projekt({ shopBestellnummer: '173', auftragsbestaetigungsnummer: 'AB-2026-0042' });
    expect(getShopBestellnummer(p)).toBe('173');
  });

  it('leitet die Bestellnummer weiterhin ab, wenn das Feld leer ist', () => {
    expect(getShopBestellnummer(projekt({ auftragsbestaetigungsnummer: 'SHOP-173-E' }))).toBe('173');
    expect(getShopBestellnummer(projekt({ projektName: 'Shop #175 (Universal)' }))).toBe('175');
  });
});

describe('Anfrage-Herkunft', () => {
  it('braucht mit gepflegter Spalte kein Anfragen-Set mehr', () => {
    // Vor der Spalte war die Verknüpfung nur auf der Anfrage hinterlegt — die
    // Akte musste sie einzeln nachschlagen.
    expect(istAnfrageProjekt(projekt({ herkunft: 'anfrage' }))).toBe(true);
    expect(getProjektHerkunft(projekt({ herkunft: 'anfrage' }))).toBe('anfrage');
  });

  it('erkennt Altbestand weiter über das übergebene Anfragen-Set', () => {
    const p = projekt({ id: 'p-alt' });
    expect(istAnfrageProjekt(p, new Set(['p-alt']))).toBe(true);
  });

  it('widerspricht dem Set nicht, sondern folgt der Spalte', () => {
    const p = projekt({ id: 'p-alt', herkunft: 'direkt' });
    expect(istAnfrageProjekt(p, new Set(['p-alt']))).toBe(false);
  });
});

describe('Platzbau gewinnt gegen die Spalte', () => {
  it('folgt der nachträglichen Zuordnung, nicht dem Anlege-Kanal', () => {
    // Die Platzbauer-Zuordnung passiert NACH dem Anlegen. Ein Projekt, das als
    // „direkt" begann, trüge sonst dauerhaft den falschen Kanal.
    const p = projekt({ herkunft: 'direkt', istPlatzbauerprojekt: true });
    expect(getProjektHerkunft(p)).toBe('platzbau');
  });

  it('zieht auch ein zugeordnetes Shop-Projekt zum Platzbauer', () => {
    const p = projekt({ herkunft: 'shop', platzbauerId: 'pb-1' });
    expect(getProjektHerkunft(p)).toBe('platzbau');
  });

  it('meldet für ein als platzbau migriertes Projekt keinen doppelten Kanal', () => {
    // Die Migration schreibt 'platzbau' als Auskunft. Trägt das Projekt die
    // harten Felder nicht (mehr), ist es kein Platzbau-Projekt — dann darf die
    // Spalte allein keinen Kanal behaupten.
    expect(getProjektHerkunft(projekt({ herkunft: 'platzbau' }))).toBeNull();
  });
});
