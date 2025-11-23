import { FixkostenInput, FixkostenErgebnis } from '../types';

export const berechneFixkosten = (
  input: FixkostenInput
): FixkostenErgebnis => {
  const jahreskostenGrundstueck =
    input.grundstueck.pacht +
    input.grundstueck.steuer +
    input.grundstueck.pflege +
    input.grundstueck.buerocontainer;

  const jahreskostenMaschinen =
    input.maschinen.wartungRadlader +
    input.maschinen.wartungStapler +
    input.maschinen.wartungMuehle +
    input.maschinen.wartungSiebanlage +
    input.maschinen.wartungAbsackanlage +
    input.maschinen.sonstigeWartung +
    input.maschinen.grundkostenMaschinen;

  const grundkostenVerwaltung =
    input.verwaltung.sigleKuhn +
    input.verwaltung.brzSteuerberater +
    input.verwaltung.kostenVorndran +
    input.verwaltung.telefonCloudServer +
    input.verwaltung.gewerbesteuer;

  const fixkostenProJahr =
    jahreskostenGrundstueck +
    jahreskostenMaschinen +
    input.ruecklagenErsatzkauf +
    input.sonstiges +
    grundkostenVerwaltung;

  return {
    jahreskostenGrundstueck,
    jahreskostenMaschinen,
    ruecklagenErsatzkauf: input.ruecklagenErsatzkauf,
    sonstiges: input.sonstiges,
    grundkostenVerwaltung,
    fixkostenProJahr,
  };
};

