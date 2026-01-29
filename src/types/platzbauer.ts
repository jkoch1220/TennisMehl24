import { ProjektStatus } from './projekt';
import { SaisonKunde, SaisonKundeMitDaten } from './saisonplanung';

// ==================== PLATZBAUER-PROJEKT TYPES ====================

// Platzbauer-Projekt Typ (Saisonprojekt oder Nachtrag)
export type PlatzbauerprojektTyp = 'saisonprojekt' | 'nachtrag';

// Platzbauer-Saisonprojekt (z.B. "Vogel 2026" oder "Vogel 2026 - Nachtrag 1")
export interface PlatzbauerProjekt {
  id: string;
  $id?: string; // Appwrite Document ID

  // Platzbauer-Referenz
  platzbauerId: string;
  platzbauerName: string;

  // Projekt-Identifikation
  projektName: string;           // z.B. "Vogel 2026" oder "Vogel 2026 - Nachtrag 1"
  saisonjahr: number;
  status: ProjektStatus;
  typ: PlatzbauerprojektTyp;

  // Bei Nachträgen: Referenz auf Hauptprojekt
  hauptprojektId?: string;
  nachtragNummer?: number;       // z.B. 1, 2, 3 für "Nachtrag 1", "Nachtrag 2", etc.

  // Dokumente (wie bei normalen Projekten)
  angebotId?: string;
  angebotsnummer?: string;
  angebotsdatum?: string;

  auftragsbestaetigungId?: string;
  auftragsbestaetigungsnummer?: string;
  auftragsbestaetigungsdatum?: string;

  lieferscheinId?: string;
  lieferscheinnummer?: string;

  rechnungId?: string;
  rechnungsnummer?: string;
  rechnungsdatum?: string;

  bezahltAm?: string;

  // Aggregierte Daten (berechnet aus zugeordneten Vereinsprojekten)
  gesamtMenge?: number;          // Summe aller Tonnen
  gesamtBrutto?: number;         // Summe aller Bruttopreise
  anzahlVereine?: number;        // Anzahl zugeordneter Vereine

  // JSON-Datenfeld für alle zusätzlichen Daten inkl. Entwürfe
  data?: string;

  // Zusätzliche Infos
  notizen?: string;

  // Timestamps
  erstelltAm: string;
  geaendertAm: string;
  erstelltVon?: string;
}

// Neues Platzbauer-Projekt (ohne generierte Felder)
export type NeuesPlatzbauerProjekt = Omit<PlatzbauerProjekt, 'id' | '$id' | 'erstelltAm' | 'geaendertAm'> & {
  id?: string;
};

// ==================== ZUORDNUNG TYPES ====================

// Zuordnung: Vereinsprojekt -> Platzbauerprojekt
// WICHTIG: Mehrere Vereine können einem Projekt/Nachtrag zugeordnet sein!
export interface ProjektZuordnung {
  id: string;
  $id?: string;

  vereinsProjektId: string;      // Referenz auf normales Projekt
  platzbauerprojektId: string;   // Referenz auf PlatzbauerProjekt

  // Reihenfolge in Dokumenten (für Sortierung der Positionen)
  position: number;

  erstelltAm: string;
}

// Neue Zuordnung
export type NeueProjektZuordnung = Omit<ProjektZuordnung, 'id' | '$id' | 'erstelltAm'>;

// ==================== POSITION TYPES ====================

// Position für Platzbauer-Dokumente (eine Position pro Verein)
export interface PlatzbauerPosition {
  vereinId: string;              // SaisonKunde ID
  vereinsname: string;
  vereinsprojektId: string;      // Normales Projekt ID

  // Mengen und Preise
  menge: number;                 // Tonnen
  einzelpreis: number;           // Preis pro Tonne
  gesamtpreis: number;           // menge * einzelpreis

  // Lieferadresse des Vereins
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
  };

  // Status des Vereinsprojekts
  projektStatus?: ProjektStatus;

  // Lieferschein-Info
  lieferscheinErstellt?: boolean;
  lieferscheinId?: string;
}

// Erweiterte Position für Platzbauer-Angebote mit Artikel-Auswahl
export interface PlatzbauerAngebotPosition {
  id: string;                    // Eindeutige Position-ID (für UI)

  // Artikel-Daten
  artikelId?: string;            // Appwrite Artikel ID
  artikelnummer: string;         // z.B. "TM-ZM-02" oder "TM-ZM-03"
  bezeichnung: string;           // z.B. "Ziegelmehl 0/2"
  beschreibung?: string;         // z.B. "für TC Musterstadt"
  einheit: string;               // z.B. "t"

  // Mengen und Preise
  menge: number;                 // Tonnen
  einzelpreis: number;           // Preis pro Tonne
  gesamtpreis: number;           // menge * einzelpreis

  // Verein-Referenz (optional - für Positionen die zu einem Verein gehören)
  vereinId?: string;             // SaisonKunde ID
  vereinsname?: string;
  vereinsprojektId?: string;     // Normales Projekt ID

  // Lieferadresse des Vereins
  lieferadresse?: {
    strasse: string;
    plz: string;
    ort: string;
  };
}

// ==================== AGGREGIERTE TYPES ====================

// Platzbauer mit zugeordneten Vereinen und Projekten
export interface PlatzbauermitVereinen {
  platzbauer: SaisonKunde;

  // Zugeordnete Vereine (alle die standardPlatzbauerId = platzbauer.id haben)
  vereine: SaisonKundeMitDaten[];

  // Projekte für diesen Platzbauer
  projekte: PlatzbauerProjekt[];

  // Statistik für diesen Platzbauer
  statistik?: {
    anzahlVereine: number;
    gesamtMenge: number;
    offeneProjekte: number;
    abgeschlosseneProjekte: number;
  };
}

// Vereinsprojekt mit Zuordnung (für Detail-Ansicht)
export interface VereinsprojektMitZuordnung {
  projekt: import('./projekt').Projekt;
  zuordnung: ProjektZuordnung;
  kunde: SaisonKunde;
}

// ==================== FILTER & STATISTIK ====================

// Filter für PBV
export interface PBVFilter {
  saisonjahr?: number;
  status?: ProjektStatus[];
  suche?: string;
  platzbauerId?: string;
  nurMitVereinsprojekten?: boolean;
}

// Statistik für PBV Dashboard
export interface PBVStatistik {
  // Übersicht
  gesamtPlatzbauer: number;
  aktivePlatzbauer: number;      // Mit mindestens einem Vereinsprojekt
  gesamtVereine: number;         // Alle zugeordneten Vereine

  // Projekte nach Status
  projekteNachStatus: Record<ProjektStatus, number>;

  // Mengen und Umsatz
  gesamtMenge: number;           // Summe aller Tonnen
  gesamtUmsatz: number;          // Summe aller Bruttopreise

  // Lieferscheine
  lieferscheineGesamt: number;
  lieferscheineOffen: number;
}

// ==================== KANBAN TYPES ====================

// Kanban-Spalte für PBV
export interface PBVKanbanSpalte {
  id: ProjektStatus;
  label: string;
  color: string;
  bgColor: string;
  projekte: PlatzbauerProjekt[];
}

// Kanban-Board Daten
export interface PBVKanbanDaten {
  spalten: PBVKanbanSpalte[];
  statistik: {
    gesamt: number;
    nachTyp: {
      saisonprojekt: number;
      nachtrag: number;
    };
  };
}

// ==================== DOKUMENT TYPES ====================

// Dokumenttyp für Platzbauer
export type PlatzbauerDokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'rechnung';

// Gespeichertes Platzbauer-Dokument (in Appwrite)
export interface GespeichertesPlatzbauerDokument {
  $id?: string;
  id?: string;
  platzbauerprojektId: string;        // Verknüpfung zum Platzbauer-Projekt
  dokumentTyp: PlatzbauerDokumentTyp;
  dokumentNummer: string;              // z.B. "PB-AG-2026-001"
  dateiId: string;                     // Appwrite Storage File ID
  dateiname: string;                   // z.B. "Angebot Vogel 2026.pdf"
  bruttobetrag?: number;               // Gesamtbetrag
  nettobetrag?: number;
  gesamtMenge?: number;                // Tonnen
  anzahlPositionen?: number;           // Anzahl Vereine
  istFinal: boolean;                   // true bei Rechnungen
  daten?: string;                      // JSON-String der Dokument-Daten
  version?: number;                    // Versionsnummer
  $createdAt?: string;
  $updatedAt?: string;
}

// Gespeicherter Platzbauer-Lieferschein (einzeln pro Verein)
export interface GespeicherterPlatzbauerLieferschein {
  $id?: string;
  id?: string;
  platzbauerprojektId: string;        // Verknüpfung zum Platzbauer-Projekt
  vereinId: string;                    // Verknüpfung zum Verein
  vereinsprojektId: string;            // Verknüpfung zum Vereinsprojekt
  vereinsname: string;
  lieferscheinnummer: string;
  lieferdatum: string;
  dateiId: string;                     // Appwrite Storage File ID
  dateiname: string;
  menge: number;                       // Tonnen
  daten?: string;                      // JSON-String der Lieferschein-Daten
  $createdAt?: string;
  $updatedAt?: string;
}

// UI-Darstellung eines Platzbauer-Dokuments
export interface PlatzbauerDokumentAnzeige {
  id: string;
  typ: PlatzbauerDokumentTyp;
  nummer: string;
  dateiname: string;
  erstelltAm: Date;
  bruttobetrag?: number;
  gesamtMenge?: number;
  istFinal: boolean;
  downloadUrl: string;
  viewUrl: string;
  version?: number;
}

// Dokumentverlauf für die UI
export interface PlatzbauerDokumentVerlaufEintrag extends PlatzbauerDokumentAnzeige {
  istAktuell: boolean;
}

// ==================== FORMULAR-DATEN TYPES ====================

// Basis für alle Platzbauer-Dokument-Formulare
export interface PlatzbauerDokumentBasis {
  // Platzbauer-Daten (Empfänger)
  platzbauerId: string;
  platzbauername: string;
  platzbauerstrasse: string;
  platzbauerPlzOrt: string;
  platzbauerAnsprechpartner?: string;

  // Positionen (Vereine)
  positionen: PlatzbauerPosition[];

  // Bemerkung
  bemerkung?: string;

  // Ihr Ansprechpartner (bei TennisMehl)
  ihreAnsprechpartner?: string;
}

// Formular-Daten für Angebot
export interface PlatzbauerAngebotFormularDaten extends PlatzbauerDokumentBasis {
  angebotsnummer: string;
  angebotsdatum: string;
  gueltigBis: string;

  // Erweiterte Positionen mit Artikel-Auswahl (optional - überschreibt positionen wenn vorhanden)
  angebotPositionen?: PlatzbauerAngebotPosition[];

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
}

// Formular-Daten für Auftragsbestätigung
export interface PlatzbauerABFormularDaten extends PlatzbauerDokumentBasis {
  auftragsbestaetigungsnummer: string;
  auftragsbestaetigungsdatum: string;

  // Zahlungsbedingungen
  zahlungsziel: string;
  zahlungsart?: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };

  // Lieferbedingungen
  lieferzeit?: string;
  frachtkosten?: number;
  verpackungskosten?: number;
  lieferbedingungenAktiviert?: boolean;
  lieferbedingungen?: string;
}

// Formular-Daten für Rechnung
export interface PlatzbauerRechnungFormularDaten extends PlatzbauerDokumentBasis {
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum?: string;

  // Zahlungsbedingungen
  zahlungsziel: string;
  skontoAktiviert?: boolean;
  skonto?: {
    prozent: number;
    tage: number;
  };
}

// Formular-Daten für Lieferschein (einzeln pro Verein)
export interface PlatzbauerLieferscheinFormularDaten {
  // Verein (Empfänger)
  vereinId: string;
  vereinsname: string;
  vereinsstrasse: string;
  vereinsPlzOrt: string;
  vereinsAnsprechpartner?: string;

  // Lieferadresse (falls abweichend)
  lieferadresseAbweichend?: boolean;
  lieferadresseName?: string;
  lieferadresseStrasse?: string;
  lieferadressePlzOrt?: string;

  // Lieferschein-Daten
  lieferscheinnummer: string;
  lieferdatum: string;
  menge: number;
  einheit: string;

  // Platzbauer-Info
  platzbauername?: string;

  // Bemerkung
  bemerkung?: string;

  // Empfangsbestätigung
  unterschriftenFuerEmpfangsbestaetigung?: boolean;

  // Ihr Ansprechpartner
  ihreAnsprechpartner?: string;
}
