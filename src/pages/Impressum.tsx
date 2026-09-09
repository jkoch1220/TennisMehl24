/**
 * Impressum.tsx — Pflichtangaben nach § 5 DDG (öffentliche Seite, KEIN Login)
 *
 * Wird von den Kundenseiten (Frachtrechner, Datenprüfung, Liefernachweis)
 * verlinkt und ist damit für jeden erreichbar, der einen solchen Link erhält.
 *
 * Bewusst OHNE Appwrite-Zugriff und OHNE useAuth: die Firmendaten stehen hier
 * fest im Code. Ein Stammdaten-Abruf würde einen Datenbank-Zugang im Browser
 * eines Externen voraussetzen — und eine leere Antwort ließe die gesetzlichen
 * Pflichtangaben still verschwinden, ohne dass es jemand merkt.
 *
 * Datenquelle für die Werte unten: src/services/stammdatenService.ts
 * (initialisiereStammdaten, Z. 226-261) — gleichlautend mit dem Live-Dokument
 * in Appwrite. Wer dort etwas ändert, ändert es hier mit.
 */

import { FileText, Mail, Phone } from 'lucide-react';

import KundenseiteLayout from '../components/Public/KundenseiteLayout';

/*
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  TODO — VOR DER VERTEILUNG DES LINKS AUSFÜLLEN                            ║
 * ║                                                                           ║
 * ║  Die Umsatzsteuer-Identifikationsnummer der Tennismehl GmbH ist noch      ║
 * ║  nicht hinterlegt (`ustIdNr` ist auch in den Stammdaten leer).            ║
 * ║                                                                           ║
 * ║  § 5 Abs. 1 Nr. 6 DDG verlangt die Angabe, SOBALD eine USt-IdNr nach      ║
 * ║  § 27 a UStG vorhanden ist. Solange diese Konstante leer ist, fehlt sie   ║
 * ║  im Impressum — und ein unvollständiges Impressum ist abmahnfähig.        ║
 * ║                                                                           ║
 * ║  NICHT "DE 320 029 255" EINTRAGEN, OHNE SIE VORHER ZU PRUEFEN.            ║
 * ║  Diese Nummer steht in tennismehl_website und dachziegelrueckgabe_website ║
 * ║  als vatId — im zweiten Repo aber neben der Anschrift der Vorgaengerfirma ║
 * ║  (Hundsberg 13, Grossrinderfeld). Der Handelsregisterauszug vom 09.09.2026║
 * ║  weist HRB 18235 als NEUGRUENDUNG aus (1 Eintragung, Gesellschaftsvertrag ║
 * ║  vom 02.12.2025) — eine neu gegruendete GmbH fuehrt die USt-IdNr einer    ║
 * ║  anderen Gesellschaft nicht fort. Die Nummer ist beim EU-Dienst gueltig,  ║
 * ║  Deutschland gibt den Inhaber aber nicht preis. Sie gehoert daher         ║
 * ║  vermutlich der Vorgaengerin. Eine fremde USt-IdNr im Impressum ist       ║
 * ║  schlimmer als gar keine: sie gefaehrdet zusaetzlich den Vorsteuerabzug   ║
 * ║  der Kunden.                                                              ║
 * ║                                                                           ║
 * ║  Richtige Quelle: Vergabebescheid des Bundeszentralamts fuer Steuern fuer ║
 * ║  HRB 18235, oder Rueckfrage bei der Kanzlei (Bachmann & Holley).          ║
 * ║                                                                           ║
 * ║  Zum Beheben: die geprüfte Nummer hier eintragen (Format: DE123456789).   ║
 * ║  Der Abschnitt "Umsatzsteuer" erscheint dann automatisch auf der Seite.   ║
 * ║  Solange die Konstante leer ist, bleibt er ausgeblendet.                  ║
 * ║                                                                           ║
 * ║  Hat die GmbH noch KEINE USt-IdNr, ist das Impressum so vollstaendig:     ║
 * ║  § 5 Abs. 1 Nr. 6 DDG verlangt die Angabe nur, sofern eine vorhanden ist. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
const UST_ID_NR = '';

/** Feste Firmenangaben (Quelle: Stammdaten der Tennismehl GmbH) */
const FIRMA = {
  name: 'Tennismehl GmbH',
  strasse: 'Raiffeisenweg 1',
  plzOrt: '97232 Giebelstadt',
  telefonAnzeige: '09391 98700',
  telefonWahl: '+49939198700',
  email: 'info@tennismehl.com',
  geschaeftsfuehrer: ['Luca Ramos de la Rosa', 'Julian Tim Koch'],
  registergericht: 'Amtsgericht Würzburg',
  registernummer: 'HRB 18235',
  sitz: 'Giebelstadt',
} as const;

/** Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV */
const INHALTLICH_VERANTWORTLICH = 'Julian Tim Koch';

const ODR_PLATTFORM = 'https://ec.europa.eu/consumers/odr/';

interface AbschnittProps {
  titel: string;
  children: React.ReactNode;
}

/**
 * Ein Block des Impressums. Die Schriftgröße der Überschrift wird mit dem
 * Wichtig-Modifier gesetzt (Tailwind 3: führendes "!"), damit eine globale
 * h1-h6-Regel sie nicht überschreibt.
 */
function Abschnitt({ titel, children }: AbschnittProps) {
  return (
    <section className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg p-5">
      <h2 className="!text-base font-semibold text-gray-900 dark:text-dark-text">{titel}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-dark-textMuted">
        {children}
      </div>
    </section>
  );
}

interface ZeileProps {
  bezeichnung: string;
  children: React.ReactNode;
}

/** Beschriftete Zeile: links die Bezeichnung, rechts der Wert. */
function Zeile({ bezeichnung, children }: ZeileProps) {
  return (
    <div className="sm:flex sm:gap-3">
      <span className="block sm:w-56 sm:flex-shrink-0 font-medium text-gray-900 dark:text-dark-text">
        {bezeichnung}
      </span>
      <span className="block text-gray-700 dark:text-dark-textMuted break-words">{children}</span>
    </div>
  );
}

export default function Impressum() {
  const ustIdNrFehlt = UST_ID_NR.trim() === '';

  return (
    <KundenseiteLayout
      titel="Impressum"
      untertitel="Angaben gemäß § 5 DDG"
      icon={FileText}
      breit
    >
      <div className="space-y-4">
        <Abschnitt titel="Anbieter">
          <p className="font-semibold text-gray-900 dark:text-dark-text">{FIRMA.name}</p>
          <p>{FIRMA.strasse}</p>
          <p>{FIRMA.plzOrt}</p>
        </Abschnitt>

        <Abschnitt titel="Vertreten durch">
          <Zeile bezeichnung="Geschäftsführer">
            {FIRMA.geschaeftsfuehrer.join(', ')}
          </Zeile>
        </Abschnitt>

        <Abschnitt titel="Kontakt">
          <Zeile bezeichnung="Telefon">
            <a
              href={`tel:${FIRMA.telefonWahl}`}
              className="inline-flex items-center gap-1.5 text-red-700 hover:underline dark:text-dark-accent"
            >
              <Phone className="h-4 w-4 flex-shrink-0" />
              {FIRMA.telefonAnzeige}
            </a>
          </Zeile>
          <Zeile bezeichnung="E-Mail">
            <a
              href={`mailto:${FIRMA.email}`}
              className="inline-flex items-center gap-1.5 text-red-700 hover:underline dark:text-dark-accent"
            >
              <Mail className="h-4 w-4 flex-shrink-0" />
              {FIRMA.email}
            </a>
          </Zeile>
        </Abschnitt>

        <Abschnitt titel="Registereintrag">
          <Zeile bezeichnung="Registergericht">{FIRMA.registergericht}</Zeile>
          <Zeile bezeichnung="Registernummer">{FIRMA.registernummer}</Zeile>
          <Zeile bezeichnung="Sitz der Gesellschaft">{FIRMA.sitz}</Zeile>
        </Abschnitt>

        {/* Der Umsatzsteuer-Abschnitt erscheint nur, wenn die Nummer hinterlegt ist.
            Ein sichtbares „[noch einzutragen]" stand hier vorher samt Hinweiskasten
            an die eigene Firma — beides las jeder Kunde mit und ließ das Impressum
            unfertig wirken. Der Mangel gehört in den Code (siehe TODO bei UST_ID_NR)
            und in die Übergabe, nicht auf die Kundenseite. Eine fehlende Zeile heilt
            den Mangel nach § 5 Abs. 1 Nr. 6 DDG nicht — die Nummer muss vor dem
            Verteilen des Links eingetragen werden. */}
        {!ustIdNrFehlt && (
          <Abschnitt titel="Umsatzsteuer">
            <Zeile bezeichnung="Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG">
              {UST_ID_NR}
            </Zeile>
          </Abschnitt>
        )}

        <Abschnitt titel="Verantwortlich für den Inhalt">
          <p>Nach § 18 Abs. 2 MStV verantwortlich:</p>
          <p className="font-medium text-gray-900 dark:text-dark-text">
            {INHALTLICH_VERANTWORTLICH}
          </p>
          <p>{FIRMA.name}</p>
          <p>{FIRMA.strasse}</p>
          <p>{FIRMA.plzOrt}</p>
        </Abschnitt>

        <Abschnitt titel="Streitbeilegung">
          <p>
            Die Europäische Kommission stellt eine Plattform zur
            Online-Streitbeilegung (OS) bereit:{' '}
            <a
              href={ODR_PLATTFORM}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-700 hover:underline dark:text-dark-accent break-all"
            >
              {ODR_PLATTFORM}
            </a>
          </p>
          <p>
            Wir sind nicht verpflichtet und nicht bereit, an einem
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
            teilzunehmen.
          </p>
        </Abschnitt>
      </div>
    </KundenseiteLayout>
  );
}
