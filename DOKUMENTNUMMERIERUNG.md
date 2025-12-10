# Dokumentnummerierung-System

## Übersicht

Das System generiert automatisch standardkonforme, eindeutige Dokumentnummern für:
- Angebote (ANG)
- Auftragsbestätigungen (AB)
- Lieferscheine (LS)
- Rechnungen (RE)

## Format

```
PREFIX-JAHR-LAUFNUMMER
```

### Beispiele
- `ANG-2025-0001` (Erstes Angebot 2025)
- `AB-2025-0042` (42. Auftragsbestätigung 2025)
- `LS-2025-0123` (123. Lieferschein 2025)
- `RE-2025-0456` (456. Rechnung 2025)

## Funktionsweise

### 1. Automatische Generierung
Beim Erstellen eines neuen Dokuments wird automatisch eine Nummer generiert:
- Der Zähler wird aus der Stammdaten-Collection geladen
- Es wird geprüft, ob die Nummer bereits existiert
- Bei Duplikaten wird automatisch die nächste freie Nummer verwendet
- Der Zähler wird in der Datenbank gespeichert

### 2. Jahreszyklus
Am Jahreswechsel werden alle Zähler automatisch auf 0 zurückgesetzt:
- 2024: `RE-2024-0001`, `RE-2024-0002`, ...
- 2025: `RE-2025-0001`, `RE-2025-0002`, ...

### 3. Duplikatsprüfung
**WICHTIG:** Das System prüft IMMER, ob eine Nummer bereits existiert:
- Vor dem Speichern wird die Projekte-Collection durchsucht
- Bei Duplikaten wird der Zähler erhöht und erneut geprüft
- Maximal 100 Versuche, um Endlosschleifen zu vermeiden
- Im Fehlerfall wird eine Fallback-Nummer mit Timestamp generiert

### 4. Fehlerbehandlung
Bei Fehlern greift ein mehrstufiges Sicherheitssystem:
1. Retry-Mechanismus bei Race Conditions
2. Fallback auf Timestamp-basierte Nummern
3. Logging aller Operationen für Debugging

## Implementierung

### Service-Funktion
```typescript
import { generiereNaechsteDokumentnummer } from '../services/nummerierungService';

// Automatische Generierung
const angebotsnummer = await generiereNaechsteDokumentnummer('angebot');
// Ergebnis: "ANG-2025-0001"
```

### Manuelle Prüfung
```typescript
import { pruefeDokumentnummer } from '../services/nummerierungService';

// Prüfe ob Nummer bereits existiert (z.B. bei manueller Eingabe)
const { existiert, projekt } = await pruefeDokumentnummer(
  'RE-2025-0123',
  'rechnung'
);

if (existiert) {
  console.warn(`Nummer bereits vergeben an: ${projekt.kundenname}`);
}
```

## Datenbank-Schema

### Stammdaten-Collection
Die Zählerstände werden in der `stammdaten` Collection gespeichert:

```typescript
{
  angebotZaehler: 42,              // Letzter Angebotszähler
  auftragsbestaetigungZaehler: 15, // Letzter AB-Zähler
  lieferscheinZaehler: 89,          // Letzter Lieferscheinzähler
  rechnungZaehler: 156,             // Letzter Rechnungszähler
  jahr: 2025                        // Aktuelles Jahr
}
```

### Projekte-Collection
Die generierten Nummern werden in Projekten gespeichert:

```typescript
{
  angebotsnummer: "ANG-2025-0001",
  auftragsbestaetigungsnummer: "AB-2025-0001",
  lieferscheinnummer: "LS-2025-0001",
  rechnungsnummer: "RE-2025-0001"
}
```

## Setup

### 1. Felder anlegen
Das Setup-Script erstellt automatisch alle benötigten Felder:

```bash
npm run setup:appwrite
```

### 2. Stammdaten initialisieren
Beim ersten Aufruf wird automatisch ein Stammdaten-Dokument mit Zählerstand 0 erstellt.

### 3. Verwendung in Komponenten
Die Komponenten verwenden die Funktionen automatisch:
- `AngebotTab.tsx`
- `AuftragsbestaetigungTab.tsx`
- `LieferscheinTab.tsx`
- `RechnungTab.tsx`

## Best Practices

### ✅ DO
- Immer die Service-Funktionen verwenden
- Niemals direkt auf die Zähler zugreifen
- Logging-Ausgaben beachten bei Debugging

### ❌ DON'T
- Keine manuellen Zähler-Updates in der Datenbank
- Keine eigene Nummerierungslogik implementieren
- Keine Timestamps als Nummern verwenden (außer im Notfall)

## Fehlersuche

### Problem: Doppelte Nummern
**Symptom:** Zwei Dokumente haben die gleiche Nummer

**Ursache:** Race Condition bei gleichzeitigen Anfragen

**Lösung:** Das System prüft automatisch und verhindert dies. Wenn es dennoch auftritt:
1. Prüfe die Logs auf Fehler
2. Überprüfe die Zählerstände in der Stammdaten-Collection
3. Führe eine manuelle Prüfung durch

### Problem: Lücken in der Nummerierung
**Symptom:** Von RE-2025-0001 zu RE-2025-0003, keine 0002

**Ursache:** Dokument wurde erstellt aber nicht gespeichert

**Lösung:** Dies ist normales Verhalten und akzeptabel. Die Nummerierung muss nicht lückenlos sein.

### Problem: Falsche Jahreszahl
**Symptom:** Neue Dokumente haben alte Jahreszahl

**Ursache:** Jahresfeld in Stammdaten wurde nicht aktualisiert

**Lösung:** System aktualisiert automatisch beim ersten Aufruf im neuen Jahr. Manuell prüfbar:
```typescript
import { getZaehlerstaende } from '../services/nummerierungService';
const staende = await getZaehlerstaende();
console.log(staende);
```

## Wartung

### Zählerstände zurücksetzen (Jahreswechsel)
Erfolgt automatisch. Bei Bedarf manuell:
1. Gehe zur Appwrite Console
2. Öffne die Stammdaten-Collection
3. Bearbeite das Dokument `stammdaten_data`
4. Setze alle Zähler auf 0 und das Jahr auf aktuelles Jahr

### Zählerstände ansehen
```typescript
import { getZaehlerstaende } from '../services/nummerierungService';
const zaehlerstaende = await getZaehlerstaende();
console.log('Aktuelle Zählerstände:', zaehlerstaende);
```

## Technische Details

### Race Conditions
Das System ist gegen Race Conditions geschützt durch:
1. Atomare Operationen auf Collection-Ebene
2. Duplikatsprüfung vor Rückgabe
3. Retry-Mechanismus mit Backoff

### Performance
- Durchschnittliche Generierungszeit: < 500ms
- Bei Duplikaten: + 200ms pro zusätzlicher Prüfung
- Maximale Anzahl Prüfungen: 100

### Skalierbarkeit
Das System ist für folgende Last ausgelegt:
- Bis zu 9999 Dokumente pro Typ und Jahr
- Bei mehr: Anpassung des Formats auf 5-stellige Nummern nötig

## Änderungshistorie

### Version 1.0 (Dezember 2024)
- Initiale Implementierung
- Standardkonforme Nummerierung nach deutschem Muster
- Automatische Duplikatsprüfung
- Jahreszyklus-Support
- Fallback-Mechanismen

## Support

Bei Problemen:
1. Prüfe die Browser-Console auf Fehler
2. Überprüfe die Appwrite-Logs
3. Kontaktiere den Entwickler mit Fehlerdetails

