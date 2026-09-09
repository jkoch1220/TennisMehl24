import React from 'react';
import { Keyboard, RotateCw } from 'lucide-react';
import { GEBINDE_ARTEN, PRODUKT_KOERNUNGEN } from '../../types/produktion';
import { NumberInput } from '../NumberInput';
import type { ErfassungApi } from './useErfassung';
import { ABSCHNITT_LABEL, FOKUS, STATION } from './produktionUi';
import KachelWahl from './KachelWahl';
import ZahlenBrett from './ZahlenBrett';
import StueckZaehler from './StueckZaehler';
import StueckGlyphen from './StueckGlyphen';
import MengenRad from './MengenRad';
import RohmaterialFelder from './RohmaterialFelder';
import { melde } from './feedback';

/**
 * Der bereichsabhängige Teil der Erfassung — geteilt zwischen Mobil und
 * Desktop, damit beide Ansichten garantiert dieselben Regeln durchsetzen.
 *
 * JE BEREICH UND JE GERÄT DAS PASSENDE EINGABEMITTEL. Ein Rad für alles war
 * der Fehler der Vorgängerversion.
 *
 * Am GERÄT (mobil):
 *  • Rohmaterial → ZIFFERNBLOCK. Die Zahl steht auf dem Wiegeschein und wird
 *    abgeschrieben, nicht geschätzt; 24,32 t ist keine Drehbewegung. Bewusst
 *    ohne Merkwert-Kacheln: vier angebotene Tonnagen verführen dazu, 26 statt
 *    24,32 zu buchen — und das ist die einzige exakt gemessene Zahl der Kette.
 *  • Mahlen → RAD. Der Wert wird abgelesen oder geschätzt, meist glatte oder
 *    halbe Tonnen. Wer exakt sein muss, schaltet auf den Ziffernblock um.
 *  • Abfüllung → ZÄHLER. Paletten sind abzählbar; ein stufenloses
 *    Bedienelement für diskrete Objekte ist eine Lüge über den Gegenstand.
 *
 * Am DESKTOP steht eine Tastatur bereit. Dort wäre ein Drehrad umständlich und
 * ein Ziffernblock überflüssig — beides weicht dem Portal-Zahlenfeld
 * (`NumberInput`, deutsche Kommaeingabe). Das spart zugleich rund 170 px Höhe,
 * ohne die die Buchen-Taste auf einem 900 px hohen Bildschirm unter den Falz
 * rutschte und die Hauptaktion nur nach Scrollen erreichbar war.
 */

export interface ErfassungsBlockProps {
  erfassung: ErfassungApi;
  lieferanten: string[];
  mobil: boolean;
}

const ErfassungsBlock: React.FC<ErfassungsBlockProps> = ({ erfassung, lieferanten, mobil }) => {
  const { zustand } = erfassung;
  const stil = STATION[zustand.bereich];

  const koernungsWahl = (
    <KachelWahl
      label="Körnung"
      bereich={zustand.bereich}
      pflicht
      optionen={PRODUKT_KOERNUNGEN.map((k) => ({ wert: k.value, label: k.label }))}
      wert={zustand.koernung}
      onWaehle={(w) => erfassung.setzeKoernung(w as never)}
    />
  );

  /**
   * Schnellwerte ERSETZEN den Wert, sie addieren nicht. Additive Kacheln sind
   * die häufigste Fehlerquelle bei Voreinstellungen: wer unsicher ist, ob der
   * Tipp angekommen ist, tippt ein zweites Mal — und bucht das Doppelte.
   */
  const schnellwerte = (werte: number[], setzen: (w: number) => void, einheit: string) => {
    if (werte.length === 0 && erfassung.letzterWert === null) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {werte.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => {
              melde('raste');
              setzen(w);
            }}
            className={`pz-rahmen min-w-[64px] flex-1 rounded-xl border-2 border-gray-200 bg-white font-bold tabular-nums text-gray-700 transition-colors active:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${FOKUS} ${
              mobil ? 'min-h-[56px] text-lg' : 'min-h-[44px] text-base'
            }`}
          >
            {w.toLocaleString('de-DE')}
            <span className="ml-0.5 text-sm opacity-60">{einheit}</span>
          </button>
        ))}
        {erfassung.letzterWert !== null && (
          <button
            type="button"
            onClick={() => {
              melde('raste');
              setzen(erfassung.letzterWert!);
            }}
            className={`pz-rahmen flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 px-3 font-bold tabular-nums text-gray-600 dark:border-slate-600 dark:text-slate-300 ${FOKUS} ${
              mobil ? 'min-h-[56px] text-base' : 'min-h-[44px] text-sm'
            }`}
          >
            <RotateCw className="h-4 w-4" />
            {erfassung.letzterWert.toLocaleString('de-DE')}
          </button>
        )}
      </div>
    );
  };

  /** Ein Zahlenfeld im Stil der Wertanzeige — groß genug, um es zu prüfen. */
  const zahlenfeld = (
    wert: number,
    onChange: (w: number) => void,
    stellen: number,
    einheit: string,
    max: number
  ) => (
    <NumberInput
      value={wert}
      onChange={onChange}
      dezimalstellen={stellen}
      min={0}
      max={max}
      suffix={einheit}
      autoFocus
      className={`pz-rahmen w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-3xl font-bold tabular-nums text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 ${FOKUS}`}
    />
  );

  return (
    <div
      id={`erfassung-${zustand.bereich}`}
      role="tabpanel"
      aria-label={`Erfassung ${zustand.bereich}`}
      className={mobil ? 'space-y-4' : 'space-y-4'}
    >
      {zustand.bereich === 'rohmaterial' && (
        <>
          <RohmaterialFelder
            werte={zustand.rohmaterial}
            onWerte={erfassung.setzeRohmaterial}
            lieferanten={lieferanten}
          />
          <div>
            <span className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`}>Menge laut Wiegeschein</span>
            {mobil ? (
              <ZahlenBrett
                text={zustand.mengeText}
                onText={erfassung.setzeMengeText}
                dezimalstellen={2}
              />
            ) : (
              /* Rohmaterial führt seinen Wert als Text (der Ziffernblock am
                 Gerät schreibt dorthin). Das Zahlenfeld hält seinen eigenen
                 Anzeige-String, solange es den Fokus hat — der Rückweg über
                 den Text ist deshalb auch beim Tippen von „0,5" verlustfrei. */
              zahlenfeld(
                erfassung.tonnen,
                (w) => erfassung.setzeMengeText(w > 0 ? String(w).replace('.', ',') : ''),
                2,
                't',
                400
              )
            )}
          </div>
        </>
      )}

      {zustand.bereich === 'mahlen' && (
        <>
          {koernungsWahl}

          {!mobil ? (
            <div>
              <span className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`}>Menge</span>
              {zahlenfeld(
                erfassung.tonnen,
                (w) => {
                  erfassung.setzeZifferModus(false);
                  erfassung.setzeMengeRad(w);
                },
                1,
                't',
                400
              )}
            </div>
          ) : zustand.zifferModus ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={`pz-panel ${ABSCHNITT_LABEL}`}>Menge</span>
                <button
                  type="button"
                  onClick={() => erfassung.setzeZifferModus(false)}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400"
                >
                  Zurück zum Rad
                </button>
              </div>
              <ZahlenBrett
                text={zustand.mengeText}
                onText={erfassung.setzeMengeText}
                dezimalstellen={1}
              />
            </div>
          ) : (
            <>
              <MengenRad
                wert={zustand.mengeRad}
                onChange={erfassung.setzeMengeRad}
                min={0}
                max={400}
                schritt={0.5}
                stellen={1}
                einheit="t"
                einheitLang="Tonnen"
                farbe={stil.rad}
              />
              <button
                type="button"
                onClick={() => erfassung.setzeZifferModus(true)}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-semibold text-gray-600 dark:border-slate-600 dark:text-slate-300 ${FOKUS}`}
              >
                <Keyboard className="h-4 w-4" /> Zahl genau eingeben
              </button>
            </>
          )}

          {schnellwerte(erfassung.merkwerte, erfassung.setzeMengeRad, 't')}
        </>
      )}

      {zustand.bereich === 'abfuellung' && (
        <>
          <KachelWahl
            label="Gebinde"
            bereich="abfuellung"
            pflicht
            optionen={GEBINDE_ARTEN.map((g) => ({
              wert: g.wert,
              label: g.label,
              untertitel: g.aufbau,
            }))}
            wert={zustand.gebinde}
            onWaehle={(w) => erfassung.setzeGebinde(w as never)}
          />
          {koernungsWahl}
          <div>
            <span className={`pz-panel mb-2 block ${ABSCHNITT_LABEL}`}>Anzahl</span>
            {mobil ? (
              <StueckZaehler
                wert={zustand.stueck}
                onWert={erfassung.setzeStueck}
                gebinde={zustand.gebinde}
                max={500}
              />
            ) : (
              <div className="space-y-2">
                {/* Die Glyphenreihe bleibt auch am Desktop: sie macht einen
                    Zahlendreher als Bild erkennbar, ohne die Ziffer zu lesen. */}
                <StueckGlyphen anzahl={zustand.stueck} hoehe={16} />
                {zahlenfeld(zustand.stueck, erfassung.setzeStueck, 0, 'Stk', 500)}
              </div>
            )}
          </div>
          {schnellwerte(erfassung.merkwerte, erfassung.setzeStueck, '')}
        </>
      )}
    </div>
  );
};

export default ErfassungsBlock;
