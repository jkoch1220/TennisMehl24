/**
 * Datenschutz.tsx — Datenschutzerklärung für die öffentlichen Kundenseiten
 * (Frachtrechner, Datenprüfung, Liefernachweis). KEIN Login, KEIN Appwrite-
 * Zugriff, kein useAuth — die Seite besteht nur aus Text.
 *
 * Die Angaben beschreiben, was auf diesen Kundenseiten tatsächlich passiert:
 *   - Der Frachtrechner rechnet in der Netlify Function und speichert die
 *     Eingaben (Menge, Körnung, Ziel-PLZ) nicht.
 *   - Der persönliche Link enthält eine Kundenkennung + Token; darüber wird
 *     der vorhandene Kundendatensatz für Anzeige und Berechnung gelesen.
 *
 * Wer an diesen Abläufen etwas ändert (z. B. Eingaben doch protokolliert oder
 * ein Analyse-Werkzeug einbindet), muss diese Seite mit ändern — sonst steht
 * hier eine Aussage, die nicht mehr stimmt.
 *
 * Hosting-Stand geprüft am 09.09.2026: Auslieferung über Netlify,
 * Datenhaltung in der Appwrite Cloud, Region Frankfurt
 * (VITE_APPWRITE_ENDPOINT = https://fra.cloud.appwrite.io/v1).
 * Für beide Dienstleister müssen Auftragsverarbeitungsverträge nach
 * Art. 28 DSGVO vorliegen.
 */

import { ShieldCheck } from 'lucide-react';

import KundenseiteLayout from '../components/Public/KundenseiteLayout';

/** Stand der Erklärung — bei inhaltlichen Änderungen mitpflegen. */
const STAND = '09.09.2026';

const VERANTWORTLICHER = {
  name: 'Tennismehl GmbH',
  strasse: 'Raiffeisenweg 1',
  plzOrt: '97232 Giebelstadt',
  telefonAnzeige: '09391 98700',
  telefonWahl: '+49939198700',
  email: 'info@tennismehl.com',
} as const;

const AUFSICHTSBEHOERDE = {
  name: 'Bayerisches Landesamt für Datenschutzaufsicht',
  strasse: 'Promenade 18',
  plzOrt: '91522 Ansbach',
} as const;

const PROTOKOLL_SPEICHERDAUER_TAGE = 14;

interface AbschnittProps {
  titel: string;
  children: React.ReactNode;
}

/**
 * Ein Abschnitt der Erklärung. Die Schriftgröße der Überschrift wird mit dem
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

/** Aufzählung mit einheitlichem Abstand. */
function Liste({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 list-disc space-y-1.5">{children}</ul>;
}

export default function Datenschutz() {
  return (
    <KundenseiteLayout
      titel="Datenschutzerklärung"
      untertitel={`Stand: ${STAND}`}
      icon={ShieldCheck}
      breit
    >
      <div className="space-y-4">
        <Abschnitt titel="Verantwortlicher">
          <p>
            Verantwortlich für die Verarbeitung personenbezogener Daten auf
            dieser Seite im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:
          </p>
          <p className="font-semibold text-gray-900 dark:text-dark-text">
            {VERANTWORTLICHER.name}
          </p>
          <p>{VERANTWORTLICHER.strasse}</p>
          <p>{VERANTWORTLICHER.plzOrt}</p>
          <p>
            Telefon:{' '}
            <a
              href={`tel:${VERANTWORTLICHER.telefonWahl}`}
              className="text-red-700 hover:underline dark:text-dark-accent"
            >
              {VERANTWORTLICHER.telefonAnzeige}
            </a>
            {' · '}E-Mail:{' '}
            <a
              href={`mailto:${VERANTWORTLICHER.email}`}
              className="text-red-700 hover:underline dark:text-dark-accent break-words"
            >
              {VERANTWORTLICHER.email}
            </a>
          </p>
        </Abschnitt>

        <Abschnitt titel="Welche Daten verarbeitet werden">
          <Liste>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Server-Protokolle:
              </span>{' '}
              Bei jedem Aufruf werden technisch bedingt die IP-Adresse Ihres
              Anschlusses, der Zeitpunkt des Zugriffs und die aufgerufene
              Adresse protokolliert.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Ihre Eingaben im Frachtrechner
              </span>{' '}
              (Menge und Postleitzahl des Lieferorts) werden ausschließlich zur
              Berechnung des angezeigten Preises verarbeitet und{' '}
              <span className="font-semibold text-gray-900 dark:text-dark-text">
                nicht gespeichert
              </span>
              . Sie verlassen den Vorgang mit der Antwort auf Ihre Anfrage.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Ihr persönlicher Zugangslink
              </span>{' '}
              enthält eine Kennung, über die wir den zu Ihnen bereits
              vorhandenen Kundendatensatz (Name, Kundennummer und die für Sie
              geltenden Konditionen) lesen, um die Seite anzuzeigen und zu
              rechnen. Diese Daten stammen aus unserer Geschäftsbeziehung und
              entstehen nicht durch Ihren Seitenaufruf.
            </li>
          </Liste>
          <p>
            Für Werbe- oder Analysezwecke setzen wir auf dieser Seite weder
            Cookies noch Zählpixel oder vergleichbare Techniken ein. Es findet
            keine Profilbildung und keine automatisierte Entscheidungsfindung
            statt.
          </p>
        </Abschnitt>

        <Abschnitt titel="Zweck und Rechtsgrundlage">
          <Liste>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Server-Protokolle:
              </span>{' '}
              Betriebssicherheit, Stabilität und Missbrauchsabwehr — etwa um
              automatisierte Massenabfragen zu erkennen und abzuwehren.
              Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren
              Betrieb, Art. 6 Abs. 1 lit. f DSGVO.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Berechnung und Anzeige Ihrer Preise:
              </span>{' '}
              Durchführung vorvertraglicher Maßnahmen und Abwicklung der
              Geschäftsbeziehung auf Ihre Anfrage hin, Art. 6 Abs. 1 lit. b
              DSGVO.
            </li>
          </Liste>
        </Abschnitt>

        <Abschnitt titel="Speicherdauer">
          <Liste>
            <li>
              Server-Protokolle werden nach {PROTOKOLL_SPEICHERDAUER_TAGE} Tagen
              gelöscht.
            </li>
            <li>
              Ihre Eingaben im Frachtrechner werden nicht gespeichert; sie
              bestehen nur für die Dauer der Berechnung.
            </li>
            <li>
              Kunden- und Auftragsdaten aus unserer Geschäftsbeziehung bewahren
              wir so lange auf, wie es für die Abwicklung erforderlich ist, und
              darüber hinaus im Rahmen der handels- und steuerrechtlichen
              Aufbewahrungspflichten (in der Regel sechs bzw. zehn Jahre).
            </li>
          </Liste>
        </Abschnitt>

        <Abschnitt titel="Empfänger und Auftragsverarbeiter">
          <p>
            Wir geben Ihre Daten nicht zu Werbezwecken weiter und verkaufen sie
            nicht. Für den Betrieb dieser Seite setzen wir folgende
            Dienstleister als Auftragsverarbeiter nach Art. 28 DSGVO ein:
          </p>
          <Liste>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Netlify
              </span>{' '}
              — Hosting und Auslieferung dieser Seite sowie Ausführung der
              Berechnung.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-dark-text">
                Appwrite
              </span>{' '}
              — Datenhaltung unserer Kunden- und Auftragsdaten
              (Rechenzentrumsstandort Frankfurt am Main).
            </li>
          </Liste>
          <p>
            Soweit dabei Daten in Länder außerhalb der Europäischen Union
            übermittelt werden, erfolgt dies auf Grundlage der
            Standardvertragsklauseln der Europäischen Kommission.
          </p>
        </Abschnitt>

        <Abschnitt titel="Ihre Rechte">
          <p>Sie haben uns gegenüber das Recht auf</p>
          <Liste>
            <li>Auskunft über die zu Ihnen verarbeiteten Daten (Art. 15 DSGVO),</li>
            <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</li>
            <li>Löschung (Art. 17 DSGVO),</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO) sowie</li>
            <li>
              Widerspruch gegen Verarbeitungen, die wir auf ein berechtigtes
              Interesse stützen (Art. 21 DSGVO).
            </li>
          </Liste>
          <p>
            Für die Ausübung dieser Rechte genügt eine formlose Nachricht an{' '}
            <a
              href={`mailto:${VERANTWORTLICHER.email}`}
              className="text-red-700 hover:underline dark:text-dark-accent break-words"
            >
              {VERANTWORTLICHER.email}
            </a>
            .
          </p>
        </Abschnitt>

        <Abschnitt titel="Beschwerderecht">
          <p>
            Unabhängig davon können Sie sich jederzeit bei einer
            Datenschutz-Aufsichtsbehörde beschweren. Die für uns zuständige
            Behörde ist:
          </p>
          <p className="font-medium text-gray-900 dark:text-dark-text">
            {AUFSICHTSBEHOERDE.name}
          </p>
          <p>{AUFSICHTSBEHOERDE.strasse}</p>
          <p>{AUFSICHTSBEHOERDE.plzOrt}</p>
        </Abschnitt>
      </div>
    </KundenseiteLayout>
  );
}
