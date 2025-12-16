# Kalender-Implementierung - Ausführlicher Prompt

## Übersicht
Erstelle einen vollständigen Kalender für die TennisMehl24-Anwendung mit Monats- und Wochenansicht, der sich an Google Calendar orientiert. Der Kalender soll extrem sauber, minimalistisch und klar gestaltet sein.

## Anforderungen

### 1. Design & UI/UX
- **Extrem sauber, minimalistisch und klar**: Keine überflüssigen Elemente, klare Linien, viel Weißraum
- **Google Calendar Inspiration**: 
  - Ähnliche Farbpalette (pastell, aber klar)
  - Ähnliche Interaktionen (Klick auf Zeit = neuer Termin)
  - Ähnliche Drag & Drop Funktionalität
  - Ähnliche Termin-Details Ansicht
- **Vollbild-Anpassung**: Der Kalender soll die gesamte verfügbare Seitenfläche nutzen (100% Höhe und Breite)
- **Responsive**: Funktioniert auf Desktop und Tablet

### 2. Ansichten

#### Monatsansicht
- Klassische Monatsansicht mit 7 Spalten (Mo-So)
- Jeder Tag zeigt alle Termine des Tages
- Termine als farbige Blöcke mit Titel
- Bei mehreren Terminen: "X weitere" anzeigen
- Klick auf Tag öffnet Wochenansicht für diesen Tag
- Klick auf leeren Bereich im Tag erstellt neuen Termin

#### Wochenansicht
- 7 Spalten für die Woche (Mo-So)
- Stunden-Spalte links (00:00 - 23:00)
- Termine als Blöcke mit Start- und Endzeit
- Termine können über mehrere Stunden gehen
- Drag & Drop zum Verschieben von Terminen
- Resize-Handles zum Ändern der Dauer
- Klick auf Zeit-Slot erstellt neuen Termin
- Aktuelle Zeit als rote Linie (wenn in sichtbarem Bereich)

### 3. Termin-Verwaltung

#### Neuen Termin erstellen
- **Schnellerfassung**: 
  - Klick auf Zeit-Slot oder Tag öffnet sofort Eingabefeld
  - Titel eingeben, Enter speichert
  - Optional: Zeit, Beschreibung, Farbe direkt setzen
- **Detailliertes Formular**:
  - Titel (Pflichtfeld)
  - Startdatum & -zeit
  - Enddatum & -zeit
  - Ganztägig-Option
  - Beschreibung (optional)
  - Farbe/Kategorie (optional)
  - Ort (optional)
  - Wiederholung (optional): täglich, wöchentlich, monatlich, jährlich
  - Erinnerung (optional)
- **Google Calendar ähnliche UX**: 
  - Schnelle Eingabe mit natürlicher Sprache ("Morgen 14 Uhr Meeting")
  - Auto-Vervollständigung bei wiederkehrenden Terminen
  - Intelligente Zeit-Erkennung

#### Termin bearbeiten
- Klick auf Termin öffnet Details
- Inline-Bearbeitung möglich
- Drag & Drop zum Verschieben
- Resize zum Ändern der Dauer
- Löschen mit Bestätigung

#### Termin anzeigen
- Klick auf Termin zeigt Details-Panel
- Alle Informationen übersichtlich dargestellt
- Schnelle Aktionen (Bearbeiten, Löschen, Duplizieren)

### 4. Navigation
- **Zeit-Navigation**:
  - "Heute" Button (springt zu aktuellem Tag)
  - Vor/Zurück Buttons (Tag, Woche, Monat)
  - Datum-Picker für schnelles Springen
- **Ansicht wechseln**:
  - Toggle zwischen Monats- und Wochenansicht
  - Aktuelle Ansicht deutlich markiert
- **Header**:
  - Aktuelles Datum/Zeitraum anzeigen
  - Navigation-Buttons
  - Ansicht-Toggle
  - "Neuer Termin" Button

### 5. Appwrite Integration

#### Collection Setup
- **Collection ID**: `kalender_termine`
- **Automatisches Setup**: Muss in `appwriteSetup.ts` integriert werden
- **Felder**:
  - `titel` (string, 500, required)
  - `beschreibung` (string, 2000, optional)
  - `startDatum` (string, 50, required) - ISO Date String
  - `endDatum` (string, 50, required) - ISO Date String
  - `ganztaegig` (boolean, default: false)
  - `farbe` (string, 50, optional) - Hex-Farbcode
  - `ort` (string, 500, optional)
  - `wiederholung` (string, 50, optional) - 'keine', 'taeglich', 'woechentlich', 'monatlich', 'jaehrlich'
  - `wiederholungEnde` (string, 50, optional) - ISO Date String
  - `erinnerung` (integer, optional) - Minuten vor Termin
  - `erstelltAm` (string, 50, required)
  - `geaendertAm` (string, 50, required)
  - `erstelltVon` (string, 100, optional) - User ID
  - `data` (string, 10000, optional) - Für zusätzliche JSON-Daten

#### Berechtigungen
- Alle eingeloggten User können lesen
- Alle eingeloggten User können erstellen
- Nur Ersteller oder Admins können bearbeiten/löschen
- Automatisch in `appwriteSetup.ts` konfigurieren

#### Service-Layer
- Erstelle `src/services/terminService.ts`
- Funktionen:
  - `loadAlleTermine()`: Alle Termine laden
  - `loadTermineImZeitraum(start, end)`: Termine für Zeitraum
  - `createTermin(termin)`: Neuen Termin erstellen
  - `updateTermin(id, termin)`: Termin aktualisieren
  - `deleteTermin(id)`: Termin löschen
  - `parseTerminDocument(doc)`: Dokument parsen

### 6. Technische Details

#### Datei-Struktur
```
src/
  components/
    Kalender/
      Kalender.tsx          # Hauptkomponente
      MonatsAnsicht.tsx    # Monatsansicht
      WochenAnsicht.tsx    # Wochenansicht
      TerminDialog.tsx     # Dialog für Termin-Erstellung/Bearbeitung
      TerminDetails.tsx    # Termin-Details Panel
  types/
    termin.ts              # TypeScript Types
  services/
    terminService.ts       # Appwrite Service
```

#### TypeScript Types
```typescript
export interface Termin {
  id: string;
  titel: string;
  beschreibung?: string;
  startDatum: string; // ISO Date String
  endDatum: string; // ISO Date String
  ganztaegig: boolean;
  farbe?: string; // Hex-Farbcode
  ort?: string;
  wiederholung?: 'keine' | 'taeglich' | 'woechentlich' | 'monatlich' | 'jaehrlich';
  wiederholungEnde?: string; // ISO Date String
  erinnerung?: number; // Minuten vor Termin
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

export interface NeuerTermin {
  titel: string;
  beschreibung?: string;
  startDatum: string;
  endDatum: string;
  ganztaegig?: boolean;
  farbe?: string;
  ort?: string;
  wiederholung?: 'keine' | 'taeglich' | 'woechentlich' | 'monatlich' | 'jaehrlich';
  wiederholungEnde?: string;
  erinnerung?: number;
}
```

#### Styling
- Tailwind CSS verwenden
- Konsistent mit bestehender App (siehe andere Komponenten)
- Farben: Pastell, aber klar
- Schatten: Minimal, nur wo nötig
- Hover-Effekte: Subtile Animationen
- Focus-States: Klar sichtbar für Accessibility

### 7. Features

#### Basis-Features
- ✅ Monatsansicht
- ✅ Wochenansicht
- ✅ Termin erstellen
- ✅ Termin bearbeiten
- ✅ Termin löschen
- ✅ Drag & Drop
- ✅ Resize von Terminen
- ✅ Farb-Kategorien
- ✅ Ganztägige Termine

#### Erweiterte Features (Optional, aber empfohlen)
- Wiederholende Termine
- Erinnerungen
- Suche nach Terminen
- Filter nach Kategorien
- Export (iCal, PDF)
- Teilen von Terminen

### 8. Integration in App

#### Route hinzufügen
- In `src/App.tsx`:
  ```tsx
  import Kalender from './components/Kalender/Kalender';
  
  <Route path="/kalender" element={
    <ProtectedRoute toolId="kalender">
      <Kalender />
    </ProtectedRoute>
  } />
  ```

#### Tool hinzufügen
- In `src/constants/tools.ts`:
  ```tsx
  {
    id: 'kalender',
    name: 'Kalender',
    description: 'Termine und Ereignisse verwalten',
    href: '/kalender',
    icon: Calendar,
    color: 'from-blue-500 to-cyan-500',
  }
  ```

#### Appwrite Setup erweitern
- In `src/config/appwrite.ts`:
  ```tsx
  export const KALENDER_COLLECTION_ID = 'kalender_termine';
  ```
- In `src/utils/appwriteSetup.ts`:
  - Kalender-Felder hinzufügen
  - Collection in Setup-Liste aufnehmen

### 9. Best Practices

#### Performance
- Lazy Loading für Termine
- Virtualisierung für große Listen
- Debouncing bei Suche/Filter
- Optimistic Updates bei Drag & Drop

#### Accessibility
- Keyboard-Navigation vollständig
- ARIA-Labels für Screen Reader
- Focus-Management
- Kontrast-Verhältnisse beachten

#### Code-Qualität
- TypeScript strict mode
- Konsistente Namenskonventionen
- Kommentare für komplexe Logik
- Fehlerbehandlung
- Loading States
- Error Boundaries

### 10. Beispiel-Interaktionen

#### Neuer Termin erstellen
1. User klickt auf Zeit-Slot (z.B. 14:00)
2. Eingabefeld erscheint direkt im Kalender
3. User tippt "Meeting mit Kunde"
4. Enter drücken → Termin wird erstellt
5. Optional: Klick auf Termin öffnet Details für weitere Bearbeitung

#### Termin verschieben
1. User klickt auf Termin
2. Drag & Drop zu neuem Zeit-Slot
3. Optimistic Update (sofort sichtbar)
4. Backend-Update im Hintergrund
5. Bei Fehler: Rollback + Fehlermeldung

#### Ansicht wechseln
1. User klickt auf "Woche" Button
2. Smooth Transition zur Wochenansicht
3. Aktueller Tag/Woche bleibt sichtbar
4. Termine werden entsprechend angezeigt

## Implementierungsreihenfolge

1. **Types & Service** (Grundlage)
   - `src/types/termin.ts`
   - `src/services/terminService.ts`
   - Appwrite Config erweitern
   - Appwrite Setup erweitern

2. **Basis-Komponente**
   - `src/components/Kalender/Kalender.tsx`
   - Navigation & Header
   - Ansicht-Toggle
   - Basis-Layout

3. **Monatsansicht**
   - `src/components/Kalender/MonatsAnsicht.tsx`
   - Kalender-Grid
   - Termine anzeigen
   - Interaktionen

4. **Wochenansicht**
   - `src/components/Kalender/WochenAnsicht.tsx`
   - Stunden-Grid
   - Termine positionieren
   - Drag & Drop
   - Resize

5. **Termin-Verwaltung**
   - `src/components/Kalender/TerminDialog.tsx`
   - `src/components/Kalender/TerminDetails.tsx`
   - CRUD-Operationen

6. **Integration**
   - Route hinzufügen
   - Tool hinzufügen
   - Testing

## Wichtige Hinweise

- **Orientierung an Google Calendar**: Der Kalender soll sich an Google Calendar orientieren, aber nicht kopieren. Eigenes Design, ähnliche UX.
- **Vollbild**: Der Kalender nutzt die gesamte verfügbare Fläche. Keine unnötigen Margins oder Padding.
- **Minimalistisch**: Weniger ist mehr. Keine überflüssigen Features oder UI-Elemente.
- **Performance**: Bei vielen Terminen muss der Kalender flüssig bleiben.
- **Mobile**: Responsive Design ist wichtig, aber Desktop ist Priorität.

## Erfolgskriterien

✅ Kalender ist vollständig funktional
✅ Monats- und Wochenansicht funktionieren
✅ Termine können erstellt, bearbeitet und gelöscht werden
✅ Drag & Drop funktioniert
✅ Appwrite Integration ist vollständig
✅ UI ist sauber, minimalistisch und klar
✅ Kalender nutzt die gesamte Seitenfläche
✅ UX ist angenehm (wie Google Calendar)
✅ Code ist sauber und wartbar
✅ Keine Linter-Fehler

---

**Viel Erfolg bei der Implementierung! 🎉**
