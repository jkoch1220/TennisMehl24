import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Loader2, Package, MapPin, Truck, Phone, AlertTriangle,
  ChevronDown, ChevronUp, ShoppingCart, FileText, CalendarDays, Camera, X, ImagePlus,
} from 'lucide-react';
import { verkleinereBild } from '../utils/bildVerkleinern';
import { OptionalNumberInput } from '../components/NumberInput';

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
  artikelnummer?: string; bezeichnung?: string; beschreibung?: string; menge?: number;
  einheit?: string; einzelpreis?: number; gesamtpreis?: number; istBedarfsposition?: boolean;
}
interface Adresse { strasse?: string; plz?: string; ort?: string }
interface Konditionen {
  zahlungsziel?: string | null; lieferzeit?: string | null; lieferbedingungen?: string | null;
  klauseln?: Array<{ titel: string; text: string }>; dieselpreiszuschlag?: string | null;
}
/** Netto, Steuer, Brutto – kommt vom Server, damit der Satz aus dem Angebot gilt. */
interface Summen {
  netto: number; steuer: number; brutto: number;
  mehrwertsteuersatz: number; ohneMehrwertsteuer: boolean;
}
interface Daten extends Summen {
  rechnungsadresseAenderbar?: boolean;
  kundenname?: string; angebotsnummer?: string; status?: string;
  angebotsdatum?: string | null; gueltigBis?: string | null;
  bestelltAm?: string | null; rechnungsnummer?: string | null; rechnungsdatum?: string | null;
  lieferwoche?: string | null; positionen: Position[]; bedarfspositionen?: Position[];
  summe: number; tonnage: number;
  mengeMin: number; mengeMax: number;
  konditionen?: Konditionen;
  rechnungsadresse?: Adresse | null; lieferadresse?: Adresse | null;
  dispoAnsprechpartner?: { name?: string; telefon?: string; email?: string } | null;
  fotos: Array<{ fileId: string; hinweis?: string }>;
  maxFotos: number;
}
/** Ergebnis der Server-Vorschau für eine geänderte Menge. */
interface Vorschau extends Summen { positionen: Position[]; summe: number; tonnage: number }

const euro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahl = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const datum = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/** Fracht und Verpackung stehen im Summenblock, nicht zwischen der Ware. */
const FRACHT_ARTIKEL = new Set(['TM-FP']);
const istFracht = (p: Position) => FRACHT_ARTIKEL.has(String(p.artikelnummer ?? '').toUpperCase());

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
  const [konditionenOffen, setKonditionenOffen] = useState(false);
  const [rechnungBearbeiten, setRechnungBearbeiten] = useState(false);
  const [lieferungBearbeiten, setLieferungBearbeiten] = useState(false);
  // Ergebnis der Server-Vorschau, solange die Menge vom Angebot abweicht.
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [vorschauFehler, setVorschauFehler] = useState<string | null>(null);

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

  /**
   * Vorschau für eine geänderte Menge — gerechnet wird auf dem Server.
   *
   * Der Kunde sah bisher erst in der Bestätigungsmail, was seine Mengenänderung
   * kostet: Die Frachtpauschale ist gestaffelt, aus 5 t werden 6 t und die
   * Fracht sinkt von 59,90 auf 49,90 €. Die Staffel bleibt bewusst auf dem
   * Server, statt ein drittes Mal in den Browser kopiert zu werden.
   */
  useEffect(() => {
    if (!daten) return;
    // Nach der Bestellung zählt nur noch der bestellte Stand. Ohne dieses
    // Leeren überlebte eine offene Vorschau den Klick — und wenn jemand aus
    // demselben Verteiler zuerst bestellt hat, stünden unter „Ihre Bestellung"
    // die Zahlen einer Menge, die nie jemand bestellt hat.
    if (daten.bestelltAm) {
      setVorschau(null);
      setVorschauFehler(null);
      return;
    }
    const gewuenscht = Number(menge.replace(',', '.'));
    if (!Number.isFinite(gewuenscht) || gewuenscht <= 0 || Math.abs(gewuenscht - daten.tonnage) < 0.001) {
      setVorschau(null);
      setVorschauFehler(null);
      return;
    }
    const abbruch = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abbruch.signal,
          body: JSON.stringify({ projektId, token, sandbox, aktion: 'vorschau', menge: gewuenscht }),
        });
        const body = await res.json();
        if (!res.ok) { setVorschau(null); setVorschauFehler(body.error ?? null); return; }
        setVorschau(body as Vorschau);
        setVorschauFehler(null);
      } catch {
        /* Abgebrochen oder offline: die Seite bleibt beim Angebotsstand. */
      }
    }, 400);
    return () => { clearTimeout(timer); abbruch.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menge, daten?.tonnage, daten?.bestelltAm, projektId, token, sandbox]);

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

  // Solange eine Vorschau vorliegt, zeigt die Seite deren Zahlen — sonst das
  // Angebot. Nach der Bestellung gilt ausnahmslos der bestellte Stand; die
  // Prüfung auf `bestellt` steht hier zusätzlich zum Leeren im Effekt oben,
  // damit zwischen Bestellung und nächstem Rendern nichts durchrutscht.
  const geaendert = !bestellt && !!vorschau;
  const anzeigePositionen = geaendert ? vorschau!.positionen : daten.positionen;
  const summen: Summen = geaendert ? vorschau! : daten;
  const anzeigeTonnage = geaendert ? vorschau!.tonnage : daten.tonnage;
  const warenPositionen = anzeigePositionen.filter((p) => !istFracht(p));
  const frachtPositionen = anzeigePositionen.filter(istFracht);

  const k = daten.konditionen;
  const hatKonditionen = !!(
    k?.zahlungsziel || k?.lieferzeit || k?.lieferbedingungen || k?.klauseln?.length || k?.dieselpreiszuschlag
  );

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
                {daten.rechnungsdatum && ` vom ${datum(daten.rechnungsdatum)}`}
              </p>
            )}
          </div>
        )}

        {/* Was bestellt wird. Zeigt die Vorschau, sobald die Menge geändert wurde —
            der Kunde soll vor dem verbindlichen Klick sehen, was er zahlt. */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" /> {bestellt ? 'Ihre Bestellung' : 'Leistungen'}
            </h2>
            {!bestellt && daten.gueltigBis && (
              <span className="text-sm text-gray-500 whitespace-nowrap">
                gültig bis {datum(daten.gueltigBis)}
              </span>
            )}
          </div>

          {geaendert && (
            <p className="mb-3 text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
              Vorschau für {zahl(anzeigeTonnage)} t. Verbindlich wird sie mit Ihrer Bestellung.
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {warenPositionen.map((p, i) => (
              <li key={p.artikelnummer ?? i} className="py-2.5 flex justify-between gap-4">
                <span className="text-gray-800">
                  {p.bezeichnung}
                  {p.beschreibung && (
                    <span className="block text-sm text-gray-500 whitespace-pre-line">{p.beschreibung}</span>
                  )}
                  <span className="block text-sm text-gray-500">
                    {zahl(Number(p.menge ?? 0))} {p.einheit} × {euro(Number(p.einzelpreis ?? 0))} €
                  </span>
                </span>
                <span className="font-medium text-gray-900 whitespace-nowrap">
                  {euro(Number(p.gesamtpreis ?? 0))} €
                </span>
              </li>
            ))}
          </ul>

          {/* Summenblock: Fracht abgesetzt, Steuer und Bruttobetrag ausgewiesen.
              Für einen Verein ist der Bruttobetrag die Zahl, die zählt. */}
          <div className="border-t border-gray-200 mt-3 pt-3 space-y-1.5 text-sm">
            {frachtPositionen.map((p, i) => (
              <div key={i} className="flex justify-between text-gray-600">
                <span>{p.bezeichnung ?? 'Frachtkostenpauschale'}</span>
                <span className="whitespace-nowrap">{euro(Number(p.gesamtpreis ?? 0))} €</span>
              </div>
            ))}
            <div className="flex justify-between text-gray-600">
              <span>Summe netto</span>
              <span className="whitespace-nowrap">{euro(summen.netto)} €</span>
            </div>
            {!summen.ohneMehrwertsteuer && (
              <div className="flex justify-between text-gray-600">
                <span>zzgl. {zahl(summen.mehrwertsteuersatz)} % MwSt.</span>
                <span className="whitespace-nowrap">{euro(summen.steuer)} €</span>
              </div>
            )}
            <div className="flex justify-between items-baseline border-t border-gray-200 pt-2 mt-1">
              <span className="font-semibold text-gray-900">
                {summen.ohneMehrwertsteuer ? 'Gesamtbetrag' : 'Gesamtbetrag brutto'}
              </span>
              <span className="text-xl font-bold text-gray-900 whitespace-nowrap">{euro(summen.brutto)} €</span>
            </div>
          </div>

          {summen.ohneMehrwertsteuer && (
            <p className="text-xs text-gray-500 mt-2">
              Ohne Umsatzsteuer (Steuerschuldnerschaft des Leistungsempfängers).
            </p>
          )}

          {/* Optionales, das nicht in der Summe steckt — im PDF eine eigene Tabelle. */}
          {!!daten.bedarfspositionen?.length && (
            <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
              <p className="text-sm font-medium text-gray-700">Optional, nicht im Gesamtbetrag</p>
              <ul className="mt-1 space-y-1">
                {daten.bedarfspositionen.map((p, i) => (
                  <li key={i} className="flex justify-between gap-4 text-sm text-gray-600">
                    <span>
                      {p.bezeichnung}
                      <span className="text-gray-400 whitespace-nowrap"> · {zahl(Number(p.menge ?? 0))} {p.einheit}</span>
                    </span>
                    <span className="whitespace-nowrap">{euro(Number(p.gesamtpreis ?? 0))} €</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-1.5">
                Auf Wunsch — sagen Sie uns einfach Bescheid.
              </p>
            </div>
          )}
        </section>

        {/* Adressen — beide direkt hier änderbar. Vorher lag nur die
            Lieferadresse zugeklappt unter „Etwas stimmt nicht?", und für die
            Rechnungsanschrift gab es überhaupt kein Feld, obwohl die
            Angebotsmail „Adressen … können Sie dort anpassen" verspricht. */}
        <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 grid sm:grid-cols-2 gap-5">
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-400" /> Rechnung an
              </h3>
              {daten.rechnungsadresseAenderbar && !rechnungBearbeiten && (
                <button onClick={() => setRechnungBearbeiten(true)}
                  className="text-sm text-slate-700 underline underline-offset-2">Ändern</button>
              )}
            </div>
            {rechnungBearbeiten ? (
              <div className="space-y-2">
                <input value={rechnung.strasse ?? ''} onChange={(e) => setRechnung({ ...rechnung, strasse: e.target.value })}
                  placeholder="Straße und Hausnummer" aria-label="Rechnungsanschrift, Straße und Hausnummer"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={rechnung.plz ?? ''} onChange={(e) => setRechnung({ ...rechnung, plz: e.target.value })}
                    placeholder="PLZ" aria-label="Rechnungsanschrift, PLZ" inputMode="numeric"
                    className="px-3 py-2 rounded-xl border border-gray-300" />
                  <input value={rechnung.ort ?? ''} onChange={(e) => setRechnung({ ...rechnung, ort: e.target.value })}
                    placeholder="Ort" aria-label="Rechnungsanschrift, Ort"
                    className="col-span-2 px-3 py-2 rounded-xl border border-gray-300" />
                </div>
                <p className="text-xs text-gray-500">Wird mit „Adressen speichern“ übernommen.</p>
              </div>
            ) : (
              <p className="text-sm text-gray-700">
                {rechnung.strasse}<br />{rechnung.plz} {rechnung.ort}
              </p>
            )}
            {!daten.rechnungsadresseAenderbar && (
              <p className="text-xs text-gray-500 mt-1">
                Änderungen bitte telefonisch — die Rechnung ist bereits erstellt
                oder läuft über Ihren Platzbauer.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" /> Lieferung an
              </h3>
              {!lieferungBearbeiten && (
                <button onClick={() => setLieferungBearbeiten(true)}
                  className="text-sm text-slate-700 underline underline-offset-2">Ändern</button>
              )}
            </div>
            {lieferungBearbeiten ? (
              <div className="space-y-2">
                <input value={lieferung.strasse ?? ''} onChange={(e) => setLieferung({ ...lieferung, strasse: e.target.value })}
                  placeholder="Straße und Hausnummer" aria-label="Lieferanschrift, Straße und Hausnummer"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={lieferung.plz ?? ''} onChange={(e) => setLieferung({ ...lieferung, plz: e.target.value })}
                    placeholder="PLZ" aria-label="Lieferanschrift, PLZ" inputMode="numeric"
                    className="px-3 py-2 rounded-xl border border-gray-300" />
                  <input value={lieferung.ort ?? ''} onChange={(e) => setLieferung({ ...lieferung, ort: e.target.value })}
                    placeholder="Ort" aria-label="Lieferanschrift, Ort"
                    className="col-span-2 px-3 py-2 rounded-xl border border-gray-300" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">Wird mit „Adressen speichern“ übernommen.</p>
                  {(lieferung.strasse || lieferung.plz || lieferung.ort) && (
                    <button onClick={() => setLieferung({})}
                      className="text-xs text-slate-700 underline underline-offset-2 whitespace-nowrap">
                      Wie Rechnungsanschrift
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700">
                {lieferung.strasse
                  ? <>{lieferung.strasse}<br />{lieferung.plz} {lieferung.ort}</>
                  : <span className="text-gray-500">wie Rechnungsanschrift</span>}
              </p>
            )}
          </div>

          {/* Der Knopf gehört hierher: „Angaben speichern" liegt weiter unten im
              zugeklappten Bereich und wäre von hier aus nicht auffindbar. */}
          {(rechnungBearbeiten || lieferungBearbeiten) && (
            <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
              <button
                onClick={async () => {
                  await senden('aktualisieren');
                  setRechnungBearbeiten(false);
                  setLieferungBearbeiten(false);
                }}
                disabled={sendet}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendet ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Adressen speichern
              </button>
              <button
                onClick={() => {
                  // Verworfen heißt: zurück auf den Stand vom Server.
                  setRechnung(daten.rechnungsadresse ?? {});
                  setLieferung(daten.lieferadresse ?? {});
                  setRechnungBearbeiten(false);
                  setLieferungBearbeiten(false);
                }}
                disabled={sendet}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium disabled:opacity-50"
              >
                Abbrechen
              </button>
            </div>
          )}
        </section>

        {/* Konditionen — im Angebots-PDF stehen sie, hier fehlten sie ganz.
            Zugeklappt, damit der Regelfall ein Klick bleibt. */}
        {hatKonditionen && (
          <section className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setKonditionenOffen((v) => !v)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <span className="font-medium text-gray-900">Liefer- und Zahlungsbedingungen</span>
              {konditionenOffen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {konditionenOffen && (
              <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-3 text-sm text-gray-700">
                {k?.zahlungsziel && (
                  <p><span className="font-medium text-gray-900">Zahlungsziel:</span> {k.zahlungsziel}</p>
                )}
                {k?.lieferzeit && (
                  <p><span className="font-medium text-gray-900">Lieferzeit:</span> {k.lieferzeit}</p>
                )}
                {k?.lieferbedingungen && (
                  <p className="whitespace-pre-line">{k.lieferbedingungen}</p>
                )}
                {k?.klauseln?.map((kl, i) => (
                  <div key={i}>
                    {kl.titel && <p className="font-medium text-gray-900">{kl.titel}</p>}
                    <p className="whitespace-pre-line text-gray-600">{kl.text}</p>
                  </div>
                ))}
                {k?.dieselpreiszuschlag && (
                  <p className="whitespace-pre-line text-gray-600">{k.dieselpreiszuschlag}</p>
                )}
                <p className="text-xs text-gray-500 pt-1">Es gelten unsere Allgemeinen Geschäftsbedingungen.</p>
              </div>
            )}
          </section>
        )}

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
                  <OptionalNumberInput step="0.25" value={menge === '' ? null : Number(menge)}
                    onChange={(v) => setMenge(v === null ? '' : String(v))}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300" />
                  <span className="text-xs text-gray-500">
                    Anpassbar zwischen {zahl(daten.mengeMin)} und {zahl(daten.mengeMax)} t. Für größere Änderungen rufen Sie uns an.
                  </span>
                  {vorschauFehler && (
                    <span className="block text-xs text-red-700 mt-1">{vorschauFehler}</span>
                  )}
                  {geaendert && !vorschauFehler && (
                    <span className="block text-xs text-gray-700 mt-1">
                      Neuer Gesamtbetrag: <strong>{euro(summen.brutto)} €</strong>
                      {summen.ohneMehrwertsteuer ? '' : ' brutto'}
                    </span>
                  )}
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

              {/* Die Adressfelder stehen jetzt oben an den Karten „Rechnung an" /
                  „Lieferung an" — dort, wo der Kunde sie sucht. Hier stünden sie
                  ein zweites Mal und liefen mit demselben Zustand auseinander. */}

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

              {/* Die Menge wandert nur mit der Bestellung ins System (der Server
                  speichert sie ausschließlich bei `bestellen`). Ohne diesen Hinweis
                  verschwände die eben gezeigte Vorschau nach dem Speichern wieder,
                  und der Kunde hielte seine Änderung für übernommen. */}
              {geaendert && (
                <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
                  Ihre Mengenänderung auf {zahl(anzeigeTonnage)} t wird erst mit
                  „Verbindlich bestellen“ übernommen. „Angaben speichern“ sichert nur
                  Lieferwoche, Adresse, Kontakt, Fotos und Hinweise.
                </p>
              )}

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
          {/* Pflichtangaben nach § 5 DDG — auf jeder Seite erreichbar, die ein
              Kunde ohne Login zu sehen bekommt. */}
          <p className="mt-2 text-xs text-gray-400">
            <Link to="/impressum" className="hover:text-gray-600 underline underline-offset-2">
              Impressum
            </Link>
            <span className="mx-2">·</span>
            <Link to="/datenschutz" className="hover:text-gray-600 underline underline-offset-2">
              Datenschutz
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
