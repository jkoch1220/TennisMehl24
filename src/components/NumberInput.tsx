/**
 * Das eine Zahlenfeld des Portals (Vorschlag „Komma in Staffelpreisangeboten", 09/2026,
 * ausgeweitet auf alle Zahlenfelder).
 *
 * Verhalten:
 *  - Textfeld mit `inputMode="decimal"`: Punkt und Komma sind beide Dezimaltrenner,
 *    unabhängig von der Browser-Sprache. Angezeigt wird deutsch („50,5").
 *  - Beim Tippen bleibt der Text so, wie er getippt wurde („0,", „05"). Erst beim
 *    Verlassen wird gerundet, auf min/max begrenzt und kanonisch formatiert.
 *  - Ein geleertes Feld bleibt leer. Das Formular bekommt 0 (NumberInput) bzw.
 *    null (OptionalNumberInput) – aber die Anzeige springt nicht auf „0" zurück.
 *  - Der Wert wird bei jedem Tastendruck gemeldet, damit Summen live mitrechnen;
 *    solange das Feld fokussiert ist, überschreibt der Elternwert die Anzeige nie.
 *  - Pfeil hoch/runter: ein Schritt (`step`, Standard 1), ohne Gleitkomma-Müll.
 *  - Ohne Änderung durch den Nutzer wird beim Verlassen nichts gemeldet – ein
 *    Tab durch ein Feld mit 12,345 t rundet die Menge nicht heimlich.
 *
 * Die gesamte Logik liegt testbar in `utils/zahlenEingabe.ts`.
 */
import {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ZahlenRegeln,
  bereinigeEingefuegtenText,
  bereinigeZahlText,
  formatZahlAnzeige,
  gleicherWert,
  parseZahlText,
  schliesseEingabeAb,
  schrittWert,
  zahlAusProp,
} from '../utils/zahlenEingabe';

type BasisProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'step' | 'min' | 'max' | 'pattern' | 'defaultValue'
>;

export interface ZahlenFeldProps extends BasisProps {
  value: number | null | undefined;
  onChange: (wert: number | null) => void;
  /** Was das Formular bei leerem Feld bekommt. */
  leerWert: 0 | null;
  /** Schrittweite für Pfeiltasten. Strings wie "0.01" sind erlaubt (Migration). */
  step?: number | string;
  min?: number | string;
  max?: number | string;
  /** Höchstzahl Nachkommastellen; 0 = nur ganze Zahlen. */
  dezimalstellen?: number;
  /** Negative Zahlen erlauben (Standard: nur wenn min fehlt oder < 0). */
  negativ?: boolean;
  /** Einheit rechts im Feld („€", „t", „Stk"). */
  suffix?: string;
  /** Roter Rahmen, solange der Wert außerhalb von min/max liegt. */
  bereichWarnung?: boolean;
  /** Eine 0 aus dem Formular als leeres Feld anzeigen. */
  nullAlsLeer?: boolean;
}

const normalisiere = (wert: number | null | undefined): number | null =>
  wert === null || wert === undefined || Number.isNaN(wert) ? null : wert;

const ZahlenFeld = forwardRef<HTMLInputElement, ZahlenFeldProps>(function ZahlenFeld(
  {
    value,
    onChange,
    leerWert,
    step,
    min,
    max,
    dezimalstellen,
    negativ,
    suffix,
    bereichWarnung = false,
    nullAlsLeer = false,
    className = '',
    placeholder,
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  },
  ref
) {
  const regeln: ZahlenRegeln = {
    min: zahlAusProp(min),
    max: zahlAusProp(max),
    dezimalstellen,
    negativ,
  };
  const schritt = zahlAusProp(step) ?? 1;

  const anzeigeVon = (wert: number | null): string =>
    wert === null || (nullAlsLeer && wert === 0) ? '' : formatZahlAnzeige(wert, dezimalstellen);

  const [anzeige, setAnzeige] = useState<string>(() => anzeigeVon(normalisiere(value)));
  const fokussiert = useRef(false);
  const geaendertSeitFokus = useRef(false);
  /** Der Wert, den das Formular nach unserem Wissen gerade hält. */
  const letzterWert = useRef<number | null>(normalisiere(value));
  /** Zählt die Verlassen-Vorgänge, um danach gegen den Formularwert abzugleichen. */
  const [abgleich, setAbgleich] = useState(0);

  // Änderungen von außen übernehmen – aber nie, solange der Nutzer tippt.
  // Nach dem Verlassen des Feldes wird immer abgeglichen: Begrenzt das Formular
  // den gemeldeten Wert (z. B. Math.min(500, v)), muss die Anzeige dem folgen,
  // sonst steht im Feld eine andere Zahl als die gespeicherte.
  useEffect(() => {
    const eingehend = normalisiere(value);
    if (fokussiert.current) return;
    if (abgleich === 0 && gleicherWert(eingehend, letzterWert.current)) return;
    letzterWert.current = eingehend;
    setAnzeige(anzeigeVon(eingehend));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, abgleich]);

  const melde = (wert: number | null) => {
    const fuerFormular = wert ?? leerWert;
    if (gleicherWert(fuerFormular, letzterWert.current)) return;
    letzterWert.current = fuerFormular;
    onChange(fuerFormular);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const neu = bereinigeZahlText(e.target.value, regeln);
    geaendertSeitFokus.current = true;
    setAnzeige(neu);
    melde(parseZahlText(neu));
  };

  // Einfügen läuft nicht über die Tipp-Regel: dort ist ein einzelner Punkt der
  // Numpad-Punkt, in der Zwischenablage ist er meist Tausendertrenner. Ohne
  // diesen Zweig wurde aus eingefügten „1.234" ein Betrag von 1,234 €.
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const eingefuegt = e.clipboardData?.getData('text');
    if (!eingefuegt) return;
    e.preventDefault();
    const ziel = e.currentTarget;
    const vorher = ziel.value;
    const von = ziel.selectionStart ?? vorher.length;
    const bis = ziel.selectionEnd ?? vorher.length;
    // Nur der eingefügte Teil folgt der Einfüge-Regel; steht schon Text im
    // Feld, wird das Ergebnis danach wie getippt bereinigt.
    const sauber = bereinigeEingefuegtenText(eingefuegt, regeln);
    const zusammen = vorher.slice(0, von) + sauber + vorher.slice(bis);
    const neu = vorher === '' ? sauber : bereinigeZahlText(zusammen, regeln);
    geaendertSeitFokus.current = true;
    setAnzeige(neu);
    melde(parseZahlText(neu));
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    fokussiert.current = true;
    geaendertSeitFokus.current = false;
    const ziel = e.currentTarget;
    // Nach dem Klick den Inhalt markieren, damit Tippen ihn ersetzt – aber nur,
    // wenn der Fokus nicht vom Klicken kommt. Sonst überschreibt das select()
    // die Cursorposition, die der Klick gerade gesetzt hat, und eine gezielte
    // Korrektur einzelner Ziffern ist unmöglich.
    if (e.currentTarget.dataset.mausfokus !== 'ja') {
      setTimeout(() => {
        if (document.activeElement === ziel) ziel.select();
      }, 0);
    }
    delete e.currentTarget.dataset.mausfokus;
    onFocus?.(e);
  };

  // Merkt vor dem Fokus, dass er von der Maus kommt (mousedown läuft vor focus).
  const handleMouseDown = (e: MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) {
      e.currentTarget.dataset.mausfokus = 'ja';
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    fokussiert.current = false;
    if (geaendertSeitFokus.current) {
      const ergebnis = schliesseEingabeAb(anzeige, regeln);
      setAnzeige(ergebnis.wert === null ? '' : anzeigeVon(ergebnis.wert));
      melde(ergebnis.wert);
    } else {
      // Unverändert verlassen: Anzeige nur kanonisch machen, nichts melden.
      setAnzeige(anzeigeVon(normalisiere(value)));
    }
    // Anstoß für den Abgleich mit dem Formularwert (siehe useEffect oben).
    setAbgleich((z) => z + 1);
    onBlur?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !rest.readOnly && !rest.disabled) {
      e.preventDefault();
      const neu = schrittWert(parseZahlText(anzeige), e.key === 'ArrowUp' ? 1 : -1, schritt, regeln);
      geaendertSeitFokus.current = true;
      // anzeigeVon, nicht formatZahlAnzeige: sonst zeigt die Pfeiltaste bei 0
      // eine „0", während derselbe Wert aus dem Formular ein leeres Feld ergibt.
      setAnzeige(anzeigeVon(neu));
      melde(neu);
    }
    onKeyDown?.(e);
  };

  const aktuellerWert = parseZahlText(anzeige);
  const ausserhalb =
    bereichWarnung &&
    aktuellerWert !== null &&
    ((regeln.min !== undefined && aktuellerWert < regeln.min) ||
      (regeln.max !== undefined && aktuellerWert > regeln.max));

  const input = (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={anzeige}
      onChange={handleChange}
      onPaste={handlePaste}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder ?? (nullAlsLeer ? '0' : '')}
      className={`${className}${ausserhalb ? ' ring-2 ring-red-500 border-red-500 dark:ring-red-400 dark:border-red-400' : ''}${suffix ? ' pr-10' : ''}`}
      {...rest}
    />
  );

  if (!suffix) return input;

  return (
    <div className="relative">
      {input}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-sm pointer-events-none select-none">
        {suffix}
      </span>
    </div>
  );
});

export interface NumberInputProps extends Omit<ZahlenFeldProps, 'onChange' | 'leerWert'> {
  /** Leeres Feld → 0. */
  onChange: (wert: number) => void;
}

/** Zahlenfeld, dessen Formularwert immer eine Zahl ist (leer = 0). */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { onChange, nullAlsLeer, readOnly, disabled, ...props },
  ref
) {
  // Ein Feld, das man nicht bearbeiten kann, zeigt einen berechneten Wert an –
  // dort muss eine 0 als „0" sichtbar sein, nicht als leeres Feld.
  const leerBeiNull = nullAlsLeer ?? !(readOnly || disabled);
  return (
    <ZahlenFeld
      ref={ref}
      {...props}
      readOnly={readOnly}
      disabled={disabled}
      nullAlsLeer={leerBeiNull}
      leerWert={0}
      onChange={(wert) => onChange(wert ?? 0)}
    />
  );
});

export interface OptionalNumberInputProps extends Omit<ZahlenFeldProps, 'onChange' | 'leerWert'> {
  /** Leeres Feld → null. */
  onChange: (wert: number | null) => void;
}

/** Zahlenfeld, das „nicht angegeben" (null) von 0 unterscheidet. */
export const OptionalNumberInput = forwardRef<HTMLInputElement, OptionalNumberInputProps>(
  function OptionalNumberInput({ onChange, nullAlsLeer = false, ...props }, ref) {
    return <ZahlenFeld ref={ref} {...props} nullAlsLeer={nullAlsLeer} leerWert={null} onChange={onChange} />;
  }
);

export default NumberInput;
