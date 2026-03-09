/**
 * Einheitliche Input-Styles für alle Formularfelder
 *
 * Verwendung:
 * - import { INPUT_CLASSES, inputClassName } from '../../constants/inputStyles';
 * - className={INPUT_CLASSES.base}
 * - className={inputClassName('red')}
 */

/**
 * Basis Input-Klassen (h-11 = 44px Höhe für bessere Touch-Targets)
 */
export const INPUT_BASE = [
  // Sizing - größer als Standard für bessere Lesbarkeit
  'h-11',           // 44px statt h-9 (36px)
  'px-4',           // Mehr horizontales Padding
  'py-2.5',         // Mehr vertikales Padding
  'text-base',      // 16px Schriftgröße (statt text-sm/14px)
  'w-full',         // Volle Breite (kann überschrieben werden)

  // Border & Radius
  'border',
  'rounded-lg',

  // Light Mode
  'bg-white',
  'border-gray-300',
  'text-gray-900',
  'placeholder-gray-400',

  // Dark Mode
  'dark:bg-slate-800',
  'dark:border-slate-600',
  'dark:text-white',
  'dark:placeholder-slate-500',

  // Focus State (deutlich sichtbar)
  'focus:outline-none',
  'focus:ring-2',
  'focus:border-transparent',

  // Transition
  'transition-colors',
  'duration-150',
].join(' ');

/**
 * Disabled State (zusätzlich zu Basis-Klassen)
 */
export const INPUT_DISABLED = [
  'disabled:bg-gray-100',
  'dark:disabled:bg-slate-700',
  'disabled:text-gray-500',
  'dark:disabled:text-slate-400',
  'disabled:cursor-not-allowed',
].join(' ');

/**
 * Vordefinierte Akzentfarben für Focus-Ring
 */
const ACCENT_COLORS = {
  red: 'focus:ring-red-500 dark:focus:ring-red-400',
  orange: 'focus:ring-orange-500 dark:focus:ring-orange-400',
  amber: 'focus:ring-amber-500 dark:focus:ring-amber-400',
  blue: 'focus:ring-blue-500 dark:focus:ring-blue-400',
  green: 'focus:ring-green-500 dark:focus:ring-green-400',
  purple: 'focus:ring-purple-500 dark:focus:ring-purple-400',
} as const;

type AccentColor = keyof typeof ACCENT_COLORS;

/**
 * Kombinierte Input-Klassen nach Akzentfarbe
 */
export const INPUT_CLASSES = {
  base: `${INPUT_BASE} ${INPUT_DISABLED}`,

  /** Mit Akzentfarbe (Default: blue) */
  withAccent: (color: AccentColor = 'blue') =>
    `${INPUT_BASE} ${ACCENT_COLORS[color]} ${INPUT_DISABLED}`,

  /** Select-Dropdown Styling */
  select: `${INPUT_BASE} ${INPUT_DISABLED} cursor-pointer appearance-none`,

  /** Textarea Styling (ohne feste Höhe) */
  textarea: [
    'px-4 py-3 text-base w-full',
    'border rounded-lg',
    'bg-white dark:bg-slate-800',
    'border-gray-300 dark:border-slate-600',
    'text-gray-900 dark:text-white',
    'placeholder-gray-400 dark:placeholder-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-blue-500',
    'focus:border-transparent',
    'resize-none',
    INPUT_DISABLED,
  ].join(' '),
};

/**
 * Helper-Funktion für schnelle Verwendung
 *
 * @example
 * <input className={inputClassName('red')} />
 * <input className={inputClassName('blue', 'w-32')} />
 */
export function inputClassName(
  accentColor: AccentColor = 'blue',
  additionalClasses?: string
): string {
  return `${INPUT_CLASSES.withAccent(accentColor)} ${additionalClasses || ''}`.trim();
}

/**
 * Numeric Input spezifische Klassen (ohne Spinner-Pfeile)
 */
export const NUMERIC_INPUT_CLASSES = [
  // Verstecke Browser-Spinner für number inputs
  '[appearance:textfield]',
  '[&::-webkit-outer-spin-button]:appearance-none',
  '[&::-webkit-inner-spin-button]:appearance-none',
].join(' ');
