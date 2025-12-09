# Appwrite Collection: Projekte

## Collection ID
`COLLECTIONS.PROJEKTE`

## Beschreibung
Diese Collection speichert alle Projekte für die Bestellabwicklung. Jedes Projekt durchläuft verschiedene Status-Stufen (Angebot → Auftragsbestätigung → Lieferschein → Rechnung → Bezahlt).

## ⚠️ WICHTIG: Appwrite Attribut-Limit

Appwrite hat ein Limit für die Anzahl der Attribute pro Collection (ca. 32-64 Attribute). 

**Problem:** Wenn du versuchst, zu viele Attribute anzulegen, bekommst du den Fehler:
```
The maximum number or size of columns for this table has been reached.
```

**✅ Lösung:** Alle Projekt-Daten werden im `data`-Feld als JSON-String gespeichert. Du musst nur **8 Basis-Indexfelder** als separate Attribute anlegen:

1. `projektName` - Name des Projekts (für Anzeige)
2. `kundeId` - Für Queries
3. `kundenname` - Für Suche
4. `saisonjahr` - Für Filter
5. `status` - Für Kanban-Board
6. `erstelltAm` - Für Sortierung
7. `geaendertAm` - Für Sortierung
8. `data` - **Enthält alle Daten als JSON**

Der `projektService` kümmert sich automatisch um die Serialisierung/Deserialisierung!

## Attribute / Felder

### ✅ Basis-Felder (MÜSSEN als Appwrite-Attribute angelegt werden)

Diese Felder werden für Queries/Suche benötigt und müssen als separate Attribute existieren:

| Feldname | Typ | Größe | Required | Beschreibung |
|----------|-----|-------|----------|--------------|
| `projektName` | String | 255 | Ja | Name des Projekts (für Anzeige in der UI) |
| `kundeId` | String | 255 | Ja | Referenz zur Kunden-ID aus der Saisonplanung |
| `kundenname` | String | 255 | Ja | Name des Kunden (für Suche) |
| `saisonjahr` | Integer | - | Ja | Jahr der Saison (z.B. 2025, für Filter) |
| `status` | String | 50 | Ja | Status des Projekts (für Kanban-View) |
| `erstelltAm` | String | 50 | Ja | Erstellungsdatum (für Sortierung) |
| `geaendertAm` | String | 50 | Ja | Änderungsdatum (für Sortierung) |
| `data` | String | 100000 | Ja | **Alle Projektdaten als JSON** (Hauptspeicher) |

### 📦 Alle anderen Felder (werden im `data`-JSON gespeichert)

Diese Felder werden **NICHT** als separate Appwrite-Attribute angelegt, sondern sind im `data`-JSON enthalten:

#### Dokument-Verlinkungen
- `angebotId`, `angebotsnummer`, `angebotsdatum`
- `auftragsbestaetigungId`, `auftragsbestaetigungsnummer`, `auftragsbestaetigungsdatum`
- `lieferscheinId`, `lieferscheinnummer`, `lieferdatum`
- `rechnungId`, `rechnungsnummer`, `rechnungsdatum`
- `bezahltAm`

#### Kundendaten
- `kundennummer`, `kundenstrasse`, `kundenPlzOrt`

#### Mengen- und Preis-Informationen
- `angefragteMenge`, `preisProTonne`, `bezugsweg`, `platzbauerId`

#### Bestellabwicklungsdaten
- `angebotsDaten` (JSON-String mit allen Angebotsdaten)
- `auftragsbestaetigungsDaten` (JSON-String)
- `lieferscheinDaten` (JSON-String)
- `rechnungsDaten` (JSON-String)

#### Sonstige
- `notizen`, `erstelltVon`

## Indizes

Es sollten folgende Indizes erstellt werden:

1. **kundeId** - Für schnelles Finden von Projekten eines Kunden
2. **saisonjahr** - Für schnelles Filtern nach Saison
3. **status** - Für schnelles Filtern nach Status
4. **kundenname** - Für Suchfunktionen

## Berechtigungen

- **Read**: Alle authentifizierten Benutzer
- **Create**: Alle authentifizierten Benutzer
- **Update**: Alle authentifizierten Benutzer
- **Delete**: Alle authentifizierten Benutzer

## ✅ Anleitung: Minimale Appwrite-Attribute (nur 7 Felder!)

### Schritt 1: Appwrite Console öffnen
1. Öffne die Appwrite Console
2. Navigiere zu deiner Datenbank
3. Wähle die Collection "Projekte" aus (oder erstelle sie)

### Schritt 2: Nur diese 8 Attribute anlegen

**Wichtig:** Wegen des Appwrite-Limits nur diese Felder anlegen!

#### 1. projektName
```
Attribut: projektName
Typ: String
Größe: 255
Required: Ja
Array: Nein
```

#### 2. kundeId
```
Attribut: kundeId
Typ: String
Größe: 255
Required: Ja
Array: Nein
```

#### 3. kundenname
```
Attribut: kundenname
Typ: String
Größe: 255
Required: Ja
Array: Nein
```

#### 4. saisonjahr
```
Attribut: saisonjahr
Typ: Integer
Min: 2000
Max: 2100
Required: Ja
Array: Nein
```

#### 5. status
```
Attribut: status
Typ: String
Größe: 50
Required: Ja
Array: Nein
```

#### 6. erstelltAm
```
Attribut: erstelltAm
Typ: String
Größe: 50
Required: Ja
Array: Nein
```

#### 7. geaendertAm
```
Attribut: geaendertAm
Typ: String
Größe: 50
Required: Ja
Array: Nein
```

#### 8. data
```
Attribut: data
Typ: String
Größe: 100000
Required: Ja
Array: Nein
```

### Schritt 3: Indizes erstellen (optional, aber empfohlen)
1. Navigiere zum Tab "Indexes"
2. Erstelle Indizes für:
   - kundeId
   - saisonjahr
   - status
   - kundenname

## JSON-Struktur des `data`-Feldes

Das `data`-Feld enthält ALLE Projektdaten als JSON-String:

```json
{
  "id": "uuid",
  "projektName": "TC Beispiel - 2025",
  "kundeId": "kunde-id",
  "kundennummer": "K-12345",
  "kundenname": "Tennisclub Beispiel",
  "kundenstrasse": "Sportweg 1",
  "kundenPlzOrt": "12345 Musterstadt",
  "saisonjahr": 2025,
  "status": "angebot",
  "angefragteMenge": 10.5,
  "preisProTonne": 150.00,
  "bezugsweg": "direkt",
  "platzbauerId": null,
  "notizen": "Stammkunde, pünktliche Zahlung",
  "angebotId": "angebot-uuid",
  "angebotsnummer": "ANG-2025-0001",
  "angebotsdatum": "2025-12-09",
  "angebotsDaten": "{...json...}",
  "auftragsbestaetigungId": null,
  "auftragsbestaetigungsnummer": null,
  "auftragsbestaetigungsdatum": null,
  "auftragsbestaetigungsDaten": null,
  "lieferscheinId": null,
  "lieferscheinnummer": null,
  "lieferdatum": null,
  "lieferscheinDaten": null,
  "rechnungId": null,
  "rechnungsnummer": null,
  "rechnungsdatum": null,
  "rechnungsDaten": null,
  "bezahltAm": null,
  "erstelltAm": "2025-12-09T10:30:00Z",
  "geaendertAm": "2025-12-09T10:30:00Z",
  "erstelltVon": "user-id"
}
```

## JSON-Struktur der Bestellabwicklungsdaten (innerhalb von data)

### angebotsDaten (AngebotsDaten)
```json
{
  "firmenname": "Firma Name",
  "firmenstrasse": "Straße 1",
  "firmenPlzOrt": "12345 Ort",
  "firmenTelefon": "+49...",
  "firmenEmail": "info@...",
  "kundenname": "Kunde Name",
  "kundenstrasse": "Kundenstr. 1",
  "kundenPlzOrt": "54321 Kundenort",
  "angebotsnummer": "ANG-2025-0001",
  "angebotsdatum": "2025-12-09",
  "gueltigBis": "2025-12-31",
  "positionen": [
    {
      "id": "uuid",
      "bezeichnung": "Tennismehl",
      "menge": 10,
      "einheit": "t",
      "einzelpreis": 100,
      "gesamtpreis": 1000
    }
  ],
  "zahlungsziel": "14 Tage",
  "lieferzeit": "2-3 Wochen"
}
```

### auftragsbestaetigungsDaten (AuftragsbestaetigungsDaten)
Ähnliche Struktur wie AngebotsDaten, aber mit `auftragsbestaetigungsnummer` und `auftragsbestaetigungsdatum`.

### lieferscheinDaten (LieferscheinDaten)
```json
{
  "firmenname": "...",
  "kundenname": "...",
  "lieferscheinnummer": "LS-2025-0001",
  "lieferdatum": "2025-12-15",
  "positionen": [
    {
      "id": "uuid",
      "artikel": "Tennismehl",
      "menge": 10,
      "einheit": "t"
    }
  ]
}
```

### rechnungsDaten (RechnungsDaten)
```json
{
  "firmenname": "...",
  "kundenname": "...",
  "rechnungsnummer": "RE-2025-0001",
  "rechnungsdatum": "2025-12-15",
  "leistungsdatum": "2025-12-15",
  "bankname": "Bank Name",
  "iban": "DE...",
  "bic": "...",
  "positionen": [...],
  "zahlungsziel": "14 Tage"
}
```

## Verwendung im Code

### Projekt mit Bestellabwicklungsdaten speichern:
```typescript
const angebotsDaten: AngebotsDaten = {
  // ... Angebotsdaten
};

await projektService.updateProjekt(projektId, {
  angebotsDaten: JSON.stringify(angebotsDaten),
  angebotsnummer: angebotsDaten.angebotsnummer,
  angebotsdatum: angebotsDaten.angebotsdatum
});
```

### Bestellabwicklungsdaten aus Projekt laden:
```typescript
const projekt = await projektService.getProjekt(projektId);

if (projekt.angebotsDaten) {
  const angebotsDaten: AngebotsDaten = JSON.parse(projekt.angebotsDaten);
  // Verwende angebotsDaten
}
```
