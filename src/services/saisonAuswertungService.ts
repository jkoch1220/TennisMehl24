/**
 * Saison-Auswertung je Artikel (Stufe 6 Artikelverwaltung, 09/2026).
 *
 * Beantwortet auf Knopfdruck, aus EINER definierten Quelle:
 * - Wie viele Tonnen je Artikel wurden angeboten / beauftragt / fakturiert?
 * - Wie viel davon wurde tatsächlich gewogen (Wiegeschein-Prüfung)?
 * - Welcher Warenerlös (Ab-Werk) und welcher Frachterlös steckt dahinter
 *   (Julians Werkspreis-Regel, siehe erloesAufteilung.ts)?
 * - Wo ist DB1 berechenbar — und wo fehlt der EK (ehrlich ausgewiesen statt
 *   DB1 = Umsatz)?
 *
 * Quelle: FINALISIERTE Belege (bestellabwicklung_dokumente) + geprüfte
 * Wiegescheine. Altdaten werden über das Nummern-Mapping (Aliasse) bestmöglich
 * zugeordnet; was nicht zuordenbar ist, erscheint als eigene Zeile und in der
 * Datenqualitäts-Ampel — nie stillschweigend irgendwo eingerechnet.
 */
import { Query } from 'appwrite';
import { DATABASE_ID, COLLECTIONS } from '../config/appwrite';
import { loadAllDocuments } from '../utils/appwritePagination';
import { Projekt } from '../types/projekt';
import { Position } from '../types/projektabwicklung';
import { getAlleArtikel } from './artikelService';
import { ladeFinalisierteBelege } from './dashboardService';
import {
  ArtikelIndex,
  erstelleArtikelIndex,
  findeArtikelZurPosition,
  normalisiereArtikelnummer,
  berechnePositionsTonnen,
} from '../utils/tonnage';
import { berechneErloesAufteilung } from '../utils/erloesAufteilung';

export const NICHT_ZUORDENBAR = '(nicht zuordenbar)';

export interface ArtikelAuswertungZeile {
  artikelnummer: string;
  bezeichnung: string;
  warengruppe: string | null;
  angeboteneTonnen: number;
  beauftragteTonnen: number;
  fakturierteTonnen: number;
  warenerloes: number;
  frachterloes: number;
  sonstigerErloes: number;
  /** Summe (Umsatz − EK) über Positionen MIT gepflegtem EK. */
  db1: number;
  /** Fakturierte Positionen ohne EK — für diese ist keine Marge berechenbar. */
  positionenOhneEk: number;
  fakturiertePositionen: number;
}

export interface SaisonArtikelAuswertung {
  saisonjahr: number;
  zeilen: ArtikelAuswertungZeile[];
  gewogeneTonnenGesamt: number;
  gewogeneProjekte: number;
  /** Datenqualität */
  freitextPositionen: number;
  nichtZuordenbarePositionen: number;
  nichtAufteilbarerErloes: number;
  anzahlProjekte: number;
  anzahlProjekteMitBelegen: number;
}

type BelegeJeProjekt = Map<string, Partial<Record<'angebot' | 'auftragsbestaetigung' | 'lieferschein' | 'rechnung', string>>>;

interface ProjektFuerAuswertung {
  $id?: string;
  wiegeschein?: { pruefStatus?: string; gepruefteMengeTonnen?: number };
  liefergewicht?: number;
}

function parsePositionen(datenString: string | undefined): Position[] {
  if (!datenString) return [];
  try {
    const daten = JSON.parse(datenString);
    return Array.isArray(daten.positionen) ? daten.positionen : [];
  } catch {
    return [];
  }
}

/**
 * Pure Aggregation — von der UI und den Tests genutzt. Belege und Projekte
 * kommen bereits geladen herein.
 */
export function aggregiereArtikelAuswertung(
  saisonjahr: number,
  projekte: ProjektFuerAuswertung[],
  belege: BelegeJeProjekt,
  index: ArtikelIndex
): SaisonArtikelAuswertung {
  const zeilen = new Map<string, ArtikelAuswertungZeile>();
  let freitextPositionen = 0;
  let nichtZuordenbarePositionen = 0;
  let nichtAufteilbarerErloes = 0;
  let gewogeneTonnenGesamt = 0;
  let gewogeneProjekte = 0;
  let anzahlProjekteMitBelegen = 0;

  const zeileFuer = (position: Position): ArtikelAuswertungZeile => {
    const artikel = findeArtikelZurPosition(position, index);
    const schluessel = artikel
      ? normalisiereArtikelnummer(artikel.artikelnummer)
      : NICHT_ZUORDENBAR;

    if (!artikel) {
      if (position.istFreitextPosition) freitextPositionen++;
      else nichtZuordenbarePositionen++;
    }

    let zeile = zeilen.get(schluessel);
    if (!zeile) {
      zeile = {
        artikelnummer: artikel?.artikelnummer ?? NICHT_ZUORDENBAR,
        bezeichnung: artikel?.bezeichnung ?? 'Positionen ohne Stammartikel (Freitext/unbekannt)',
        warengruppe: artikel?.warengruppe ?? null,
        angeboteneTonnen: 0,
        beauftragteTonnen: 0,
        fakturierteTonnen: 0,
        warenerloes: 0,
        frachterloes: 0,
        sonstigerErloes: 0,
        db1: 0,
        positionenOhneEk: 0,
        fakturiertePositionen: 0,
      };
      zeilen.set(schluessel, zeile);
    }
    return zeile;
  };

  for (const projekt of projekte) {
    const projektBelege = projekt.$id ? belege.get(projekt.$id) : undefined;
    if (projektBelege) anzahlProjekteMitBelegen++;

    // Gewogene Ist-Mengen: nur die bestätigte Wiegeschein-Prüfung zählt.
    const geprueft =
      projekt.wiegeschein?.pruefStatus === 'bestaetigt' ||
      projekt.wiegeschein?.pruefStatus === 'korrigiert';
    const gewogen = geprueft
      ? projekt.wiegeschein?.gepruefteMengeTonnen ?? projekt.liefergewicht
      : undefined;
    if (gewogen && gewogen > 0) {
      gewogeneTonnenGesamt += gewogen;
      gewogeneProjekte++;
    }

    for (const pos of parsePositionen(projektBelege?.angebot)) {
      if (pos.istBedarfsposition) continue;
      zeileFuer(pos).angeboteneTonnen += berechnePositionsTonnen(pos, 'auswertung', index);
    }

    for (const pos of parsePositionen(projektBelege?.auftragsbestaetigung)) {
      if (pos.istBedarfsposition) continue;
      zeileFuer(pos).beauftragteTonnen += berechnePositionsTonnen(pos, 'auswertung', index);
    }

    for (const pos of parsePositionen(projektBelege?.rechnung)) {
      if (pos.istBedarfsposition) continue;
      const zeile = zeileFuer(pos);
      zeile.fakturierteTonnen += berechnePositionsTonnen(pos, 'auswertung', index);
      zeile.fakturiertePositionen++;

      const erloes = berechneErloesAufteilung([pos], index);
      zeile.warenerloes += erloes.warenerloes;
      zeile.frachterloes += erloes.frachterloes;
      zeile.sonstigerErloes += erloes.sonstigerErloes;
      nichtAufteilbarerErloes += erloes.nichtAufteilbar;

      const umsatz = pos.gesamtpreis ?? (pos.menge || 0) * (pos.einzelpreis || 0);
      if (pos.einkaufspreis !== undefined && pos.einkaufspreis !== null) {
        zeile.db1 += umsatz - (pos.menge || 0) * pos.einkaufspreis;
      } else {
        zeile.positionenOhneEk++;
      }
    }
  }

  const sortiert = [...zeilen.values()].sort((a, b) => {
    if (a.artikelnummer === NICHT_ZUORDENBAR) return 1;
    if (b.artikelnummer === NICHT_ZUORDENBAR) return -1;
    return b.fakturierteTonnen - a.fakturierteTonnen || b.warenerloes - a.warenerloes;
  });

  return {
    saisonjahr,
    zeilen: sortiert,
    gewogeneTonnenGesamt,
    gewogeneProjekte,
    freitextPositionen,
    nichtZuordenbarePositionen,
    nichtAufteilbarerErloes,
    anzahlProjekte: projekte.length,
    anzahlProjekteMitBelegen,
  };
}

/** Lädt alles Nötige und aggregiert die Saison-Auswertung. */
export async function ladeSaisonArtikelAuswertung(saisonjahr: number): Promise<SaisonArtikelAuswertung> {
  const documents = await loadAllDocuments(DATABASE_ID, COLLECTIONS.PROJEKTE, {
    queries: [Query.equal('saisonjahr', saisonjahr)],
  });

  // Projekt-Nutzdaten liegen im data-JSON (wiegeschein, liefergewicht)
  const projekte: ProjektFuerAuswertung[] = (documents as unknown as Array<Projekt & { data?: string }>).map((doc) => {
    let daten: ProjektFuerAuswertung = doc;
    if (typeof doc.data === 'string') {
      try {
        daten = { ...JSON.parse(doc.data), $id: doc.$id };
      } catch {
        // Original behalten
      }
    }
    return { ...daten, $id: doc.$id };
  });

  const belege = await ladeFinalisierteBelege(projekte.map((p) => p.$id!).filter(Boolean));
  const index = erstelleArtikelIndex(await getAlleArtikel());

  return aggregiereArtikelAuswertung(saisonjahr, projekte, belege, index);
}
