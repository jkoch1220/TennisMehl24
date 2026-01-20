import { Handler, HandlerEvent } from '@netlify/functions';
import { Client, Databases, Query } from 'node-appwrite';

// Termin Interface
interface Termin {
  $id: string;
  titel: string;
  beschreibung?: string;
  startDatum: string;
  endDatum: string;
  ganztaegig: boolean;
  farbe?: string;
  ort?: string;
  wiederholung?: 'keine' | 'taeglich' | 'woechentlich' | 'monatlich' | 'jaehrlich';
  wiederholungEnde?: string;
  erinnerung?: number;
  erstelltAm: string;
  geaendertAm: string;
}

// Appwrite Konfiguration
const DATABASE_ID = 'tennismehl24_db';
const KALENDER_COLLECTION_ID = 'kalender_termine';

// ICS Datum formatieren (UTC)
function formatICSDate(dateString: string, allDay: boolean = false): string {
  const date = new Date(dateString);

  if (allDay) {
    // Für ganztägige Termine: YYYYMMDD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // Für Termine mit Uhrzeit: YYYYMMDDTHHMMSSZ (UTC)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Aktuelles Datum im ICS-Format
function formatICSNow(): string {
  return formatICSDate(new Date().toISOString());
}

// Text für ICS escapen (Zeilenumbrüche, Kommas, Semikolons)
function escapeICSText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Wiederholungsregel (RRULE) generieren
function generateRRule(termin: Termin): string | null {
  if (!termin.wiederholung || termin.wiederholung === 'keine') {
    return null;
  }

  let freq: string;
  switch (termin.wiederholung) {
    case 'taeglich':
      freq = 'DAILY';
      break;
    case 'woechentlich':
      freq = 'WEEKLY';
      break;
    case 'monatlich':
      freq = 'MONTHLY';
      break;
    case 'jaehrlich':
      freq = 'YEARLY';
      break;
    default:
      return null;
  }

  let rrule = `RRULE:FREQ=${freq}`;

  // Wiederholungsende hinzufügen falls vorhanden
  if (termin.wiederholungEnde) {
    const untilDate = formatICSDate(termin.wiederholungEnde, true);
    rrule += `;UNTIL=${untilDate}`;
  }

  return rrule;
}

// Erinnerung (VALARM) generieren
function generateVAlarm(minutes: number): string {
  if (!minutes || minutes <= 0) return '';

  // Konvertiere Minuten in ISO 8601 Duration
  let duration = '-PT';
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remainingMinutes = minutes % 1440;
    duration = `-P${days}D`;
    if (remainingMinutes > 0) {
      if (remainingMinutes >= 60) {
        duration += `T${Math.floor(remainingMinutes / 60)}H`;
        if (remainingMinutes % 60 > 0) {
          duration += `${remainingMinutes % 60}M`;
        }
      } else {
        duration += `T${remainingMinutes}M`;
      }
    }
  } else if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    duration = `-PT${hours}H`;
    if (remainingMinutes > 0) {
      duration += `${remainingMinutes}M`;
    }
  } else {
    duration = `-PT${minutes}M`;
  }

  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Erinnerung',
    `TRIGGER:${duration}`,
    'END:VALARM'
  ].join('\r\n');
}

// Einzelnen VEVENT generieren
function generateVEvent(termin: Termin): string {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${termin.$id}@tennismehl24.de`,
    `DTSTAMP:${formatICSNow()}`,
  ];

  // Start- und Enddatum
  if (termin.ganztaegig) {
    lines.push(`DTSTART;VALUE=DATE:${formatICSDate(termin.startDatum, true)}`);
    // Für ganztägige Termine: Enddatum ist der nächste Tag
    const endDate = new Date(termin.endDatum);
    endDate.setDate(endDate.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${formatICSDate(endDate.toISOString(), true)}`);
  } else {
    lines.push(`DTSTART:${formatICSDate(termin.startDatum)}`);
    lines.push(`DTEND:${formatICSDate(termin.endDatum)}`);
  }

  // Titel
  lines.push(`SUMMARY:${escapeICSText(termin.titel)}`);

  // Beschreibung (optional)
  if (termin.beschreibung) {
    lines.push(`DESCRIPTION:${escapeICSText(termin.beschreibung)}`);
  }

  // Ort (optional)
  if (termin.ort) {
    lines.push(`LOCATION:${escapeICSText(termin.ort)}`);
  }

  // Letzte Änderung
  if (termin.geaendertAm) {
    lines.push(`LAST-MODIFIED:${formatICSDate(termin.geaendertAm)}`);
  }

  // Erstellungsdatum
  if (termin.erstelltAm) {
    lines.push(`CREATED:${formatICSDate(termin.erstelltAm)}`);
  }

  // Wiederholungsregel
  const rrule = generateRRule(termin);
  if (rrule) {
    lines.push(rrule);
  }

  // Erinnerung
  if (termin.erinnerung && termin.erinnerung > 0) {
    lines.push(generateVAlarm(termin.erinnerung));
  }

  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

// ICS-Kalender generieren
function generateICS(termine: Termin[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TennisMehl24//Kalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TennisMehl24 Kalender',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  // Zeitzone hinzufügen
  lines.push(
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  );

  // Alle Termine hinzufügen
  for (const termin of termine) {
    lines.push(generateVEvent(termin));
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// Main handler
const handler: Handler = async (event: HandlerEvent) => {
  // CORS und Cache headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="tennismehl24-kalender.ics"',
    // Cache für 5 Minuten (Kalender-Apps cachen sowieso)
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

  try {
    // Appwrite Client initialisieren
    const client = new Client();

    const endpoint = process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !apiKey) {
      console.error('Appwrite Konfiguration fehlt:', { endpoint: !!endpoint, projectId: !!projectId, apiKey: !!apiKey });
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    client
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);

    // Alle Termine laden
    const response = await databases.listDocuments(
      DATABASE_ID,
      KALENDER_COLLECTION_ID,
      [
        Query.orderDesc('startDatum'),
        Query.limit(1000)
      ]
    );

    const termine = response.documents as unknown as Termin[];

    // ICS generieren
    const icsContent = generateICS(termine);

    return {
      statusCode: 200,
      headers,
      body: icsContent,
    };

  } catch (error) {
    console.error('Fehler beim Generieren des ICS-Feeds:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to generate calendar',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};

export { handler };
