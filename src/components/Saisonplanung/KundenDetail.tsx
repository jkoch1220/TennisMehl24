import { useState, useEffect } from 'react';
import { X, Edit, Plus, Calendar, TrendingUp, Users, Phone, Mail, Building2, FileCheck, FileSignature, Truck, FileText, CheckCircle2, Layers, Copy, Check, MapPin, History, ChevronDown, ChevronRight } from 'lucide-react';
import {
  SaisonKundeMitDaten,
  SaisonAktivitaet,
  NeueSaisonAktivitaet,
  AktivitaetsTyp,
} from '../../types/saisonplanung';
import { saisonplanungService } from '../../services/saisonplanungService';
import { projektService } from '../../services/projektService';
import { formatAdresszeile } from '../../services/pdfHelpers';
import { Adresse } from '../../types/dispo';
import { Projekt, NeuesProjekt } from '../../types/projekt';
import { useNavigate } from 'react-router-dom';
import ProjektDialog from '../Shared/ProjektDialog';
import OpenInNewTabButton from '../Shared/OpenInNewTabButton';

interface KundenDetailProps {
  kunde: SaisonKundeMitDaten;
  onClose: () => void;
  onEdit: () => void;
  onUpdate: () => void;
}

const KundenDetail = ({ kunde, onClose, onEdit, onUpdate }: KundenDetailProps) => {
  const navigate = useNavigate();
  const [aktivitaeten, setAktivitaeten] = useState<SaisonAktivitaet[]>(kunde.aktivitaeten);
  const [showAddAktivitaet, setShowAddAktivitaet] = useState(false);
  // Bestellhistorie reicht bis 2001 zurück und wäre aufgeklappt länger als der
  // Rest des Dialogs — deshalb standardmäßig zu, mit Summe in der Kopfzeile.
  const [historieOffen, setHistorieOffen] = useState(false);
  const [aktivitaetTyp, setAktivitaetTyp] = useState<AktivitaetsTyp>('kommentar');
  const [aktivitaetTitel, setAktivitaetTitel] = useState('');
  const [aktivitaetBeschreibung, setAktivitaetBeschreibung] = useState('');
  const [kundenNamen, setKundenNamen] = useState<Record<string, string>>({});
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [loadingProjekte, setLoadingProjekte] = useState(false);
  const [showProjektDialog, setShowProjektDialog] = useState(false);
  const [savingProjekt, setSavingProjekt] = useState(false);
  const [copiedNummer, setCopiedNummer] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyTelefonnummer = async (nummer: string) => {
    try {
      await navigator.clipboard.writeText(nummer);
      setCopiedNummer(nummer);
      setTimeout(() => setCopiedNummer((current) => (current === nummer ? null : current)), 2000);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  // Baut einen kompletten, einfügefertigen Adressblock (z.B. für Sendungsformulare)
  const buildAdresstext = (adr: Adresse) =>
    [kunde.kunde.name, adr.strasse, formatAdresszeile(adr.plz, adr.ort, adr.land)]
      .filter(Boolean)
      .join('\n');

  const renderAdresse = (label: string, adr?: Adresse) => {
    if (!adr) return null;
    const text = buildAdresstext(adr);
    const copied = copiedKey === label;
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            {label}
          </span>
          <button
            onClick={() => copyText(text, label)}
            title="Komplette Adresse kopieren"
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </button>
        </div>
        <div className="text-sm text-gray-900 dark:text-slate-100 whitespace-pre-line select-all leading-relaxed">
          {text}
        </div>
      </div>
    );
  };

  useEffect(() => {
    loadAktivitaeten();
    resolveKundenNamen();
    loadProjekte();
  }, [kunde.kunde.id, kunde.beziehungenAlsVerein, kunde.beziehungenAlsPlatzbauer]);

  const loadAktivitaeten = async () => {
    try {
      const akt = await saisonplanungService.loadAktivitaetenFuerKunde(kunde.kunde.id);
      setAktivitaeten(akt);
    } catch (error) {
      console.error('Fehler beim Laden der Aktivitäten:', error);
    }
  };

  const loadProjekte = async () => {
    setLoadingProjekte(true);
    try {
      // KRITISCH: Lade Projekte direkt über kundeId, NICHT über den Namen!
      // Der Name kann sich ändern, die ID bleibt immer gleich.
      const kundeProjekte = await projektService.loadProjekteFuerKundeId(kunde.kunde.id);
      // Sortiere nach Saisonjahr (neueste zuerst)
      kundeProjekte.sort((a, b) => b.saisonjahr - a.saisonjahr);
      setProjekte(kundeProjekte);
    } catch (error) {
      console.error('Fehler beim Laden der Projekte:', error);
    } finally {
      setLoadingProjekte(false);
    }
  };

  const handleNeuesProjekt = () => {
    setShowProjektDialog(true);
  };

  const handleSaveProjekt = async (neuesProjekt: NeuesProjekt) => {
    setSavingProjekt(true);
    try {
      const erstellt = await projektService.createProjekt(neuesProjekt);

      // Schließe Dialog
      setShowProjektDialog(false);

      // Direkt in die Abwicklung des neu angelegten Projekts springen — von hier
      // aus geht es immer mit dem Angebot weiter, der Umweg über die
      // Projektverwaltung war nur ein zusätzlicher Klick.
      const projektId = (erstellt as { $id?: string })?.$id || erstellt?.id;
      if (projektId) {
        navigate(`/projektabwicklung/${projektId}`);
      } else {
        // Sollte nicht vorkommen; ohne ID bleibt nur die Übersicht
        console.warn('Neues Projekt ohne ID erhalten – navigiere zur Projektverwaltung');
        navigate('/projekt-verwaltung');
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Projekts:', error);
      alert('Fehler beim Erstellen des Projekts');
    } finally {
      setSavingProjekt(false);
    }
  };

  const handleProjektClick = (projekt: Projekt) => {
    const projektId = (projekt as any).$id || projekt.id;
    navigate(`/projektabwicklung/${projektId}`);
  };

  const handleAddAktivitaet = async () => {
    if (!aktivitaetTitel.trim()) {
      alert('Bitte geben Sie einen Titel ein');
      return;
    }

    try {
      await saisonplanungService.createAktivitaet({
        kundeId: kunde.kunde.id,
        saisonDatenId: kunde.aktuelleSaison?.id,
        typ: aktivitaetTyp,
        titel: aktivitaetTitel,
        beschreibung: aktivitaetBeschreibung || undefined,
      } as NeueSaisonAktivitaet);

      setAktivitaetTitel('');
      setAktivitaetBeschreibung('');
      setShowAddAktivitaet(false);
      loadAktivitaeten();
      onUpdate();
    } catch (error) {
      console.error('Fehler beim Erstellen der Aktivität:', error);
      alert('Fehler beim Erstellen der Aktivität');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  // Kennzahlen der Bestellhistorie für die Kopfzeile des Abschnitts.
  const bestellhistorie = kunde.kunde.bestellhistorie ?? [];
  const historieAnzahl = bestellhistorie.reduce((s, e) => s + (e.anzahl || 0), 0);
  const historieSumme = bestellhistorie.reduce((s, e) => s + (e.summeEuro || 0), 0);
  const historieJahre = bestellhistorie.map((e) => e.jahr).sort((a, b) => a - b);
  const historieSpanne = historieJahre.length
    ? (historieJahre[0] === historieJahre[historieJahre.length - 1]
        ? `${historieJahre[0]}`
        : `${historieJahre[0]}–${historieJahre[historieJahre.length - 1]}`)
    : '';
  const mehrereKonten = new Set(bestellhistorie.flatMap((e) => e.quellen ?? [])).size > 1;

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const resolveKundenNamen = async () => {
    const ids = new Set<string>();
    kunde.beziehungenAlsVerein?.forEach((b) => b.platzbauerId && ids.add(b.platzbauerId));
    kunde.beziehungenAlsPlatzbauer?.forEach((b) => b.vereinId && ids.add(b.vereinId));

    const unknownIds = Array.from(ids).filter((id) => !kundenNamen[id]);
    if (unknownIds.length === 0) return;

    const entries = await Promise.all(
      unknownIds.map(async (id) => {
        const k = await saisonplanungService.loadKunde(id);
        return { id, name: k?.name || id };
      })
    );

    setKundenNamen((prev) => {
      const next = { ...prev };
      for (const { id, name } of entries) {
        next[id] = name;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{kunde.kunde.name}</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
              {kunde.kunde.lieferadresse.plz} {kunde.kunde.lieferadresse.ort}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <OpenInNewTabButton
              to={`/saisonplanung?kunde=${kunde.kunde.id}`}
              title="Kunde in neuem Tab öffnen"
              appearOnGroupHover={false}
              iconClassName="w-5 h-5"
            />
            <button
              onClick={onEdit}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Edit className="w-5 h-5" />
              Bearbeiten
            </button>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-slate-400">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Adresse */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Adresse
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderAdresse('Lieferadresse', kunde.kunde.lieferadresse)}
              {(() => {
                const lief = kunde.kunde.lieferadresse;
                const rech = kunde.kunde.rechnungsadresse;
                const abweichend =
                  rech &&
                  (rech.strasse !== lief?.strasse ||
                    rech.plz !== lief?.plz ||
                    rech.ort !== lief?.ort);
                return abweichend ? renderAdresse('Rechnungsadresse', rech) : null;
              })()}
            </div>
          </div>

          {/* Stammdaten */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Stammdaten
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-slate-400">Typ:</span>{' '}
                <span className="text-gray-900 dark:text-slate-100">
                  {kunde.kunde.typ === 'verein' ? 'Verein' : 'Platzbauer'}
                </span>
              </div>
              {kunde.kunde.typ === 'verein' && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Bezug Platzbauer über uns:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.beziehtUeberUnsPlatzbauer ? 'Ja' : 'Nein'}
                  </span>
                </div>
              )}
              {kunde.kunde.lieferadresse.bundesland && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Bundesland:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">{kunde.kunde.lieferadresse.bundesland}</span>
                </div>
              )}
              {kunde.kunde.kundennummer && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Kundennummer:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">{kunde.kunde.kundennummer}</span>
                </div>
              )}
              {kunde.kunde.email && (
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-700 dark:text-slate-400">E-Mail:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100 select-all">{kunde.kunde.email}</span>
                  <button
                    onClick={() => copyText(kunde.kunde.email!, 'email')}
                    title="E-Mail kopieren"
                    className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    {copiedKey === 'email' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}
              {kunde.kunde.zuletztGezahlterPreis && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Zuletzt gezahlter Preis:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {formatCurrency(kunde.kunde.zuletztGezahlterPreis)}/t
                  </span>
                </div>
              )}
              {kunde.kunde.belieferungsart && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Belieferungsart:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.belieferungsart === 'nur_motorwagen' && 'Nur Motorwagen'}
                    {kunde.kunde.belieferungsart === 'mit_haenger' && 'Mit Hänger Belieferbar'}
                    {kunde.kunde.belieferungsart === 'abholung_ab_werk' && 'Abholung ab Werk'}
                    {kunde.kunde.belieferungsart === 'palette_mit_ladekran' && 'Palette mit Ladekran'}
                    {kunde.kunde.belieferungsart === 'bigbag' && 'BigBag'}
                  </span>
                </div>
              )}
              {kunde.kunde.notizen && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700 dark:text-slate-400">Notizen:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">{kunde.kunde.notizen}</span>
                </div>
              )}
              {kunde.kunde.standardBezugsweg && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Standard Bezugsweg:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.standardBezugsweg === 'direkt' 
                      ? 'Direkt' 
                      : kunde.kunde.standardBezugsweg === 'direkt_instandsetzung'
                      ? 'Direkt Instandsetzung'
                      : 'Platzbauer'}
                  </span>
                </div>
              )}
              {kunde.kunde.schuettstellenAnzahl !== undefined && kunde.kunde.schuettstellenAnzahl !== null && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Schüttstellen Anzahl:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">{kunde.kunde.schuettstellenAnzahl}</span>
                </div>
              )}

              {/* Zahlungskonditionen — im Kundenformular pflegbar, aber bislang
                  nirgends sichtbar. Seit 08/2026 belegen Angebot, AB und Rechnung
                  damit ihr Zahlungsziel vor; wer den Wert nicht sieht, versteht
                  nicht, warum dort etwas anderes als 14 Tage steht. */}
              {kunde.kunde.zahlungsziel !== undefined && kunde.kunde.zahlungsziel !== null && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Zahlungsziel:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.zahlungsziel === 0 ? 'Sofort' : `${kunde.kunde.zahlungsziel} Tage`}
                  </span>
                  {kunde.kunde.zahlungszielQuelle && (
                    <span className="text-xs text-gray-500 dark:text-slate-500 ml-1">
                      ({kunde.kunde.zahlungszielQuelle})
                    </span>
                  )}
                </div>
              )}
              {kunde.kunde.skonto && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Skonto:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.skonto.prozent} %
                    {kunde.kunde.skonto.tage ? ` bei Zahlung in ${kunde.kunde.skonto.tage} Tagen` : ''}
                  </span>
                </div>
              )}
              {kunde.kunde.vorkasse && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Zahlungsart:</span>{' '}
                  <span className="text-amber-700 dark:text-amber-400 font-medium">Vorkasse</span>
                </div>
              )}
              {kunde.kunde.abwerkspreis && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Preisstellung:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">Ab-Werk-Preis</span>
                </div>
              )}

              {/* Dispo-Angaben: stehen in der Datenbank, wurden hier aber nie gezeigt.
                  Wer am Telefon einen Liefertermin abstimmt, braucht genau diese. */}
              {kunde.kunde.dispoAnsprechpartner?.name && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Dispo-Ansprechpartner:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.dispoAnsprechpartner.name}
                    {kunde.kunde.dispoAnsprechpartner.telefon ? ` · ${kunde.kunde.dispoAnsprechpartner.telefon}` : ''}
                  </span>
                </div>
              )}
              {kunde.kunde.standardLieferzeitfenster?.von && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Lieferzeitfenster:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">
                    {kunde.kunde.standardLieferzeitfenster.von} – {kunde.kunde.standardLieferzeitfenster.bis}
                  </span>
                </div>
              )}
              {kunde.kunde.wunschLieferwoche && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Wunsch-Lieferwoche:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">KW {kunde.kunde.wunschLieferwoche}</span>
                </div>
              )}
              {kunde.kunde.anfahrtshinweise && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700 dark:text-slate-400">Anfahrtshinweise:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100">{kunde.kunde.anfahrtshinweise}</span>
                </div>
              )}

              {/* Verwaltung */}
              {kunde.kunde.automatischesAngebot && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Massen-Angebot:</span>{' '}
                  <span className="text-green-700 dark:text-green-400">bekommt Jahresangebot</span>
                </div>
              )}
              {kunde.kunde.mosaikKurzname && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-slate-400">Mosaik-Kurzname:</span>{' '}
                  <span className="text-gray-900 dark:text-slate-100 font-mono text-xs">{kunde.kunde.mosaikKurzname}</span>
                </div>
              )}
              {kunde.kunde.archiviert && (
                <div className="md:col-span-2">
                  <span className="font-medium text-amber-700 dark:text-amber-400">Archiviert</span>
                  {kunde.kunde.archivGrund ? `: ${kunde.kunde.archivGrund}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Ansprechpartner */}
          {kunde.ansprechpartner.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Ansprechpartner
              </h3>
              <div className="space-y-3">
                {kunde.ansprechpartner.map((ap) => (
                  <div key={ap.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="font-medium text-gray-900 dark:text-slate-100">{ap.name}</div>
                    {ap.rolle && <div className="text-sm text-gray-600 dark:text-slate-400">{ap.rolle}</div>}
                    {ap.email && (
                      <div className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-1 mt-1">
                        <Mail className="w-4 h-4" />
                        {ap.email}
                      </div>
                    )}
                    {ap.telefonnummern.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {ap.telefonnummern.map((tel, idx) => (
                          <div key={idx} className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-red-600" />
                            <a
                              href={`tel:${tel.nummer}`}
                              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              {tel.nummer}
                            </a>
                            {tel.typ && <span className="text-gray-500 dark:text-slate-400">({tel.typ})</span>}
                            <button
                              type="button"
                              onClick={() => copyTelefonnummer(tel.nummer)}
                              className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-slate-200 transition-colors"
                              title="Nummer kopieren"
                              aria-label="Nummer kopieren"
                            >
                              {copiedNummer === tel.nummer ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Beziehungen */}
          {kunde.kunde.typ === 'verein' && (kunde.beziehungenAlsVerein?.length || 0) > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Platzbauer</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-400 space-y-1">
                {kunde.beziehungenAlsVerein?.map((b) => (
                  <li key={b.id}>
                    {kundenNamen[b.platzbauerId] || b.platzbauerId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
                    {b.status === 'inaktiv' && <span className="text-xs text-gray-500 dark:text-slate-400">(inaktiv)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {kunde.kunde.typ === 'platzbauer' &&
            (kunde.beziehungenAlsPlatzbauer?.length || 0) > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Vereine</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 dark:text-slate-400 space-y-1">
                  {kunde.beziehungenAlsPlatzbauer?.map((b) => (
                    <li key={b.id}>
                      {kundenNamen[b.vereinId] || b.vereinId} {b.notiz ? `– ${b.notiz}` : ''}{' '}
                      {b.status === 'inaktiv' && (
                        <span className="text-xs text-gray-500 dark:text-slate-400">(inaktiv)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Aktuelle Saison */}
          {kunde.aktuelleSaison && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Saison {kunde.aktuelleSaison.saisonjahr}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {kunde.aktuelleSaison.referenzmenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Referenzmenge:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">{kunde.aktuelleSaison.referenzmenge.toFixed(1)} t</span>
                  </div>
                )}
                {kunde.aktuelleSaison.angefragteMenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Angefragte Menge:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">
                      {kunde.aktuelleSaison.angefragteMenge.toFixed(1)} t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.tatsaechlicheMenge !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Tatsächliche Menge:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">
                      {kunde.aktuelleSaison.tatsaechlicheMenge.toFixed(1)} t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.preisProTonne && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Preis:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">
                      {formatCurrency(kunde.aktuelleSaison.preisProTonne)}/t
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.bezugsweg && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Bezugsweg:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">
                      {kunde.aktuelleSaison.bezugsweg === 'direkt'
                        ? 'Direkt'
                        : kunde.aktuelleSaison.bezugsweg === 'direkt_instandsetzung'
                        ? 'Direkt Instandsetzung'
                        : 'Platzbauer'}
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.bestellabsicht && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Bestellabsicht:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">
                      {kunde.aktuelleSaison.bestellabsicht === 'bestellt'
                        ? 'Bestellt'
                        : kunde.aktuelleSaison.bestellabsicht === 'bestellt_nicht'
                        ? 'Bestellt nicht'
                        : 'Unklar'}
                    </span>
                  </div>
                )}
                {kunde.aktuelleSaison.lieferfensterFrueh && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Frühestes Lieferdatum:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">{formatDate(kunde.aktuelleSaison.lieferfensterFrueh)}</span>
                  </div>
                )}
                {kunde.aktuelleSaison.lieferfensterSpaet && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-slate-400">Spätestes Lieferdatum:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">{formatDate(kunde.aktuelleSaison.lieferfensterSpaet)}</span>
                  </div>
                )}
                {kunde.aktuelleSaison.gespraechsnotizen && (
                  <div className="md:col-span-2">
                    <span className="font-medium text-gray-700 dark:text-slate-400">Notizen:</span>{' '}
                    <span className="text-gray-900 dark:text-slate-100">{kunde.aktuelleSaison.gespraechsnotizen}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Saison-Historie */}
          {kunde.saisonHistorie.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Saison-Historie
              </h3>
              <div className="space-y-2">
                {kunde.saisonHistorie
                  .sort((a, b) => b.saisonjahr - a.saisonjahr)
                  .map((saison) => (
                    <div key={saison.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="font-medium text-gray-900 dark:text-slate-100 mb-2">Saison {saison.saisonjahr}</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {saison.angefragteMenge !== undefined && (
                          <div>
                            <span className="text-gray-600 dark:text-slate-400">Angefragt:</span>{' '}
                            <span className="font-medium">{saison.angefragteMenge.toFixed(1)} t</span>
                          </div>
                        )}
                        {saison.tatsaechlicheMenge !== undefined && (
                          <div>
                            <span className="text-gray-600 dark:text-slate-400">Tatsächlich:</span>{' '}
                            <span className="font-medium">{saison.tatsaechlicheMenge.toFixed(1)} t</span>
                          </div>
                        )}
                        {saison.preisProTonne && (
                          <div>
                            <span className="text-gray-600 dark:text-slate-400">Preis:</span>{' '}
                            <span className="font-medium">{formatCurrency(saison.preisProTonne)}/t</span>
                          </div>
                        )}
                        {saison.bezugsweg && (
                          <div>
                            <span className="text-gray-600 dark:text-slate-400">Bezugsweg:</span>{' '}
                            <span className="font-medium">
                              {saison.bezugsweg === 'direkt'
                                ? 'Direkt'
                                : saison.bezugsweg === 'direkt_instandsetzung'
                                ? 'Direkt Instandsetzung'
                                : 'Platzbauer'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Projekte */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Projekte
              </h3>
              <button
                onClick={handleNeuesProjekt}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Neues Projekt
              </button>
            </div>

            {loadingProjekte ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">Lade Projekte...</p>
              </div>
            ) : projekte.length === 0 ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-slate-400 mb-2">Noch keine Projekte vorhanden</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Erstellen Sie ein neues Projekt, um mit der Projektabwicklung zu beginnen.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projekte.map((projekt) => (
                  <div
                    key={(projekt as any).$id || projekt.id}
                    onClick={() => handleProjektClick(projekt)}
                    className="group border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md dark:shadow-dark-md hover:border-green-300 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900 dark:text-slate-100">Saison {projekt.saisonjahr}</span>
                          <StatusBadge status={projekt.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {projekt.angefragteMenge && (
                            <div className="text-gray-600 dark:text-slate-400">
                              Menge: <span className="font-medium text-gray-900 dark:text-slate-100">{projekt.angefragteMenge.toFixed(1)} t</span>
                            </div>
                          )}
                          {projekt.preisProTonne && (
                            <div className="text-gray-600 dark:text-slate-400">
                              Preis: <span className="font-medium text-gray-900 dark:text-slate-100">{formatCurrency(projekt.preisProTonne)}/t</span>
                            </div>
                          )}
                          {projekt.bezugsweg && (
                            <div className="text-gray-600 dark:text-slate-400">
                              Bezugsweg: <span className="font-medium text-gray-900 dark:text-slate-100">
                                {projekt.bezugsweg === 'direkt'
                                  ? 'Direkt'
                                  : projekt.bezugsweg === 'direkt_instandsetzung'
                                  ? 'Direkt Instandsetzung'
                                  : 'Platzbauer'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          {projekt.angebotsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                              <FileCheck className="w-3 h-3 text-blue-500" />
                              Angebot: {projekt.angebotsnummer}
                              {projekt.angebotsdatum && (
                                <span> • {new Date(projekt.angebotsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.auftragsbestaetigungsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                              <FileSignature className="w-3 h-3 text-orange-500" />
                              AB: {projekt.auftragsbestaetigungsnummer}
                              {projekt.auftragsbestaetigungsdatum && (
                                <span> • {new Date(projekt.auftragsbestaetigungsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.lieferscheinnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                              <Truck className="w-3 h-3 text-green-500" />
                              Lieferschein: {projekt.lieferscheinnummer}
                              {projekt.lieferdatum && (
                                <span> • {new Date(projekt.lieferdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.rechnungsnummer && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                              <FileText className="w-3 h-3 text-red-500" />
                              Rechnung: {projekt.rechnungsnummer}
                              {projekt.rechnungsdatum && (
                                <span> • {new Date(projekt.rechnungsdatum).toLocaleDateString('de-DE')}</span>
                              )}
                            </div>
                          )}
                          {projekt.status === 'bezahlt' && projekt.bezahltAm && (
                            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Bezahlt am {new Date(projekt.bezahltAm).toLocaleDateString('de-DE')}
                            </div>
                          )}
                        </div>
                        {projekt.notizen && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-1 italic">
                            "{projekt.notizen}"
                          </div>
                        )}
                      </div>
                      <OpenInNewTabButton to={`/projektabwicklung/${(projekt as any).$id || projekt.id}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bestellhistorie aus dem Altsystem Mosaik (2001–2025).
              Steht bewusst unter den Projekten: die Projekte sind das laufende
              Geschäft, das hier ist Archiv. */}
          {bestellhistorie.length > 0 && (
            <div>
              <button
                onClick={() => setHistorieOffen(!historieOffen)}
                className="w-full flex items-center justify-between mb-4 group"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                  {historieOffen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  <History className="w-5 h-5" />
                  Bestellhistorie (Mosaik)
                </h3>
                <span className="text-sm text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-slate-100">
                  {historieSpanne} · {historieAnzahl} Vorgänge · {formatCurrency(historieSumme)}
                </span>
              </button>

              {historieOffen && (
                <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-slate-400">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Jahr</th>
                          <th className="text-right px-4 py-2 font-medium">Vorgänge</th>
                          <th className="text-right px-4 py-2 font-medium">Umsatz</th>
                          <th className="text-left px-4 py-2 font-medium">Mosaik-Konto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...bestellhistorie].sort((a, b) => b.jahr - a.jahr).map((e) => (
                          <tr key={e.jahr} className="border-t border-gray-100 dark:border-slate-700">
                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-slate-100">{e.jahr}</td>
                            <td className="px-4 py-2 text-right text-gray-600 dark:text-slate-400">{e.anzahl}</td>
                            <td className="px-4 py-2 text-right text-gray-900 dark:text-slate-100">
                              {e.summeEuro > 0 ? formatCurrency(e.summeEuro) : '–'}
                            </td>
                            <td className="px-4 py-2 text-gray-500 dark:text-slate-400 text-xs">
                              {(e.quellen ?? []).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-slate-700">
                        <tr>
                          <td className="px-4 py-2 font-semibold text-gray-900 dark:text-slate-100">Gesamt</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-slate-100">{historieAnzahl}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-slate-100">{formatCurrency(historieSumme)}</td>
                          <td className="px-4 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-slate-700">
                    Archiv aus dem abgelösten System Mosaik. Wird nicht fortgeschrieben — laufende
                    Vorgänge stehen oben unter „Projekte".
                    {mehrereKonten && ' Dieser Kunde wurde aus mehreren Mosaik-Konten zusammengeführt; die Jahre sind addiert.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Aktivitätsverlauf */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Aktivitätsverlauf
              </h3>
              <button
                onClick={() => setShowAddAktivitaet(!showAddAktivitaet)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Aktivität hinzufügen
              </button>
            </div>

            {showAddAktivitaet && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Typ</label>
                  <select
                    value={aktivitaetTyp}
                    onChange={(e) => setAktivitaetTyp(e.target.value as AktivitaetsTyp)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="telefonat">Telefonat</option>
                    <option value="email">E-Mail</option>
                    <option value="kommentar">Kommentar</option>
                    <option value="mengen_aenderung">Mengenänderung</option>
                    <option value="preis_aenderung">Preisänderung</option>
                    <option value="status_aenderung">Statusänderung</option>
                    <option value="beziehung_aenderung">Beziehungsänderung</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Titel</label>
                  <input
                    type="text"
                    value={aktivitaetTitel}
                    onChange={(e) => setAktivitaetTitel(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="z.B. Telefonat mit Platzwart"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-400 mb-1">Beschreibung</label>
                  <textarea
                    value={aktivitaetBeschreibung}
                    onChange={(e) => setAktivitaetBeschreibung(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddAktivitaet}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => {
                      setShowAddAktivitaet(false);
                      setAktivitaetTitel('');
                      setAktivitaetBeschreibung('');
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {aktivitaeten.length === 0 ? (
                <p className="text-gray-500 dark:text-slate-400 text-center py-4">Keine Aktivitäten vorhanden</p>
              ) : (
                aktivitaeten.map((akt) => (
                  <div key={akt.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-slate-100">{akt.titel}</div>
                        {akt.beschreibung && (
                          <div className="text-sm text-gray-600 dark:text-slate-400 mt-1">{akt.beschreibung}</div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                          {new Date(akt.erstelltAm).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {akt.typ}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Projekt-Dialog */}
        {showProjektDialog && (
          <ProjektDialog
            kundenname={kunde.kunde.name}
            kundeId={kunde.kunde.id}
            kundennummer={kunde.kunde.kundennummer}
            // RECHNUNGSADRESSE (wird auf der Rechnung verwendet!)
            kundenstrasse={kunde.kunde.rechnungsadresse.strasse}
            kundenPlzOrt={formatAdresszeile(kunde.kunde.rechnungsadresse.plz, kunde.kunde.rechnungsadresse.ort, kunde.kunde.rechnungsadresse.land)}
            // LIEFERADRESSE (falls abweichend von Rechnungsadresse)
            lieferadresse={
              // Nur übergeben wenn Lieferadresse sich von Rechnungsadresse unterscheidet
              kunde.kunde.lieferadresse.strasse !== kunde.kunde.rechnungsadresse.strasse ||
              kunde.kunde.lieferadresse.plz !== kunde.kunde.rechnungsadresse.plz
                ? {
                    strasse: kunde.kunde.lieferadresse.strasse,
                    plz: kunde.kunde.lieferadresse.plz,
                    ort: kunde.kunde.lieferadresse.ort,
                    land: kunde.kunde.lieferadresse.land,
                  }
                : undefined
            }
            angefragteMenge={kunde.aktuelleSaison?.angefragteMenge}
            preisProTonne={kunde.aktuelleSaison?.preisProTonne || (kunde.kunde.zuletztGezahlterPreis ? Math.round(kunde.kunde.zuletztGezahlterPreis * 1.04 * 100) / 100 : undefined)}
            bezugsweg={kunde.aktuelleSaison?.bezugsweg || kunde.kunde.standardBezugsweg}
            onSave={handleSaveProjekt}
            onCancel={() => setShowProjektDialog(false)}
            saving={savingProjekt}
          />
        )}
      </div>
    </div>
  );
};

// Status Badge Komponente für Projekte
interface StatusBadgeProps {
  status: string;
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    angebot: { label: 'Angebot', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    auftragsbestaetigung: { label: 'Auftragsbestätigung', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    lieferschein: { label: 'Lieferschein', color: 'text-green-700', bgColor: 'bg-green-100' },
    rechnung: { label: 'Rechnung', color: 'text-red-700', bgColor: 'bg-red-100' },
    bezahlt: { label: 'Bezahlt', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  };

  const config = statusConfig[status] || { label: status, color: 'text-gray-700', bgColor: 'bg-gray-100' };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
};

export default KundenDetail;
