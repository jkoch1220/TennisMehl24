import { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  step?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * NumericInput - Ein verbessertes Zahlenfeld mit besserer UX
 *
 * Features:
 * - Erlaubt das Leeren des Feldes während der Bearbeitung
 * - Setzt erst beim Verlassen (onBlur) den Wert auf 0, wenn das Feld leer ist
 * - Verhindert das nervige "080"-Problem beim Eingeben nach dem Löschen
 */
const NumericInput = ({
  value,
  onChange,
  className,
  step,
  placeholder,
  min,
  max,
  disabled
}: NumericInputProps) => {
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync wenn sich der externe Wert ändert und das Feld nicht fokussiert ist
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Wenn 0, leere das Feld für bessere UX
    if (localValue === '0') {
      setLocalValue('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const numValue = parseFloat(localValue) || 0;
    setLocalValue(String(numValue));
    onChange(numValue);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      step={step}
      placeholder={placeholder}
      min={min}
      max={max}
      disabled={disabled}
    />
  );
};

export default NumericInput;
