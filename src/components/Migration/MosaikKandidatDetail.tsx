import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  Plus,
  SkipForward,
  Search,
  Building2,
  MapPin,
  Phone,
  Mail,
  Banknote,
  Hash,
  History,
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MigrationKandidat,
  MosaikAnsprechpartner,
  FeldDiffEintrag,
} from '../../types/mosaik';
import { KundenTyp, SaisonKunde } from '../../types/saisonplanung';
import { Adresse } from '../../types/dispo';
import {
  berechneFeldDiff,
  findeTopMatches,
} from '../../services/mosaikMatchingService';
import {
  leiteKundentypAb,
  mosaikApplyService,
} from '../../services/mosaikApplyService';
import { mosaikMigrationService } from '../../services/mosaikMigrationService';
import { plzZuBundesland } from '../../utils/plzBundesland';

interface Props {
  kandidat: MigrationKandidat;
  crmKunden: SaisonKunde[];
  crmKundenById: Map<string, SaisonKunde>;
  bearbeiter?: string;
  onClose: () => void;
  onSaved: () => void;
}

type Modus = 'merge' | 'neu';

const FELD_LABEL: Record<string, string> = {
  name: 'Name',
  kundennummer: 'Kundennummer',
  strasse: 'Straße',
  plz: 'PLZ',
  ort: 'Ort',
  bundesland: 'Bundesland',
  email: 'E-Mail',
  telefon: 'Telefon',
  mobil: 'Mobil',
  webseite: 'Webseite',
  ustid: 'USt-IdNr.',
  iban: 'IBAN',
  notizen: 'Notizen',
};

/** Felder, die wir wirklich in `saison_kunden` mergen können. */
const ANWENDBARE_FELDER = new Set([
  'name',
  'kundennummer',
  'strasse',
  'plz',
  'ort',
  'bundesland',
  'email',
  'notizen',
]);

export default function MosaikKandidatDetail({
  kandidat,
  crmKunden,
  crmKundenById,
  bearbeiter,
  onClose,
  onSaved,
}: Props) {
  const rohdaten = kandidat.data.rohdaten;

  const [modus, setModus] = useState<Modus>(kandidat.matchKundeId ? 'merge' : 'neu');
  const [matchId, setMatchId] = useState<string | undefined>(kandidat.matchKundeId);
  const [sucheOffen, setSucheOffen] = useState(false);
  const [suchtext, setSuchtext] = useState('');
  const [notiz, setNotiz] = useState(kandidat.data.notiz ?? '');
  const [speichert, setSpeichert] = useState(false);

  // Pro Mosaik-Kontakt: ankreuzen, ob er angelegt werden soll
  const [kontakteAuswahl, setKontakteAuswahl] = useState<Set<number>>(
    new Set(kandidat.data.ansprechpartner.map((_, i) => i))
  );

  // Neu-Anlegen: Felder direkt editierbar
  const [neuTyp, setNeuTyp] = useState<KundenTyp>(leiteKundentypAb(rohdaten.Gruppe));
  const [neuName, setNeuName] = useState(
    (rohdaten.Name2 || rohdaten.Name3 || rohdaten.Name1 || kandidat.mosaikKurzname).trim()
  );
  const [neuStrasse, setNeuStrasse] = useState(rohdaten.Straße?.trim() ?? '');
  const [neuPlz, setNeuPlz] = useState(rohdaten.PLZ?.trim() ?? '');
  const [neuOrt, setNeuOrt] = useState(rohdaten.Ort?.trim() ?? '');
  const [neuEmail, setNeuEmail] = useState(rohdaten.Kommunikation?.trim() ?? '');
  const [neuNotizen, setNeuNotizen] = useState(rohdaten.Info?.trim() ?? '');

  // Merge: ausgewählter Wert pro Feldnamen
  const matchKunde = matchId ? crmKundenById.get(matchId) : undefined;
  const diff: FeldDiffEintrag[] = useMemo(() => {
    return berechneFeldDiff(rohdaten, matchKunde);
  }, [rohdaten, matchKunde]);

  const [feldWahl, setFeldWahl] = useState<Record<string, 'mosaik' | 'crm'>>({});
  useEffect(() => {
    // beim Match-Wechsel auf die Empfehlung zurücksetzen
    const initial: Record<string, 'mosaik' | 'crm'> = {};
    diff.forEach((d) => {
      initial[d.feld] = d.empfehlung === 'mosaik' ? 'mosaik' : 'crm';
    });
    setFeldWahl(initial);
  }, [diff]);

  const topVorschlaege = useMemo(() => {
    if (matchId) return [];
    return findeTopMatches(rohdaten, crmKunden, 3);
  }, [rohdaten, crmKunden, matchId]);

  const sucheTreffer = useMemo(() => {
    const q = suchtext.trim().toLowerCase();
    if (!q) return [];
    return crmKunden
      .filter((k) => {
        return (
          k.name.toLowerCase().includes(q) ||
          k.kundennummer?.toLowerCase().includes(q) ||
          k.rechnungsadresse?.ort?.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [crmKunden, suchtext]);

  // ----------------------------------------------------------
  // Aktionen
  // ----------------------------------------------------------

  function kontaktToggle(idx: number) {
    setKontakteAuswahl((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function gewaehlteKontakte(): MosaikAnsprechpartner[] {
    return kandidat.data.ansprechpartner.filter((_, i) => kontakteAuswahl.has(i));
  }

  async function zusammenfuehren() {
    if (!matchKunde) {
      toast.error('Kein Match-Kunde gewählt');
      return;
    }
    setSpeichert(true);
    try {
      const patch: Partial<SaisonKunde> = {};
      // Adresse-Felder zusammenbauen
      const r = matchKunde.rechnungsadresse ?? ({ strasse: '', plz: '', ort: '', bundesland: '' } as Adresse);
      const l = matchKunde.lieferadresse ?? r;
      const rNeu: Adresse = { ...r };
      const lNeu: Adresse = { ...l };
      let adresseGeaendert = false;

      for (const d of diff) {
        if (!ANWENDBARE_FELDER.has(d.feld)) continue;
        if (feldWahl[d.feld] !== 'mosaik') continue;
        const wert = d.mosaikWert ?? '';
        switch (d.feld) {
          case 'name':
            patch.name = wert;
            break;
          case 'kundennummer':
            patch.kundennummer = wert;
            break;
          case 'strasse':
            rNeu.strasse = wert;
            lNeu.strasse = wert;
            adresseGeaendert = true;
            break;
          case 'plz':
            rNeu.plz = wert;
            lNeu.plz = wert;
            adresseGeaendert = true;
            break;
          case 'ort':
            rNeu.ort = wert;
            lNeu.ort = wert;
            adresseGeaendert = true;
            break;
          case 'bundesland':
            rNeu.bundesland = wert;
            lNeu.bundesland = wert;
            adresseGeaendert = true;
            break;
          case 'email':
            patch.email = wert;
            break;
          case 'notizen': {
            const bestehend = matchKunde.notizen?.trim() ?? '';
            const mosaikText = wert.trim();
            if (!mosaikText) break;
            if (!bestehend) {
              patch.notizen = mosaikText;
            } else if (!bestehend.includes(mosaikText)) {
              patch.notizen = `${bestehend}\n\n[Mosaik] ${mosaikText}`;
            }
            break;
          }
        }
      }
      if (adresseGeaendert) {
        patch.rechnungsadresse = rNeu;
        patch.lieferadresse = lNeu;
      }

      const ergebnis = await mosaikApplyService.applyZusammenfuehren(
        kandidat,
        {
          kundeId: matchKunde.id,
          patch,
          neueKontakte: gewaehlteKontakte(),
          notiz,
        },
        bearbeiter
      );
      if (ergebnis.fehler) {
        toast.error(`Fehler: ${ergebnis.fehler}`);
      } else {
        toast.success(
          `Zusammengeführt mit ${matchKunde.name} (${ergebnis.angelegteKontakte} neue Kontakte)`
        );
        onSaved();
      }
    } finally {
      setSpeichert(false);
    }
  }

  async function neuAnlegen() {
    setSpeichert(true);
    try {
      const adresse: Adresse = {
        strasse: neuStrasse.trim(),
        plz: neuPlz.trim(),
        ort: neuOrt.trim(),
        bundesland: plzZuBundesland(neuPlz) ?? '',
      };
      const ergebnis = await mosaikApplyService.applyAnlegen(
        kandidat,
        {
          typ: neuTyp,
          name: neuName.trim() || kandidat.mosaikKurzname,
          rechnungsadresse: adresse,
          lieferadresse: adresse,
          email: neuEmail.trim() || undefined,
          notizen: neuNotizen.trim() || undefined,
          aktiv: !(kandidat.mosaikInaktiv ?? false),
        },
        gewaehlteKontakte(),
        bearbeiter,
        notiz
      );
      if (ergebnis.fehler) {
        toast.error(`Fehler: ${ergebnis.fehler}`);
      } else {
        toast.success(`Neuer Kunde "${neuName}" angelegt`);
        onSaved();
      }
    } finally {
      setSpeichert(false);
    }
  }

  async function ueberspringen() {
    setSpeichert(true);
    try {
      await mosaikApplyService.applyUeberspringen(kandidat, notiz, bearbeiter);
      toast.success('Übersprungen');
      onSaved();
    } finally {
      setSpeichert(false);
    }
  }

  async function statusZuruecksetzen() {
    setSpeichert(true);
    try {
      await mosaikMigrationService.setStatus(kandidat.id, 'neu', bearbeiter);
      toast.success('Status auf "Neu" zurückgesetzt');
      onSaved();
    } finally {
      setSpeichert(false);
    }
  }

  function matchWaehlen(id: string) {
    setMatchId(id);
    setModus('merge');
    setSucheOffen(false);
    setSuchtext('');
  }

  function matchLoesen() {
    setMatchId(undefined);
    setModus('neu');
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-dark-surface rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-dark-surface/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
              Mosaik-Kurzname: {kandidat.mosaikKurzname}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">
              {rohdaten.Name2 || rohdaten.Name3 || rohdaten.Name1 || '(ohne Name)'}
            </h2>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-2">
              <span>Status: {kandidat.status}</span>
              {kandidat.mosaikInaktiv && (
                <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Mosaik-inaktiv
                </span>
              )}
              {(kandidat.status === 'angelegt' || kandidat.status === 'bestaetigt') && (
                <button
                  onClick={statusZuruecksetzen}
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-2"
                >
                  Status zurücksetzen
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modus-Switch */}
        <div className="px-6 pt-4 flex gap-2 flex-wrap">
          <button
            onClick={() => matchKunde && setModus('merge')}
            disabled={!matchKunde}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              modus === 'merge' && matchKunde
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            } ${!matchKunde ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Zusammenführen
          </button>
          <button
            onClick={() => setModus('neu')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              modus === 'neu'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Neu anlegen
          </button>
          <button
            onClick={() => {
              setSucheOffen((v) => !v);
              setSuchtext('');
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 inline-flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Match ändern
          </button>
          {matchKunde && (
            <button
              onClick={matchLoesen}
              className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Match lösen
            </button>
          )}
        </div>

        {/* Manuelle Match-Suche */}
        {sucheOffen && (
          <div className="px-6 pt-3">
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/40">
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={suchtext}
                  onChange={(e) => setSuchtext(e.target.value)}
                  placeholder="CRM-Kunde suchen: Name, Kundennummer, Ort …"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                />
              </div>
              {sucheTreffer.length > 0 && (
                <div className="space-y-1">
                  {sucheTreffer.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => matchWaehlen(k.id)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-white dark:hover:bg-gray-800 flex items-center justify-between text-sm"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{k.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {k.kundennummer ?? '—'} · {k.rechnungsadresse?.plz}{' '}
                          {k.rechnungsadresse?.ort}
                        </div>
                      </div>
                      <ArrowRightCircle className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
              {suchtext && sucheTreffer.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2">
                  Keine Treffer.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top-Vorschläge wenn noch kein Match */}
        {!matchKunde && topVorschlaege.length > 0 && (
          <div className="px-6 pt-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Vorschläge
            </div>
            <div className="space-y-1">
              {topVorschlaege.map((t) => (
                <button
                  key={t.kunde.id}
                  onClick={() => matchWaehlen(t.kunde.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-orange-50 dark:hover:bg-gray-800/50 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{t.kunde.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t.kunde.rechnungsadresse?.plz} {t.kunde.rechnungsadresse?.ort} ·{' '}
                      {t.begruendung}
                    </div>
                  </div>
                  <div className="text-sm font-mono text-emerald-600 dark:text-emerald-400">
                    {(t.score * 100).toFixed(0)} %
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hauptinhalt */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Linke Spalte: Mosaik */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-red-600" />
              Mosaik (Quelle)
            </h3>
            <dl className="space-y-1.5 text-sm">
              <Feld icon={Building2} label="Name" wert={rohdaten.Name2} hinweis={rohdaten.Name3 ?? undefined} />
              <Feld icon={Hash} label="Nummer" wert={rohdaten.Nummer} />
              <Feld icon={MapPin} label="Adresse" wert={[rohdaten.Straße, [rohdaten.PLZ, rohdaten.Ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
              <Feld icon={Phone} label="Telefon" wert={rohdaten.Telefon} />
              <Feld icon={Phone} label="Mobil" wert={rohdaten.Mobiltelefon} />
              <Feld icon={Mail} label="E-Mail" wert={rohdaten.Kommunikation} />
              <Feld icon={Banknote} label="IBAN" wert={rohdaten.IBAN} />
              <Feld icon={Building2} label="UStID" wert={rohdaten.UStID} />
              <Feld icon={Building2} label="Gruppe" wert={kandidat.gruppe} />
            </dl>
            {rohdaten.Info && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                {rohdaten.Info}
              </div>
            )}
          </section>

          {/* Rechte Spalte: CRM oder Neu-Anlage */}
          <section>
            {modus === 'merge' && matchKunde ? (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  CRM-Match: {matchKunde.name}
                  {typeof kandidat.matchScore === 'number' && (
                    <span className="text-xs text-gray-500 ml-1">
                      ({(kandidat.matchScore * 100).toFixed(0)} %)
                    </span>
                  )}
                </h3>
                {kandidat.data.matchBegruendung && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    {kandidat.data.matchBegruendung}
                  </div>
                )}
                <div className="space-y-2">
                  {diff.map((d) => (
                    <DiffZeile
                      key={d.feld}
                      d={d}
                      wahl={feldWahl[d.feld]}
                      onWahl={(w) => setFeldWahl((p) => ({ ...p, [d.feld]: w }))}
                      anwendbar={ANWENDBARE_FELDER.has(d.feld)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-orange-600" />
                  Neuer CRM-Kunde
                </h3>
                <div className="space-y-3 text-sm">
                  <FormFeld label="Typ">
                    <select
                      value={neuTyp}
                      onChange={(e) => setNeuTyp(e.target.value as KundenTyp)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    >
                      <option value="verein">Verein / Endkunde</option>
                      <option value="platzbauer">Platzbauer</option>
                    </select>
                  </FormFeld>
                  <FormFeld label="Name">
                    <input
                      value={neuName}
                      onChange={(e) => setNeuName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    />
                  </FormFeld>
                  <FormFeld label="Straße">
                    <input
                      value={neuStrasse}
                      onChange={(e) => setNeuStrasse(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    />
                  </FormFeld>
                  <div className="grid grid-cols-3 gap-2">
                    <FormFeld label="PLZ">
                      <input
                        value={neuPlz}
                        onChange={(e) => setNeuPlz(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                      />
                    </FormFeld>
                    <div className="col-span-2">
                      <FormFeld label="Ort">
                        <input
                          value={neuOrt}
                          onChange={(e) => setNeuOrt(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                        />
                      </FormFeld>
                    </div>
                  </div>
                  <FormFeld
                    label={`Bundesland (aus PLZ: ${plzZuBundesland(neuPlz) ?? '—'})`}
                  >
                    <input
                      readOnly
                      value={plzZuBundesland(neuPlz) ?? ''}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600"
                    />
                  </FormFeld>
                  <FormFeld label="E-Mail">
                    <input
                      value={neuEmail}
                      onChange={(e) => setNeuEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    />
                  </FormFeld>
                  <FormFeld label="Notizen">
                    <textarea
                      value={neuNotizen}
                      onChange={(e) => setNeuNotizen(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    />
                  </FormFeld>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Kontakte */}
        {kandidat.data.ansprechpartner.length > 0 && (
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-600" />
              Ansprechpartner aus Mosaik ({kandidat.data.ansprechpartner.length})
            </h3>
            <div className="space-y-1.5">
              {kandidat.data.ansprechpartner.map((a, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <input
                    type="checkbox"
                    checked={kontakteAuswahl.has(i)}
                    onChange={() => kontaktToggle(i)}
                    className="mt-1"
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {a.Ansprechpartner || '(ohne Namen)'}
                      {a.Position && (
                        <span className="font-normal text-gray-500 ml-2">— {a.Position}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4">
                      {a.Telefon && <span>Tel: {a.Telefon}</span>}
                      {a.Mobiltelefon && <span>Mobil: {a.Mobiltelefon}</span>}
                      {a.Kommunikation && <span>E-Mail: {a.Kommunikation}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Historie als Kontext */}
        {(kandidat.data.bestellhistorie || kandidat.data.zahlungsverhalten) && (
          <div className="px-6 pb-4">
            <details className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <History className="w-4 h-4" /> Bestellhistorie & Zahlungsverhalten (Kontext)
              </summary>
              <div className="p-4 text-xs space-y-3 text-gray-700 dark:text-gray-300">
                {kandidat.data.zahlungsverhalten && (
                  <div>
                    <strong>Zahlungen:</strong>{' '}
                    {kandidat.data.zahlungsverhalten.anzahl_buchungen} Buchungen, max. Mahnstufe{' '}
                    {kandidat.data.zahlungsverhalten.max_mahnstufe}, letzte am{' '}
                    {kandidat.data.zahlungsverhalten.letzte_buchung ?? '—'}
                  </div>
                )}
                {kandidat.data.bestellhistorie && (
                  <div>
                    <strong>Vorgänge je Jahr:</strong>
                    <div className="mt-1 font-mono grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {Object.entries(kandidat.data.bestellhistorie)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([jahr, info]) => (
                          <div key={jahr}>
                            {jahr}: {info.anzahl}
                          </div>
                        ))}
                    </div>
                    <div className="mt-2 text-amber-700 dark:text-amber-400">
                      ⚠ Summen-Werte sind in Mosaik skaliert und werden hier nicht
                      übernommen, bis Skalierungsfaktor verifiziert ist.
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Notiz + Aktionen */}
        <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Notiz zu dieser Entscheidung
            </label>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={2}
              placeholder="Optional: Warum diese Entscheidung getroffen wurde …"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={ueberspringen}
              disabled={speichert}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              <SkipForward className="w-4 h-4" />
              Überspringen
            </button>
            {modus === 'merge' ? (
              <button
                onClick={zusammenfuehren}
                disabled={speichert || !matchKunde}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white font-medium hover:from-emerald-700 hover:to-green-700 disabled:opacity-40"
              >
                <Save className="w-4 h-4" />
                Zusammenführen
              </button>
            ) : (
              <button
                onClick={neuAnlegen}
                disabled={speichert || !neuName.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 text-white font-medium hover:from-red-700 hover:to-orange-700 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                Neu anlegen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-Komponenten
// ============================================================

function Feld({
  icon: Icon,
  label,
  wert,
  hinweis,
}: {
  icon: typeof Building2;
  label: string;
  wert: string | null | undefined;
  hinweis?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-1" />
      <div className="flex-1 min-w-0">
        <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </dt>
        <dd className="text-sm text-gray-900 dark:text-gray-100 break-words">
          {wert || <span className="text-gray-400">—</span>}
          {hinweis && (
            <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal">
              {hinweis}
            </span>
          )}
        </dd>
      </div>
    </div>
  );
}

function FormFeld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function DiffZeile({
  d,
  wahl,
  onWahl,
  anwendbar,
}: {
  d: FeldDiffEintrag;
  wahl: 'mosaik' | 'crm' | undefined;
  onWahl: (w: 'mosaik' | 'crm') => void;
  anwendbar: boolean;
}) {
  const beideLeer = !d.mosaikWert && !d.crmWert;
  const gleich = d.mosaikWert === d.crmWert;

  return (
    <div
      className={`grid grid-cols-2 gap-2 p-2 rounded-lg border text-sm ${
        gleich
          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
          : 'border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
      }`}
    >
      <div className="col-span-2 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 flex justify-between">
        <span>{FELD_LABEL[d.feld] ?? d.feld}</span>
        {!anwendbar && (
          <span className="text-gray-400">nur Info — wird nicht übernommen</span>
        )}
      </div>
      <label
        className={`flex items-start gap-2 p-2 rounded cursor-pointer ${
          wahl === 'mosaik' && anwendbar
            ? 'bg-white dark:bg-gray-800 ring-2 ring-orange-500'
            : 'bg-white/60 dark:bg-gray-800/40'
        } ${!anwendbar || beideLeer ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="radio"
          checked={wahl === 'mosaik'}
          onChange={() => onWahl('mosaik')}
          disabled={!anwendbar || beideLeer}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-orange-700 dark:text-orange-400">Mosaik</div>
          <div className="break-words text-gray-900 dark:text-gray-100">
            {d.mosaikWert || <span className="text-gray-400">—</span>}
          </div>
        </div>
      </label>
      <label
        className={`flex items-start gap-2 p-2 rounded cursor-pointer ${
          wahl === 'crm' && anwendbar
            ? 'bg-white dark:bg-gray-800 ring-2 ring-emerald-500'
            : 'bg-white/60 dark:bg-gray-800/40'
        } ${!anwendbar || beideLeer ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="radio"
          checked={wahl === 'crm'}
          onChange={() => onWahl('crm')}
          disabled={!anwendbar || beideLeer}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400">CRM</div>
          <div className="break-words text-gray-900 dark:text-gray-100">
            {d.crmWert || <span className="text-gray-400">—</span>}
          </div>
        </div>
      </label>
    </div>
  );
}
