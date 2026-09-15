import { describe, it, expect } from 'vitest';
import { ANSICHTEN, darfAnsichtSehen, type AnsichtRechte } from '../ansichten';
import { ALL_TOOLS, LEGACY_VOLLZUGRIFF_TOOL_IDS } from '../../../constants/tools';

const MASSENANGEBOT = ANSICHTEN.find((a) => a.id === 'massenangebot')!;

const rechte = (ueberschrieben: Partial<AnsichtRechte> = {}): AnsichtRechte => ({
  isAdmin: false,
  darfShop: false,
  darfMassenangebot: false,
  ...ueberschrieben,
});

describe('Zugang zum Massen-Angebots-Tool', () => {
  it('haengt am Tool-Recht, nicht mehr am Admin-Label', () => {
    expect(MASSENANGEBOT.benoetigt).toBe('massenangebot');
    expect(darfAnsichtSehen(MASSENANGEBOT, rechte({ darfMassenangebot: true }))).toBe(true);
    // Admin sieht es weiter — aber ueber can(), das Admins ohnehin durchlaesst,
    // nicht mehr ueber ein eigenes Admin-Gate an der Ansicht.
    expect(darfAnsichtSehen(MASSENANGEBOT, rechte({ isAdmin: true }))).toBe(false);
  });

  it('bleibt ohne das Recht verschlossen', () => {
    expect(darfAnsichtSehen(MASSENANGEBOT, rechte())).toBe(false);
    expect(darfAnsichtSehen(MASSENANGEBOT, rechte({ darfShop: true }))).toBe(false);
  });

  it('ist als eigenes Tool in der Rechte-Matrix waehlbar', () => {
    const tool = ALL_TOOLS.find((t) => t.id === 'massen-angebote');
    expect(tool).toBeDefined();
    // nurAdmin wuerde es aus der Matrix werfen — dann waere nichts gewonnen.
    expect(tool!.nurAdmin).toBeUndefined();
    expect(tool!.optInPflichtig).toBe(true);
  });

  it('taucht nicht als eigene Kachel oder Menuepunkt auf', () => {
    // Es ist ein Reiter IN der Projektverwaltung. Ein eigener Menuepunkt waere
    // ein zweiter Weg zum selben Ziel, den die Menueleiste nie aktiv markiert.
    const tool = ALL_TOOLS.find((t) => t.id === 'massen-angebote')!;
    expect(tool.keinEinstieg).toBe(true);
  });

  it('faellt niemandem durch den Legacy-Vollzugriff zu', () => {
    // User ohne Rollen und ohne allowedTools bekommen genau diese Liste.
    // Ein Tool, das scharf Kunden-Mails verschickt, gehoert nicht hinein.
    expect(LEGACY_VOLLZUGRIFF_TOOL_IDS).not.toContain('massen-angebote');
    expect(LEGACY_VOLLZUGRIFF_TOOL_IDS).toContain('projekt-verwaltung');
  });
});
