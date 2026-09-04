/**
 * Mehrere E-Mail-Adressen in einem Feld.
 *
 * Auslöser: Im Kundenstamm ließ sich „dietmar.nunn@gmx.de; michaelzull@web.de"
 * nicht als Rechnungs-E-Mail speichern — der Browser lehnte das Semikolon ab.
 */
import { describe, it, expect } from 'vitest';
import {
  trenneEmailAdressen,
  pruefeEmailAdressen,
  sindGueltigeEmailAdressen,
  normalisiereEmailAdressen,
  emailAdressenFehler,
  istGueltigeEmailAdresse,
} from '../emailAdressen';

describe('trenneEmailAdressen', () => {
  it('trennt eine Outlook-Liste mit Semikolon', () => {
    expect(trenneEmailAdressen('dietmar.nunn@gmx.de; michaelzull@web.de')).toEqual([
      'dietmar.nunn@gmx.de',
      'michaelzull@web.de',
    ]);
  });

  it('trennt Komma, Leerzeichen und Zeilenumbrüche gleichermaßen', () => {
    expect(trenneEmailAdressen('a@x.de, b@y.de')).toEqual(['a@x.de', 'b@y.de']);
    expect(trenneEmailAdressen('a@x.de b@y.de')).toEqual(['a@x.de', 'b@y.de']);
    expect(trenneEmailAdressen('a@x.de\nb@y.de\r\nc@z.de')).toEqual(['a@x.de', 'b@y.de', 'c@z.de']);
    expect(trenneEmailAdressen(' ;a@x.de ;; b@y.de , ')).toEqual(['a@x.de', 'b@y.de']);
  });

  it('nimmt aus „Name <adresse>" nur die Adresse', () => {
    expect(trenneEmailAdressen('Dietmar Nunn <dietmar.nunn@gmx.de>; Michael Zull <michaelzull@web.de>')).toEqual([
      'dietmar.nunn@gmx.de',
      'michaelzull@web.de',
    ]);
  });

  it('entfernt Dubletten ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(trenneEmailAdressen('Info@Verein.de; info@verein.de; kasse@verein.de')).toEqual([
      'Info@Verein.de',
      'kasse@verein.de',
    ]);
  });

  it('liefert für leere Eingaben eine leere Liste', () => {
    expect(trenneEmailAdressen('')).toEqual([]);
    expect(trenneEmailAdressen('   ')).toEqual([]);
    expect(trenneEmailAdressen(undefined)).toEqual([]);
    expect(trenneEmailAdressen(null)).toEqual([]);
  });
});

describe('istGueltigeEmailAdresse', () => {
  it('akzeptiert übliche Adressen inkl. Plus und Subdomain', () => {
    expect(istGueltigeEmailAdresse('buchhaltung@tc-giebelstadt.de')).toBe(true);
    expect(istGueltigeEmailAdresse('kasse+2026@verein.bayern.de')).toBe(true);
    expect(istGueltigeEmailAdresse('  a@x.de ')).toBe(true);
  });

  it('lehnt Eingaben ohne @, ohne Domain-Punkt oder mit Trennzeichen ab', () => {
    expect(istGueltigeEmailAdresse('kein-at.de')).toBe(false);
    expect(istGueltigeEmailAdresse('a@x')).toBe(false);
    expect(istGueltigeEmailAdresse('a@x.de; b@y.de')).toBe(false);
    expect(istGueltigeEmailAdresse('')).toBe(false);
  });
});

describe('pruefeEmailAdressen / sindGueltigeEmailAdressen', () => {
  it('benennt genau die ungültigen Einträge', () => {
    const p = pruefeEmailAdressen('a@x.de; kaputt; b@y.de; 0171 123456');
    expect(p.adressen).toEqual(['a@x.de', 'kaputt', 'b@y.de', '0171', '123456']);
    expect(p.ungueltig).toEqual(['kaputt', '0171', '123456']);
    expect(sindGueltigeEmailAdressen('a@x.de; kaputt')).toBe(false);
  });

  it('gilt nur mit mindestens einer gültigen Adresse als gültig', () => {
    expect(sindGueltigeEmailAdressen('a@x.de; b@y.de')).toBe(true);
    expect(sindGueltigeEmailAdressen('')).toBe(false);
    expect(sindGueltigeEmailAdressen(undefined)).toBe(false);
  });
});

describe('normalisiereEmailAdressen', () => {
  it('speichert kommagetrennt — die Form, die nodemailer und mailto: verstehen', () => {
    expect(normalisiereEmailAdressen('dietmar.nunn@gmx.de; michaelzull@web.de')).toBe(
      'dietmar.nunn@gmx.de, michaelzull@web.de'
    );
    expect(normalisiereEmailAdressen('a@x.de\nb@y.de')).toBe('a@x.de, b@y.de');
  });

  it('lässt eine einzelne Adresse und leere Felder unverändert', () => {
    expect(normalisiereEmailAdressen('  a@x.de ')).toBe('a@x.de');
    expect(normalisiereEmailAdressen('')).toBe('');
    expect(normalisiereEmailAdressen(undefined)).toBe('');
  });

  it('ist idempotent', () => {
    const einmal = normalisiereEmailAdressen('a@x.de; b@y.de');
    expect(normalisiereEmailAdressen(einmal)).toBe(einmal);
  });
});

describe('emailAdressenFehler', () => {
  it('meldet nichts bei leerem oder gültigem Feld', () => {
    expect(emailAdressenFehler('')).toBeNull();
    expect(emailAdressenFehler(undefined)).toBeNull();
    expect(emailAdressenFehler('a@x.de; b@y.de', 'Rechnungs-E-Mail')).toBeNull();
  });

  it('nennt Feld und ungültigen Eintrag', () => {
    expect(emailAdressenFehler('a@x.de; kaputt', 'Rechnungs-E-Mail')).toBe(
      'Rechnungs-E-Mail: „kaputt" ist keine gültige E-Mail-Adresse.'
    );
    expect(emailAdressenFehler('x; y', 'E-Mail')).toBe(
      'E-Mail: „x", „y" sind keine gültigen E-Mail-Adressen.'
    );
  });

  it('lehnt im Einzelmodus mehrere Adressen ab', () => {
    expect(emailAdressenFehler('a@x.de; b@y.de', 'Login', false)).toBe(
      'Login: Hier ist nur eine Adresse möglich (2 eingetragen).'
    );
    expect(emailAdressenFehler('a@x.de', 'Login', false)).toBeNull();
  });
});
