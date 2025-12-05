# Dashboard Setup

## Übersicht

Das Dashboard zeigt die wichtigsten Unternehmenskennzahlen auf einen Blick:

- **Ziegelschutt vorhanden** (in Tonnen)
- **Ziegelmehl Schüttware vorhanden** (in Tonnen)
- **Ziegelmehl Sackware vorhanden** (in Säcken)
- **Hammer auf Lager** (in Stück)
- **Anstehende Auslieferungen** (nächste 7 Tage)

## Features

✨ **Modernes Design**
- Minimalistisch und übersichtlich
- Viel Schatten und Tiefe für bessere Optik
- Animierte Progress Bars
- Gradient-Effekte und Hover-Animationen

📊 **Intelligente Statusanzeige**
- 🚨 **ALARM** (rot): Bestand am oder unter Minimum
- ⚠️ **Warnung** (orange): Bestand unter 30% des Zielbereichs
- ✓ **Gut** (blau): Bestand im normalen Bereich
- ★ **Optimal** (grün): Bestand am oder über Maximum

📝 **Bearbeitungsmodus**
- Einfaches Bearbeiten aller Kennzahlen
- Min/Max-Werte pro Kennzahl einstellbar
- Speichern mit einem Klick

## Appwrite Collection Setup

### 1. Collection erstellen

Erstelle in Appwrite eine neue Collection mit dem Namen:

```
lager_bestand
```

**Collection ID:** `lager_bestand`

### 2. Attribute/Felder hinzufügen

Füge nur **EIN** Attribut hinzu:

- **Name:** `data`
- **Type:** String
- **Size:** 10000 (oder mehr)
- **Required:** Nein

Alle Daten werden als JSON im `data`-Feld gespeichert (wie bei den anderen Collections auch).

### 3. Permissions

Setze die Collection auf **Document Security**:

- ✅ **Create**: Role: Any
- ✅ **Read**: Role: Any
- ✅ **Update**: Role: Any
- ✅ **Delete**: Role: Any

### 4. Document ID

Das Dashboard verwendet die feste Document ID: `lager_data`

Beim ersten Aufruf wird das Dokument automatisch erstellt, falls es noch nicht existiert.

## Verwendung

1. Navigiere zum Dashboard über die Navigation: **Dashboard**
2. Klicke auf **Bearbeiten** um in den Bearbeitungsmodus zu wechseln
3. Fülle die aktuellen Bestände und Min/Max-Werte ein
4. Klicke auf **💾 Speichern**

Die Kennzahlen werden nun visuell mit farbigen Progress Bars und Status-Badges dargestellt!

## Automatisches Setup

Wenn die `VITE_APPWRITE_API_KEY` gesetzt ist, wird beim App-Start versucht, die Collection-Felder automatisch zu erstellen. Ansonsten müssen die Felder manuell in Appwrite angelegt werden.

## Anstehende Auslieferungen

Die Anzahl der anstehenden Auslieferungen wird automatisch aus der `bestellungen` Collection berechnet:
- Zeitraum: Heute + 7 Tage
- Nur offene Bestellungen

Stelle sicher, dass die Bestellungen ein `lieferDatum` und `status` Feld haben.
