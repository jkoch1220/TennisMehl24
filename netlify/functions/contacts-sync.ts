import { Handler, HandlerEvent } from '@netlify/functions';
import { Client, Databases, Query } from 'node-appwrite';

// Appwrite Konfiguration
const DATABASE_ID = 'tennismehl24_db';
const SAISON_KUNDEN_COLLECTION_ID = 'saison_kunden';
const SAISON_ANSPRECHPARTNER_COLLECTION_ID = 'saison_ansprechpartner';
const KUNDEN_COLLECTION_ID = 'kunden';

// Interfaces
interface SaisonKunde {
  $id: string;
  name: string;
  kundennummer?: string;
  typ: string;
  email?: string;
  rechnungsEmail?: string;
  rechnungsadresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
    land?: string;
  };
  lieferadresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
    land?: string;
  };
  dispoAnsprechpartner?: {
    name?: string;
    telefon?: string;
  };
  aktiv: boolean;
}

interface Ansprechpartner {
  $id: string;
  kundeId: string;
  name: string;
  rolle?: string;
  email?: string;
  telefonnummern?: Array<{
    nummer: string;
    typ?: string;
    beschreibung?: string;
  }>;
  aktiv: boolean;
}

interface KundenListenEintrag {
  $id: string;
  name: string;
  kundennummer?: string;
  kundenTyp?: string;
  telefonnummer?: string;
  ansprechpartner?: string;
  email?: string;
  adresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
    land?: string;
  };
}

// vCard-Text escapen (RFC 6350)
function escapeVCard(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Adresse formatieren für vCard ADR
function formatADR(adresse?: {
  strasse?: string;
  plz?: string;
  ort?: string;
  bundesland?: string;
  land?: string;
}): string | null {
  if (!adresse) return null;
  const { strasse, plz, ort, bundesland, land } = adresse;
  if (!strasse && !plz && !ort) return null;
  // ADR: PO Box;Extended;Street;City;Region;Postal;Country
  return `;;${escapeVCard(strasse || '')};${escapeVCard(ort || '')};${escapeVCard(bundesland || '')};${escapeVCard(plz || '')};${escapeVCard(land || 'Deutschland')}`;
}

// Telefonnummer normalisieren (Deutsche Nummern)
function normalizePhone(nummer: string): string {
  if (!nummer) return '';
  // Entferne Leerzeichen, Bindestriche, Klammern
  let cleaned = nummer.replace(/[\s\-\(\)]/g, '');
  // Wenn mit 0 beginnt, ersetze durch +49
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
    cleaned = '+49' + cleaned.substring(1);
  }
  // 00 -> +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }
  return cleaned;
}

// Telefon-Typ für vCard bestimmen
function getPhoneType(typ?: string): string {
  if (!typ) return 'WORK,VOICE';
  const lower = typ.toLowerCase();
  if (lower.includes('mobil') || lower.includes('handy') || lower.includes('cell')) {
    return 'CELL';
  }
  if (lower.includes('fax')) {
    return 'FAX';
  }
  if (lower.includes('privat') || lower.includes('home')) {
    return 'HOME,VOICE';
  }
  return 'WORK,VOICE';
}

// Einzelne vCard generieren
function generateVCard(params: {
  uid: string;
  fullName: string;
  organization?: string;
  rolle?: string;
  emails?: string[];
  phones?: Array<{ nummer: string; typ?: string }>;
  adresse?: {
    strasse?: string;
    plz?: string;
    ort?: string;
    bundesland?: string;
    land?: string;
  };
  notizen?: string;
  kategorien?: string[];
}): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${params.uid}@tennismehl24.de`,
    `FN:${escapeVCard(params.fullName)}`,
    `N:;${escapeVCard(params.fullName)};;;`,
    `REV:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
  ];

  // Organisation
  if (params.organization) {
    lines.push(`ORG:${escapeVCard(params.organization)}`);
  }

  // Rolle/Titel
  if (params.rolle) {
    lines.push(`TITLE:${escapeVCard(params.rolle)}`);
  }

  // E-Mails
  if (params.emails) {
    for (const email of params.emails) {
      if (email && email.trim()) {
        lines.push(`EMAIL;TYPE=INTERNET,WORK:${email.trim()}`);
      }
    }
  }

  // Telefonnummern
  if (params.phones) {
    for (const phone of params.phones) {
      if (phone.nummer && phone.nummer.trim()) {
        const type = getPhoneType(phone.typ);
        const normalized = normalizePhone(phone.nummer);
        lines.push(`TEL;TYPE=${type}:${normalized}`);
      }
    }
  }

  // Adresse
  const adr = formatADR(params.adresse);
  if (adr) {
    lines.push(`ADR;TYPE=WORK:${adr}`);
  }

  // Notizen
  if (params.notizen) {
    lines.push(`NOTE:${escapeVCard(params.notizen)}`);
  }

  // Kategorien
  if (params.kategorien && params.kategorien.length > 0) {
    lines.push(`CATEGORIES:${params.kategorien.map(escapeVCard).join(',')}`);
  }

  // Produktname (für Erkennung auf dem Handy)
  lines.push('PRODID:-//TennisMehl24//Kontakt-Sync//DE');

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// Alle Dokumente aus einer Collection laden (mit Pagination)
async function loadAllDocuments(
  databases: Databases,
  collectionId: string,
  queries: string[] = []
): Promise<unknown[]> {
  const allDocs: unknown[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      [...queries, Query.limit(limit), Query.offset(offset)]
    );
    allDocs.push(...response.documents);
    offset += limit;
    hasMore = response.documents.length === limit;
  }

  return allDocs;
}

// Main handler
const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/vcard; charset=utf-8',
    'Content-Disposition': 'attachment; filename="tennismehl24-kontakte.vcf"',
    'Cache-Control': 'public, max-age=300',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Nur GET erlauben
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Einfache Token-Authentifizierung
  const token = event.queryStringParameters?.token;
  const expectedToken = process.env.CONTACTS_SYNC_TOKEN;

  if (expectedToken && token !== expectedToken) {
    return {
      statusCode: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Invalid token' }),
    };
  }

  // Query-Parameter
  const quelle = event.queryStringParameters?.quelle || 'alle'; // 'saison', 'kunden', 'alle'
  const nurAktive = event.queryStringParameters?.aktiv !== 'false'; // Standard: nur aktive

  try {
    // Appwrite Client initialisieren
    const client = new Client();

    const endpoint = process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !apiKey) {
      console.error('Appwrite Konfiguration fehlt:', {
        endpoint: !!endpoint,
        projectId: !!projectId,
        apiKey: !!apiKey,
      });
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

    const databases = new Databases(client);
    const vCards: string[] = [];

    // ========================================
    // 1. Saison-Kunden + Ansprechpartner laden
    // ========================================
    if (quelle === 'saison' || quelle === 'alle') {
      // Saison-Kunden laden
      const kundenQueries: string[] = [];
      if (nurAktive) {
        kundenQueries.push(Query.equal('aktiv', true));
      }

      const saisonKunden = (await loadAllDocuments(
        databases,
        SAISON_KUNDEN_COLLECTION_ID,
        kundenQueries
      )) as SaisonKunde[];

      // Ansprechpartner laden
      const ansprechpartnerQueries: string[] = [];
      if (nurAktive) {
        ansprechpartnerQueries.push(Query.equal('aktiv', true));
      }

      const ansprechpartner = (await loadAllDocuments(
        databases,
        SAISON_ANSPRECHPARTNER_COLLECTION_ID,
        ansprechpartnerQueries
      )) as Ansprechpartner[];

      // Ansprechpartner nach Kunden-ID gruppieren
      const apByKunde = new Map<string, Ansprechpartner[]>();
      for (const ap of ansprechpartner) {
        const existing = apByKunde.get(ap.kundeId) || [];
        existing.push(ap);
        apByKunde.set(ap.kundeId, existing);
      }

      for (const kunde of saisonKunden) {
        const kundenAPs = apByKunde.get(kunde.$id) || [];
        const typLabel = kunde.typ === 'verein' ? 'Verein' : 'Platzbauer';
        const kategorien = ['TennisMehl24', typLabel];

        if (kundenAPs.length > 0) {
          // Eigene vCard für jeden Ansprechpartner (mit Firmenname)
          for (const ap of kundenAPs) {
            const phones = ap.telefonnummern?.map((t) => ({
              nummer: t.nummer,
              typ: t.typ,
            })) || [];

            const emails: string[] = [];
            if (ap.email) emails.push(ap.email);

            const notizTeile: string[] = [];
            if (kunde.kundennummer) notizTeile.push(`KdNr: ${kunde.kundennummer}`);
            if (ap.rolle) notizTeile.push(`Rolle: ${ap.rolle}`);
            notizTeile.push(`Typ: ${typLabel}`);

            vCards.push(
              generateVCard({
                uid: `saison-ap-${ap.$id}`,
                fullName: `${ap.name} (${kunde.name})`,
                organization: kunde.name,
                rolle: ap.rolle,
                emails,
                phones,
                adresse: kunde.lieferadresse || kunde.rechnungsadresse,
                notizen: notizTeile.join(' | '),
                kategorien,
              })
            );
          }
        }

        // Dispo-Ansprechpartner (falls vorhanden und nicht schon als AP angelegt)
        if (kunde.dispoAnsprechpartner?.telefon) {
          const dispoName = kunde.dispoAnsprechpartner.name || 'Dispo';
          const alreadyExists = kundenAPs.some(
            (ap) =>
              ap.telefonnummern?.some(
                (t) =>
                  normalizePhone(t.nummer) ===
                  normalizePhone(kunde.dispoAnsprechpartner!.telefon)
              )
          );

          if (!alreadyExists) {
            const notizTeile: string[] = [];
            if (kunde.kundennummer) notizTeile.push(`KdNr: ${kunde.kundennummer}`);
            notizTeile.push(`Dispo-Kontakt | Typ: ${typLabel}`);

            vCards.push(
              generateVCard({
                uid: `saison-dispo-${kunde.$id}`,
                fullName: `${dispoName} (${kunde.name})`,
                organization: kunde.name,
                rolle: 'Dispo',
                emails: kunde.email ? [kunde.email] : [],
                phones: [{ nummer: kunde.dispoAnsprechpartner.telefon, typ: 'Mobil' }],
                adresse: kunde.lieferadresse || kunde.rechnungsadresse,
                notizen: notizTeile.join(' | '),
                kategorien,
              })
            );
          }
        }

        // Falls kein AP und kein Dispo: Kunde direkt als Kontakt (nur wenn E-Mail vorhanden)
        if (kundenAPs.length === 0 && !kunde.dispoAnsprechpartner?.telefon && kunde.email) {
          const notizTeile: string[] = [];
          if (kunde.kundennummer) notizTeile.push(`KdNr: ${kunde.kundennummer}`);
          notizTeile.push(`Typ: ${typLabel}`);

          vCards.push(
            generateVCard({
              uid: `saison-kunde-${kunde.$id}`,
              fullName: kunde.name,
              organization: kunde.name,
              emails: [kunde.email, kunde.rechnungsEmail].filter(Boolean) as string[],
              phones: [],
              adresse: kunde.lieferadresse || kunde.rechnungsadresse,
              notizen: notizTeile.join(' | '),
              kategorien,
            })
          );
        }
      }
    }

    // ========================================
    // 2. Kundenliste (Legacy) laden
    // ========================================
    if (quelle === 'kunden' || quelle === 'alle') {
      const kundenListe = (await loadAllDocuments(
        databases,
        KUNDEN_COLLECTION_ID
      )) as KundenListenEintrag[];

      for (const kunde of kundenListe) {
        // Nur Kunden mit Telefonnummer anlegen
        if (!kunde.telefonnummer && !kunde.email) continue;

        const phones: Array<{ nummer: string; typ?: string }> = [];
        if (kunde.telefonnummer) {
          phones.push({ nummer: kunde.telefonnummer });
        }

        const emails: string[] = [];
        if (kunde.email) emails.push(kunde.email);

        const notizTeile: string[] = [];
        if (kunde.kundennummer) notizTeile.push(`KdNr: ${kunde.kundennummer}`);
        if (kunde.kundenTyp) notizTeile.push(`Typ: ${kunde.kundenTyp}`);
        if (kunde.ansprechpartner) notizTeile.push(`AP: ${kunde.ansprechpartner}`);

        const displayName = kunde.ansprechpartner
          ? `${kunde.ansprechpartner} (${kunde.name})`
          : kunde.name;

        vCards.push(
          generateVCard({
            uid: `kunden-${kunde.$id}`,
            fullName: displayName,
            organization: kunde.name,
            emails,
            phones,
            adresse: kunde.adresse,
            notizen: notizTeile.join(' | '),
            kategorien: ['TennisMehl24', 'Kundenliste'],
          })
        );
      }
    }

    // Alle vCards zusammenfügen
    const vcfContent = vCards.join('\r\n');

    console.log(`Kontakte exportiert: ${vCards.length} vCards generiert (Quelle: ${quelle})`);

    // Statistik als Custom-Header
    const responseHeaders = {
      ...headers,
      'X-Contact-Count': String(vCards.length),
      'X-Source': quelle,
    };

    // Falls JSON-Format angefordert (für die UI-Vorschau)
    if (event.queryStringParameters?.format === 'json') {
      return {
        statusCode: 200,
        headers: { ...responseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anzahl: vCards.length,
          quelle,
          nurAktive,
          generiert: new Date().toISOString(),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: vcfContent,
    };
  } catch (error) {
    console.error('Fehler beim Generieren der Kontakte:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to generate contacts',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
