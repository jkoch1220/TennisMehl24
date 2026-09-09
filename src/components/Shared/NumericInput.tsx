/**
 * NumericInput – Kompatibilitätshülle um das zentrale Zahlenfeld.
 *
 * Bis 09/2026 war das eine zweite, eigenständige Zahlenfeld-Implementierung
 * (natives `type="number"`, Wert erst bei Blur gemeldet, Spinner-Sonderfall aus
 * Vorschlag [20]). Beide Komponenten verhielten sich unterschiedlich, und beide
 * hatten die Komma-/Null-Probleme aus dem Vorschlag „Komma in Staffelpreisangeboten".
 *
 * Jetzt läuft alles über `NumberInput`; die Props bleiben, damit die Aufrufer in
 * Angebot/AB/Lieferschein/Rechnung unverändert weiterlaufen. `formatGerman` ist
 * wirkungslos – die Anzeige ist immer deutsch.
 *
 * `dezimalstellen` fehlte hier zunächst und ließ sich auch nicht nachreichen (die
 * Hülle spreadet nichts). Damit lief jedes Geldfeld der vier Belegtabs ohne
 * Rundung: ein Einzelpreis von 12,3456 € blieb so stehen, während das PDF 12,35 €
 * druckte. Beim Ergänzen einer Prop deshalb immer beide Seiten anfassen.
 */
import { NumberInput } from '../NumberInput';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  step?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Suffix-Anzeige rechts im Feld (z.B. "€", "t", "Stk") */
  suffix?: string;
  /** Zeigt Min/Max-Verletzungen mit rotem Ring an (Default: true) */
  showValidationWarning?: boolean;
  /** Ohne Wirkung – Anzeige ist immer deutsch. Bleibt für alte Aufrufer. */
  formatGerman?: boolean;
  /** ID für das Input-Element */
  id?: string;
  /** Readonly-Modus */
  readOnly?: boolean;
  /** Höchstzahl Nachkommastellen; 0 = nur ganze Zahlen. */
  dezimalstellen?: number;
  /** Negative Zahlen erlauben (Standard: nur wenn min fehlt oder < 0). */
  negativ?: boolean;
}

const NumericInput = ({
  value,
  onChange,
  className = '',
  step,
  placeholder,
  min,
  max,
  disabled,
  suffix,
  showValidationWarning = true,
  id,
  readOnly,
  dezimalstellen,
  negativ,
}: NumericInputProps) => (
  <NumberInput
    id={id}
    value={value}
    onChange={onChange}
    className={className}
    step={step}
    placeholder={placeholder}
    min={min}
    max={max}
    disabled={disabled}
    readOnly={readOnly}
    suffix={suffix}
    dezimalstellen={dezimalstellen}
    negativ={negativ}
    bereichWarnung={showValidationWarning}
    nullAlsLeer={false}
  />
);

export default NumericInput;
