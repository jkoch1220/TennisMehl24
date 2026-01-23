import { X, Sparkles, MapPin, FileText, CheckCircle2, Package, Truck, Clock, AlertTriangle, ArrowDown } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const TourenHilfe = ({ onClose }: Props) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            Hilfe zur Tourenplanung
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Einleitung */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Was ist die KI-Tourenplanung?
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Die KI-Tourenplanung nutzt Claude AI, um automatisch optimale Liefertouren zu erstellen.
              Das System berücksichtigt Fahrzeugkapazitäten, Zeitfenster der Kunden, KW-Deadlines
              und die Belieferungsart (Motorwagen/Hänger), um die effizientesten Routen zu finden.
            </p>
          </section>

          {/* Flowchart */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Ablauf der Tourenplanung
            </h3>
            <div className="relative">
              {/* SVG Flowchart */}
              <div className="flex flex-col items-center gap-3">
                {/* Schritt 1 */}
                <FlowStep
                  number={1}
                  icon={<Package className="w-5 h-5" />}
                  title="Lieferungen auswählen"
                  description="Wähle die Projekte aus, die an diesem Tag geliefert werden sollen"
                  color="blue"
                />
                <FlowArrow />

                {/* Schritt 2 */}
                <FlowStep
                  number={2}
                  icon={<Truck className="w-5 h-5" />}
                  title="Fahrzeuge prüfen"
                  description="Das System zeigt verfügbare Fahrzeuge mit Kapazitäten"
                  color="purple"
                />
                <FlowArrow />

                {/* Schritt 3 */}
                <FlowStep
                  number={3}
                  icon={<Sparkles className="w-5 h-5" />}
                  title="KI-Optimierung starten"
                  description="Claude AI erstellt optimale Touren basierend auf allen Faktoren"
                  color="gradient"
                  highlight
                />
                <FlowArrow />

                {/* Schritt 4 */}
                <FlowStep
                  number={4}
                  icon={<MapPin className="w-5 h-5" />}
                  title="Touren prüfen & anpassen"
                  description="Überprüfe die Vorschläge und passe sie bei Bedarf manuell an"
                  color="orange"
                />
                <FlowArrow />

                {/* Schritt 5 */}
                <FlowStep
                  number={5}
                  icon={<FileText className="w-5 h-5" />}
                  title="Tourenplan drucken"
                  description="Erstelle einen PDF-Tourenplan für den Fahrer mit allen Details"
                  color="green"
                />
              </div>
            </div>
          </section>

          {/* Was die KI berücksichtigt */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Was die KI berücksichtigt
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FeatureCard
                icon={<Clock className="w-5 h-5 text-blue-600" />}
                title="Zeitfenster"
                description="Kundenvorgaben wie '08:00-12:00' werden strikt eingehalten"
              />
              <FeatureCard
                icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
                title="KW-Deadlines"
                description="Lieferungen mit 'spätestens KW X' werden priorisiert"
              />
              <FeatureCard
                icon={<Truck className="w-5 h-5 text-purple-600" />}
                title="Fahrzeugkapazität"
                description="Die Tonnage wird nie überschritten"
              />
              <FeatureCard
                icon={<Package className="w-5 h-5 text-green-600" />}
                title="Belieferungsart"
                description="Motor/Hänger und Ladekran werden berücksichtigt"
              />
            </div>
          </section>

          {/* Tipps */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Tipps für die Hochsaison
            </h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 space-y-3">
              <TipItem>
                <strong>Zeitfenster pflegen:</strong> Je genauer die Zeitfenster bei den Kunden hinterlegt sind,
                desto besser kann die KI planen.
              </TipItem>
              <TipItem>
                <strong>KW-Deadlines nutzen:</strong> Wenn ein Kunde "spätestens KW 20" braucht,
                trage das in der Auftragsbestätigung ein - die KI priorisiert dann automatisch.
              </TipItem>
              <TipItem>
                <strong>Hänger-Lieferungen:</strong> Bei größeren Mengen mit Hänger achte auf
                Wendemöglichkeiten - hinterlege Anfahrtshinweise für enge Zufahrten.
              </TipItem>
              <TipItem>
                <strong>Wichtige Hinweise:</strong> Alle rot markierten Warnungen im Tourenplan
                solltest du dem Fahrer mündlich mitteilen!
              </TipItem>
            </div>
          </section>

          {/* Belieferungsarten erklärt */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Belieferungsarten
            </h3>
            <div className="space-y-2">
              <BelArtRow label="Nur Motorwagen" color="blue" description="Standard-LKW ohne Anhänger, flexibel und wendig" />
              <BelArtRow label="Mit Hänger" color="purple" description="Größere Kapazität, aber eingeschränkte Wendemöglichkeiten" />
              <BelArtRow label="Ladekran" color="orange" description="Für Paletten ohne Stapler vor Ort" />
              <BelArtRow label="BigBag" color="yellow" description="Spezielle Lieferung in BigBags" />
              <BelArtRow label="Abholung" color="gray" description="Kunde holt selbst ab - keine Tour nötig" />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-blue-700"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};

// Flow-Schritt Komponente
const FlowStep = ({
  number,
  icon,
  title,
  description,
  color,
  highlight = false,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'blue' | 'purple' | 'orange' | 'green' | 'gradient';
  highlight?: boolean;
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 border-purple-200 dark:border-purple-800',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 border-orange-200 dark:border-orange-800',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-600 border-green-200 dark:border-green-800',
    gradient: 'bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 text-purple-600 border-purple-200 dark:border-purple-800',
  };

  return (
    <div
      className={`w-full max-w-md p-4 rounded-xl border-2 ${colorClasses[color]} ${
        highlight ? 'ring-2 ring-purple-400 ring-offset-2 dark:ring-offset-slate-900' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center font-bold text-sm shadow">
          {number}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            {icon}
            {title}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
};

// Pfeil zwischen Schritten
const FlowArrow = () => (
  <div className="text-gray-400">
    <ArrowDown className="w-5 h-5" />
  </div>
);

// Feature Card
const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="font-medium text-gray-900 dark:text-white">{title}</span>
    </div>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </div>
);

// Tipp Item
const TipItem = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-200">
    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
    <span>{children}</span>
  </div>
);

// Belieferungsart Row
const BelArtRow = ({
  label,
  color,
  description,
}: {
  label: string;
  color: 'blue' | 'purple' | 'orange' | 'yellow' | 'gray';
  description: string;
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800">
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClasses[color]}`}>
        {label}
      </span>
      <span className="text-sm text-gray-600 dark:text-gray-400">{description}</span>
    </div>
  );
};

export default TourenHilfe;
