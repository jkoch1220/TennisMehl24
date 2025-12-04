# Dispo-Planung Tool - Konzept

## 🎯 Vision
Ein umfassendes Dispositions- und Lieferplanungstool, das die tägliche Planung von Lieferungen optimiert, Routen intelligent zusammenfasst und alle relevanten Informationen zentral verwaltet.

---

## 📋 Kernfunktionalitäten

### 1. **Lieferungen verwalten**
- ✅ Lieferungen anlegen, bearbeiten, löschen
- ✅ Status-Tracking (Geplant → Bestätigt → Beladen → Unterwegs → Geliefert → Abgerechnet)
- ✅ Prioritäten setzen (Hoch, Normal, Niedrig)
- ✅ Notizen und Anmerkungen zu Lieferungen
- ✅ Kundeninformationen verwalten
- ✅ Lieferhistorie und Wiederholungslieferungen

### 2. **Kalenderansicht**
- 📅 Monatsansicht mit allen geplanten Lieferungen
- 📅 Wochenansicht für detaillierte Planung
- 📅 Tagesansicht für aktuelle Lieferungen
- 🎨 Farbcodierung nach Status/Priorität/Lieferart
- 📊 Übersicht über Auslastung pro Tag/Woche

### 3. **Routenoptimierung**
- 🗺️ Automatische Routenoptimierung für mehrere Lieferungen
- 🚚 Optimale Reihenfolge der Anlieferungen berechnen
- ⏱️ Zeitplanung mit realistischen Fahrzeiten
- 💰 Kostenberechnung pro Route (Diesel, Verschleiß, Zeit)
- 📍 Kartenansicht mit Route visualisieren
- 🔄 Manuelle Anpassung der Route möglich

### 4. **Fahrzeugverwaltung**
- 🚛 LKW-Flotte verwalten (Kennzeichen, Typ, Kapazität)
- ⚙️ Fahrzeug-spezifische Stammdaten (Verbrauch, Verschleißpauschale)
- 📊 Verfügbarkeit pro Fahrzeug (Wartung, Reparatur, Urlaub)
- 👤 Fahrer-Zuordnung zu Fahrzeugen
- 📈 Auslastungsstatistiken pro Fahrzeug

### 5. **Intelligente Planung**
- 🤖 Automatische Vorschläge für optimale Routen
- 📦 Mehrere Lieferungen zu einer Tour zusammenfassen
- ⚡ Konflikt-Erkennung (Überlastung, Zeitfenster)
- 💡 Vorschläge für bessere Auslastung
- 📊 Kapazitätsplanung (Tonnen pro Tag/Woche)

### 6. **Integration mit bestehenden Tools**
- 🔗 Verknüpfung mit Speditionskosten-Rechner
- 💶 Automatische Kostenberechnung pro Lieferung
- 📊 Nutzung der bestehenden Routenberechnung
- 💾 Verwendung der Appwrite-Datenbank

---

## 🗂️ Datenstruktur

### Lieferung (Delivery)
```typescript
interface Lieferung {
  id: string;
  kundenname: string;
  kundennummer?: string;
  adresse: {
    strasse: string;
    plz: string;
    ort: string;
    koordinaten?: [number, number]; // [lon, lat]
  };
  kontakt?: {
    name: string;
    telefon: string;
    email?: string;
  };
  lieferdetails: {
    warenart: 'sackware' | 'schuettware';
    paletten: number;
    gewicht: number; // kg
    tonnen: number;
    kundentyp: 'endkunde' | 'grosskunde';
  };
  zeitfenster: {
    gewuenscht: Date; // Gewünschtes Lieferdatum
    bestaetigt?: Date; // Bestätigtes Lieferdatum
    zeitfenster?: {
      von: string; // HH:mm
      bis: string; // HH:mm
    };
  };
  status: 'geplant' | 'bestaetigt' | 'beladen' | 'unterwegs' | 'geliefert' | 'abgerechnet';
  priorität: 'hoch' | 'normal' | 'niedrig';
  lieferart: 'spedition' | 'eigenlieferung';
  route?: {
    routeId: string; // Verknüpfung zu Route
    positionInRoute: number; // Position in der Route (1, 2, 3...)
  };
  kosten?: {
    werkspreis: number;
    transportkosten: number;
    gesamtpreis: number;
  };
  notizen?: string;
  erstelltAm: Date;
  geaendertAm: Date;
}
```

### Route (Tour)
```typescript
interface Route {
  id: string;
  name: string; // z.B. "Route Nord - 15.01.2025"
  datum: Date;
  fahrzeugId: string;
  fahrer?: string;
  lieferungen: string[]; // IDs der Lieferungen in Reihenfolge
  routeDetails: {
    startAdresse: string; // Wertheimer Str. 30, 97828 Marktheidenfeld
    endAdresse: string; // Rückkehr zum Start
    gesamtDistanz: number; // km
    gesamtFahrzeit: number; // Minuten
    gesamtZeit: number; // Minuten (inkl. Beladung, Abladung, Pausen)
    dieselkosten: number; // €
    verschleisskosten: number; // €
    gesamtkosten: number; // €
  };
  zeitplan: {
    startZeit: Date; // Geplante Abfahrt
    rueckkehrZeit: Date; // Geplante Rückkehr
    stops: Array<{
      lieferungId: string;
      ankunft: Date;
      abfahrt: Date;
      distanzVomStart: number; // km
    }>;
  };
  status: 'geplant' | 'aktiv' | 'abgeschlossen' | 'storniert';
  optimiert: boolean; // Wurde die Route automatisch optimiert?
  erstelltAm: Date;
}
```

### Fahrzeug (Vehicle)
```typescript
interface Fahrzeug {
  id: string;
  kennzeichen: string;
  typ: string; // z.B. "LKW 7,5t", "LKW 12t"
  kapazitaetTonnen: number;
  stammdaten: EigenlieferungStammdaten; // Wiederverwendung bestehender Struktur
  verfuegbarkeit: {
    verfuegbar: boolean;
    nichtVerfuegbarBis?: Date; // Wartung, Reparatur
    grund?: string;
  };
  fahrer?: string; // Standard-Fahrer
  statistik: {
    gesamtKilometer: number;
    gesamtLieferungen: number;
    durchschnittlicheAuslastung: number; // %
  };
}
```

### Kunde (Customer)
```typescript
interface Kunde {
  id: string;
  kundennummer: string;
  name: string;
  adresse: {
    strasse: string;
    plz: string;
    ort: string;
    koordinaten?: [number, number];
  };
  kontakt: {
    name: string;
    telefon: string;
    email?: string;
  };
  kundentyp: 'endkunde' | 'grosskunde';
  lieferhinweise?: string; // z.B. "Nur vormittags", "Hofeinfahrt eng"
  zahlungsbedingungen?: string;
  lieferhistorie: string[]; // IDs vergangener Lieferungen
  erstelltAm: Date;
}
```

---

## 🎨 UI/UX Konzept

### Hauptansicht: Kalender mit Tabs
```
┌─────────────────────────────────────────────────────────┐
│ [Kalender] [Routen] [Fahrzeuge] [Kunden] [Statistik]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [◀ Jan]  Januar 2025  [Feb ▶]                        │
│                                                         │
│  Mo  Di  Mi  Do  Fr  Sa  So                            │
│  ─────────────────────────────────────                 │
│  [6] [7] [8] [9] [10] [11] [12]                        │
│  [13] [14] [15] [16] [17] [18] [19]                    │
│  [20] [21] [22] [23] [24] [25] [26]                    │
│                                                         │
│  📅 15. Januar 2025                                     │
│  ─────────────────────────────────────                 │
│  🚚 Route Nord (LKW-AB-123)                            │
│     ⏰ 08:00 - 16:30                                    │
│     📍 3 Lieferungen                                    │
│     💰 245,50 €                                         │
│                                                         │
│  📦 Einzellieferung                                     │
│     🏢 Firma Müller                                     │
│     ⏰ 14:00                                            │
│     📍 2 Paletten                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Routenansicht
```
┌─────────────────────────────────────────────────────────┐
│ Routen für: [15.01.2025 ▼] [+ Neue Route]             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Route Nord - 15.01.2025                               │
│  🚛 LKW-AB-123  |  👤 Max Mustermann                   │
│  ⏰ 08:00 - 16:30  |  📍 156 km  |  💰 245,50 €        │
│                                                         │
│  Route:                                                 │
│  1. 🏢 Firma Schmidt (08:30) - 2 Paletten              │
│  2. 🏢 Firma Weber (11:15) - 1 Palette                 │
│  3. 🏢 Firma Klein (14:00) - 3 Paletten                │
│                                                         │
│  [🗺️ Karte anzeigen] [✏️ Bearbeiten] [🗑️ Löschen]     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Lieferung hinzufügen/bearbeiten
```
┌─────────────────────────────────────────────────────────┐
│ Neue Lieferung                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Kunde:                                                  │
│  [Kunde auswählen ▼] oder [Neuer Kunde]                │
│                                                         │
│ Adresse:                                                │
│  Straße: [________________]                              │
│  PLZ: [____] Ort: [________________]                     │
│                                                         │
│ Lieferdetails:                                          │
│  Warenart: [Sackware ▼]                                 │
│  Paletten: [__]  Gewicht: [____] kg                     │
│  Kundentyp: [Endkunde ▼]                                │
│                                                         │
│ Zeitfenster:                                            │
│  Gewünschtes Datum: [15.01.2025]                       │
│  Zeitfenster: [08:00] bis [17:00]                       │
│                                                         │
│ Priorität: [Normal ▼]                                   │
│ Lieferart: [Eigenlieferung ▼]                           │
│                                                         │
│ Notizen:                                                │
│  [________________________________]                     │
│                                                         │
│  [Abbrechen]  [Speichern]  [Speichern & Route erstellen]│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Technische Umsetzung

### Komponenten-Struktur
```
src/
├── components/
│   ├── DispoPlanung/
│   │   ├── DispoPlanung.tsx          # Hauptkomponente
│   │   ├── KalenderAnsicht.tsx       # Kalender-View
│   │   ├── RoutenAnsicht.tsx         # Routen-Übersicht
│   │   ├── FahrzeugVerwaltung.tsx   # Fahrzeuge verwalten
│   │   ├── KundenVerwaltung.tsx      # Kunden verwalten
│   │   ├── LieferungFormular.tsx     # Lieferung anlegen/bearbeiten
│   │   ├── RouteDetails.tsx          # Route-Details anzeigen
│   │   ├── RouteOptimizer.tsx        # Routenoptimierung
│   │   ├── KartenAnsicht.tsx         # Kartenansicht mit Route
│   │   └── Statistik.tsx             # Statistiken und Auswertungen
│   └── ...
├── services/
│   ├── lieferungService.ts           # CRUD für Lieferungen
│   ├── routeService.ts               # CRUD für Routen
│   ├── fahrzeugService.ts            # CRUD für Fahrzeuge
│   ├── kundenService.ts              # CRUD für Kunden
│   └── routeOptimizerService.ts      # Routenoptimierungs-Logik
├── utils/
│   ├── routeOptimization.ts          # Optimierungs-Algorithmen
│   ├── kalenderUtils.ts              # Kalender-Hilfsfunktionen
│   └── ...
└── types/
    └── dispo.ts                      # Dispo-spezifische Typen
```

### Appwrite Collections
- `lieferungen` - Alle Lieferungen
- `routen` - Alle Routen/Touren
- `fahrzeuge` - Fahrzeugflotte
- `kunden` - Kundenstamm

### Routenoptimierung
- **Algorithmus**: Nearest Neighbor + 2-Opt Verbesserung
- **Kriterien**: 
  - Minimale Gesamtdistanz
  - Zeitfenster einhalten
  - Kapazität des Fahrzeugs beachten
  - Prioritäten berücksichtigen

### Integration bestehender Funktionen
- Wiederverwendung von `berechneEigenlieferungRoute()` aus `routeCalculation.ts`
- Nutzung von `berechneSpeditionskosten()` für Kostenberechnung
- Geocoding über bestehende Nominatim-Integration

---

## 📊 Features im Detail

### 1. Intelligente Routenoptimierung
- **Automatisch**: Mehrere Lieferungen werden zu optimaler Route kombiniert
- **Manuell anpassbar**: Route kann nachträglich manuell geändert werden
- **Zeitfenster**: Berücksichtigt gewünschte Lieferzeiten
- **Kapazität**: Prüft ob alle Lieferungen ins Fahrzeug passen
- **Kostenoptimierung**: Minimiert Gesamtkosten (Diesel + Verschleiß)

### 2. Echtzeit-Updates
- Status-Änderungen werden sofort im Kalender aktualisiert
- Route wird automatisch neu berechnet bei Änderungen
- Konflikte werden sofort angezeigt

### 3. Export & Reporting
- Export als PDF (Route, Lieferliste)
- Excel-Export für Statistik
- Druckansicht für Fahrer

### 4. Mobile Optimierung
- Responsive Design für Tablet/Smartphone
- Touch-optimierte Bedienung
- Offline-Fähigkeit (Service Worker)

---

## 🚀 Implementierungs-Phasen

### Phase 1: Grundfunktionalität (MVP)
- ✅ Lieferungen anlegen, bearbeiten, löschen
- ✅ Kalenderansicht (Monat/Woche/Tag)
- ✅ Status-Tracking
- ✅ Basis-Routenverwaltung
- ✅ Integration mit bestehender Routenberechnung

### Phase 2: Optimierung
- ✅ Automatische Routenoptimierung
- ✅ Fahrzeugverwaltung
- ✅ Kundenverwaltung
- ✅ Kartenansicht

### Phase 3: Erweiterte Features
- ✅ Statistik & Reporting
- ✅ Export-Funktionen
- ✅ Wiederholungslieferungen
- ✅ Mobile Optimierung

### Phase 4: Advanced Features
- ✅ Echtzeit-Tracking (GPS)
- ✅ Push-Benachrichtigungen
- ✅ Integration mit externen Systemen
- ✅ KI-gestützte Optimierung

---

## 💡 Besondere Highlights

1. **Nahtlose Integration**: Nutzt alle bestehenden Kalkulationstools
2. **Intelligente Planung**: Automatische Vorschläge für optimale Routen
3. **Benutzerfreundlich**: Intuitive Bedienung, moderne UI
4. **Skalierbar**: Kann von kleinen zu großen Flotten wachsen
5. **Datengetrieben**: Alle Entscheidungen basieren auf echten Kosten- und Zeitdaten

---

## 🎯 Erfolgskriterien

- ✅ Reduzierung der Planungszeit um 50%
- ✅ Optimierung der Routen (weniger km, weniger Zeit)
- ✅ Bessere Auslastung der Fahrzeuge
- ✅ Übersichtliche Planung aller Lieferungen
- ✅ Einfache Nachverfolgung des Status

---

## 📝 Nächste Schritte

1. **Datenmodell finalisieren** - Types definieren
2. **Appwrite Collections erstellen** - Datenbank-Schema
3. **UI-Mockups erstellen** - Design finalisieren
4. **MVP implementieren** - Schritt für Schritt
5. **Testing & Feedback** - Iterative Verbesserung


