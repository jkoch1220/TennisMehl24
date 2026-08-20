/**
 * Erkennung vorab bezahlter Shop-Bestellungen.
 *
 * Regression: Der Frontend-Typ deklarierte `bezahlt`/`zahlungsart`, die es als
 * Appwrite-Attribut nie gab — beide sind in jedem Datensatz undefined. Die
 * Projekt-Anlage wertete genau die aus und schrieb deshalb „(noch offen)" in die
 * Notizen, auch bei laengst bezahlten Bestellungen. Massgeblich ist `zahlungsStatus`,
 * das der Gambio-Sync tatsaechlich schreibt.
 */
import { describe, it, expect } from 'vitest';
import { istVorabBezahlt } from '../shopBestellungService';

describe('istVorabBezahlt — zahlungsStatus aus dem Sync', () => {
  it('erkennt eine ueber den Hub bezahlte Kreditkartenzahlung', () => {
    // Bestellung #202 aus der Produktion: Gambio Hub / PayPal2Hub, Kredit-/Debitkarte
    expect(istVorabBezahlt({ zahlungsStatus: 'bezahlt', zahlungsmethode: 'Kreditkarten' })).toBe(true);
  });

  it('erkennt PayPal', () => {
    expect(istVorabBezahlt({ zahlungsStatus: 'bezahlt', zahlungsmethode: 'PayPal' })).toBe(true);
  });

  it('erkennt Lastschrift ueber den Hub', () => {
    expect(istVorabBezahlt({ zahlungsStatus: 'bezahlt', zahlungsmethode: 'Lastschrift' })).toBe(true);
  });

  it('haelt Rechnungskauf offen', () => {
    expect(istVorabBezahlt({ zahlungsStatus: 'offen', zahlungsmethode: 'Rechnung' })).toBe(false);
  });

  it('haelt Vorkasse offen', () => {
    expect(
      istVorabBezahlt({ zahlungsStatus: 'offen', zahlungsmethode: 'Vorkasse (Überweisung)' })
    ).toBe(false);
  });

  it('vertraut zahlungsStatus auch gegen die Zahlungsmethode', () => {
    // Vorkasse, die nachweislich eingegangen ist
    expect(
      istVorabBezahlt({ zahlungsStatus: 'bezahlt', zahlungsmethode: 'Vorkasse (Überweisung)' })
    ).toBe(true);
    // PayPal-Bestellung, die der Shop als offen fuehrt (z.B. abgebrochene Zahlung)
    expect(istVorabBezahlt({ zahlungsStatus: 'offen', zahlungsmethode: 'PayPal' })).toBe(false);
  });
});

describe('istVorabBezahlt — Fallback fuer Altbestellungen ohne zahlungsStatus', () => {
  it('wertet Rechnung als offen', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'Rechnung' })).toBe(false);
  });

  it('wertet Vorkasse als offen', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'Vorkasse (Überweisung)' })).toBe(false);
  });

  it('wertet PayPal als bezahlt', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'PayPal' })).toBe(true);
  });

  it('wertet Kreditkarten als bezahlt', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'Kreditkarten' })).toBe(true);
  });

  it('ist im Zweifel vorsichtig — unbekannte Methode gilt als offen', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'Barzahlung bei Abholung' })).toBe(false);
    expect(istVorabBezahlt({ zahlungsmethode: '' })).toBe(false);
    expect(istVorabBezahlt({})).toBe(false);
  });

  it('ignoriert Gross-/Kleinschreibung', () => {
    expect(istVorabBezahlt({ zahlungsmethode: 'KREDITKARTEN' })).toBe(true);
    expect(istVorabBezahlt({ zahlungsmethode: 'rechnung' })).toBe(false);
  });

  it('fuehrt erstattete Bestellungen nicht als bezahlt', () => {
    // Rueckabwicklung: Das Geld ist zurueck beim Kunden. Ohne eigene Behandlung
    // wuerde der Zahlart-Fallback greifen und PayPal faelschlich als bezahlt melden.
    expect(istVorabBezahlt({ zahlungsStatus: 'erstattet', zahlungsmethode: 'PayPal' })).toBe(false);
  });

  it('laesst Rechnung auch dann offen, wenn der Text weitere Kennungen enthaelt', () => {
    // "Kauf auf Rechnung (Klarna)" ist eine Forderung, keine Vorabzahlung
    expect(istVorabBezahlt({ zahlungsmethode: 'Kauf auf Rechnung (Klarna)' })).toBe(false);
  });
});
