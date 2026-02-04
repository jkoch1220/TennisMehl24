/**
 * Type definitions for Ziegelmehl Abgabe (Brick Drop-off Submissions)
 */

export type AbgabeStatus = 'neu' | 'bestaetigt' | 'abgeholt' | 'abgelehnt';

export interface ZiegelmehlAbgabe {
  id: string;
  $id?: string; // Appwrite document ID

  // Contact info
  name: string;
  email?: string;
  telefon: string;

  // Submission details
  menge: number; // in Tonnen
  abgabedatum: string; // ISO date string (YYYY-MM-DD)

  // Status tracking
  status: AbgabeStatus;

  // Metadata
  erstelltAm: string;
  notizen?: string;
  quelle: 'website' | 'telefon' | 'email' | 'direkt';
}

export interface NeueZiegelmehlAbgabe {
  name: string;
  email?: string;
  telefon: string;
  menge: number;
  abgabedatum: string;
  notizen?: string;
  quelle?: 'website' | 'telefon' | 'email' | 'direkt';
}

export interface ZiegelmehlAbgabeUpdate {
  status?: AbgabeStatus;
  abgabedatum?: string;
  notizen?: string;
}

// Status display helpers
export const ABGABE_STATUS_LABELS: Record<AbgabeStatus, string> = {
  neu: 'Neu',
  bestaetigt: 'Bestätigt',
  abgeholt: 'Abgeholt',
  abgelehnt: 'Abgelehnt',
};

export const ABGABE_STATUS_COLORS: Record<AbgabeStatus, string> = {
  neu: 'bg-blue-100 text-blue-800',
  bestaetigt: 'bg-green-100 text-green-800',
  abgeholt: 'bg-gray-100 text-gray-800',
  abgelehnt: 'bg-red-100 text-red-800',
};
