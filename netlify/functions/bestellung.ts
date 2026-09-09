/**
 * bestellung.ts — Bestellportal für Kunden
 *
 * Der Verein öffnet den Link aus der Angebots-E-Mail, sieht sein Angebot und
 * bestellt mit einem Klick. Kein Login, keine Registrierung.
 *
 *   GET  ?projektId=…&token=…   → Angebot, Adressen, Status
 *   POST { projektId, token, aktion: 'bestellen' | 'aktualisieren', … }
 *
 * SICHERHEIT — die drei Regeln, die hier alles tragen:
 *
 * 1. Der Client spricht NIE mit Appwrite. Jeder Zugriff läuft über diese
 *    Function mit dem Server-Key. Der Kunde bekommt ausschließlich das eine
 *    Projekt zu sehen, zu dem sein Token passt — nie eine Liste, nie einen
 *    anderen Kunden.
 * 2. Der Token ist ein eigenes Zufallsfeld, NICHT die Projekt-ID. IDs stehen in
 *    PDFs, Logs und internen Listen; ein Link, der allein darauf beruht, wäre
 *    durch Weitergabe eines Dokuments kompromittiert.
 * 3. Preise werden serverseitig neu gerechnet. Was der Client schickt, ist ein
 *    Wunsch, kein Faktum — sonst bestellte jemand 20 Tonnen zum Preis von zwei.
 *
 * Was der Kunde NICHT kann: stornieren (dafür ruft er an) und den Preis pro
 * Tonne ändern. Die Menge darf er um ±10 % anpassen — das entspricht der
 * Mengenklausel in den AGB; die Frachtpauschale wird dabei neu gestaffelt.
 */
import { Handler, HandlerEvent } from '@netlify/functions';
import { randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Ziel-Datenbank.
 *
 * Der Bestell-Link trägt `&sandbox=1`, wenn er aus der Sandbox heraus erzeugt
 * wurde. Ohne diese Weiche läse die Function immer aus der Produktion — ein
 * Testlauf in der Sandbox würde also echte Aufträge anfassen.
 *
 * Der Parameter ist unbedenklich manipulierbar: Er wählt nur, WO gesucht wird.
 * Ohne passenden Token findet man in keiner der beiden Datenbanken etwas, und
 * ein Sandbox-Token existiert in der Produktion schlicht nicht.
 */
const PRODUKTIONS_DB = 'tennismehl24_db';
const SANDBOX_DB = 'tennismehl24_db_mock';
const datenbank = (sandbox: boolean): string => (sandbox ? SANDBOX_DB : PRODUKTIONS_DB);

const PROJEKTE_COLLECTION_ID = 'projekte';
const DOKUMENTE_COLLECTION_ID = 'bestellabwicklung_dokumente';
const FOTOS_BUCKET_ID = 'bestellung-fotos';

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

/** Gültigkeit ab Angebotsversand. Danach greift die Verlängerung über die Rechnung. */
const GUELTIGKEIT_TAGE = 90;
/** Nach Rechnungsstellung bleibt die Seite so lange als Nachschlagewerk offen. */
const NACH_RECHNUNG_TAGE = 30;
/** Mengenspielraum laut Mengenklausel. */
const MENGEN_TOLERANZ = 0.10;

const MAX_TEXT = 500;
const MAX_NOTIZ = 2000;

/** Höchstens drei Fotos je Bestellung — mehr braucht keine Schüttstelle. */
const MAX_FOTOS = 3;
/**
 * 1,5 MB nach der Verkleinerung im Browser.
 *
 * Der Client rechnet Bilder auf 1600 px herunter; dabei bleiben typisch
 * 300–500 KB übrig. Die Grenze fängt ab, wer die Verkleinerung umgeht —
 * und hält die Anfrage unter dem 6-MB-Limit von Netlify.
 */
const MAX_FOTO_BYTES = 1_500_000;

/**
 * Frachtkostenpauschale TM-FP — Staffel aus der Preisliste.
 *
 * EXAKT dieselbe Grenzen-Semantik wie berechneFrachtkostenpauschale im Portal
 * (src/utils/frachtkostenCalculations.ts): die Obergrenzen sind einschließlich
 * („bis 19,9 t" → 24,90 €). Die frühere `<`-Variante bepreiste die exakten
 * Staffelgrenzen eine Stufe günstiger als die spätere Rechnung — bei genau
 * 19,9 t stand sogar 0,00 € in der Bestellbestätigung.
 */
const frachtpauschale = (tonnen: number): number => {
  if (tonnen <= 0) return 59.9;
  if (tonnen < 5.4) return 59.9;
  if (tonnen <= 7.4) return 49.9;
  if (tonnen <= 11.4) return 39.9;
  if (tonnen <= 15.4) return 31.9;
  if (tonnen <= 19.9) return 24.9;
  return 0;
};

/**
 * Pauschalen/Dienstleistungen, die in „t" fakturiert werden, aber keine Ware
 * sind. Kopie der zentralen Liste in src/utils/tonnage.ts — die Function ist
 * bewusst self-contained (wie schon die Frachtstaffel), beide müssen synchron
 * bleiben. Ohne den Ausschluss zählte z. B. eine Ladekran-Position als Tonne
 * und verschob die ±10-%-Grenzen und die Frachtstaffel.
 */
const NICHT_MATERIAL_ARTIKEL = new Set(['TM-PE', 'TM-FP', 'TM-HYC-V', 'TM-LKW-KR', 'TM-SK']);

/** Zählt diese Position als Ware in Tonnen? (gleiche Logik wie summiereTonnage im Portal) */
const istWarenTonnenPosition = (p: Position): boolean =>
  !p.istBedarfsposition &&
  /^(t|to)$/i.test(String(p.einheit ?? '')) &&
  !NICHT_MATERIAL_ARTIKEL.has(String(p.artikelnummer ?? '').trim().toUpperCase());

interface Position {
  id?: string;
  artikelnummer?: string;
  bezeichnung?: string;
  beschreibung?: string;
  menge?: number;
  einheit?: string;
  einzelpreis?: number;
  gesamtpreis?: number;
  istBedarfsposition?: boolean;
  /** Nur intern — darf den Kunden nie erreichen (siehe oeffentlichePosition). */
  einkaufspreis?: number;
  preisQuelle?: string;
  [k: string]: unknown;
}

/**
 * Was von einer Position zum Kunden darf.
 *
 * Bis 09/2026 reichte die Antwort die Positionsobjekte unverändert durch. Im
 * Angebots-JSON stehen aber auch `einkaufspreis` (im Portal-Typ ausdrücklich
 * „nur intern") und `preisQuelle` — beides lag damit im Browser des Kunden,
 * sichtbar in den Entwicklerwerkzeugen. Eine Whitelist ist hier richtig: Neue
 * interne Felder im Angebot landen so nicht automatisch beim Empfänger.
 */
const oeffentlichePosition = (p: Position) => ({
  artikelnummer: p.artikelnummer,
  bezeichnung: p.bezeichnung,
  beschreibung: p.beschreibung,
  menge: p.menge,
  einheit: p.einheit,
  einzelpreis: p.einzelpreis,
  gesamtpreis: p.gesamtpreis,
  istBedarfsposition: p.istBedarfsposition,
});

/** Angebotsdaten, die die Bestellseite anzeigt. */
interface AngebotsKopf {
  positionen: Position[];
  angebotsdatum?: string;
  gueltigBis?: string;
  mehrwertsteuersatz?: number;
  ohneMehrwertsteuer?: boolean;
  zahlungsziel?: string;
  lieferzeit?: string;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
  /** Achtung: Das Flag heißt `aktiviert` (types/projektabwicklung.ts), nicht `aktiv`. */
  vertragsklauseln?: Array<{ titel?: string; text?: string; aktiviert?: boolean }>;
  dieselpreiszuschlagAktiviert?: boolean;
  dieselpreiszuschlagText?: string;
}

interface Adresse { strasse?: string; plz?: string; ort?: string; land?: string }

interface ProjektDaten {
  kundenname?: string;
  kundennummer?: string;
  kundenstrasse?: string;
  kundenPlzOrt?: string;
  angebotsnummer?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  lieferwoche?: string;
  bestellToken?: string;
  bestellTokenErstelltAm?: string;
  bestellungEingegangenAm?: string;
  bestellungDaten?: string;
  dispoAnsprechpartner?: { name?: string; telefon?: string; email?: string };
  lieferadresse?: Adresse;
  rechnungsadresse?: Adresse;
  dispoNotizen?: Array<{ id: string; text: string; erstelltAm: string; wichtig?: boolean }>;
  schuettstelleFotos?: SchuettstelleFoto[];
  /** Bezugsweg 'platzbauer': Die Rechnung geht an den Platzbauer, nicht an den Verein. */
  bezugsweg?: string;
  platzbauerId?: string;
  istPlatzbauerprojekt?: boolean;
  /** Freitext-Änderungswunsch, wenn die Adresse nicht mehr übernommen werden darf. */
  rechnungsadresseHinweis?: string;
  /**
   * Zeitpunkt, zu dem der Kunde die Rechnungsanschrift über das Portal gesetzt hat.
   * Gesetzt heißt: Für DIESEN Vorgang gilt die Anschrift am Projekt, nicht die aus
   * dem Kundenstamm (siehe rechnungsadressenService.ts). Der Stammsatz bleibt
   * unangetastet — ein einzelner Verein soll ihn nicht für alle Vorgänge umschreiben.
   */
  rechnungsadresseVomKundenAm?: string;
  /** An wen das Angebot ging — dorthin geht auch die Bestätigung. */
  bestellEmpfaenger?: string;
  [k: string]: unknown;
}

interface ProjektDokument { $id: string; status?: string; data?: string; [k: string]: unknown }

interface SchuettstelleFoto { fileId: string; hochgeladenAm: string; hinweis?: string }

/**
 * Erkennt das Bildformat an den ersten Bytes.
 *
 * Der vom Browser gemeldete Content-Type ist eine Behauptung, kein Beweis —
 * jede Datei kann sich als `image/jpeg` ausgeben. SVG wird bewusst nicht
 * unterstützt: SVG ist XML und kann Skripte enthalten.
 */
const erkenneBildtyp = (bytes: Buffer): { typ: 'image/jpeg' | 'image/png'; endung: 'jpg' | 'png' } | null => {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { typ: 'image/jpeg', endung: 'jpg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { typ: 'image/png', endung: 'png' };
  return null;
};

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Appwrite-Project': APPWRITE_PROJECT_ID,
  'X-Appwrite-Key': APPWRITE_API_KEY,
});

const antwort = (status: number, body: unknown) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const ladeProjekt = async (projektId: string, db: string): Promise<ProjektDokument | null> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    { headers: headers() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Projekt nicht ladbar (HTTP ${res.status})`);
  return (await res.json()) as ProjektDokument;
};

/**
 * Schreibt die Projekt-Nutzdaten zurück.
 *
 * Die Collection hat nur eine Handvoll echter Spalten (`status`, `saisonjahr`,
 * `kundeId` …); alles Übrige liegt als JSON-String im Attribut `data`. Wer das
 * geparste Objekt direkt durchreicht, bekommt „Unknown attribute: kundennummer"
 * — Appwrite deutet dann jeden Schlüssel als Spalte.
 *
 * `spalten` ist deshalb bewusst getrennt: nur was wirklich eine Spalte ist.
 */
const speichereProjekt = async (
  projektId: string,
  nutzdaten: ProjektDaten,
  db: string,
  spalten: Record<string, unknown> = {}
): Promise<void> => {
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${PROJEKTE_COLLECTION_ID}/documents/${encodeURIComponent(projektId)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        data: { ...spalten, data: JSON.stringify(nutzdaten), geaendertAm: new Date().toISOString() },
      }),
    }
  );
  if (!res.ok) {
    const f = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(f.message || `Speichern fehlgeschlagen (HTTP ${res.status})`);
  }
};

/** Das gespeicherte Angebot — Grundlage für Positionen, Preise und Konditionen. */
const ladeAngebot = async (projektId: string, db: string): Promise<AngebotsKopf | null> => {
  // Appwrite-REST erwartet `attribute` als eigenes Feld. Steckt der Name im
  // values-Array, kommt er leer an und die Abfrage scheitert mit
  // „Attribute not found in schema" — still, denn der Fehler landet im catch.
  const q = encodeURIComponent(JSON.stringify({ method: 'equal', attribute: 'projektId', values: [projektId] }));
  const res = await fetch(
    `${APPWRITE_ENDPOINT}/databases/${db}/collections/${DOKUMENTE_COLLECTION_ID}/documents?queries[]=${q}`,
    { headers: headers() }
  );
  if (!res.ok) return null;
  const { documents = [] } = (await res.json()) as { documents: Array<Record<string, unknown>> };
  const angebot = documents.filter((d) => d.dokumentTyp === 'angebot').pop();
  if (!angebot) return null;
  try {
    const daten = JSON.parse(String(angebot.daten ?? '{}')) as Partial<AngebotsKopf>;
    return {
      positionen: daten.positionen ?? [],
      angebotsdatum: daten.angebotsdatum,
      gueltigBis: daten.gueltigBis,
      mehrwertsteuersatz: daten.mehrwertsteuersatz,
      ohneMehrwertsteuer: daten.ohneMehrwertsteuer,
      zahlungsziel: daten.zahlungsziel,
      lieferzeit: daten.lieferzeit,
      lieferbedingungenAktiviert: daten.lieferbedingungenAktiviert,
      lieferbedingungen: daten.lieferbedingungen,
      vertragsklauseln: daten.vertragsklauseln,
      dieselpreiszuschlagAktiviert: daten.dieselpreiszuschlagAktiviert,
      dieselpreiszuschlagText: daten.dieselpreiszuschlagText,
    };
  } catch { return null; }
};

/**
 * Darf der Kunde die Rechnungsadresse hier selbst ändern?
 *
 * Ja im Regelfall: Das Bestellportal steht VOR der Bestellung — das ist genau
 * der Zeitpunkt, an dem eine falsche Anschrift auffällt und korrigiert gehört,
 * sonst tippt sie jemand im Büro ab. Zwei Ausnahmen:
 *
 *  - Rechnung schon geschrieben: Eine Änderung würde die Rechnung und den
 *    Beleg auseinanderlaufen lassen (Storno/Neuausstellung ist Bürosache).
 *  - Bezugsweg Platzbauer: Die Rechnung geht an den Platzbauer, nicht an den
 *    Verein. Der Verein darf dessen Anschrift nicht überschreiben.
 *
 * In beiden Fällen wird der Wunsch als Notiz festgehalten statt übernommen —
 * dasselbe Muster wie im AB-Änderungsformular (datenpruefung.ts).
 */
const rechnungsadresseAenderbar = (daten: ProjektDaten): boolean => {
  if (daten.rechnungsnummer) return false;
  if (daten.bezugsweg === 'platzbauer' || daten.istPlatzbauerprojekt) return false;
  return true;
};

/**
 * Vergleichsform einer Adresszeile: Leerraum vereinheitlicht.
 *
 * Im Bestand steht „PLZ Ort" oft mit unregelmäßigem Leerraum — `formatAdresszeile`
 * baut die Zeile als `${plz} ${ort}` ohne Trimmen, bei fehlender PLZ bleibt also
 * ein führendes Leerzeichen stehen. Ohne diese Normalisierung meldete der
 * Vergleich unten eine Änderung, obwohl der Kunde nichts angefasst hat: Notiz
 * und Alarm-Mail bei jedem Speichern, im gesperrten Fall sogar dauerhaft, weil
 * dort nie zurückgeschrieben wird.
 */
const vergleichbar = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * „Straße, PLZ Ort" für Notizen, Mails und den Änderungsvergleich.
 *
 * Jeder Bestandteil wird EINZELN normalisiert, bevor die Zeile entsteht — sonst
 * überlebt ein Leerzeichen am Ende der Straße als „Am Sportpark 4 , 97070 …"
 * und der Vergleich meldet eine Änderung, die keine ist.
 */
const adressZeile = (a?: Adresse | null): string => {
  const teile = [a?.strasse, a?.plz, a?.ort].map((t) => vergleichbar(String(t ?? '')));
  const plzOrt = [teile[1], teile[2]].filter(Boolean).join(' ');
  return [teile[0], plzOrt].filter(Boolean).join(', ');
};

/**
 * Zerlegt die gewachsene Schreibweise „97070 Würzburg" in PLZ und Ort.
 *
 * Am Projekt stehen Straße und „PLZ Ort" in zwei Feldern; die Bestellseite
 * braucht drei Eingabefelder. Ohne die Trennung landete die komplette Zeile im
 * Ortsfeld und beim Speichern stand dort „97070 Würzburg Würzburg".
 * Nicht erkannte Formate (Auslands-PLZ, fehlende Zahl) wandern vollständig ins
 * Ortsfeld — dann korrigiert der Kunde von Hand, statt dass etwas verloren geht.
 */
const trenneAdresse = (strasse?: string, plzOrt?: string): Adresse => {
  const rest = (plzOrt ?? '').trim();
  const treffer = /^(\d{4,5})\s+(.*)$/.exec(rest);
  return {
    strasse: strasse ?? '',
    plz: treffer ? treffer[1] : '',
    ort: treffer ? treffer[2] : rest,
  };
};

/** Standardsatz, wenn das Angebot keinen eigenen trägt. */
const MWST_STANDARD = 19;

/**
 * Netto, Steuer und Brutto für die Anzeige.
 *
 * Der Satz kommt aus dem Angebot, nicht aus einer Konstante im Browser: Bei
 * Reverse Charge oder einem abweichenden Satz stand auf der Seite sonst
 * „zzgl. 19 % MwSt.", während die Rechnung etwas anderes auswies.
 */
const summenBlock = (nettoSumme: number, angebot: AngebotsKopf | null) => {
  const ohne = angebot?.ohneMehrwertsteuer === true;
  const satz = ohne ? 0 : angebot?.mehrwertsteuersatz ?? MWST_STANDARD;
  const netto = Math.round(nettoSumme * 100) / 100;
  const steuer = Math.round(netto * (satz / 100) * 100) / 100;
  return {
    netto,
    mehrwertsteuersatz: satz,
    ohneMehrwertsteuer: ohne,
    steuer,
    brutto: Math.round((netto + steuer) * 100) / 100,
  };
};

const parseDaten = (doc: ProjektDokument): ProjektDaten => {
  try { return doc.data ? (JSON.parse(doc.data) as ProjektDaten) : {}; } catch { return {}; }
};

const tokenGleich = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/**
 * Gültigkeit in zwei Stufen: 90 Tage ab Versand, und sobald eine Rechnung
 * existiert, noch 30 Tage ab Rechnungsdatum. So bleibt die Seite genau so
 * lange erreichbar, wie der Kunde etwas nachschlagen will — und nicht länger.
 */
const pruefeZugang = (
  daten: ProjektDaten,
  token: string
): { ok: true } | { ok: false; grund: string; abgelaufen?: boolean } => {
  if (!daten.bestellToken) return { ok: false, grund: 'Für dieses Angebot gibt es keine Bestellseite.' };
  if (!tokenGleich(daten.bestellToken, token)) return { ok: false, grund: 'Der Link ist ungültig.' };

  const jetzt = Date.now();
  const erstellt = daten.bestellTokenErstelltAm ? new Date(daten.bestellTokenErstelltAm).getTime() : NaN;
  const innerhalbGrundfrist =
    !Number.isNaN(erstellt) && jetzt <= erstellt + GUELTIGKEIT_TAGE * 864e5;
  if (innerhalbGrundfrist) return { ok: true };

  if (daten.rechnungsdatum) {
    const rechnung = new Date(daten.rechnungsdatum).getTime();
    if (!Number.isNaN(rechnung) && jetzt <= rechnung + NACH_RECHNUNG_TAGE * 864e5) return { ok: true };
  }
  return {
    ok: false,
    abgelaufen: true,
    grund: 'Dieser Link ist abgelaufen. Rufen Sie uns gerne an: 09391 9870-0.',
  };
};

const text = (wert: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof wert !== 'string') return undefined;
  const t = wert.trim();
  return t ? t.slice(0, max) : undefined;
};

/**
 * Maskiert Text für den Einbau in HTML-Mails.
 *
 * Adressen, Namen und Hinweise tippt der Kunde selbst. Ohne Maskierung landet
 * sein `<` unmaskiert im Mail-Quelltext: Im harmlosen Fall zerlegt das die
 * Darstellung, im unangenehmen Fall schiebt jemand einen fremden Link in eine
 * Mail, die aussieht, als käme sie von uns.
 */
const html = (wert: unknown): string =>
  String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const adresse = (wert: unknown): Adresse | undefined => {
  if (!wert || typeof wert !== 'object') return undefined;
  const a = wert as Record<string, unknown>;
  const gebaut: Adresse = {
    strasse: text(a.strasse, 200), plz: text(a.plz, 10),
    ort: text(a.ort, 100), land: text(a.land, 60),
  };
  return gebaut.strasse || gebaut.plz || gebaut.ort ? gebaut : undefined;
};

/**
 * Rechnet die Positionen auf eine neue Menge um.
 *
 * Der Preis pro Tonne bleibt, was er war — daran darf der Kunde nicht drehen.
 * Die Frachtpauschale wird neu gestaffelt, weil sie an der Tonnage hängt: Wer
 * von 5 auf 6 Tonnen geht, zahlt 49,90 € statt 59,90 €.
 */
const rechneUm = (positionen: Position[], neueTonnage: number): { positionen: Position[]; summe: number } => {
  const alteTonnage = positionen
    .filter(istWarenTonnenPosition)
    .reduce((s, p) => s + Number(p.menge ?? 0), 0);

  // Unveränderte Menge → Angebot unangetastet lassen. Sonst würde die
  // TM-FP-Position hier neu gestaffelt und könnte vom verbindlich
  // angebotenen Preis abweichen (Altangebote wurden teils mit anderer
  // Tonnage-Zählung bepreist; manuell verhandelte Pauschalen gäbe es auch).
  if (Math.abs(neueTonnage - alteTonnage) < 0.001) {
    const summe = positionen
      .filter((p) => !p.istBedarfsposition)
      .reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
    return { positionen, summe: Math.round(summe * 100) / 100 };
  }

  const faktor = alteTonnage > 0 ? neueTonnage / alteTonnage : 1;

  const neu = positionen.map((p) => {
    if (p.istBedarfsposition) return p;
    const nr = String(p.artikelnummer ?? '').toUpperCase();
    if (nr === 'TM-FP') {
      const preis = frachtpauschale(neueTonnage);
      return { ...p, menge: 1, einzelpreis: preis, gesamtpreis: preis };
    }
    // Nur Ware skaliert mit der Menge — Pauschalen in „t" bleiben stehen.
    if (istWarenTonnenPosition(p)) {
      const menge = Math.round(Number(p.menge ?? 0) * faktor * 100) / 100;
      const ep = Number(p.einzelpreis ?? 0);
      return { ...p, menge, gesamtpreis: Math.round(menge * ep * 100) / 100 };
    }
    return p;
  });
  const summe = neu.filter((p) => !p.istBedarfsposition).reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
  return { positionen: neu, summe: Math.round(summe * 100) / 100 };
};

// Einfaches Rate-Limit pro IP. Best effort — Netlify-Instanzen sind kurzlebig,
// aber es bremst das naive Durchprobieren von Tokens spürbar.
const versuche = new Map<string, { anzahl: number; bis: number }>();
const zuVieleVersuche = (ip: string): boolean => {
  const jetzt = Date.now();
  const e = versuche.get(ip);
  if (!e || jetzt > e.bis) { versuche.set(ip, { anzahl: 1, bis: jetzt + 60_000 }); return false; }
  e.anzahl++;
  return e.anzahl > 30;
};

/** Empfänger der internen Meldung — geht auch aus der Sandbox echt raus. */
const INTERN_EMPFAENGER = 'bestellung@tennismehl24.com';
const ABSENDER = 'info@tennismehl.com';
/** In der Sandbox landet die Kundenmail hier statt beim Verein. */
const TEST_EMPFAENGER = 'jtatwcook@gmail.com';

const euro = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Verschickt eine Mail über die vorhandene email-send-Function.
 *
 * Bewusst über den bestehenden Endpunkt statt mit eigenem SMTP-Code: Dort
 * liegen die Zugangsdaten, dort wird ins „Gesendet"-Postfach kopiert, und
 * dieselbe Mail zweimal unterschiedlich zu verschicken wäre eine Fehlerquelle.
 */
/**
 * Basis-URL der laufenden Instanz.
 *
 * Netlify setzt `URL` selbst. Lokal fehlt sie — dort greift der Dev-Server auf
 * Port 8888, auf dem auch `email-send` liegt. Ohne diesen Rückfall bliebe der
 * Mailversand beim lokalen Testen stumm, und man hielte ihn für kaputt.
 */
const basisUrl = (): string =>
  process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';

/** Öffentliche Adresse für Links IN den Mails — nie localhost beim Kunden. */
const oeffentlicheUrl = (): string =>
  process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.VITE_PORTAL_PUBLIC_URL || '';

/**
 * Zentrale E-Mail-Signatur aus den Stammdaten — dieselbe Quelle wie das Portal
 * (emailTemplates.standardSignatur). Die Function läuft ohne Login, deshalb
 * bleibt die neutrale Team-Grußzeile. Ein Ladefehler kostet nur die Signatur,
 * nie die Bestellung.
 */
const ladeSignatur = async (db: string): Promise<string> => {
  try {
    const res = await fetch(
      `${APPWRITE_ENDPOINT}/databases/${db}/collections/stammdaten/documents/stammdaten_data`,
      { headers: headers() }
    );
    if (!res.ok) return '';
    const doc = (await res.json()) as { emailTemplates?: string };
    const templates = JSON.parse(doc.emailTemplates ?? '{}') as { standardSignatur?: string };
    const signatur = typeof templates.standardSignatur === 'string' ? templates.standardSignatur : '';
    return signatur.replace(/\{absender\}/g, 'Ihr Team der Tennismehl GmbH');
  } catch {
    return '';
  }
};

const sendeMail = async (
  an: string,
  betreff: string,
  html: string
): Promise<void> => {
  const basis = basisUrl();
  try {
    const res = await fetch(`${basis}/.netlify/functions/email-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: an, from: ABSENDER, subject: betreff, htmlBody: html }),
    });
    if (!res.ok) console.error(`Mail an ${an} fehlgeschlagen (HTTP ${res.status})`);
  } catch (fehler) {
    // Eine gescheiterte Benachrichtigung darf die Bestellung nicht kippen —
    // der Auftrag ist gespeichert, das ist der Teil, der zählt.
    console.error('Mailversand fehlgeschlagen:', fehler);
  }
};

/**
 * Zwei Mails nach der Bestellung — mit unterschiedlicher Sandbox-Regel:
 *
 * - Die BESTÄTIGUNG an den Kunden geht in der Sandbox an die Testadresse.
 *   Ein Testlauf darf keinen Verein erreichen.
 * - Die INTERNE Meldung geht immer an bestellung@tennismehl24.com, auch aus
 *   der Sandbox. Sie ist an uns selbst gerichtet; dort ist nichts zu schützen,
 *   und beim Testen will man sehen, dass sie ankommt.
 */
const versendeBestellmails = async (
  daten: ProjektDaten,
  projektId: string,
  token: string,
  sandbox: boolean,
  tonnage: number,
  summe: number
): Promise<void> => {
  const nummer = daten.angebotsnummer ?? '—';
  const kunde = daten.kundenname ?? 'Kunde';
  const basis = oeffentlicheUrl();
  const link = `${basis}/bestellung/${projektId}?token=${token}${sandbox ? '&sandbox=1' : ''}`;
  const liefer = daten.lieferadresse;
  // Maskiert, weil die Adresse aus dem Kundenformular stammt und hier in
  // HTML-Mails eingesetzt wird — an den Kunden UND an uns.
  const lieferZeile = liefer?.strasse
    ? html(`${liefer.strasse}, ${liefer.plz ?? ''} ${liefer.ort ?? ''}`)
    : 'wie Rechnungsanschrift';

  // --- an den Kunden ---
  const kundenEmpfaenger = sandbox
    ? TEST_EMPFAENGER
    : (daten.bestellEmpfaenger as string | undefined) || '';
  if (kundenEmpfaenger) {
    const signatur = await ladeSignatur(datenbank(sandbox));
    await sendeMail(
      kundenEmpfaenger,
      `${sandbox ? '[SANDBOX] ' : ''}Ihre Bestellung ${nummer} — vielen Dank`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;">
  <p>Sehr geehrte Damen und Herren,</p>
  <p>vielen Dank für Ihre Bestellung. Wir haben sie erhalten und melden uns zur Terminabstimmung.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="margin:16px 0;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Angebot</td><td><strong>${nummer}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Menge</td><td>${tonnage} t</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Summe netto</td><td>${euro(summe)} €</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Lieferung an</td><td>${lieferZeile}</td></tr>
  </table>
  <p>Über den folgenden Link können Sie jederzeit Ihre Angaben ergänzen — Wunschtermin,
     Ansprechpartner vor Ort und Fotos der Schüttstelle:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr><td bgcolor="#16a34a" style="border-radius:12px;">
      <a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;
         font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#fff;
         text-decoration:none;border-radius:12px;">Bestellung ansehen</a>
    </td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px;">
    Fragen? Rufen Sie uns an: 09391 9870-0
  </p>
  ${signatur ? `<div style="margin-top:24px;">${signatur}</div>` : ''}
</div>`
    );
  }

  // --- an uns ---
  await sendeMail(
    INTERN_EMPFAENGER,
    `${sandbox ? '[SANDBOX] ' : ''}Neue Bestellung: ${kunde} — ${nummer}`,
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;">
  <p><strong>${kunde}</strong> hat über das Bestellportal bestellt.</p>
  ${sandbox ? '<p style="color:#b45309;"><strong>Achtung: Testlauf aus der Sandbox.</strong> Kein echter Auftrag.</p>' : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="margin:16px 0;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Angebot</td><td><strong>${nummer}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Menge</td><td>${tonnage} t</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Summe netto</td><td>${euro(summe)} €</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Lieferung an</td><td>${lieferZeile}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Wunschwoche</td><td>${daten.lieferwoche ?? '—'}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Kontakt vor Ort</td><td>${daten.dispoAnsprechpartner?.name ?? '—'}${daten.dispoAnsprechpartner?.telefon ? ` · ${daten.dispoAnsprechpartner.telefon}` : ''}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Fotos</td><td>${(daten.schuettstelleFotos ?? []).length}</td></tr>
  </table>
  <p style="background:#fef3c7;padding:12px;border-radius:8px;">
    <strong>Die Auftragsbestätigung wurde NICHT automatisch verschickt.</strong><br>
    Bitte in der Projektakte prüfen und von dort auslösen.
  </p>
</div>`
  );
};

/** Legt ein geprüftes Bild im privaten Bucket ab. Dateiname kommt vom Server. */
const speichereFoto = async (bytes: Buffer, endung: string, typ: string): Promise<string> => {
  const fileId = randomUUID().replace(/-/g, '').slice(0, 32);
  const grenze = `----tm${randomUUID().replace(/-/g, '')}`;
  const kopf = Buffer.from(
    `--${grenze}\r\nContent-Disposition: form-data; name="fileId"\r\n\r\n${fileId}\r\n` +
    `--${grenze}\r\nContent-Disposition: form-data; name="file"; filename="${fileId}.${endung}"\r\n` +
    `Content-Type: ${typ}\r\n\r\n`,
    'utf8'
  );
  const fuss = Buffer.from(`\r\n--${grenze}--\r\n`, 'utf8');
  const res = await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files`, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': APPWRITE_API_KEY,
      'Content-Type': `multipart/form-data; boundary=${grenze}`,
    },
    body: Buffer.concat([kopf, bytes, fuss]),
  });
  if (!res.ok) {
    const f = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(f.message || `Upload fehlgeschlagen (HTTP ${res.status})`);
  }
  return fileId;
};

const loescheFoto = async (fileId: string): Promise<void> => {
  await fetch(`${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY },
  }).catch(() => { /* verwaiste Datei ist harmlos, ein Abbruch hier nicht */ });
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    return antwort(500, { error: 'Serverkonfiguration unvollständig.' });
  }
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unbekannt';
  if (zuVieleVersuche(ip)) return antwort(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });

  try {
    // ---------- Lesen ----------
    if (event.httpMethod === 'GET') {
      const projektId = event.queryStringParameters?.projektId || '';
      const token = event.queryStringParameters?.token || '';
      const db = datenbank(event.queryStringParameters?.sandbox === '1');
      if (!projektId || !token) return antwort(400, { error: 'Link unvollständig.' });

      const doc = await ladeProjekt(projektId, db);
      if (!doc) return antwort(404, { error: 'Angebot nicht gefunden.' });
      const daten = parseDaten(doc);
      const zugang = pruefeZugang(daten, token);
      if (!zugang.ok) return antwort(zugang.abgelaufen ? 410 : 403, { error: zugang.grund });

      // Bildauslieferung: Der Bucket ist privat, also reicht die Function die
      // Bytes durch — erst nachdem der Token geprüft ist. Ein direkter
      // Bucket-Link wäre ein Zugang ohne jede Prüfung.
      const fotoId = event.queryStringParameters?.foto;
      if (fotoId) {
        const erlaubt = (daten.schuettstelleFotos ?? []).some((f) => f.fileId === fotoId);
        if (!erlaubt) return antwort(404, { error: 'Bild nicht gefunden.' });
        const res = await fetch(
          `${APPWRITE_ENDPOINT}/storage/buckets/${FOTOS_BUCKET_ID}/files/${encodeURIComponent(fotoId)}/download`,
          { headers: { 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY } }
        );
        if (!res.ok) return antwort(404, { error: 'Bild nicht gefunden.' });
        const bytes = Buffer.from(await res.arrayBuffer());
        const typ = erkenneBildtyp(bytes)?.typ ?? 'application/octet-stream';
        return {
          statusCode: 200,
          headers: {
            'Content-Type': typ,
            'Cache-Control': 'private, max-age=3600',
            'Content-Disposition': 'inline',
          },
          body: bytes.toString('base64'),
          isBase64Encoded: true,
        };
      }

      const angebot = await ladeAngebot(projektId, db);

      // Nach der Bestellung zählt, was bestellt wurde – nicht das ursprüngliche
      // Angebot. Vorher zeigte die Seite unter „Ihre Bestellung" weiter die
      // Angebotsmenge, obwohl der Kunde sie vor dem Klick geändert hatte.
      const bestellung = (() => {
        if (!daten.bestellungDaten) return null;
        try {
          return JSON.parse(daten.bestellungDaten) as { positionen?: Position[]; summe?: number; tonnage?: number };
        } catch { return null; }
      })();

      const allePositionen = bestellung?.positionen ?? angebot?.positionen ?? [];
      const positionen = allePositionen.filter((p) => !p.istBedarfsposition);
      const bedarfspositionen = allePositionen.filter((p) => p.istBedarfsposition);
      const summe = positionen.reduce((s, p) => s + Number(p.gesamtpreis ?? 0), 0);
      const tonnage = positionen
        .filter(istWarenTonnenPosition)
        .reduce((s, p) => s + Number(p.menge ?? 0), 0);
      // Spielraum immer am ursprünglichen Angebot messen: Sonst wandert die
      // Grenze mit jeder Anpassung mit und ±10 % werden über die Zeit beliebig.
      const angebotsTonnage = (angebot?.positionen ?? [])
        .filter((p) => !p.istBedarfsposition)
        .filter(istWarenTonnenPosition)
        .reduce((s, p) => s + Number(p.menge ?? 0), 0);

      return antwort(200, {
        kundenname: daten.kundenname,
        angebotsnummer: daten.angebotsnummer,
        angebotsdatum: angebot?.angebotsdatum ?? null,
        gueltigBis: angebot?.gueltigBis ?? null,
        status: doc.status,
        bestelltAm: daten.bestellungEingegangenAm ?? null,
        rechnungsnummer: daten.rechnungsnummer ?? null,
        rechnungsdatum: daten.rechnungsdatum ?? null,
        lieferwoche: daten.lieferwoche ?? null,
        positionen: positionen.map(oeffentlichePosition),
        bedarfspositionen: bedarfspositionen.map(oeffentlichePosition),
        ...summenBlock(summe, angebot),
        // `summe` bleibt für ältere Clients erhalten (Netto).
        summe: Math.round(summe * 100) / 100,
        tonnage,
        mengeMin: Math.round(angebotsTonnage * (1 - MENGEN_TOLERANZ) * 100) / 100,
        mengeMax: Math.round(angebotsTonnage * (1 + MENGEN_TOLERANZ) * 100) / 100,
        konditionen: {
          zahlungsziel: angebot?.zahlungsziel ?? null,
          lieferzeit: angebot?.lieferzeit ?? null,
          lieferbedingungen: angebot?.lieferbedingungenAktiviert ? angebot?.lieferbedingungen ?? null : null,
          // Exakt dieselbe Bedingung wie im Angebots-PDF (dokumentService.ts:116):
          // nur aktivierte Klauseln MIT Text. Bewusst `=== true` statt `!== false` —
          // fehlt das Flag, ist Nichtanzeigen die sichere Richtung. Abgewählte
          // Klauseln bleiben als Schnappschuss im Angebot stehen; sie hier
          // auszugeben hieße, den Kunden gegen Bedingungen bestellen zu lassen,
          // die auf seinem PDF nicht stehen.
          klauseln: (angebot?.vertragsklauseln ?? [])
            .filter((k) => k?.aktiviert === true && !!k?.text?.trim())
            .map((k) => ({ titel: k.titel ?? '', text: (k.text ?? '').trim() })),
          dieselpreiszuschlag: angebot?.dieselpreiszuschlagAktiviert ? angebot?.dieselpreiszuschlagText ?? null : null,
        },
        // Die Anschrift kommt aus den Feldern, die AB und Rechnung lesen —
        // nicht mehr aus dem toten Feld `rechnungsadresse`. PLZ und Ort stecken
        // im Bestand gemeinsam in `kundenPlzOrt`, deshalb hier getrennt.
        rechnungsadresse: trenneAdresse(daten.kundenstrasse, daten.kundenPlzOrt),
        rechnungsadresseAenderbar: rechnungsadresseAenderbar(daten),
        lieferadresse: daten.lieferadresse ?? null,
        dispoAnsprechpartner: daten.dispoAnsprechpartner ?? null,
        fotos: (daten.schuettstelleFotos ?? []).map((f) => ({ fileId: f.fileId, hinweis: f.hinweis })),
        maxFotos: MAX_FOTOS,
      });
    }

    // ---------- Schreiben ----------
    if (event.httpMethod === 'POST') {
      const req = JSON.parse(event.body || '{}') as Record<string, unknown>;
      const projektId = text(req.projektId, 60) ?? '';
      const token = text(req.token, 120) ?? '';
      const aktion = text(req.aktion, 30) ?? '';
      const sandbox = req.sandbox === true || req.sandbox === '1';
      const db = datenbank(sandbox);
      if (!projektId || !token) return antwort(400, { error: 'Link unvollständig.' });

      const doc = await ladeProjekt(projektId, db);
      if (!doc) return antwort(404, { error: 'Angebot nicht gefunden.' });
      const daten = parseDaten(doc);
      const zugang = pruefeZugang(daten, token);
      if (!zugang.ok) return antwort(zugang.abgelaufen ? 410 : 403, { error: zugang.grund });

      // Vorschau: rechnet eine geänderte Menge durch, ohne etwas zu speichern.
      // Damit sieht der Kunde Fracht und Summe VOR dem verbindlichen Klick –
      // und die Frachtstaffel bleibt an einer Stelle, statt ein drittes Mal in
      // den Browser kopiert zu werden.
      if (aktion === 'vorschau') {
        const angebot = await ladeAngebot(projektId, db);
        if (!angebot) return antwort(404, { error: 'Angebot nicht gefunden.' });
        const gewuenscht = Number(req.menge);
        if (!Number.isFinite(gewuenscht) || gewuenscht <= 0) {
          return antwort(400, { error: 'Bitte eine Menge größer als 0 angeben.' });
        }
        const basis = angebot.positionen.filter((p) => !p.istBedarfsposition);
        const alteTonnage = basis.filter(istWarenTonnenPosition).reduce((s, p) => s + Number(p.menge ?? 0), 0);
        const min = Math.round(alteTonnage * (1 - MENGEN_TOLERANZ) * 100) / 100;
        const max = Math.round(alteTonnage * (1 + MENGEN_TOLERANZ) * 100) / 100;
        if (alteTonnage > 0 && (gewuenscht < min || gewuenscht > max)) {
          return antwort(400, { error: `Bitte eine Menge zwischen ${min} und ${max} t angeben.` });
        }
        const gerechnet = rechneUm(angebot.positionen, gewuenscht);
        const sichtbar = gerechnet.positionen.filter((p) => !p.istBedarfsposition);
        return antwort(200, {
          positionen: sichtbar.map(oeffentlichePosition),
          ...summenBlock(gerechnet.summe, angebot),
          summe: gerechnet.summe,
          tonnage: sichtbar.filter(istWarenTonnenPosition).reduce((s, p) => s + Number(p.menge ?? 0), 0),
        });
      }

      const neu: ProjektDaten = { ...daten };
      const jetzt = new Date().toISOString();

      // ---------- Adressen ----------
      // Bis 09/2026 landete die Rechnungsadresse in `neu.rechnungsadresse` —
      // einem Feld, das KEIN Portal-Code liest. AB und Rechnung nehmen
      // `kundenstrasse`/`kundenPlzOrt`. Die Änderung sah für den Kunden also
      // erfolgreich aus und verpuffte. Jetzt wird sie dorthin geschrieben, wo
      // sie wirkt — oder als Änderungswunsch hinterlegt, wenn das zu spät ist.
      const adressAenderungen: string[] = [];
      const rechnungsadresse = adresse(req.rechnungsadresse);
      const lieferadresse = adresse(req.lieferadresse);
      // Der Kunde hat das Feld ausdrücklich mitgeschickt (statt es wegzulassen).
      const lieferadresseGesendet = Object.prototype.hasOwnProperty.call(req, 'lieferadresse');

      if (rechnungsadresse) {
        const vorher = adressZeile({ strasse: daten.kundenstrasse, ort: daten.kundenPlzOrt });
        const nachher = adressZeile(rechnungsadresse);
        // Eine Rechnungsanschrift ohne Straße oder ohne Ort ist keine Anschrift.
        // Ohne diese Prüfung leerte eine halb ausgefüllte Eingabe die Felder, aus
        // denen Auftragsbestätigung und Rechnung ihren Empfänger nehmen.
        const vollstaendig = !!rechnungsadresse.strasse?.trim() && !!rechnungsadresse.ort?.trim();
        if (vorher !== nachher && !vollstaendig) {
          return antwort(400, {
            error: 'Bitte geben Sie die Rechnungsanschrift vollständig an: Straße, PLZ und Ort.',
          });
        }
        if (vorher !== nachher) {
          if (rechnungsadresseAenderbar(daten)) {
            // Dorthin, wo AB und Rechnung wirklich lesen.
            neu.kundenstrasse = rechnungsadresse.strasse ?? '';
            neu.kundenPlzOrt = vergleichbar(
              [rechnungsadresse.plz, rechnungsadresse.ort].filter(Boolean).join(' ')
            );
            // Merker für die Rechnungsstellung: Diese Anschrift kommt vom Kunden
            // und darf nicht wieder aus dem Kundenstamm überschrieben werden
            // (rechnungsadressenService.ts, Fall „Direktgeschäft").
            neu.rechnungsadresseVomKundenAm = jetzt;
            adressAenderungen.push(`Rechnungsanschrift geändert: „${vorher}" → „${nachher}"`);
          } else {
            const grund = daten.rechnungsnummer
              ? `Rechnung ${daten.rechnungsnummer} ist bereits geschrieben`
              : 'Rechnung läuft über den Platzbauer';
            neu.rechnungsadresseHinweis = nachher;
            adressAenderungen.push(
              `⚠ Änderungswunsch Rechnungsanschrift (NICHT übernommen, ${grund}): „${vorher}" → „${nachher}"`
            );
          }
        }
      }

      if (lieferadresse) {
        const vorher = adressZeile(daten.lieferadresse);
        const nachher = adressZeile(lieferadresse);
        if (vorher !== nachher) {
          neu.lieferadresse = lieferadresse;
          adressAenderungen.push(
            vorher
              ? `Lieferanschrift geändert: „${vorher}" → „${nachher}"`
              : `Abweichende Lieferanschrift: „${nachher}"`
          );
        }
      } else if (lieferadresseGesendet && daten.lieferadresse) {
        // Alle Felder geleert = „wie Rechnungsanschrift". Vorher wurde eine
        // geleerte Adresse verworfen, der Kunde kam nicht mehr zurück.
        delete neu.lieferadresse;
        adressAenderungen.push(
          `Abweichende Lieferanschrift entfernt („${adressZeile(daten.lieferadresse)}") — Lieferung an die Rechnungsanschrift.`
        );
      }
      if (req.dispoAnsprechpartner && typeof req.dispoAnsprechpartner === 'object') {
        const d = req.dispoAnsprechpartner as Record<string, unknown>;
        neu.dispoAnsprechpartner = {
          name: text(d.name, 120), telefon: text(d.telefon, 60), email: text(d.email, 200),
        };
      }
      const wunschwoche = text(req.lieferwoche, 20);
      if (wunschwoche) neu.lieferwoche = wunschwoche;

      const hinweis = text(req.hinweis, MAX_NOTIZ);
      // Adressänderungen kommen als eigene, wichtige Notiz ins Projekt — mit
      // Vorher/Nachher. Ohne sie ließe sich später nicht mehr feststellen, wer
      // die Anschrift geändert hat und was vorher dort stand.
      const neueNotizen = [...(daten.dispoNotizen ?? [])];
      if (hinweis) {
        neueNotizen.push({ id: randomUUID(), text: `[Kundenportal] ${hinweis}`, erstelltAm: jetzt, wichtig: true });
      }
      if (adressAenderungen.length) {
        neueNotizen.push({
          id: randomUUID(),
          text: `[Kundenportal] ${adressAenderungen.join('\n')}`,
          erstelltAm: jetzt,
          wichtig: true,
        });
      }
      if (neueNotizen.length !== (daten.dispoNotizen ?? []).length) {
        neu.dispoNotizen = neueNotizen;
      }

      if (aktion === 'foto-hochladen') {
        const vorhandene = daten.schuettstelleFotos ?? [];
        if (vorhandene.length >= MAX_FOTOS) {
          return antwort(400, { error: `Mehr als ${MAX_FOTOS} Bilder sind nicht möglich.` });
        }
        const roh = typeof req.datei === 'string' ? req.datei : '';
        const base64 = roh.includes(',') ? roh.split(',')[1] : roh;
        if (!base64) return antwort(400, { error: 'Kein Bild empfangen.' });

        let bytes: Buffer;
        try { bytes = Buffer.from(base64, 'base64'); }
        catch { return antwort(400, { error: 'Das Bild konnte nicht gelesen werden.' }); }
        if (bytes.length > MAX_FOTO_BYTES) {
          return antwort(413, { error: 'Das Bild ist zu groß. Bitte versuchen Sie es erneut.' });
        }
        const bildtyp = erkenneBildtyp(bytes);
        if (!bildtyp) return antwort(400, { error: 'Nur JPG- und PNG-Bilder sind möglich.' });

        const fileId = await speichereFoto(bytes, bildtyp.endung, bildtyp.typ);
        const neuesFoto: SchuettstelleFoto = {
          fileId, hochgeladenAm: jetzt, hinweis: text(req.hinweis, 200),
        };
        neu.schuettstelleFotos = [...vorhandene, neuesFoto];
        await speichereProjekt(projektId, neu, db);
        return antwort(200, { fileId, anzahl: neu.schuettstelleFotos.length });
      }

      if (aktion === 'foto-loeschen') {
        const fileId = text(req.fileId, 64) ?? '';
        const vorhandene = daten.schuettstelleFotos ?? [];
        if (!vorhandene.some((f) => f.fileId === fileId)) {
          return antwort(404, { error: 'Bild nicht gefunden.' });
        }
        await loescheFoto(fileId);
        neu.schuettstelleFotos = vorhandene.filter((f) => f.fileId !== fileId);
        await speichereProjekt(projektId, neu, db);
        return antwort(200, { anzahl: neu.schuettstelleFotos.length });
      }

      if (aktion === 'bestellen') {
        if (daten.bestellungEingegangenAm) {
          // Zweiter Besteller aus demselben Verteiler — kein Fehler, aber auch
          // keine zweite Bestellung. Die erste zählt.
          return antwort(200, { bereitsBestellt: true, bestelltAm: daten.bestellungEingegangenAm });
        }
        const angebot = await ladeAngebot(projektId, db);
        if (!angebot) return antwort(409, { error: 'Zu diesem Angebot fehlt das Dokument. Bitte rufen Sie uns an.' });

        // Menge: Wunsch des Kunden, aber nur innerhalb der Toleranz.
        const alteTonnage = angebot.positionen
          .filter(istWarenTonnenPosition)
          .reduce((s, p) => s + Number(p.menge ?? 0), 0);
        const gewuenscht = Number(req.menge);
        let tonnage = alteTonnage;
        if (Number.isFinite(gewuenscht) && gewuenscht > 0) {
          // Auf 2 Nachkommastellen gerundet — exakt die Grenzen, die die
          // Bestellseite anzeigt. Ungerundet lehnte der Server Eingaben ab,
          // die die Seite selbst als zulässig auswies (z. B. 7,43 bei 6,75 t).
          const min = Math.round(alteTonnage * (1 - MENGEN_TOLERANZ) * 100) / 100;
          const max = Math.round(alteTonnage * (1 + MENGEN_TOLERANZ) * 100) / 100;
          if (gewuenscht < min || gewuenscht > max) {
            return antwort(400, {
              error: `Die Menge lässt sich hier um ±10 % anpassen (${min.toFixed(2)} – ${max.toFixed(2)} t). ` +
                'Für größere Änderungen rufen Sie uns bitte an: 09391 9870-0.',
            });
          }
          tonnage = gewuenscht;
        }
        const { positionen, summe } = rechneUm(angebot.positionen, tonnage);

        neu.bestellungEingegangenAm = jetzt;
        neu.bestellungDaten = JSON.stringify({ tonnage, summe, positionen, bestelltAm: jetzt });
        // `status` UND `bestellungEingegangenAm` sind echte Spalten — sie müssen
        // dorthin, sonst findet die Projektliste die Bestellung nicht.
        await speichereProjekt(projektId, neu, db, {
          status: 'auftragsbestaetigung',
          bestellungEingegangenAm: jetzt,
        });
        await versendeBestellmails(
          { ...neu, angebotsnummer: daten.angebotsnummer }, projektId, token, sandbox, tonnage, summe
        );
        // Auch hier durch die Whitelist: `rechneUm` reicht die Angebotsobjekte
        // durch, samt `einkaufspreis`. Ohne diese Zeile wäre das Leck nur beim
        // Laden geschlossen und beim Bestellen weiter offen.
        return antwort(200, {
          bestelltAm: jetzt,
          tonnage,
          summe,
          positionen: positionen.filter((p) => !p.istBedarfsposition).map(oeffentlichePosition),
        });
      }

      await speichereProjekt(projektId, neu, db);

      // Eine geänderte Anschrift muss jemand sehen: Sie entscheidet, wohin die
      // Rechnung geht und wo der LKW hinfährt. Bisher lief „Angaben speichern"
      // vollkommen stumm — die Änderung stand nur im Projekt und fiel erst auf,
      // wenn jemand zufällig hinsah. Andere Angaben lösen weiterhin keine Mail
      // aus, sonst wird die Meldung zum Rauschen.
      if (adressAenderungen.length) {
        await sendeMail(
          INTERN_EMPFAENGER,
          // Kennzeichnung wie bei den Bestellmails: Diese Meldung geht auch aus
          // der Sandbox echt raus und wäre sonst nicht von einem Kundenvorgang
          // zu unterscheiden.
          `${sandbox ? '[SANDBOX] ' : ''}Adressänderung über das Bestellportal — ${daten.kundenname ?? 'Kunde'} (${daten.angebotsnummer ?? '—'})`,
          `${sandbox ? '<p><strong>Testlauf aus der Sandbox — kein echter Vorgang.</strong></p>' : ''}
           <p><strong>${html(daten.kundenname ?? 'Kunde')}</strong> hat im Bestellportal Angaben geändert.</p>
           <ul>${adressAenderungen.map((z) => `<li>${html(z)}</li>`).join('')}</ul>
           <p>Angebot: ${html(daten.angebotsnummer ?? '—')}<br>Projekt: ${html(projektId)}</p>
           ${neu.rechnungsadresseHinweis
             ? '<p><strong>Achtung:</strong> Die Rechnungsanschrift wurde NICHT übernommen und muss im Portal geprüft werden.</p>'
             : ''}`
        );
      }
      return antwort(200, { gespeichert: true });
    }

    return antwort(405, { error: 'Methode nicht erlaubt.' });
  } catch (fehler) {
    console.error('bestellung:', fehler);
    return antwort(500, { error: 'Es ist ein Fehler aufgetreten. Bitte rufen Sie uns an: 09391 9870-0.' });
  }
};
