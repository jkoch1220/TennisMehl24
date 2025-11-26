import { useState, useEffect, useRef } from 'react';
import { cleanNumberInput, parseNumberValue } from '../utils/numberInput';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Verbesserte NumberInput-Komponente mit besserer UX:
 * - Entfernt führende Nullen automatisch
 * - Erlaubt leere Eingabe während der Eingabe
 * - Bessere Handhabung von Dezimalzahlen
 */
export const NumberInput = ({
  value,
  onChange,
  step = 0.01,
  min,
  max,
  className = '',
  placeholder,
  ...props
}: NumberInputProps) => {
  const [displayValue, setDisplayValue] = useState<string>(value === 0 ? '' : value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // Aktualisiere displayValue wenn value von außen geändert wird
  useEffect(() => {
    if (value === 0) {
      setDisplayValue('');
    } else {
      const currentDisplay = displayValue === '' ? '' : parseFloat(displayValue).toString();
      if (parseFloat(currentDisplay) !== value) {
        setDisplayValue(value.toString().replace(/\.?0+$/, ''));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Erlaube leere Eingabe
    if (inputValue === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    // Bereinige die Eingabe
    const cleaned = cleanNumberInput(inputValue);
    
    // Wenn nach der Bereinigung nichts übrig bleibt, setze auf leer
    if (cleaned === '' || cleaned === '.') {
      setDisplayValue('');
      onChange(0);
      return;
    }
    
    // Prüfe auf gültige Zahl
    const numericValue = parseNumberValue(cleaned);
    
    // Prüfe Min/Max
    let finalValue = numericValue;
    if (min !== undefined && numericValue < min) {
      finalValue = min;
      setDisplayValue(min.toString());
      onChange(finalValue);
      return;
    }
    if (max !== undefined && numericValue > max) {
      finalValue = max;
      setDisplayValue(max.toString());
      onChange(finalValue);
      return;
    }
    
    // Aktualisiere Display-Wert (bereits bereinigt, ohne führende Nullen)
    setDisplayValue(cleaned);
    
    // Aktualisiere den numerischen Wert
    onChange(finalValue);
  };

  const handleBlur = () => {
    // Beim Verlassen des Feldes: Zeige den Wert oder 0
    if (displayValue === '' || displayValue === '0' || parseFloat(displayValue) === 0) {
      setDisplayValue('0');
      onChange(0);
    } else {
      // Entferne unnötige Nullen
      const numValue = parseFloat(displayValue);
      setDisplayValue(numValue.toString().replace(/\.?0+$/, ''));
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Beim Fokus: Wenn Wert 0 ist, leere das Feld für bessere Eingabe
    if (value === 0) {
      setDisplayValue('');
    }
    // Selektiere den gesamten Text für einfaches Überschreiben
    e.target.select();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={className}
      placeholder={placeholder || '0'}
      pattern="[0-9]*\.?[0-9]*"
      {...props}
    />
  );
};

