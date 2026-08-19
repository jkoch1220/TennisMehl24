/**
 * Vertragsklauseln & AGB-Anhang für Angebote und Auftragsbestätigungen
 *
 * Die Vorlagen hier sind die Standard-Werte. Sie können unter
 * Stammdaten → „Klauseln & AGB" angepasst werden und werden dann als JSON
 * in den Stammdaten gespeichert (Felder `vertragsklauselVorlagen` und
 * `agbAbschnitte`). Auf dem einzelnen Angebot/der AB ist jede Klausel
 * per Checkbox aktivierbar und der Text frei editierbar (Snapshot im Dokument).
 */

import { Stammdaten } from '../types/stammdaten';
import { VertragsKlausel } from '../types/projektabwicklung';

// === LIEFER- UND ZAHLUNGSBEDINGUNGEN ===

/**
 * Standard-Lieferbedingungen auf Angebot und Auftragsbestätigung.
 *
 * Stand bis 08/2026 an vier Stellen wortgleich hartkodiert (Anfrage-Dialog +
 * drei Pfade im anfrageVerarbeitungService). Hier zentral, damit eine Änderung
 * nicht wieder auseinanderläuft.
 */
export const STANDARD_LIEFERBEDINGUNGEN =
  'Für die Lieferung ist eine uneingeschränkte Befahrbarkeit für LKW mit Achslasten bis 11,5t ' +
  'und Gesamtgewicht bis 40 t erforderlich. Der Durchfahrtsfreiraum muss mindestens 3,20 m ' +
  'Breite und 4,00 m Höhe betragen. Für ungenügende Zufahrt (auch Untergrund) ist der ' +
  'Empfänger verantwortlich.\n\nMindestabnahmemenge für loses Material sind 3 Tonnen.';

/** Standard-Zahlungsziel auf Angeboten aus Anfragen. */
export const STANDARD_ZAHLUNGSZIEL = '14 Tage';

// === KLAUSEL-VORLAGEN ===

export interface KlauselVorlage {
  id: string;
  titel: string;
  text: string;
  standardAktiv: boolean;
}

export const DEFAULT_KLAUSEL_VORLAGEN: KlauselVorlage[] = [
  {
    id: 'erschwerte-zufahrt',
    titel: 'Erschwerte Zufahrt / Standzeit',
    text:
      'Der Besteller stellt sicher, dass die Zufahrt zur Abladestelle gemäß unseren Lieferbedingungen ' +
      'ungehindert befahrbar ist (u. a. zurückgeschnittener Bewuchs, ausreichende Durchfahrtsbreite ' +
      'und -höhe, tragfähiger Untergrund). Überschreitet der Aufenthalt unseres Fahrzeugs vor Ort – ' +
      'einschließlich Rangier-, Warte- und Abladezeit, auch bei mehreren Schüttstellen – aus Gründen, ' +
      'die der Besteller zu vertreten hat, insgesamt 20 Minuten, wird die darüber hinausgehende Zeit ' +
      'mit 108,00 € netto je Stunde berechnet (anteilig je angefangene Viertelstunde).',
    standardAktiv: true,
  },
  {
    id: 'mengenanpassung',
    titel: 'Mengenanpassung',
    text:
      'Weicht die tatsächlich abgerufene bzw. gelieferte Menge um mehr als 10 % von der angebotenen ' +
      'Menge ab, wird der Preis automatisch auf Basis der vereinbarten Einzelpreise und Konditionen ' +
      'an die tatsächliche Menge angepasst; einer neuen Auftragsbestätigung bedarf es hierfür nicht. ' +
      'Die Abrechnung erfolgt nach tatsächlichem Gewicht laut Wiegeschein.',
    standardAktiv: true,
  },
];

/**
 * Liest die Klausel-Vorlagen aus den Stammdaten (JSON), Fallback: Standard-Vorlagen
 */
export const getKlauselVorlagen = (stammdaten?: Stammdaten | null): KlauselVorlage[] => {
  if (stammdaten?.vertragsklauselVorlagen) {
    try {
      const geparst = JSON.parse(stammdaten.vertragsklauselVorlagen);
      if (Array.isArray(geparst) && geparst.length > 0) {
        return geparst;
      }
    } catch (error) {
      console.error('Fehler beim Parsen der Klausel-Vorlagen, verwende Standard:', error);
    }
  }
  return DEFAULT_KLAUSEL_VORLAGEN;
};

/**
 * Erzeugt aus den Vorlagen die Dokument-Klauseln für ein neues Angebot / eine neue AB
 */
export const initialisiereDokumentKlauseln = (vorlagen: KlauselVorlage[]): VertragsKlausel[] => {
  return vorlagen.map((v) => ({
    id: v.id,
    titel: v.titel,
    text: v.text,
    aktiviert: v.standardAktiv,
  }));
};

// === AGB-ANHANG ===

export interface AgbAbschnitt {
  titel: string;
  absaetze: string[];
}

/**
 * AGB der Tennismehl GmbH — übernommen von tennismehl.com/de/agb
 * (Stand 27.07.2026: durchnummeriert § 1–§ 12, Wartezeit 20 Minuten).
 */
export const DEFAULT_AGB_ABSCHNITTE: AgbAbschnitt[] = [
  {
    titel: '§ 1 Allgemeines / Geltungsbereich',
    absaetze: [
      'Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen der Tennismehl GmbH – tennismehl24.com (nachfolgend „Tennismehl") und dem Besteller bzw. Auftraggeber (nachfolgend einheitlich „Besteller"). Der Besteller erkennt sie mit der Bestellung oder Beauftragung an. Abweichende Bedingungen des Bestellers gelten nur, wenn Tennismehl ihnen ausdrücklich in Textform zustimmt.',
      'Diese AGB gelten ausschließlich gegenüber Unternehmern im Sinne des § 14 BGB, Kaufleuten, eingetragenen Vereinen, juristischen Personen des öffentlichen Rechts, öffentlich rechtlichen Sondervermögen sowie selbstständig tätigen Personen in Ausübung ihrer gewerblichen oder freiberuflichen Tätigkeit. Bestellungen durch Verbraucher im Sinne des § 13 BGB sind ausgeschlossen. Mit der Bestellung versichert der Besteller, ausschließlich in dieser Eigenschaft zu handeln.',
    ],
  },
  {
    titel: '§ 2 Besteller / Auftragserteilung',
    absaetze: [
      'Der Besteller ist, wer eine Bestellung, Beauftragung, Reservierung oder sonstige vertragliche Erklärung gegenüber Tennismehl schriftlich, mündlich, elektronisch oder über den Onlineshop abgibt.',
      'Erfolgt die Bestellung im Namen oder für Rechnung eines Dritten, ist Tennismehl hierauf vor Vertragsschluss hinzuweisen. Erfolgt die Rechnungsstellung auf Wunsch des Bestellers an einen Dritten, haftet der Besteller neben dem Dritten als Gesamtschuldner. Tennismehl ist nicht verpflichtet, die Vertretungsbefugnis des Erklärenden gesondert zu prüfen.',
    ],
  },
  {
    titel: '§ 3 Vertragsgegenstand',
    absaetze: [
      'Gegenstand des Vertrages ist der Verkauf von Tennismehl, Tennissand, Tennisplatzzubehör, Pflegeprodukten, Platzbedarf, Ausstattungsgegenständen sowie sonstigen Waren für Tennisanlagen und Sportflächen sowie sportstättenrelevanten Waren und Dienstleistungen. Transport, Anlieferung und sonstige Nebenleistungen erfolgen nur bei ausdrücklicher Vereinbarung. Lieferzeiten sind individuelle, unverbindliche Ca.-Angaben und ergeben sich aus Angebot, Auftragsbestätigung oder Artikelbeschreibung. Art, Umfang und Ausführung ergeben sich aus Angebot, Auftragsbestätigung, Bestellvorgang oder Individualvereinbarung.',
      'Liefer- oder Leistungstermine sind grundsätzlich unverbindliche Ca.-Angaben, auch wenn sie in Textform mitgeteilt oder bestätigt werden, sofern Tennismehl sie nicht ausdrücklich als Garantiert verbindlich bezeichnet. Bei höherer Gewalt, Streik, Krankheit, Maschinenbruch, Verkehrsbehinderungen oder sonstigen nicht von Tennismehl zu vertretenden Umständen verschieben sich Lieferfristen angemessen.',
    ],
  },
  {
    titel: '§ 4 Preise / Zahlung / Rabatte',
    absaetze: [
      'Maßgeblich sind die in Angebot, Auftragsbestätigung, Onlineshop oder Rechnung ausgewiesenen Preise. Ohne besondere Preisvereinbarung gelten die am Tag der Bestellung gültigen Listen- oder Shoppreise zuzüglich aktueller Transportkosten. Paketpreise sind feste Pauschalen. Ein Mehraufwand des kalkulierten Umfangs kann gesondert berechnet werden siehe § 5 Zusatzleistungen und Mehraufwand. Wird eine beauftragte Zusatzleistung aus Gründen, die Tennismehl nicht zu vertreten hat, nicht oder nicht vollständig durchgeführt, bleibt der Vergütungsanspruch für die bis dahin erbrachten Leistungen bestehen.',
      'Von den im Angebot genannten Preisen kann in begründeten Fällen abgewichen werden, sofern bei der Auftragserteilung ein erheblicher Mehraufwand nicht absehbar war. Dies betrifft insbesondere, jedoch nicht abschließend: mehrere Schüttstellen, unzureichende Zufahrt, besondere Abladevoraussetzungen oder sonstige logistische Erschwernisse.',
      'Für alle Angebote gilt der nachstehende Dieselpreiszuschlag als vereinbart.',
      'Angebote mit Gültigkeit bis 31.12.2025: Den angebotenen Preisen liegt ein Basis-Dieselpreis von bis zu 1,699 €/Liter zugrunde. Bei einer Steigerung des Dieselpreises über diesen Basiswert erhöht sich der Preis des gelieferten Ziegelmehls um 0,45 € je Tonne pro 0,05 € Dieselpreisanstieg.',
      'Angebote mit Gültigkeit bis 31.12.2026: Den angebotenen Preisen liegt ein Basis-Dieselpreis von bis zu 1,749 €/Liter zugrunde. Bei einer Steigerung des Dieselpreises über diesen Basiswert erhöht sich der Preis des gelieferten Ziegelmehls um 0,45 € je Tonne pro 0,05 € Dieselpreisanstieg.',
      'Angebote mit Gültigkeit ab 01.01.2027: Den angebotenen Preisen liegt ein Basis-Dieselpreis von bis zu 1,749 €/Liter zugrunde. Bei einer Steigerung des Dieselpreises über diesen Basiswert erhöht sich der Preis des gelieferten Ziegelmehls pro 0,05 € Dieselpreisanstieg gestaffelt nach der Entfernung zwischen dem Versandwerk von Tennismehl und der Abladestelle (einfache Strecke): bis 50 km: 0,45 € je Tonne; über 50 bis 75 km: 0,65 € je Tonne; über 75 bis 100 km: 0,85 € je Tonne; über 100 bis 125 km: 1,05 € je Tonne; über 125 bis 150 km: 1,25 € je Tonne; über 150 km: 1,45 € je Tonne. Maßgeblich ist die Entfernung zur vereinbarten Abladestelle.',
      'Tennismehl kann Vorkasse, Abschlagszahlungen oder Teilabrechnungen verlangen. Gerät der Besteller in Verzug, so ist Tennismehl berechtigt, von dem betreffenden Zeitpunkt ab Zinsen in Höhe von 2 % über dem jeweiligen Überziehungszinssatz der VR-Bank Würzburg als pauschalen Schadensersatz zu verlangen. Tennismehl behält sich vor, einen höheren Schaden nachzuweisen und geltend zu machen.',
      'Tennismehl kann weitere Lieferungen oder Leistungen bis zum vollständigen Zahlungsausgleich zurückhalten. Gewährte Rabatte gelten nur bei fristgerechter Zahlung. Wird das Zahlungsziel überschritten, entfallen Rabatte vollständig; es gilt dann der reguläre Listenpreis zuzüglich der Transportkosten.',
      'Erhöhen sich bei vereinbarten Transporten nach Vertragsschluss die Kosten für Maut, Kraftstoff, Transportwege, Frachtraum oder sonstige transportbedingte Fremdkosten, kann Tennismehl diese Mehrkosten weiterberechnen, soweit sie nicht von Tennismehl zu vertreten sind.',
      'Bei Schüttgutlieferungen sind Mengenabweichungen von bis zu 10 % unter der bestellten Menge sowie bis zu 150 kg über der bestellten Menge zulässig. Die Abrechnung erfolgt stets nach dem tatsächlichen Gewicht laut Wiegeschein.',
      'Überschreitet die gelieferte Menge die bestellte Menge um mehr als 150 kg, wird maximal die bestellte Menge zuzüglich 150 kg abgerechnet.',
      'Unterschreitet die gelieferte Menge die bestellte Menge um mehr als 10 %, kann der Kunde eine Nachlieferung der Differenzmenge verlangen. Die Nachlieferung erfolgt in der Regel als BigBag auf Palette, als Sackware oder als erneute Schüttgutlieferung.',
      'Eine Aufrechnung oder Zurückbehaltung ist nur mit unbestrittenen, rechtskräftig festgestellten oder von Tennismehl anerkannten Forderungen zulässig.',
    ],
  },
  {
    titel: '§ 5 Zusatzleistungen und Mehraufwand',
    absaetze: [
      'Zusätzlicher Kommunikations- und Prüfaufwand, der über die reine Lieferabstimmung hinausgeht sowie nicht vereinbarter zusätzlicher Abladestellen und Terminvereinbarung, wird nach Zeitaufwand berechnet. Hierzu zählen insbesondere Telefonate, Messenger-, SMS- und E-Mail-Kommunikation, das Lesen, Prüfen, Bearbeiten und Beantworten von Nachrichten sowie das Prüfen von Unterlagen und Bescheinigungen. Der Preis beträgt 24,80 € netto je angefangene zehn Minuten. Speditionswartezeiten regelt § 7.',
    ],
  },
  {
    titel: '§ 6 Lieferung / Leistung / Verfügbarkeit',
    absaetze: [
      'Lieferfristen und Leistungstermine sind grundsätzlich unverbindliche Ca.-Angaben, sofern Tennismehl sie nicht ausdrücklich als Garantiert verbindlich bezeichnet. Tennismehl ist zu Teillieferungen und Teilleistungen berechtigt. Liefer- und Leistungsverzögerungen aufgrund höherer Gewalt oder sonstiger bei Vertragsschluss nicht vorhersehbarer, von Tennismehl nicht zu vertretender Umstände verlängern die Fristen angemessen.',
      'Kommt der Besteller in Annahmeverzug oder verletzt er Mitwirkungspflichten, kann Tennismehl den hierdurch entstehenden Schaden und Mehraufwand verlangen, insbesondere für Mehrfachanfahrten der Spedition.',
    ],
  },
  {
    titel: '§ 7 Versand / Gefahrübergang / Wartezeit',
    absaetze: [
      'Der Versand erfolgt auf Rechnung und Gefahr des Bestellers, sofern nichts anderes vereinbart ist. Die Gefahr des zufälligen Untergangs und der zufälligen Verschlechterung geht mit Übergabe an Spediteur, Frachtführer oder sonstigen Versanddienstleister auf den Besteller über. Verzögert sich der Versand aus Gründen, die der Besteller zu vertreten hat, geht die Gefahr mit Meldung der Versandbereitschaft auf den Besteller über. Versand-, Verpackungs- und Zustellkosten werden gesondert berechnet, soweit sie nicht bereits ausgewiesen sind.',
      'Kann eine vereinbarte Anlieferung aus Gründen aus der Sphäre des Bestellers nicht oder nicht rechtzeitig entladen werden, gilt Folgendes: Ab einer Wartezeit von mehr als 20 Minuten werden die Wartekosten der Spedition nachberechnet. Dauert die Verzögerung mehr als 90 Minuten, kann Tennismehl zusätzlich Folgekosten und Mehraufwand berechnen, insbesondere für erneute Anlieferung, Ausfall anderer Abladestellen oder zusätzliche Disposition. Muss ein vereinbarter Termin erneut angefahren werden, fallen die Frachtkosten erneut an. Ist die Verantwortlichkeit des Bestellers schriftlich bestätigt oder eindeutig nachweisbar, trägt er die Mehrkosten vollständig. Ist die Verantwortlichkeit streitig und nicht eindeutig nachweisbar, tragen Tennismehl und der Besteller die Zusatzfrachtkosten je zur Hälfte.',
    ],
  },
  {
    titel: '§ 8 Mitwirkungspflichten des Bestellers',
    absaetze: [
      'Der Besteller hat Tennismehl alle für Auftrag oder Zusatzleistung erforderlichen Informationen, Unterlagen, Freigaben und Mitwirkungen rechtzeitig und vollständig zur Verfügung zu stellen. Bei Zusatzleistungen darf Tennismehl die Angaben und Unterlagen des Bestellers als vollständig und richtig zugrunde legen. Mehraufwand wegen unrichtiger, verspäteter oder unvollständiger Angaben wird gesondert nach Aufwand berechnet. Siehe § 5 Zusatzleistungen und Mehraufwand.',
    ],
  },
  {
    titel: '§ 9 Gewährleistung / Haftung',
    absaetze: [
      'Der Besteller hat Ware und Leistung unverzüglich zu prüfen und Mängel, soweit § 377 HGB gilt, unverzüglich anzuzeigen. Bei Mängeln ist Tennismehl zunächst zur Nacherfüllung berechtigt. Erst danach kommen Minderung, Rücktritt oder Schadensersatz nach den gesetzlichen Vorschriften in Betracht. Schadensersatzansprüche verjähren nach 3 Monaten; ausgenommen sind Ansprüche wegen Vorsatz, grober Fahrlässigkeit sowie wegen Verletzung von Leben, Körper oder Gesundheit.',
      'Tennismehl haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei einfacher Fahrlässigkeit haftet Tennismehl nur bei Verletzung wesentlicher Vertragspflichten und nur für den vorhersehbaren, vertragstypischen Schaden. Im Übrigen ist die Haftung ausgeschlossen. Die Haftungsbeschränkungen gelten auch für gesetzliche Vertreter, Mitarbeiter und Erfüllungsgehilfen. Die Produkthaftung nach dem Produkthaftungsgesetz bleibt unberührt. Soweit Schäden durch selbständige Dritte verursacht werden, insbesondere durch Spediteure, Frachtführer oder sonstige externe Dienstleister, sind Ansprüche vorrangig gegenüber dem jeweiligen Dritten geltend zu machen.',
    ],
  },
  {
    titel: '§ 10 Eigentumsvorbehalt',
    absaetze: [
      'Die gelieferte Ware bleibt bis zur vollständigen Bezahlung sämtlicher Forderungen aus der Geschäftsbeziehung Eigentum von Tennismehl. Der Besteller hat die Vorbehaltsware pfleglich zu behandeln. Bei Zahlungsverzug siehe „§ 4 Preise / Zahlung / Rabatte".',
    ],
  },
  {
    titel: '§ 11 Gerichtsstand / Recht',
    absaetze: [
      'Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz von Tennismehl. Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts.',
    ],
  },
  {
    titel: '§ 12 Schlussbestimmungen',
    absaetze: [
      'Ist eine Bestimmung dieses Vertrages unwirksam, so wird die Wirksamkeit der übrigen Bestimmungen dadurch nicht berührt. Die unwirksame Bestimmung soll durch eine Regelung ersetzt werden, die der unwirksamen Bestimmung wirtschaftlich am nächsten kommt.',
    ],
  },
];

/**
 * Liest die AGB-Abschnitte aus den Stammdaten (JSON), Fallback: Shop-AGB
 */
export const getAgbAbschnitte = (stammdaten?: Stammdaten | null): AgbAbschnitt[] => {
  if (stammdaten?.agbAbschnitte) {
    try {
      const geparst = JSON.parse(stammdaten.agbAbschnitte);
      if (Array.isArray(geparst) && geparst.length > 0) {
        return geparst;
      }
    } catch (error) {
      console.error('Fehler beim Parsen der AGB-Abschnitte, verwende Standard:', error);
    }
  }
  return DEFAULT_AGB_ABSCHNITTE;
};
