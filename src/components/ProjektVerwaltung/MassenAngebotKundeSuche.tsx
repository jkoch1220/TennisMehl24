import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SaisonKunde } from '../../types/saisonplanung';
import { MassenAngebotKampagne } from '../../types/massenAngebot';
import { saisonplanungService } from '../../services/saisonplanungService';
import { massenAngebotKampagnenService } from '../../services/massenAngebotKampagnenService';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Kunden von Hand in die Kampagne holen.
 *
 * Die automatische Zuordnung kann nur erkennen, was in den Daten steht. Ein
 * reiner Palettenkunde ohne Vorjahresbelege ist für sie unsichtbar — für den
 * Bearbeiter, der ihn seit Jahren beliefert, dagegen offensichtlich. Diese
 * Suche schließt genau diese Lücke.
 */

interface Props {
  kampagne: MassenAngebotKampagne;
  bereitsDrin: Set<string>;
  onHinzugefuegt: () => void;
}

export default function MassenAngebotKundeSuche({ kampagne, bereitsDrin, onHinzugefuegt }: Props) {
  const { user } = useAuth();
  const [offen, setOffen] = useState(false);
  const [kunden, setKunden] = useState<SaisonKunde[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  const [fuegtHinzu, setFuegtHinzu] = useState<string | null>(null);

  useEffect(() => {
    if (!offen || kunden.length > 0) return;
    setLaedt(true);
    saisonplanungService
      .loadAlleKunden()
      .then(setKunden)
      .catch(() => toast.error('Kundenstamm konnte nicht geladen werden'))
      .finally(() => setLaedt(false));
  }, [offen, kunden.length]);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (s.length < 2) return [];
    return kunden
      .filter((k) => {
        const plz = k.lieferadresse?.plz || k.rechnungsadresse?.plz || '';
        const ort = k.lieferadresse?.ort || k.rechnungsadresse?.ort || '';
        return (
          k.name.toLowerCase().includes(s) ||
          (k.kundennummer ?? '').toLowerCase().includes(s) ||
          plz.startsWith(s) ||
          ort.toLowerCase().includes(s)
        );
      })
      .slice(0, 25);
  }, [kunden, suche]);

  const hinzufuegen = async (kunde: SaisonKunde) => {
    setFuegtHinzu(kunde.id);
    try {
      await massenAngebotKampagnenService.fuegeKundenHinzu(kampagne, kunde.id, {
        benutzer: user?.name || user?.email,
      });
      toast.success(`${kunde.name} aufgenommen — noch nicht angewählt, bitte Menge und Preis prüfen`);
      onHinzugefuegt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hinzufügen fehlgeschlagen');
    } finally {
      setFuegtHinzu(null);
    }
  };

  if (kampagne.status === 'versendet') return null;

  if (!offen) {
    return (
      <button
        onClick={() => setOffen(true)}
        className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
      >
        <UserPlus className="w-4 h-4" /> Kunde hinzufügen
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            autoFocus
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Verein, Kundennummer, PLZ oder Ort…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <button
          onClick={() => { setOffen(false); setSuche(''); }}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
          title="Schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {laedt && (
        <p className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Kundenstamm wird geladen…
        </p>
      )}

      {!laedt && suche.trim().length < 2 && (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Mindestens zwei Zeichen eingeben. Archivierte Kunden erscheinen hier nicht.
        </p>
      )}

      {!laedt && suche.trim().length >= 2 && treffer.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400">Kein Kunde gefunden.</p>
      )}

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {treffer.map((k) => {
          const drin = bereitsDrin.has(k.id);
          const plz = k.lieferadresse?.plz || k.rechnungsadresse?.plz || '';
          const ort = k.lieferadresse?.ort || k.rechnungsadresse?.ort || '';
          return (
            <div
              key={k.id}
              className="flex items-center gap-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{k.name}</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">
                  {k.kundennummer ? `${k.kundennummer} · ` : ''}{plz} {ort}
                  {k.automatischesAngebot !== true && ' · kein Opt-in'}
                </span>
              </span>
              <button
                onClick={() => void hinzufuegen(k)}
                disabled={drin || fuegtHinzu === k.id}
                className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {fuegtHinzu === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                {drin ? 'Schon drin' : 'Hinzufügen'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
