# Kreditoren-Verwaltung - Datenstruktur Dokumentation

Diese Dokumentation beschreibt die vollständige Datenstruktur für die Kreditoren-Verwaltung.

## Übersicht

Die Kreditoren-Verwaltung besteht aus zwei Hauptentitäten:
1. **Kreditoren** (Glaubiger) - Stammdaten der Lieferanten/Glaubiger
2. **Offene Rechnungen** - Verwaltung der offenen Rechnungen

## Datenmodell

### 1. Kreditor (Glaubiger)

```typescript
interface Kreditor {
  id: string;                    // Eindeutige ID
  name: string;                  // Name des Kreditors (Pflichtfeld)
  kreditorennummer?: string;      // Interne Kreditorennummer (optional)
  
  kontakt?: {                    // Kontaktdaten (optional)
    ansprechpartner?: string;
    telefon?: string;
    email?: string;
    adresse?: {
      strasse?: string;
      plz?: string;
      ort?: string;
    };
  };
  
  zahlungsbedingungen?: {         // Zahlungsbedingungen (optional)
    zahlungsziel?: number;        // Zahlungsziel in Tagen
    skonto?: {
      prozent: number;            // Skonto-Prozentsatz
      tage: number;               // Skonto-Tage
    };
  };
  
  notizen?: string;              // Zusätzliche Notizen
  erstelltAm: string;            // ISO Date String - Erstellungsdatum
}
```

**Beispiel:**
```json
{
  "id": "kred_123",
  "name": "Bauhaus GmbH",
  "kreditorennummer": "KR-001",
  "kontakt": {
    "ansprechpartner": "Max Mustermann",
    "telefon": "+49 123 456789",
    "email": "max@bauhaus.de",
    "adresse": {
      "strasse": "Musterstraße 1",
      "plz": "12345",
      "ort": "Musterstadt"
    }
  },
  "zahlungsbedingungen": {
    "zahlungsziel": 30,
    "skonto": {
      "prozent": 2,
      "tage": 10
    }
  },
  "erstelltAm": "2025-01-15T10:00:00.000Z"
}
```

### 2. Offene Rechnung

```typescript
interface OffeneRechnung {
  id: string;                    // Eindeutige ID
  rechnungsnummer?: string;       // Externe Rechnungsnummer vom Kreditor
  betreff?: string;               // Betreff/Kurzbeschreibung
  
  kreditorId: string;              // Referenz zum Kreditor (Pflichtfeld)
  kreditorName: string;           // Name des Kreditors (denormalisiert)
  
  status: RechnungsStatus;        // Status der Rechnung (siehe unten)
  summe: number;                 // Betrag in EUR (Pflichtfeld)
  mwst?: number;                  // MwSt-Betrag (optional)
  bruttoSumme?: number;           // Summe inkl. MwSt (optional)
  
  faelligkeitsdatum: string;      // ISO Date String - Fälligkeitsdatum (Pflichtfeld)
  rechnungsdatum?: string;         // ISO Date String - Rechnungsdatum
  
  mahnstufe: Mahnstufe;           // 0-5 (0 = keine Mahnung)
  letzterKontakt?: string;         // ISO Date String - Letzter Kontakt
  spaetestensBearbeitenAm?: string; // ISO Date String - Deadline
  
  prioritaet: Prioritaet;         // kritisch | hoch | normal | niedrig
  kategorie: Rechnungskategorie;  // Kategorie (siehe unten)
  
  kommentar?: string;             // Zusätzliche Notizen
  anhaenge?: string[];            // URLs/Pfade zu Dokumenten
  zahlungsreferenz?: string;      // Verwendungszweck
  
  erstelltAm: string;             // ISO Date String
  geaendertAm: string;            // ISO Date String
  bezahltAm?: string;             // ISO Date String (wann bezahlt)
  bezahlbetrag?: number;          // Tatsächlich bezahlter Betrag
}
```

**Status-Werte:**
- `offen` - Rechnung ist offen und noch nicht fällig
- `faellig` - Rechnung ist fällig
- `gemahnt` - Rechnung wurde gemahnt
- `in_bearbeitung` - Rechnung wird bearbeitet/zur Zahlung vorbereitet
- `verzug` - Rechnung ist im Verzug
- `bezahlt` - Rechnung wurde bezahlt
- `storniert` - Rechnung wurde storniert

**Mahnstufe:**
- `0` - Keine Mahnung
- `1` - 1. Mahnung
- `2` - 2. Mahnung
- `3` - 3. Mahnung
- `4` - 4. Mahnung
- `5` - 5. Mahnung

**Priorität:**
- `kritisch` - Kritisch (sofortige Bearbeitung erforderlich)
- `hoch` - Hoch (baldige Bearbeitung erforderlich)
- `normal` - Normal (Standard-Priorität)
- `niedrig` - Niedrig (kann später bearbeitet werden)

**Kategorie:**
- `lieferanten` - Lieferanten
- `dienstleister` - Dienstleister
- `energie` - Energie
- `miete` - Miete
- `versicherung` - Versicherung
- `steuern` - Steuern
- `sonstiges` - Sonstiges

**Beispiel:**
```json
{
  "id": "rech_456",
  "rechnungsnummer": "RE-2025-001",
  "betreff": "Materiallieferung Januar 2025",
  "kreditorId": "kred_123",
  "kreditorName": "Bauhaus GmbH",
  "status": "faellig",
  "summe": 1250.50,
  "mwst": 237.60,
  "bruttoSumme": 1488.10,
  "faelligkeitsdatum": "2025-01-20T00:00:00.000Z",
  "rechnungsdatum": "2025-01-01T00:00:00.000Z",
  "mahnstufe": 0,
  "prioritaet": "hoch",
  "kategorie": "lieferanten",
  "kommentar": "Wichtig für Produktion",
  "zahlungsreferenz": "RE-2025-001",
  "erstelltAm": "2025-01-15T10:00:00.000Z",
  "geaendertAm": "2025-01-15T10:00:00.000Z"
}
```

## Appwrite Collections Setup

### Collection: `kreditoren`

**Collection ID:** `kreditoren`  
**Name:** `Kreditoren`

**Attribute:**
- `data` (String, Size: 100000) - Enthält das gesamte Kreditor-Objekt als JSON-String

**Berechtigungen:**
- Read: `users` oder `any`
- Create: `users` oder `any`
- Update: `users` oder `any`
- Delete: `users` oder `any`

### Collection: `offene_rechnungen`

**Collection ID:** `offene_rechnungen`  
**Name:** `Offene Rechnungen`

**Attribute:**
- `data` (String, Size: 100000) - Enthält das gesamte OffeneRechnung-Objekt als JSON-String

**Berechtigungen:**
- Read: `users` oder `any`
- Create: `users` oder `any`
- Update: `users` oder `any`
- Delete: `users` oder `any`

## Statistik-Datenstruktur

Die Statistik wird zur Laufzeit berechnet und enthält:

```typescript
interface KreditorenStatistik {
  gesamtOffen: number;              // Anzahl offener Rechnungen
  gesamtBetrag: number;              // Summe aller offenen Rechnungen
  faelligBetrag: number;             // Summe fälliger Rechnungen
  verzugBetrag: number;              // Summe im Verzug
  gemahntBetrag: number;             // Summe gemahnter Rechnungen
  
  nachStatus: Record<RechnungsStatus, {
    anzahl: number;
    betrag: number;
  }>;
  
  nachMahnstufe: Record<Mahnstufe, {
    anzahl: number;
    betrag: number;
  }>;
  
  nachKategorie: Record<Rechnungskategorie, {
    anzahl: number;
    betrag: number;
  }>;
  
  kritischeRechnungen: OffeneRechnung[];  // Top 10 kritische Rechnungen
  naechsteFaelligkeiten: OffeneRechnung[]; // Top 10 nächste Fälligkeiten
}
```

## Verwendung

### 1. Kreditor erstellen

```typescript
import { kreditorService } from './services/kreditorService';

const neuerKreditor = {
  name: "Bauhaus GmbH",
  kreditorennummer: "KR-001",
  kontakt: {
    ansprechpartner: "Max Mustermann",
    telefon: "+49 123 456789",
    email: "max@bauhaus.de"
  },
  zahlungsbedingungen: {
    zahlungsziel: 30
  }
};

const kreditor = await kreditorService.createKreditor(neuerKreditor);
```

### 2. Rechnung erstellen

```typescript
const neueRechnung = {
  kreditorId: "kred_123",
  kreditorName: "Bauhaus GmbH",
  rechnungsnummer: "RE-2025-001",
  betreff: "Materiallieferung",
  summe: 1250.50,
  faelligkeitsdatum: new Date("2025-01-20").toISOString(),
  status: "offen",
  mahnstufe: 0,
  prioritaet: "normal",
  kategorie: "lieferanten"
};

const rechnung = await kreditorService.createRechnung(neueRechnung);
```

### 3. Statistik abrufen

```typescript
const statistik = await kreditorService.berechneStatistik();
console.log(`Gesamtbetrag offen: ${statistik.gesamtBetrag} EUR`);
console.log(`Fällige Rechnungen: ${statistik.faelligBetrag} EUR`);
```

### 4. Rechnungen filtern

```typescript
const filter: RechnungsFilter = {
  status: ['faellig', 'verzug'],
  prioritaet: ['kritisch', 'hoch'],
  kategorie: ['lieferanten']
};

const gefilterteRechnungen = await kreditorService.filterRechnungen(
  filter,
  'faelligkeitsdatum',
  'asc'
);
```

## Diagramme und Visualisierungen

Die Anwendung bietet folgende Visualisierungen:

1. **Status-Verteilung** - Balkendiagramm der Rechnungen nach Status
2. **Kategorie-Verteilung** - Balkendiagramm der Rechnungen nach Kategorie
3. **Statistik-Karten** - Übersichtskarten mit:
   - Gesamtbetrag offen
   - Fällige Beträge
   - Beträge im Verzug
   - Gemahnte Beträge
4. **Kritische Rechnungen** - Liste der kritischsten Rechnungen
5. **Nächste Fälligkeiten** - Liste der Rechnungen, die in den nächsten 7 Tagen fällig werden

## Best Practices

1. **Kreditoren zuerst anlegen** - Bevor Sie Rechnungen anlegen, sollten Sie die Kreditoren-Stammdaten anlegen
2. **Konsistente Kategorien** - Verwenden Sie konsistent die vordefinierten Kategorien
3. **Prioritäten setzen** - Setzen Sie realistische Prioritäten für bessere Übersicht
4. **Regelmäßige Aktualisierung** - Aktualisieren Sie den Status regelmäßig, besonders bei Zahlungen
5. **Kommentare nutzen** - Nutzen Sie das Kommentarfeld für wichtige Informationen

## Migration bestehender Daten

Falls Sie bereits Rechnungen in einem anderen System haben, können Sie diese wie folgt migrieren:

1. Erstellen Sie zuerst alle Kreditoren-Stammdaten
2. Importieren Sie die Rechnungen mit den entsprechenden `kreditorId`-Referenzen
3. Stellen Sie sicher, dass alle Pflichtfelder ausgefüllt sind
4. Überprüfen Sie die Datenintegrität nach dem Import
