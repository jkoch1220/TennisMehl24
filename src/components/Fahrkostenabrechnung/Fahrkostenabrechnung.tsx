import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Car, Plus, Calendar, Trash2, Edit3, Zap, Route, ArrowRight,
  ArrowLeft, ChevronRight, Settings, FileSpreadsheet, Building2, MessageSquare,
} from 'lucide-react';
import { fahrkostenService } from '../../services/fahrkostenService';
import { Fahrt, DefaultStrecke, Person, Auto, Firma } from '../../types/fahrtkosten';
import QuickAddModal from './QuickAddModal';
import FahrtFormular from './FahrtFormular';
import VorlagenVerwaltung from './VorlagenVerwaltung';
import StammdatenVerwaltung from './StammdatenVerwaltung';
import ReportModal from './ReportModal';

type ModalState =
  | { typ: 'none' }
  | { typ: 'quickAdd'; vorlage: DefaultStrecke }
  | { typ: 'fahrt'; fahrt: Fahrt | null }
  | { typ: 'vorlagen'; direktAnlegen?: boolean }
  | { typ: 'stammdaten' }
  | { typ: 'report' };

export default function Fahrkostenabrechnung() {
  const [personen, setPersonen] = useState<Person[]>([]);
  const [autos, setAutos] = useState<Auto[]>([]);
  const [firmen, setFirmen] = useState<Firma[]>([]);
  const [defaultStrecken, setDefaultStrecken] = useState<DefaultStrecke[]>([]);
  const [fahrten, setFahrten] = useState<Fahrt[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ typ: 'none' });

  // Personen-Liste (global) neu laden
  const reloadPersonen = useCallback(async () => {
    setPersonen(await fahrkostenService.ladePersonen());
  }, []);

  // Autos / Firmen / Vorlagen der gewählten Person laden
  const ladePersonStammdaten = useCallback(async (personId: string) => {
    const [autosData, firmenData, streckenData] = await Promise.all([
      fahrkostenService.ladeAutos(personId),
      fahrkostenService.ladeFirmen(personId),
      fahrkostenService.ladeDefaultStrecken(personId),
    ]);
    setAutos(autosData);
    setFirmen(firmenData);
    setDefaultStrecken(streckenData);
  }, []);

  const ladeBasis = useCallback(async () => {
    setLoading(true);
    try {
      const [personenData, fahrtenData] = await Promise.all([
        fahrkostenService.ladePersonen(),
        fahrkostenService.ladeAlleFahrten(),
      ]);
      setPersonen(personenData);
      setFahrten(fahrtenData);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { ladeBasis(); }, [ladeBasis]);

  // Stammdaten der gewählten Person nachladen
  useEffect(() => {
    if (selectedPersonId) {
      ladePersonStammdaten(selectedPersonId);
    } else {
      setAutos([]);
      setFirmen([]);
      setDefaultStrecken([]);
    }
  }, [selectedPersonId, ladePersonStammdaten]);

  // Stammdaten der aktuellen Person neu laden (für Modal-Updates)
  const reloadStammdaten = useCallback(async () => {
    if (selectedPersonId) await ladePersonStammdaten(selectedPersonId);
  }, [selectedPersonId, ladePersonStammdaten]);

  const selectedPerson = personen.find(p => p.id === selectedPersonId) || null;

  // Fahrten der gewählten Person
  const personFahrten = useMemo(
    () => (selectedPerson ? fahrten.filter(f => f.personId === selectedPerson.id) : []),
    [fahrten, selectedPerson]
  );

  const favoritStrecken = defaultStrecken.filter(s => s.istFavorit);

  // ---- Handler ----
  const handleFahrtErstellt = (neue: Fahrt[]) => {
    setFahrten(prev => [...neue, ...prev].sort((a, b) => b.datum.localeCompare(a.datum)));
  };

  const handleFahrtGespeichert = (fahrt: Fahrt, istNeu: boolean) => {
    setFahrten(prev => {
      const liste = istNeu ? [fahrt, ...prev] : prev.map(f => (f.id === fahrt.id ? fahrt : f));
      return liste.sort((a, b) => b.datum.localeCompare(a.datum));
    });
  };

  const handleLoeschen = async (id: string) => {
    if (!confirm('Fahrt wirklich löschen?')) return;
    try {
      await fahrkostenService.loescheFahrt(id);
      setFahrten(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  };

  const handleVorlageLoeschen = async (strecke: DefaultStrecke) => {
    if (!confirm(`Quick-Add „${strecke.name}" löschen?`)) return;
    try {
      await fahrkostenService.loescheDefaultStrecke(strecke.id);
      await reloadStammdaten();
    } catch (error) {
      console.error('Fehler beim Löschen der Vorlage:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  // ============ PERSONEN-AUSWAHL ============
  if (!selectedPerson) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg pb-24 sm:pb-8">
        <div className="bg-white dark:bg-dark-surface shadow-sm">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl"><Car className="w-6 h-6 text-red-600" /></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Fahrtkosten</h1>
                <p className="text-sm text-gray-500 dark:text-dark-textMuted">Wer erfasst Fahrten?</p>
              </div>
            </div>
            <button
              onClick={() => setModal({ typ: 'stammdaten' })}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400"
              title="Stammdaten"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-6 max-w-md mx-auto space-y-3">
          {personen.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-dark-textMuted mb-3">Noch keine Personen angelegt.</p>
              <button onClick={() => setModal({ typ: 'stammdaten' })} className="px-4 py-2 bg-red-600 text-white rounded-xl">
                Person anlegen
              </button>
            </div>
          )}
          {personen.map(p => {
            const anzahl = fahrten.filter(f => f.personId === p.id).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPersonId(p.id)}
                className="w-full flex items-center gap-4 p-4 bg-white dark:bg-dark-surface rounded-2xl shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-sm text-gray-500 dark:text-dark-textMuted">{anzahl} Fahrt{anzahl === 1 ? '' : 'en'}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            );
          })}
        </div>

        {modal.typ === 'stammdaten' && (
          <StammdatenVerwaltung
            tabs={['personen']}
            personen={personen}
            onClose={() => setModal({ typ: 'none' })}
            onUpdate={reloadPersonen}
          />
        )}
      </div>
    );
  }

  // ============ PERSONEN-SEITE ============
  const gesamtKm = personFahrten.reduce((s, f) => s + f.kilometer, 0);
  const gesamtBetrag = Math.round(personFahrten.reduce((s, f) => s + f.betrag, 0) * 100) / 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg pb-28 sm:pb-8">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSelectedPersonId(null)} className="p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center font-bold flex-shrink-0">
              {selectedPerson.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{selectedPerson.name}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setModal({ typ: 'report' })} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400" title="Report">
              <FileSpreadsheet className="w-5 h-5" />
            </button>
            <button onClick={() => setModal({ typ: 'vorlagen' })} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400" title="Vorlagen">
              <Route className="w-5 h-5" />
            </button>
            <button onClick={() => setModal({ typ: 'stammdaten' })} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400" title="Autos & Firmen">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summen */}
      <div className="px-4 sm:px-6 py-3">
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{personFahrten.length}</p>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">Fahrten</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{gesamtKm}</p>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">Kilometer</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{gesamtBetrag.toFixed(2)} €</p>
            <p className="text-xs text-gray-500 dark:text-dark-textMuted">Gesamt</p>
          </div>
        </div>
      </div>

      {/* Hauptaktionen */}
      <div className="px-4 sm:px-6 py-2 grid grid-cols-2 gap-3">
        <button
          onClick={() => setModal({ typ: 'fahrt', fahrt: null })}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all font-medium"
        >
          <Plus className="w-5 h-5" /> Fahrt anlegen
        </button>
        <button
          onClick={() => setModal({ typ: 'vorlagen', direktAnlegen: true })}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-all font-medium"
        >
          <Route className="w-5 h-5" /> Vorlage anlegen
        </button>
      </div>

      {/* Quick-Add */}
      {favoritStrecken.length > 0 && (
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick-Add (Vorlagen)</span>
          </div>
          <div className="flex flex-col gap-2">
            {favoritStrecken.map(strecke => (
              <div key={strecke.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => setModal({ typ: 'quickAdd', vorlage: strecke })}
                  className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl shadow-lg hover:from-red-600 hover:to-red-700 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="w-4 h-4 opacity-80 flex-shrink-0" />
                    <span className="font-medium truncate">{strecke.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm opacity-90 flex-shrink-0">
                    <span>{strecke.kilometer * 2} km</span>
                    <Plus className="w-4 h-4" />
                  </div>
                </button>
                <button
                  onClick={() => handleVorlageLoeschen(strecke)}
                  title="Quick-Add löschen"
                  className="px-3 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-400 hover:text-red-600 hover:border-red-300 dark:hover:border-red-700 flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fahrten-Liste */}
      <div className="px-4 sm:px-6 py-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Alle Fahrten</h2>
        {personFahrten.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-xl">
            <Car className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-dark-textMuted">Noch keine Fahrten</p>
            <p className="text-sm text-gray-400 mt-1">Lege eine Fahrt oder Vorlage an.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {personFahrten.map(fahrt => (
              <FahrtKarte
                key={fahrt.id}
                fahrt={fahrt}
                onEdit={() => setModal({ typ: 'fahrt', fahrt })}
                onDelete={() => handleLoeschen(fahrt.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== Modals ===== */}
      {modal.typ === 'quickAdd' && (
        <QuickAddModal
          vorlage={modal.vorlage}
          person={selectedPerson}
          autos={autos}
          firmen={firmen}
          onClose={() => setModal({ typ: 'none' })}
          onCreated={handleFahrtErstellt}
        />
      )}

      {modal.typ === 'fahrt' && (
        <FahrtFormular
          person={selectedPerson}
          autos={autos}
          firmen={firmen}
          defaultStrecken={defaultStrecken}
          bearbeitungsFahrt={modal.fahrt}
          onClose={() => setModal({ typ: 'none' })}
          onSaved={handleFahrtGespeichert}
        />
      )}

      {modal.typ === 'vorlagen' && (
        <VorlagenVerwaltung
          strecken={defaultStrecken}
          autos={autos}
          personId={selectedPerson.id}
          direktAnlegen={modal.direktAnlegen}
          onClose={() => setModal({ typ: 'none' })}
          onUpdate={reloadStammdaten}
        />
      )}

      {modal.typ === 'stammdaten' && (
        <StammdatenVerwaltung
          tabs={['autos', 'firmen']}
          personId={selectedPerson.id}
          personName={selectedPerson.name}
          autos={autos}
          firmen={firmen}
          onClose={() => setModal({ typ: 'none' })}
          onUpdate={reloadStammdaten}
        />
      )}

      {modal.typ === 'report' && (
        <ReportModal
          fahrten={fahrten}
          personen={personen}
          firmen={firmen}
          startPersonId={selectedPerson.id}
          onClose={() => setModal({ typ: 'none' })}
        />
      )}
    </div>
  );
}

// Fahrt-Karte
function FahrtKarte({ fahrt, onEdit, onDelete }: { fahrt: Fahrt; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-textMuted mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(fahrt.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
              <span className="truncate">{fahrt.startort}</span>
              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{fahrt.zielort}</span>
            </div>
            {fahrt.firmaName && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-dark-textMuted mt-1">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{fahrt.firmaName}</span>
              </div>
            )}
            {fahrt.kommentar && (
              <div className="flex items-center gap-1.5 text-sm text-gray-400 mt-0.5">
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{fahrt.kommentar}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end flex-shrink-0 gap-2">
            <div className="text-right">
              <p className="font-bold text-red-600">{fahrt.betrag.toFixed(2)} €</p>
              <p className="text-xs text-gray-500 dark:text-dark-textMuted">{fahrt.kilometer} km</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onEdit} title="Bearbeiten" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={onDelete} title="Löschen" className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
