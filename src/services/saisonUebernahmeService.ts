/**
 * Saisonvereinbarung eines Platzbauers ins Folgejahr übernehmen (09/2026).
 *
 * Verbindet die reine Übernahmelogik (`utils/saisonUebernahme.ts`) mit den
 * beiden Speichern: Platzbauerprojekt der neuen Saison und Angebotsentwurf.
 *
 * Bewusst konservativ:
 *  - Ein vorhandenes Saisonprojekt wird WIEDERVERWENDET, nicht ersetzt.
 *  - Ein vorhandener Angebotsentwurf wird NICHT überschrieben, außer der
 *    Aufrufer erlaubt es ausdrücklich. Eine begonnene Arbeit stillschweigend
 *    durch die Vorjahresvorlage zu ersetzen wäre der teuerste Fehler hier.
 */
import { PlatzbauerProjekt } from '../types/platzbauer';
import { platzbauerverwaltungService } from './platzbauerverwaltungService';
import {
  ladeAktuellesDokument,
  ladeEntwurf,
  speichereEntwurf,
} from './platzbauerprojektabwicklungDokumentService';
import { leseAngebotsStand } from '../utils/staffelUebernahme';
import { baueUebernahmeEntwurf } from '../utils/saisonUebernahme';

export type UebernahmeErgebnis =
  | { status: 'uebernommen'; projekt: PlatzbauerProjekt; quellsaison: number }
  | { status: 'kein-vorjahr'; projekt: PlatzbauerProjekt }
  | { status: 'entwurf-vorhanden'; projekt: PlatzbauerProjekt };

/**
 * Legt das Saisonprojekt der Zielsaison an (oder nimmt das vorhandene) und
 * füllt seinen Angebotsentwurf aus dem letzten Angebot der Vorsaison.
 *
 * `maxJahreZurueck` erlaubt es, auch eine Saison zu überspringen: Wer 2025
 * beliefert hat, 2026 nicht, soll 2027 trotzdem seine Vereinbarung wiederfinden.
 */
export const uebernehmeSaisonVomVorjahr = async (
  platzbauerId: string,
  zielsaison: number,
  optionen?: { ueberschreibeEntwurf?: boolean; maxJahreZurueck?: number }
): Promise<UebernahmeErgebnis> => {
  const zielprojekt = await platzbauerverwaltungService.getOderErstelleSaisonprojekt(
    platzbauerId,
    zielsaison
  );

  const vorhandenerEntwurf = await ladeEntwurf<Record<string, unknown>>(zielprojekt.id, 'angebot');
  if (vorhandenerEntwurf && !optionen?.ueberschreibeEntwurf) {
    return { status: 'entwurf-vorhanden', projekt: zielprojekt };
  }

  const maxJahre = optionen?.maxJahreZurueck ?? 3;
  for (let zurueck = 1; zurueck <= maxJahre; zurueck++) {
    const quellsaison = zielsaison - zurueck;
    const projekte = await platzbauerverwaltungService.loadProjekteFuerPlatzbauer(
      platzbauerId,
      quellsaison
    );
    const quellprojekt = projekte.find(p => p.typ === 'saisonprojekt') || projekte[0];
    if (!quellprojekt) continue;

    const angebot = await ladeAktuellesDokument(quellprojekt.id, 'angebot');
    if (!angebot?.daten) continue;

    const stand = leseAngebotsStand(angebot.daten, quellsaison);
    if (!stand.hatInhalt) continue;

    await speichereEntwurf(
      zielprojekt.id,
      'angebot',
      baueUebernahmeEntwurf(stand, quellsaison, zielsaison)
    );
    return { status: 'uebernommen', projekt: zielprojekt, quellsaison };
  }

  return { status: 'kein-vorjahr', projekt: zielprojekt };
};
