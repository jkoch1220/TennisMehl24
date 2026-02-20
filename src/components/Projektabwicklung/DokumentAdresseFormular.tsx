import { RefreshCw, FileText, Truck, AlertCircle } from 'lucide-react';
import { SaisonKunde } from '../../types/saisonplanung';
import { formatAdresszeile } from '../../services/pdfHelpers';

export interface DokumentAdresse {
  name: string;
  strasse: string;
  plzOrt: string;
}

interface DokumentAdresseFormularProps {
  // Die aktuelle Adresse für das Dokument (wird im PDF gedruckt)
  adresse: DokumentAdresse;
  // Callback wenn Adresse geändert wird
  onChange: (adresse: DokumentAdresse) => void;
  // Kunde für Stammdaten-Übernahme
  kunde?: SaisonKunde | null;
  // Dokumenttyp bestimmt Default-Adresse und Styling
  dokumentTyp: 'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung';
  // Optional: Projekt-Name als Fallback
  projektKundenname?: string;
  // Optional: Deaktiviert (z.B. bei finaler Rechnung)
  disabled?: boolean;
}

/**
 * Adressformular für Dokumente (Angebot, AB, Lieferschein, Rechnung)
 *
 * Logik:
 * - Angebot/AB/Rechnung: Default = Rechnungsadresse vom Kunden
 * - Lieferschein: Default = Lieferadresse vom Kunden
 *
 * Das Formular speichert NUR im Dokument, ändert NICHT die Kunden-Stammdaten!
 */
const DokumentAdresseFormular = ({
  adresse,
  onChange,
  kunde,
  dokumentTyp,
  projektKundenname,
  disabled = false,
}: DokumentAdresseFormularProps) => {

  // Bestimme Titel und Farben basierend auf Dokumenttyp
  const getConfig = () => {
    switch (dokumentTyp) {
      case 'lieferschein':
        return {
          title: 'Lieferschein-Adresse',
          subtitle: 'Diese Adresse wird auf dem Lieferschein gedruckt',
          defaultLabel: 'Lieferadresse',
          defaultSource: kunde?.lieferadresse,
          icon: Truck,
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          textColor: 'text-green-800 dark:text-green-300',
          iconBg: 'bg-green-100 dark:bg-green-900/50',
          iconColor: 'text-green-600',
          buttonBg: 'bg-green-600 hover:bg-green-700',
        };
      case 'angebot':
        return {
          title: 'Angebots-Adresse',
          subtitle: 'Diese Adresse wird auf dem Angebot gedruckt',
          defaultLabel: 'Rechnungsadresse',
          defaultSource: kunde?.rechnungsadresse,
          icon: FileText,
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          textColor: 'text-blue-800 dark:text-blue-300',
          iconBg: 'bg-blue-100 dark:bg-blue-900/50',
          iconColor: 'text-blue-600',
          buttonBg: 'bg-blue-600 hover:bg-blue-700',
        };
      case 'auftragsbestaetigung':
        return {
          title: 'AB-Adresse',
          subtitle: 'Diese Adresse wird auf der Auftragsbestätigung gedruckt',
          defaultLabel: 'Rechnungsadresse',
          defaultSource: kunde?.rechnungsadresse,
          icon: FileText,
          bgColor: 'bg-orange-50 dark:bg-orange-900/20',
          borderColor: 'border-orange-200 dark:border-orange-800',
          textColor: 'text-orange-800 dark:text-orange-300',
          iconBg: 'bg-orange-100 dark:bg-orange-900/50',
          iconColor: 'text-orange-600',
          buttonBg: 'bg-orange-600 hover:bg-orange-700',
        };
      case 'rechnung':
        return {
          title: 'Rechnungs-Adresse',
          subtitle: 'Diese Adresse wird auf der Rechnung gedruckt',
          defaultLabel: 'Rechnungsadresse',
          defaultSource: kunde?.rechnungsadresse,
          icon: FileText,
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          textColor: 'text-red-800 dark:text-red-300',
          iconBg: 'bg-red-100 dark:bg-red-900/50',
          iconColor: 'text-red-600',
          buttonBg: 'bg-red-600 hover:bg-red-700',
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  // Stammdaten übernehmen
  const handleUebernehmenVonStammdaten = () => {
    if (!kunde) return;

    const source = config.defaultSource;
    if (source) {
      onChange({
        name: kunde.name || projektKundenname || '',
        strasse: source.strasse || '',
        plzOrt: formatAdresszeile(source.plz, source.ort, source.land),
      });
    }
  };

  // Alternative Adresse übernehmen (z.B. Lieferadresse bei Rechnung)
  const handleAlternativeAdresse = () => {
    if (!kunde) return;

    // Bei Rechnung/AB/Angebot: Lieferadresse anbieten
    // Bei Lieferschein: Rechnungsadresse anbieten
    const altSource = dokumentTyp === 'lieferschein'
      ? kunde.rechnungsadresse
      : kunde.lieferadresse;

    if (altSource) {
      onChange({
        name: kunde.name || projektKundenname || '',
        strasse: altSource.strasse || '',
        plzOrt: formatAdresszeile(altSource.plz, altSource.ort, altSource.land),
      });
    }
  };

  // Prüfen ob aktuell Stammdaten verwendet werden
  const istStammdaten = () => {
    if (!kunde || !config.defaultSource) return false;
    const source = config.defaultSource;
    const expectedPlzOrt = formatAdresszeile(source.plz, source.ort, source.land);
    return (
      adresse.name === kunde.name &&
      adresse.strasse === source.strasse &&
      adresse.plzOrt === expectedPlzOrt
    );
  };

  // Prüfen ob Felder leer sind
  const istLeer = !adresse.name && !adresse.strasse && !adresse.plzOrt;

  return (
    <div className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} p-4 sm:p-5`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.iconBg}`}>
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
          </div>
          <div>
            <h3 className={`font-semibold ${config.textColor}`}>{config.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{config.subtitle}</p>
          </div>
        </div>

        {/* Buttons */}
        {!disabled && kunde && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUebernehmenVonStammdaten}
              className={`flex items-center gap-2 px-3 py-2 ${config.buttonBg} text-white rounded-lg text-sm font-medium transition-colors`}
              title={`${config.defaultLabel} vom Kunden übernehmen`}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">{config.defaultLabel} laden</span>
              <span className="sm:hidden">Laden</span>
            </button>

            {/* Alternative Adresse Button */}
            <button
              type="button"
              onClick={handleAlternativeAdresse}
              className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              title={dokumentTyp === 'lieferschein' ? 'Rechnungsadresse laden' : 'Lieferadresse laden'}
            >
              {dokumentTyp === 'lieferschein' ? (
                <>
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Rechnungsadr.</span>
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" />
                  <span className="hidden sm:inline">Lieferadr.</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Warnung wenn Felder leer */}
      {istLeer && !disabled && (
        <div className="mb-4 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Keine Adresse eingetragen. Bitte laden Sie die Adresse vom Kunden oder geben Sie sie manuell ein.
          </p>
        </div>
      )}

      {/* Status wenn Stammdaten verwendet werden */}
      {istStammdaten() && !disabled && (
        <div className="mb-4 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300 text-center">
            Verwendet aktuell die {config.defaultLabel} vom Kunden
          </p>
        </div>
      )}

      {/* Formular-Felder */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name / Firma
          </label>
          <input
            type="text"
            value={adresse.name}
            onChange={(e) => onChange({ ...adresse, name: e.target.value })}
            disabled={disabled}
            placeholder="z.B. Tennisclub Musterstadt e.V."
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Straße & Hausnummer
          </label>
          <input
            type="text"
            value={adresse.strasse}
            onChange={(e) => onChange({ ...adresse, strasse: e.target.value })}
            disabled={disabled}
            placeholder="z.B. Tennisweg 123"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            PLZ & Ort
          </label>
          <input
            type="text"
            value={adresse.plzOrt}
            onChange={(e) => onChange({ ...adresse, plzOrt: e.target.value })}
            disabled={disabled}
            placeholder="z.B. 12345 Musterstadt"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Info-Text */}
      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        Diese Adresse wird nur auf diesem Dokument verwendet und ändert nicht die Kunden-Stammdaten.
      </p>
    </div>
  );
};

export default DokumentAdresseFormular;
