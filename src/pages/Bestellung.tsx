import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Loader2, Package, MapPin, Truck, Phone, AlertTriangle,
  ChevronDown, ChevronUp, ShoppingCart, FileText, CalendarDays, Camera, X, ImagePlus,
} from 'lucide-react';
import { verkleinereBild } from '../utils/bildVerkleinern';

/**
 * Bestellseite für Kunden — öffentlich, ohne Login, über einen Token geschützt.
 *
 * Gestaltungsregel: Der Regelfall ist EIN Klick. Wer nichts ändern will, sieht
 * das Angebot und einen Knopf. Alles Anpassbare liegt zugeklappt darunter.
 *
 * Die Seite spricht ausschließlich mit `/.netlify/functions/bestellung` — nie
 * direkt mit der Datenbank. Was sie anzeigt, hat der Server freigegeben.
 */

const API = '/.netlify/functions/bestellung';

interface Position {
  artikelnummer?: string; bezeichnung?: string; menge?: number;
  einheit?: string; einzelpreis?: number; gesamtpreis?: number;
}
interface Adresse { strasse?: string; plz?: string; ort?: string }
interface Daten {
  kundenname?: string; angebotsnummer?: string; status?: string;
  bestelltAm?: string | null; rechnungsnummer?: string | null; rechnungsdatum?: string | null;
  lieferwoche?: string | null; positionen: Position[]; summe: number; tonnage: number;
  mengeMin: number; mengeMax: number;
  rechnungsadresse?: Adresse | null; lieferadresse?: Adresse | null;
  dispoAnsprechpartner?: { name?: string; telefon?: string; email?: string } | null;
  fotos: Array<{ fileId: string; hinweis?: string }>;
  maxFotos: number;
}

const euro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Bestellung() {
  const { projektId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  // Aus der Sandbox erzeugte Links tragen `sandbox=1` — die Function liest dann
  // aus der Sandbox-Datenbank statt aus der Produktion.
  const sandbox = params.get('sandbox') === '1';

  const [daten, setDaten] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [anpassen, setAnpassen] = useState(false);

  // Formularwerte
  const [menge, setMenge] = useState<string>('');
  const [lieferwoche, setLieferwoche] = useState('');
  const [rechnung, setRechnung] = useState<Adresse>({});
  const [lieferung, setLieferung] = useState<Adresse>({});
  const [dispo, setDispo] = useState({ name: '', telefon: '', email: '' });
  const [hinweis, setHinweis] = useState('');
  const [fotoLaeuft, setFotoLaeuft] = useState(false);

  /**
   * Bild auswählen, verkleinern, hochladen.
   *
   * Die Verkleinerung passiert VOR dem Upload — sie bringt die Datei unter das
   * Größenlimit und entfernt nebenbei die GPS-Daten aus dem Handyfoto.
   */
  const fotoHochladen = async (datei: File) => {
    setFotoLaeuft(true);
    setFehler(null);
    try {
      const klein = await verkleinereBild(datei);
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projektId, token, sandbox, aktion: 'foto-hochladen', datei: klein.dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) { setFehler(body.error ?? 'Das Bild konnte nicht gespeichert werden.'); return; }
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das Bild konnte nicht verarbeitet werden.');
    } finally { setFotoLaeuft(false); }
  };

  const fotoLoeschen = async (fileId: string) => {
    setFotoLaeuft(true);
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projektId, token, sandbox, aktion: 'foto-loeschen', fileId }),
      });
      await laden();
    } finally { setFotoLaeuft(false); }
  };

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const res = await fetch(
        `${API}?projektId=${encodeURIComponent(projektId)}&token=${encodeURIComponent(token)}${sandbox ? '&sandbox=1' : ''}`
      );
      const body = await res.json();
      if (!res.ok) { setFehler(body.error ?? 'Das Angebot konnte nicht geladen werden.'); return; }
      setDaten(body);
      setMenge(String(body.tonnage ?? ''));
      setLieferwoche(body.lieferwoche ?? '');
      setRechnung(body.rechnungsadresse ?? {});
      setLieferung(body.lieferadresse ?? {});
      setDispo({
        name: body.dispoAnsprechpartner?.name ?? '',
        telefon: body.dispoAnsprechpartner?.telefon ?? '',
        email: body.dispoAnsprechpartner?.email ?? '',
      });
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte versuchen Sie es später erneut.');
    } finally { setLaedt(false); }
  }, [projektId, token, sandbox]);

  useEffect(() => { void laden(); }, [laden]);

  const senden = async (aktion: 'bestellen' | 'aktualisieren') => {
    setSendet(true);
    setFehler(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projektId, token, aktion, sandbox,
          menge: Number(menge.replace(',', '.')),
          lieferwoche, rechnungsadresse: rechnung, lieferadresse: lieferung,
          dispoAnsprechpartner: dispo, hinweis,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setFehler(body.error ?? 'Es ist ein Fehler aufgetreten.'); return; }
      setHinweis('');
      await laden();
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    } finally { setSendet(false); }
  };

  if (laedt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (fehler && !daten) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <p className="text-gray-800 mb-6">{fehler}</p>
          <a href="tel:+4993919870" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white">
            <Phone className="w-4 h-4" /> 09391 9870-0
          </a>
        </div>
      </div>
    );
  }

  if (!daten) return null;
  const bestellt = !!daten.bestelltAm;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        <header className="text-center pb-2">
          <p className="text-sm text-gray-500">Tennismehl GmbH</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {bestellt ? 'Ihre Bestellung' : 'Ihr Angebot'}
          </h1>
          <p className="text-gray-600 mt-1">
            {daten.kundenname} · {daten.angebotsnummer}
          </p>
        </header>

        {/* Nach der Bestellung steht die Bestätigung ganz oben — das ist die
            Information, wegen der jemand die Seite erneut öffnet. */}
        {bestellt && (
          <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <p className="font-semibold text-green-900">Bestellung eingegangen</p>
            <p className="text-sm text-green-800 mt-1">
              am {new Date(daten.bestelltAm!).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
              {' '}· Wir melden uns zur Terminabstimmung.
            </p>
            {daten.rechnungsnummer && (
              <p className="text-sm text-green-800 mt-2 flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4" /> Rechnung {daten.rechnungsnummer}
                {daten.rechnungsdatum && ` vom ${new Date(daten.rechnungsdatum).toLocaleDateString('de-DE')}`}
              </p>
            )}
          </div>
        )}

        {/* Was bestellt wird */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-400" /> Leistungen
          </h2>
          <ul className="divide-y divide-gray-100">
            {daten.positionen.map((p, i) => (
              <li key={p.artikelnummer ?? i} className="py-2.5 flex justify-between gap-4">
                <span className="text-gray-800">
                  {p.bezeichnung}
                  <span className="block text-sm text-gray-500">
                    {p.menge} {p.einheit} × {euro(Number(p.einzelpreis ?? 0))} €
                  </span>
                </span>
                <span className="font-medium text-gray-900 whitespace-nowrap">
                  {euro(Number(p.gesamtpreis ?? 0))} €
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between items-baseline">
            <span className="text-gray-600">Summe netto</span>
            <span className="text-xl font-bold text-gray-900">{euro(daten.summe)} €</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">zzgl. 19 % MwSt. · Es gelten unsere AGB.</p>
        </section>

        {/* Adressen — der Kunde muss sehen, wohin geliefert wird */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 grid sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
              <FileText className="w-4 h-4 text-gray-400" /> Rechnung an
            </h3>
            <p className="text-sm text-gray-700">
              {rechnung.strasse}<br />{rechnung.plz} {rechnung.ort}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1">
              <MapPin className="w-4 h-4 text-gray-400" /> Lieferung an
            </h3>
            <p className="text-sm text-gray-700">
              {lieferung.strasse
                ? <>{lieferung.strasse}<br />{lieferung.plz} {lieferung.ort}</>
                : <span className="text-gray-500">wie Rechnungsanschrift</span>}
            </p>
          </div>
        </section>

        {/* Der eine Knopf */}
        {!bestellt && (
          <button
            onClick={() => void senden('bestellen')}
            disabled={sendet}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-lg font-semibold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {sendet ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
            Verbindlich bestellen
          </button>
        )}

        {fehler && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{fehler}</p>
        )}

        {/* Alles Anpassbare — zugeklappt, damit der Regelfall ein Klick bleibt */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setAnpassen((v) => !v)}
            className="w-full px-5 py-4 flex items-center justify-between text-left"
          >
            <span className="font-medium text-gray-900">
              {bestellt ? 'Angaben zur Lieferung ergänzen' : 'Etwas stimmt nicht?'}
            </span>
            {anpassen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {anpassen && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
              {!bestellt && (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Menge (Tonnen)</span>
                  <input type="number" step="0.25" value={menge} onChange={(e) => setMenge(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300" />
                  <span className="text-xs text-gray-500">
                    Anpassbar zwischen {daten.mengeMin} und {daten.mengeMax} t. Für größere Änderungen rufen Sie uns an.
                  </span>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-gray-400" /> Wunsch-Lieferwoche
                </span>
                <input value={lieferwoche} onChange={(e) => setLieferwoche(e.target.value)}
                  placeholder="z. B. KW 12 oder ab 20.03."
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300" />
              </label>

              <fieldset className="grid sm:grid-cols-2 gap-3">
                <legend className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-gray-400" /> Ansprechpartner für die Anlieferung
                </legend>
                <input value={dispo.name} onChange={(e) => setDispo({ ...dispo, name: e.target.value })}
                  placeholder="Name" className="px-3 py-2.5 rounded-xl border border-gray-300" />
                <input value={dispo.telefon} onChange={(e) => setDispo({ ...dispo, telefon: e.target.value })}
                  placeholder="Telefon" className="px-3 py-2.5 rounded-xl border border-gray-300" />
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700 mb-1">Lieferadresse</legend>
                <input value={lieferung.strasse ?? ''} onChange={(e) => setLieferung({ ...lieferung, strasse: e.target.value })}
                  placeholder="Straße und Hausnummer" className="w-full px-3 py-2.5 rounded-xl border border-gray-300" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={lieferung.plz ?? ''} onChange={(e) => setLieferung({ ...lieferung, plz: e.target.value })}
                    placeholder="PLZ" className="px-3 py-2.5 rounded-xl border border-gray-300" />
                  <input value={lieferung.ort ?? ''} onChange={(e) => setLieferung({ ...lieferung, ort: e.target.value })}
                    placeholder="Ort" className="col-span-2 px-3 py-2.5 rounded-xl border border-gray-300" />
                </div>
              </fieldset>

              {/* Fotos der Schüttstelle — der eigentliche Zeitgewinn: Der Fahrer
                  sieht vor der Abfahrt, wo er hinsoll, statt vor Ort anzurufen. */}
              <div>
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-gray-400" /> Fotos der Schüttstelle
                </span>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Wo soll das Material abgeladen werden? Ein Bild spart dem Fahrer den Anruf.
                  Bis zu {daten.maxFotos} Bilder.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {daten.fotos.map((f) => (
                    <div key={f.fileId} className="relative">
                      <img
                        src={`${API}?projektId=${encodeURIComponent(projektId)}&token=${encodeURIComponent(token)}&foto=${encodeURIComponent(f.fileId)}${sandbox ? '&sandbox=1' : ''}`}
                        alt="Schüttstelle"
                        className="w-24 h-24 object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        onClick={() => void fotoLoeschen(f.fileId)}
                        disabled={fotoLaeuft}
                        aria-label="Bild entfernen"
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center text-gray-500 hover:text-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {daten.fotos.length < daten.maxFotos && (
                    <label className={`w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gray-400 hover:bg-gray-50 ${fotoLaeuft ? 'opacity-50 pointer-events-none' : ''}`}>
                      {fotoLaeuft
                        ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        : <><ImagePlus className="w-6 h-6 text-gray-400" /><span className="text-xs text-gray-500">Foto</span></>}
                      <input
                        type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => {
                          const datei = e.target.files?.[0];
                          e.target.value = '';
                          if (datei) void fotoHochladen(datei);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Hinweise zur Anlieferung
                </span>
                <textarea value={hinweis} onChange={(e) => setHinweis(e.target.value)} rows={3}
                  placeholder="Wo soll abgeschüttet werden? Zufahrt, Tor, Ansprechzeiten…"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300" />
              </label>

              <button onClick={() => void senden('aktualisieren')} disabled={sendet}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {sendet ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Angaben speichern
              </button>
            </div>
          )}
        </section>

        <footer className="text-center text-sm text-gray-500 pt-2 pb-8">
          <p>Fragen? Wir sind für Sie da.</p>
          <a href="tel:+4993919870" className="inline-flex items-center gap-1.5 mt-1 text-slate-800 font-medium">
            <Phone className="w-4 h-4" /> 09391 9870-0
          </a>
          <p className="mt-3 text-xs text-gray-400">
            Tennismehl GmbH · Raiffeisenweg 1 · 97232 Giebelstadt
          </p>
        </footer>
      </div>
    </div>
  );
}
