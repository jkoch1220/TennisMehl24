import { useState, useEffect, useRef, useCallback } from 'react';

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
  /** Formatiert Werte mit deutschem Dezimalformat bei blur (Default: false) */
  formatGerman?: boolean;
  /** ID für das Input-Element */
  id?: string;
  /** Readonly-Modus */
  readOnly?: boolean;
}

/**
 * NumericInput - Ein verbessertes Zahlenfeld mit besserer UX
 *
 * Features:
 * - ANTI-SCROLL: Mausrad ändert nicht versehentlich den Wert
 * - Erlaubt das Leeren des Feldes während der Bearbeitung
 * - Setzt erst beim Verlassen (onBlur) den Wert auf 0, wenn das Feld leer ist
 * - Verhindert das nervige "080"-Problem beim Eingeben nach dem Löschen
 * - Optional: Suffix-Anzeige (€, t, Stk etc.)
 * - Optional: Min/Max-Validierung mit visuellem Feedback
 * - Optional: Deutsche Zahlenformatierung (Komma statt Punkt)
 */
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
  formatGerman = false,
  id,
  readOnly,
}: NumericInputProps) => {
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync wenn sich der externe Wert ändert und das Feld nicht fokussiert ist
  useEffect(() => {
    if (!isFocused) {
      if (formatGerman && value !== 0) {
        setLocalValue(value.toLocaleString('de-DE', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }));
      } else {
        setLocalValue(String(value));
      }
    }
  }, [value, isFocused, formatGerman]);

  // Validierung bei Wertänderung
  useEffect(() => {
    if (showValidationWarning) {
      const isOutOfRange =
        (min !== undefined && value < min) ||
        (max !== undefined && value > max);
      setIsInvalid(isOutOfRange);
    }
  }, [value, min, max, showValidationWarning]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;

    // Bei deutschem Format: Komma zu Punkt für Parsing
    if (formatGerman) {
      // Erlaube Komma als Dezimaltrenner
      newValue = newValue.replace(',', '.');
    }

    setLocalValue(e.target.value);
  }, [formatGerman]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Wenn 0, leere das Feld für bessere UX
    if (localValue === '0' || value === 0) {
      setLocalValue('');
    } else if (formatGerman) {
      // Bei Focus: Zurück zu Roh-Format für einfache Bearbeitung
      setLocalValue(String(value).replace('.', ','));
    }
  }, [localValue, value, formatGerman]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);

    // Parse den Wert (deutsch oder englisch)
    let parseValue = localValue;
    if (formatGerman) {
      // Tausendertrennzeichen entfernen, Komma zu Punkt
      parseValue = localValue.replace(/\./g, '').replace(',', '.');
    }

    const numValue = parseFloat(parseValue) || 0;

    // Formatierung anwenden
    if (formatGerman && numValue !== 0) {
      setLocalValue(numValue.toLocaleString('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }));
    } else {
      setLocalValue(String(numValue));
    }

    onChange(numValue);
  }, [localValue, formatGerman, onChange]);

  // ANTI-SCROLL: Bei Mausrad das Feld verlassen um versehentliche Änderungen zu verhindern
  const handleWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur();
  }, []);

  // Validation-Styling
  const validationClasses = isInvalid
    ? 'ring-2 ring-red-500 border-red-500 dark:ring-red-400 dark:border-red-400'
    : '';

  // Basis-Input Element
  const inputElement = (
    <input
      ref={inputRef}
      id={id}
      type="number"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={handleWheel}
      className={`${className} ${validationClasses} ${suffix ? 'pr-10' : ''}`}
      step={step}
      placeholder={placeholder}
      min={min}
      max={max}
      disabled={disabled}
      readOnly={readOnly}
    />
  );

  // Ohne Suffix: Einfaches Input zurückgeben
  if (!suffix) {
    return inputElement;
  }

  // Mit Suffix: Wrapper mit absolut positioniertem Suffix
  return (
    <div className="relative">
      {inputElement}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-sm pointer-events-none select-none">
        {suffix}
      </span>
    </div>
  );
};

export default NumericInput;
