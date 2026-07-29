// Tests für die Signatur-Vererbung der E-Mail-Vorlagen.
//
// Hintergrund: Bis 07/2026 trug jede der vier Vorlagen ihre eigene Signaturkopie.
// Wer sie an einer Stelle pflegte, ließ die anderen veralten — so fehlten der
// Angebots-Signatur das Hydrocourt-Banner und die Bildmaße am Logo (ohne width/height
// rendern viele Mailclients es in Originalgröße). Seither gilt die gemeinsame
// Signatur, und eine Vorlage weicht nur ab, wenn sie es ausdrücklich tut.

import { describe, it, expect } from 'vitest';
import { ermittleSignatur } from '../emailHelpers';

const GEMEINSAM = '<p>Mit sportlichen Grüßen</p><p>vom Team der Tennismehl GmbH</p>';
const EIGEN = '<p>Sondersignatur nur für dieses Dokument</p>';

describe('ermittleSignatur', () => {
  it('nimmt die gemeinsame Signatur, wenn die Vorlage keine eigene hat', () => {
    const templates = { standardSignatur: GEMEINSAM, angebot: { betreff: '' } };
    expect(ermittleSignatur(templates, templates.angebot)).toBe(GEMEINSAM);
  });

  it('behandelt eine leere eigene Signatur wie „keine"', () => {
    const templates = { standardSignatur: GEMEINSAM, angebot: { signatur: '   ' } };
    expect(ermittleSignatur(templates, templates.angebot)).toBe(GEMEINSAM);
  });

  it('lässt eine bewusst abweichende Signatur stehen', () => {
    const templates = { standardSignatur: GEMEINSAM, rechnung: { signatur: EIGEN } };
    expect(ermittleSignatur(templates, templates.rechnung)).toBe(EIGEN);
  });

  // Regression: ohne gepflegte Signatur ging früher eine mit „Koch Dienste" und der
  // toten Adresse www.tennismehl24.de hinaus — beides gehört nicht zur Tennismehl GmbH.
  it('fällt ohne jede gepflegte Signatur auf korrekte Firmendaten zurück', () => {
    const signatur = ermittleSignatur({}, {});
    expect(signatur).toContain('Tennismehl GmbH');
    expect(signatur).toContain('HRB 18235');
    expect(signatur).not.toContain('Koch Dienste');
    expect(signatur).not.toContain('tennismehl24.de');
  });

  it('ignoriert eine leere gemeinsame Signatur und nimmt den Notnagel', () => {
    const templates = { standardSignatur: '  ', angebot: {} };
    expect(ermittleSignatur(templates, templates.angebot)).toContain('Tennismehl GmbH');
  });
});
