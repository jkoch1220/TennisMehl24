import { useState } from 'react';
import { emailAdressenFehler, normalisiereEmailAdressen, trenneEmailAdressen } from '../../utils/emailAdressen';

interface EmailAdressenInputProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Dürfen mehrere Adressen im Feld stehen? (Default: ja)
   * Bei `false` ist eine zweite Adresse ein Fehler — für Login, Benutzerkonten,
   * einzelne Ansprechpartner.
   */
  mehrere?: boolean;
  /** Bezeichnung im Fehlertext, z.B. „Rechnungs-E-Mail" */
  feldname?: string;
  /** Klassen für das Eingabefeld selbst (Rahmen, Farben, Padding) */
  className?: string;
  /**
   * Klassen für den umschließenden Block — er trägt das Layout
   * (`flex-1`, `w-full`, …), damit Feld und Hinweis zusammenbleiben.
   */
  wrapperClassName?: string;
  /** Hinweiszeile unter dem Feld anzeigen (Default: ja) */
  hinweis?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  name?: string;
}

/**
 * Eingabefeld für E-Mail-Adressen — ein oder mehrere in einem Feld.
 *
 * Warum kein `<input type="email">`: Der Browser prüft dort selbst und lehnt
 * „a@x.de; b@y.de" mit „Nach dem @ darf kein ; verwendet werden" ab. Das
 * blockiert den ganzen Speichervorgang, obwohl Kunden ihre Rechnungsempfänger
 * genau so liefern. Hier läuft die Prüfung über `emailAdressen.ts`:
 *   - Semikolon, Komma, Leerzeichen, Zeilenumbruch und „Name <adresse>" werden
 *     verstanden,
 *   - beim Verlassen des Felds wird auf „a@x.de, b@y.de" vereinheitlicht
 *     (die Form, die Versand und `mailto:` verstehen),
 *   - ungültige Einträge werden unter dem Feld benannt statt still verworfen.
 *
 * Der Fehler erscheint erst nach dem ersten Verlassen des Felds, damit das Feld
 * nicht schon beim Tippen rot wird.
 */
const EmailAdressenInput = ({
  value,
  onChange,
  mehrere = true,
  feldname = 'E-Mail',
  className = '',
  wrapperClassName = 'w-full',
  hinweis = true,
  placeholder,
  disabled,
  required,
  autoFocus,
  id,
  name,
}: EmailAdressenInputProps) => {
  const [beruehrt, setBeruehrt] = useState(false);

  const fehler = emailAdressenFehler(value, feldname, mehrere);
  const zeigeFehler = beruehrt && !!fehler;
  const anzahl = mehrere ? trenneEmailAdressen(value).length : 0;

  const handleBlur = () => {
    setBeruehrt(true);
    const normalisiert = mehrere ? normalisiereEmailAdressen(value) : value.trim();
    if (normalisiert !== value) onChange(normalisiert);
  };

  return (
    <div className={wrapperClassName}>
      <input
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder ?? (mehrere ? 'name@beispiel.de, weitere@beispiel.de' : 'name@beispiel.de')}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        aria-invalid={zeigeFehler || undefined}
        title={fehler ?? undefined}
        className={`${className} w-full ${zeigeFehler ? 'border-red-500 dark:border-red-500 ring-2 ring-red-500/40' : ''}`}
      />
      {hinweis && zeigeFehler && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fehler}</p>
      )}
      {hinweis && !zeigeFehler && anzahl > 1 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          {anzahl} Empfänger — alle erhalten die E-Mail gemeinsam.
        </p>
      )}
    </div>
  );
};

export default EmailAdressenInput;
