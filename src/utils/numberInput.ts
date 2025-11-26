/**
 * Utility-Funktionen für bessere Zahleneingabe in Input-Feldern
 */

/**
 * Bereinigt einen String-Wert für die Eingabe:
 * - Entfernt führende Nullen (außer bei "0." oder "0,")
 * - Erlaubt leere Strings während der Eingabe
 * - Entfernt ungültige Zeichen
 */
export const cleanNumberInput = (value: string): string => {
  // Entferne alle Zeichen außer Ziffern, Punkt und Komma
  let cleaned = value.replace(/[^\d.,]/g, '');
  
  // Ersetze Komma durch Punkt für einheitliche Behandlung
  cleaned = cleaned.replace(',', '.');
  
  // Erlaube nur einen Dezimalpunkt
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  
  // Entferne führende Nullen, aber behalte "0." bei
  if (cleaned.length > 1) {
    // Wenn es mit "0" beginnt und nicht "0." ist, entferne führende Nullen
    if (cleaned.startsWith('0') && cleaned[1] !== '.') {
      // Entferne alle führenden Nullen
      cleaned = cleaned.replace(/^0+/, '');
      // Wenn alles entfernt wurde, setze auf leer
      if (cleaned === '' || cleaned === '.') {
        cleaned = '';
      }
    }
  }
  
  return cleaned;
};

/**
 * Konvertiert einen String-Wert zu einer Zahl für die Speicherung
 * - Leere Strings werden zu 0
 * - Ungültige Werte werden zu 0
 */
export const parseNumberValue = (value: string): number => {
  if (value === '' || value === '-') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Formatiert einen Zahlenwert für die Anzeige im Input-Feld
 * - Entfernt unnötige Nullen nach dem Dezimalpunkt
 * - Zeigt 0 als "0" (nicht "0.00")
 */
export const formatNumberForInput = (value: number): string => {
  if (value === 0) return '0';
  // Entferne unnötige Nullen nach dem Dezimalpunkt
  return value.toString().replace(/\.?0+$/, '');
};

/**
 * Handler für onChange-Events in Zahleneingabefeldern
 * Gibt ein Objekt zurück mit:
 * - displayValue: Der Wert für das Input-Feld (kann leer sein)
 * - numericValue: Der numerische Wert für die Speicherung
 */
export const handleNumberInputChange = (
  value: string,
  onNumericChange: (value: number) => void
): { displayValue: string; numericValue: number } => {
  const cleaned = cleanNumberInput(value);
  const numericValue = parseNumberValue(cleaned);
  
  // Erlaube leere Eingabe während der Eingabe
  const displayValue = cleaned === '' ? '' : cleaned;
  
  // Aktualisiere den numerischen Wert
  onNumericChange(numericValue);
  
  return { displayValue, numericValue };
};

