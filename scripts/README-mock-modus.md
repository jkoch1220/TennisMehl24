# Mock-Datenbank-Modus (Sandbox)

Ein Admin schaltet das Portal zur Laufzeit auf eine vollständige Kopie der
Produktionsdaten um. Dort lässt sich alles durchspielen — Massen-Angebote,
Rechnungen, Mahnläufe — ohne dass echte Daten verändert werden oder eine E-Mail
bei einem echten Kunden ankommt.

## Auf einen Blick

| | |
|---|---|
| Produktion | `tennismehl24_db` + Buckets ohne Präfix |
| Sandbox | `tennismehl24_db_mock` + Buckets mit `mock_`-Präfix |
| Schalter | Settings → **Sandbox** (nur für Admins sichtbar) |
| Speicherung | `localStorage` (`tm_mock_modus_v1`), gilt **nur für diesen Browser** |
| Laufzeit | maximal 12 Stunden, endet zusätzlich beim Logout |
| E-Mails | gehen ausnahmslos an `jtatwcook@gmail.com` |
| Spur | jedes Ein-/Ausschalten steht im `audit_log` der **Produktion** |

## Einrichten (einmalig)

```bash
npm run mock:setup
```

Legt die Datenbank `tennismehl24_db_mock` an und spiegelt Schema (81 Tabellen,
alle Spalten und Indizes) sowie die Storage-Buckets aus der Produktion. Idempotent
— vorhandenes wird übersprungen, nichts gelöscht.

```bash
npm run mock:copy
```

Kopiert die Daten. Die Quelle wird ausschließlich gelesen.

## Zurücksetzen

```bash
npm run mock:reset
```

Leert die Sandbox und kopiert frisch aus der Produktion. Genau dafür ist die
Sandbox da: kaputtspielen, zurücksetzen, weitermachen.

## Weitere Flags

```bash
npx tsx scripts/copy-to-mock-db.ts --dry-run              # nur zählen
npx tsx scripts/copy-to-mock-db.ts --only=projekte        # eine Tabelle
npx tsx scripts/copy-to-mock-db.ts --wipe-target          # vorher leeren
npx tsx scripts/copy-to-mock-db.ts --with-storage         # Dateien mitkopieren (langsam)
npx tsx scripts/copy-to-mock-db.ts --nur-verweise-kappen  # nur Dateiverweise leeren
```

## PDFs in der Sandbox

**In der Sandbox gibt es nur die PDFs, die man dort selbst erzeugt.** Kein
einziges Dokument aus der Produktion ist dort sichtbar — auch nicht bei
Projekten, die bereits auf „Rechnung" stehen.

Umgesetzt in zwei Schritten:

1. Die PDFs werden **nicht mitkopiert**. Die neun `mock_`-Buckets starten leer
   und füllen sich ausschließlich mit dem, was in der Sandbox entsteht.
2. Die **Dateiverweise werden gekappt** (`dateiId`, `fileId`, `bildHaupt`,
   `pdfDatenblatt` — auch innerhalb von JSON-Feldern). Sonst zeigte jedes
   kopierte Dokument auf eine Datei, die es im Mock-Bucket nicht gibt, und das
   UI hätte kaputte Links statt einer klaren Aussage. Ansehen- und
   Herunterladen-Symbole sind bei solchen Einträgen ausgegraut und tragen den
   Hinweis „Kein PDF vorhanden".

**Die Dokumentzeilen selbst bleiben erhalten** — nur der Dateiverweis fällt weg.
Das ist wichtig: Das Massen-Angebots-Tool leitet Positionen und Preise aus alten
ABs und Rechnungen ab (`ladeReferenzDokumenteFuerProjekte`). Diese Daten stehen
im Feld `daten` der Dokumentzeile, nicht im PDF. Ohne sie würde sich das Tool in
der Sandbox völlig anders verhalten als in echt.

Wer die echten PDFs doch in der Sandbox braucht, kopiert sie mit
`--with-storage` mit — dann bleiben die Verweise erhalten.

## Massen-Angebote mit vollem Kundenstamm proben

Produktiv ist „Massenangebots-tauglich" ein bewusstes Opt-in pro Kunde — in der
Sandbox stehen deshalb zunächst nur dieselben drei Kunden zur Auswahl. Für einen
Lauf über den kompletten Stamm:

```bash
npx tsx scripts/mock-alle-massenangebots-tauglich.ts --dry-run   # erst zählen
npx tsx scripts/mock-alle-massenangebots-tauglich.ts             # dann setzen
npx tsx scripts/mock-alle-massenangebots-tauglich.ts --zuruecksetzen
```

Das Script schreibt ausschließlich in eine Datenbank mit `_mock`-Suffix. Flächig
gesetzt hieße das produktiv: jeder Kunde bekommt beim nächsten Lauf ein Angebot.

⚠️ Ein Versandlauf über alle Kunden schickt im Mock-Modus **jede** Mail an die
Testadresse. Im Tool das Feld „Stufenweise (Limit)" nutzen und klein anfangen.

## Angebots-Verteiler (mehrere Empfänger)

Das Kundenfeld `angebotsEmails` nimmt beliebig viele Adressen auf — zu pflegen
im Kundenformular unter „Angebots-Verteiler", eine Adresse pro Zeile. Massen-
Angebote gehen an alle gleichzeitig (alle im To-Feld, kommasepariert an
nodemailer). Ist die Liste leer, greift wie bisher `rechnungsEmail || email`.

`scripts/trage-gefundene-angebots-emails-ein.ts` sucht Adressen, die nur in
Nebenquellen stehen (Mosaik-Migrationsdaten, Portal-Ansprechpartner), und trägt
sie bei Kunden ohne eigene E-Mail als Verteiler ein. Ohne `--produktion` ist das
Ziel ausschließlich die Sandbox.

## Wie die Isolation funktioniert

**Datenbank.** `src/config/appwrite.ts` exportiert `databases` und `storage` nicht
mehr direkt, sondern als Proxy. Der ersetzt bei jedem Aufruf die Datenbank- bzw.
Bucket-ID durch das Ergebnis von `getDatabaseId()` / `getBucketId()`. Alle 68
Dateien, die `databases` importieren, sind damit ohne eigene Änderung abgedeckt.

Der Proxy behandelt beide Aufrufformen des Appwrite-SDK 21 — die positionale
(`listDocuments(dbId, collId, …)`) **und** die Objekt-Form
(`listDocuments({ databaseId, … })`). Letztere wäre sonst still durchgerutscht.

**Fail-closed.** Trifft der Proxy im Mock-Modus auf etwas, das er nicht sicher
umschreiben kann — unbekannte SDK-Methode, Transaktions-API, unerwartete
Argumentform —, wirft er. Ein blockiertes Feature ist ein akzeptables Ergebnis;
ein durchgerutschter Schreibzugriff auf Produktivdaten nicht.

**E-Mail.** In `sendeEmail()` (`src/services/emailSendService.ts`) — der einzigen
Stelle, an der eine Mail das Frontend verlässt — werden im Mock-Modus zwei
Bremsen gesetzt: `testMode: true` für die serverseitige Umleitung **und** der
Empfänger wird bereits clientseitig auf die Testadresse gesetzt. Die zweite
Bremse greift auch dann, wenn auf Netlify eine ältere Function-Version läuft.
Der ursprüngliche Empfänger steht im Betreff: `[MOCK → kunde@example.com] …`.

**Realtime.** Die früher hartkodierten Kanal-Strings laufen jetzt über
`realtimeKanal()` — sonst hätte die Sandbox weiter Live-Events aus der
Produktion empfangen.

**Storage-URLs.** 21 von Hand zusammengebaute `…/storage/buckets/…`-URLs gehen
jetzt über `getBucketId()`.

## Was in der Sandbox gesperrt ist

Diese Pfade wirken an der Sandbox vorbei und melden sich mit einem Hinweis,
statt still auf Produktion zu schreiben:

| Funktion | Grund |
|---|---|
| Postfach-Synchronisation (Anfragen) | `email-sync` hat die Produktions-DB hartkodiert |
| Newsletter-Abmeldung | `newsletter-unsubscribe` hat die Produktions-DB hartkodiert |
| Datenprüfungs-Formular absenden | `datenpruefung` hat die Produktions-DB hartkodiert |
| Benutzer anlegen / Passwort zurücksetzen | Konten liegen projektweit, nicht in einer Datenbank |
| Eigenes Passwort ändern | dito — würde das echte Konto treffen |
| „Passwort vergessen"-Mail | Appwrite verschickt sie serverseitig an die echte Adresse |
| Shop: Sync, Statusänderung, Versandbenachrichtigung, Gambio-Refresh | VPS-Backend schreibt selbst nach Appwrite und mailt an echte Kunden |
| Banking: Setup, Connect, Disconnect | wirkt auf die echte GoCardless-Anbindung |

Erlaubt bleiben lesende Aufrufe (Benutzerliste, Banking-Umsätze, Shop-Bestellungen
laden) sowie Geocoding, Dieselpreise und die Claude-Aufrufe — sie verändern keine
Geschäftsdaten.

## Dokumentnummern

Sandbox-Dokumente tragen den Präfix `MOCK-`: **`MOCK-ANG-2026-0024`**.

Der Zähler selbst liegt im `stammdaten`-Dokument der jeweiligen Datenbank — ein
Sandbox-Lauf kann den Produktionszähler also gar nicht bewegen. Der Präfix löst
das zweite Problem: dass dieselbe Nummer in Sandbox und Produktion für zwei
völlig verschiedene Dokumente steht. Mit ihm ist auf jedem PDF, in jeder Liste
und in jeder E-Mail sofort erkennbar, woher ein Dokument stammt, und eine
Sandbox-Nummer kann nie mit einer echten Rechnungsnummer verwechselt werden.

## QR-Liefernachweis in der Sandbox

Der komplette Durchlauf ist testbar: Lieferschein drucken → QR scannen → Foto
und Unterschrift → Liefernachweis-PDF.

Ein in der Sandbox gedruckter QR-Code trägt zusätzlich `&mock=1`. Die Netlify
Function `liefernachweis.ts` schaltet daraufhin Datenbank **und** Buckets auf die
Sandbox um (`setzeDatenziel()`, läuft als Erstes im Handler).

Warum das keinen neuen Angriffsweg öffnet: Der Zugriff hängt weiterhin
ausschließlich am Projekt-Token, das mit `timingSafeEqual` geprüft wird —
`mock=1` ohne gültiges Token bringt nichts. Ein Aufruf mit `mock=1` erreicht die
Produktion nicht mehr, einer ohne nicht die Sandbox.

Der Bucket `mock_liefernachweis-dateien` wird von `npm run mock:setup` angelegt,
das Produktions-Pendant `liefernachweis-dateien` von
`node scripts/add-liefernachweis-bucket.js`. Beide sind identisch konfiguriert
(10 MB, jpg/jpeg/png/webp, `read("users")`, Verschlüsselung und Virenscan an).

## Bekannte Grenzen

- **Cron-Jobs laufen weiter.** `notifications-generate` (alle 5 Minuten) arbeitet
  serverseitig auf der Produktion. Das ist ihr Normalbetrieb und unabhängig davon,
  ob jemand eine Sandbox offen hat.
- **Kalender-Abos aus der Sandbox zeigen auf Produktion.** Für den
  QR-Liefernachweis ist das gelöst (siehe oben), für `kalender-ics` nicht.
- **Der Schalter gilt pro Browser.** Kollegen bleiben auf Echtdaten — das ist
  Absicht. Wer in der Sandbox etwas zeigen will, muss es am eigenen Rechner tun.
- **Benutzer, Rollen und Berechtigungen sind geteilt.** Sie liegen in Appwrite
  projektweit bzw. werden aus `roles`/`user_permissions` gelesen. Änderungen an
  Rollen in der Sandbox betreffen nur die Sandbox-Kopie dieser Tabellen; die
  Appwrite-Konten selbst sind dieselben.

## Dateien

| Datei | Zweck |
|---|---|
| `src/config/appwriteEnv.ts` | Endpoint, Projekt-ID, Datenbank-IDs (importiert nichts) |
| `src/config/mockModus.ts` | Zustand, Umschaltung, Ablauf, Audit, Fail-closed-Helfer |
| `src/config/appwrite.ts` | der Proxy |
| `src/components/MockModusBanner.tsx` | Balken, Viewport-Rahmen, Tab-Titel, Favicon |
| `src/components/Settings/MockModusSchalter.tsx` | Schalter in den Settings |
| `scripts/mock-db-setup.ts` | Schema + Buckets spiegeln |
| `scripts/copy-to-mock-db.ts` | Daten kopieren |
