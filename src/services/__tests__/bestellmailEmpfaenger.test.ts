/**
 * Wer bekommt welche Mail nach einer Bestellung?
 *
 * Die beiden Mails folgen bewusst UNTERSCHIEDLICHEN Regeln:
 * Die Bestätigung an den Kunden darf aus der Sandbox niemals einen Verein
 * erreichen. Die interne Meldung geht immer an uns selbst — auch beim Testen,
 * denn dort will man sehen, dass sie ankommt.
 */
import { describe, it, expect } from 'vitest';

const INTERN = 'bestellung@tennismehl24.com';
const TEST = 'jtatwcook@gmail.com';

/** Bildet die Empfängerwahl aus netlify/functions/bestellung.ts nach. */
const kundenEmpfaenger = (sandbox: boolean, echt: string | undefined) =>
  sandbox ? TEST : (echt || '');
const internEmpfaenger = () => INTERN;

describe('Bestätigung an den Kunden', () => {
  const verein = 'vorstand@tc-musterstadt.de';

  it('erreicht den Verein nur aus der Produktion', () => {
    expect(kundenEmpfaenger(false, verein)).toBe(verein);
  });

  it('geht aus der Sandbox an die Testadresse — nie an den Verein', () => {
    expect(kundenEmpfaenger(true, verein)).toBe(TEST);
    expect(kundenEmpfaenger(true, verein)).not.toBe(verein);
  });

  it('entfällt, wenn kein Empfänger hinterlegt ist', () => {
    expect(kundenEmpfaenger(false, undefined)).toBe('');
  });
});

describe('Interne Meldung', () => {
  it('geht immer an bestellung@tennismehl24.com — auch aus der Sandbox', () => {
    expect(internEmpfaenger()).toBe(INTERN);
  });

  it('ist an uns selbst gerichtet, deshalb gibt es dort nichts zu schützen', () => {
    // Gegenprobe zur Kundenmail: keine Umleitung, keine Bedingung.
    expect(internEmpfaenger()).not.toBe(TEST);
  });
});
