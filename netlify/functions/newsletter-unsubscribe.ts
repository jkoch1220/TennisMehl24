import { Handler, HandlerEvent } from '@netlify/functions';
import { Client, Databases, Query } from 'node-appwrite';

// Öffentliche Newsletter-Abmeldung per Token.
// Ersetzt den früheren Client-Pfad, der den Admin-API-Key im Browser benötigte.
const DATABASE_ID = 'tennismehl24_db';
const NEWSLETTER_COLLECTION_ID = 'newsletter_subscribers';

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.APPWRITE_API_KEY || process.env.VITE_APPWRITE_API_KEY;
  const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;

  if (!apiKey || !endpoint || !projectId) {
    console.error('Appwrite-Konfiguration fehlt (APPWRITE_API_KEY / ENDPOINT / PROJECT_ID)');
    return jsonResponse(500, { success: false, error: 'Konfigurationsfehler' });
  }

  let token: string | undefined;
  try {
    token = JSON.parse(event.body || '{}').token;
  } catch {
    // fällt unten in die Validierung
  }

  if (!token || typeof token !== 'string' || token.length < 10) {
    return jsonResponse(400, { success: false, error: 'Ungültiger Abmeldelink' });
  }

  try {
    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(client);

    const result = await databases.listDocuments(DATABASE_ID, NEWSLETTER_COLLECTION_ID, [
      Query.equal('unsubscribeToken', token),
      Query.limit(1),
    ]);

    if (result.documents.length === 0) {
      return jsonResponse(404, { success: false, error: 'Ungültiger Abmeldelink' });
    }

    const subscriber = result.documents[0];

    if (subscriber.status === 'unsubscribed') {
      return jsonResponse(200, { success: true, email: subscriber.email });
    }

    await databases.updateDocument(DATABASE_ID, NEWSLETTER_COLLECTION_ID, subscriber.$id, {
      status: 'unsubscribed',
      unsubscribedAt: new Date().toISOString(),
    });

    return jsonResponse(200, { success: true, email: subscriber.email });
  } catch (error) {
    console.error('Fehler bei Newsletter-Abmeldung:', error);
    return jsonResponse(500, { success: false, error: 'Abmeldung fehlgeschlagen. Bitte kontaktieren Sie uns.' });
  }
};
