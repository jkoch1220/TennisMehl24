// Die Signatur trägt einen {absender}-Platzhalter, der zur Laufzeit mit dem
// angemeldeten Benutzer gefüllt wird — Skripte und Functions ohne Login
// verschicken die neutrale Team-Grußzeile. Namensquelle ist prefs.signaturName,
// weil die Kontonamen teils Kurzformen sind ("Julian", "Ronald").
import { describe, it, expect, afterEach } from 'vitest';
import { personalisiereSignatur } from '../emailHelpers';
import { setAuditUser } from '../../services/auditService';
import type { User } from '../../services/authService';

const SIGNATUR = '<td>{absender}</td>';

const benutzer = (name: string, signaturName?: string): User =>
  ({ $id: 'u1', name, prefs: signaturName ? { signaturName } : {} }) as unknown as User;

afterEach(() => setAuditUser(null));

describe('personalisiereSignatur', () => {
  it('grüßt ohne Login neutral vom Team', () => {
    expect(personalisiereSignatur(SIGNATUR)).toBe('<td>Ihr Team der Tennismehl GmbH</td>');
  });

  it('nutzt prefs.signaturName des angemeldeten Benutzers samt Team-Zeile', () => {
    setAuditUser(benutzer('Ronald', 'Ronald Riedl'));
    const ergebnis = personalisiereSignatur(SIGNATUR);
    expect(ergebnis).toContain('Ihr Ronald Riedl');
    expect(ergebnis).toContain('vom Team der Tennismehl GmbH');
  });

  it('fällt auf den Kontonamen zurück, wenn er wie ein voller Name aussieht', () => {
    setAuditUser(benutzer('Luca Ramos de la Rosa'));
    expect(personalisiereSignatur(SIGNATUR)).toContain('Ihr Luca Ramos de la Rosa');
  });

  it('lässt Kurz-Kontonamen nicht halbfertig in die Grußzeile fallen', () => {
    setAuditUser(benutzer('Julian'));
    expect(personalisiereSignatur(SIGNATUR)).toBe('<td>Ihr Team der Tennismehl GmbH</td>');
  });

  it('lässt ein explizit übergebener Name den angemeldeten Benutzer übersteuern', () => {
    setAuditUser(benutzer('Ronald', 'Ronald Riedl'));
    expect(personalisiereSignatur(SIGNATUR, 'Julian Koch')).toContain('Ihr Julian Koch');
  });

  it('escaped HTML im Namen', () => {
    setAuditUser(benutzer('x', 'A<b>B'));
    expect(personalisiereSignatur(SIGNATUR)).toContain('A&lt;b&gt;B');
  });

  it('lässt Signaturen ohne Platzhalter unangetastet', () => {
    const alt = '<p>Mit sportlichen Grüßen</p>';
    expect(personalisiereSignatur(alt)).toBe(alt);
  });
});
