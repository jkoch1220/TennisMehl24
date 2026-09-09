/**
 * KundenseiteLayout.tsx — gemeinsamer Rahmen aller öffentlichen Kundenseiten
 * (Frachtrechner, Datenprüfung, Bestellportal, Liefernachweis …).
 *
 * Diese Seiten laufen OHNE Login auf einem fremden Gerät. Sie kennen weder
 * `useAuth` noch `config/appwrite`, noch irgendeine Preislogik — sie sprechen
 * ausschließlich mit ihrer jeweiligen Netlify Function. Das Layout hält
 * deshalb bewusst nichts vor, was aus dem Portal stammt: es ist reine Hülle.
 *
 * Was hier zentral liegt, muss auf keiner Seite mehr wiederholt werden:
 *   - der warme Verlauf und die Kopfzeile mit Icon-Badge (Kanon aus
 *     `pages/Datenpruefung.tsx`),
 *   - der System-Dark-Effekt (siehe Kommentar unten — ohne ihn ist jede
 *     `dark:`-Klasse auf diesen Seiten tot),
 *   - die Fußzeile mit Impressum, Datenschutz und einem echten Kontaktweg.
 *
 * Verwendung:
 *   <KundenseiteLayout titel="Frachtrechner" untertitel="Averbeck GmbH" icon={Truck}>
 *     …
 *   </KundenseiteLayout>
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, type LucideIcon } from 'lucide-react';

/**
 * Kontaktdaten wie auf allen Belegen — eine Schreibweise für Kunden.
 * Die Anzeigeform stammt aus den Stammdaten (`firmenTelefon`,
 * stammdatenService.ts:232) und muss mit Impressum, Datenschutz und der
 * Rechnerseite übereinstimmen; die Durchwahl-Schreibweise „9870-0" stand hier
 * abweichend und sah neben dem Fließtext wie eine zweite Nummer aus.
 */
const TELEFON_ANZEIGE = '09391 98700';
const TELEFON_LINK = 'tel:+49939198700';
const EMAIL = 'info@tennismehl.com';

export interface KundenseiteLayoutProps {
  /** Überschrift der Seite, z.B. „Frachtrechner". */
  titel: string;
  /** Optionaler Zusatz hinter „Tennismehl GmbH", z.B. der Kundenname. */
  untertitel?: string;
  /** Lucide-Icon für das Badge in der Kopfzeile, z.B. `Truck`. */
  icon: LucideIcon;
  children: React.ReactNode;
  /** true → breiterer Container (max-w-2xl statt max-w-xl). */
  breit?: boolean;
}

export default function KundenseiteLayout({
  titel,
  untertitel,
  icon: Icon,
  children,
  breit = false,
}: KundenseiteLayoutProps): JSX.Element {
  // Dark Mode: Das Portal-Theme ist klassenbasiert (`darkMode: 'class'`), und
  // die Klasse `dark` setzt nur der ThemeProvider hinter dem Login. Ein externer
  // Besucher hat keinen ThemeProvider — an <html> hängt also nie ein `dark`,
  // und sämtliche `dark:`-Klassen dieser Seiten wären wirkungslos. Deshalb
  // spiegeln wir hier die Systemeinstellung des Kunden selbst auf <html>.
  // Beim Verlassen wird der vorherige Zustand wiederhergestellt — sonst würde
  // ein Admin, der die Seite im laufenden Portal öffnet, sein eigenes Theme
  // verlieren. (Übernommen aus `pages/Datenpruefung.tsx`.)
  useEffect(() => {
    const root = document.documentElement;
    const warDark = root.classList.contains('dark');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const anwenden = () => root.classList.toggle('dark', mq.matches);
    anwenden();
    mq.addEventListener('change', anwenden);
    return () => {
      mq.removeEventListener('change', anwenden);
      root.classList.toggle('dark', warDark);
    };
  }, []);

  // Browser-Titel: ohne diesen Effekt steht im Tab des Kunden der Titel aus
  // index.html — „TennisMehl24 - Kalkulationstools". Das ist der interne Name
  // des Portals und hat auf einer Kundenseite nichts zu suchen; beim Speichern
  // als Lesezeichen bliebe er dauerhaft stehen. Beim Verlassen wird der
  // ursprüngliche Titel zurückgesetzt, damit das Portal selbst unberührt bleibt.
  useEffect(() => {
    const vorher = document.title;
    document.title = `${titel} · Tennismehl GmbH`;
    return () => {
      document.title = vorher;
    };
  }, [titel]);

  // Ein Fuß-Link ist mindestens 44px hoch — das ist die kleinste Fläche, die
  // sich am Handy zuverlässig treffen lässt.
  const fussLink =
    'inline-flex min-h-[44px] items-center gap-1.5 px-2 text-gray-600 hover:text-red-700 dark:text-dark-textMuted dark:hover:text-dark-accent transition-colors';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface transition-colors duration-300">
      <div className={`w-full ${breit ? 'max-w-2xl' : 'max-w-xl'} mx-auto px-4 py-6 flex-1`}>
        {/* Kopf — Icon-Badge, Titel, Absender. Gleicher Aufbau auf allen Seiten,
            damit der Kunde eine Seite von uns auf einen Blick wiedererkennt. */}
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-600 dark:bg-dark-accent rounded-xl p-2.5 shrink-0">
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            {/* Wichtig: `!text-xl`. Eine globale Überschriftenregel (h1–h6 mit
                clamp) schlägt sonst die Tailwind-Klasse, und die Zeile wächst
                auf Browser-Standardgröße. Tailwind 3 schreibt das Ausrufezeichen
                als Präfix — `text-xl!` wäre hier gar keine Klasse. */}
            <h1 className="!text-xl font-bold text-gray-900 dark:text-dark-text">{titel}</h1>
            <p className="text-sm text-gray-600 dark:text-dark-textMuted truncate">
              Tennismehl GmbH
              {untertitel ? ` · ${untertitel}` : ''}
            </p>
          </div>
        </div>

        {children}
      </div>

      {/* Fußzeile — dezent, aber vollständig: Pflichtangaben und ein Weg zu
          einem Menschen. Wer auf einer Kundenseite stockt, greift zum Telefon. */}
      <footer className="w-full max-w-2xl mx-auto px-4 pb-6 pt-2">
        <div className="border-t border-gray-200 dark:border-dark-border pt-2">
          <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0 text-sm">
            <a href={TELEFON_LINK} className={fussLink}>
              <Phone className="h-4 w-4 shrink-0" />
              {TELEFON_ANZEIGE}
            </a>
            <a href={`mailto:${EMAIL}`} className={fussLink}>
              <Mail className="h-4 w-4 shrink-0" />
              {EMAIL}
            </a>
            <Link to="/impressum" className={fussLink}>
              Impressum
            </Link>
            <Link to="/datenschutz" className={fussLink}>
              Datenschutz
            </Link>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-dark-textSubtle">
            Tennismehl GmbH · Raiffeisenweg 1 · 97232 Giebelstadt
          </p>
        </div>
      </footer>
    </div>
  );
}
