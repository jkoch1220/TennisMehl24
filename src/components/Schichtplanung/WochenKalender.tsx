import {
  SchichtTyp,
  SchichtZuweisung,
  Mitarbeiter,
  getWochentage,
  formatDatum,
  formatDatumKurz,
  WOCHENTAGE_LANG,
  SchichtEinstellungen,
} from '../../types/schichtplanung';
import SchichtZelle from './SchichtZelle';

interface WochenKalenderProps {
  montag: Date;
  zuweisungen: SchichtZuweisung[];
  mitarbeiter: Mitarbeiter[];
  einstellungen: SchichtEinstellungen;
  onZuweisungDelete: (id: string) => void;
  onZuweisungStatusChange: (id: string, status: SchichtZuweisung['status']) => void;
}

export default function WochenKalender({
  montag,
  zuweisungen,
  mitarbeiter,
  einstellungen,
  onZuweisungDelete,
  onZuweisungStatusChange,
}: WochenKalenderProps) {
  const wochentage = getWochentage(montag);
  const heute = formatDatum(new Date());
  const schichtTypen: SchichtTyp[] = ['fruehschicht', 'spaetschicht', 'nachtschicht'];

  // Zuweisungen nach Datum und Schichttyp gruppieren
  const zuweisungenMap = new Map<string, SchichtZuweisung[]>();
  for (const z of zuweisungen) {
    const key = `${z.datum}-${z.schichtTyp}`;
    if (!zuweisungenMap.has(key)) {
      zuweisungenMap.set(key, []);
    }
    zuweisungenMap.get(key)!.push(z);
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
      {/* Header mit Wochentagen */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-dark-border">
        {wochentage.map((tag, index) => {
          const tagStr = formatDatum(tag);
          const istHeute = tagStr === heute;
          const istWochenende = index >= 5;

          return (
            <div
              key={tagStr}
              className={`
                px-3 py-3 text-center border-r border-gray-200 dark:border-dark-border last:border-r-0
                ${istWochenende ? 'bg-gray-50 dark:bg-dark-bg' : ''}
              `}
            >
              <div className={`text-sm font-medium ${istWochenende ? 'text-gray-500' : 'text-gray-700 dark:text-dark-text'}`}>
                {WOCHENTAGE_LANG[index]}
              </div>
              <div
                className={`
                  inline-flex items-center justify-center w-8 h-8 mt-1 rounded-full text-sm font-bold
                  ${istHeute
                    ? 'bg-violet-600 text-white'
                    : istWochenende
                    ? 'text-gray-400 dark:text-dark-textMuted'
                    : 'text-gray-900 dark:text-white'
                  }
                `}
              >
                {tag.getDate()}
              </div>
              <div className="text-xs text-gray-400 dark:text-dark-textMuted mt-0.5">
                {formatDatumKurz(tag)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Schichten Grid */}
      {schichtTypen.map((schichtTyp) => (
        <div
          key={schichtTyp}
          className="grid grid-cols-7 border-b border-gray-200 dark:border-dark-border last:border-b-0"
        >
          {wochentage.map((tag, index) => {
            const tagStr = formatDatum(tag);
            const key = `${tagStr}-${schichtTyp}`;
            const zellenZuweisungen = zuweisungenMap.get(key) || [];
            const istWochenende = index >= 5;

            return (
              <div
                key={key}
                className={`
                  p-1 border-r border-gray-200 dark:border-dark-border last:border-r-0 min-h-[120px]
                  ${istWochenende ? 'bg-gray-50/50 dark:bg-dark-bg/50' : ''}
                `}
              >
                <SchichtZelle
                  datum={tagStr}
                  schichtTyp={schichtTyp}
                  zuweisungen={zellenZuweisungen}
                  mitarbeiter={mitarbeiter}
                  einstellungen={einstellungen}
                  onZuweisungDelete={onZuweisungDelete}
                  onZuweisungStatusChange={onZuweisungStatusChange}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
