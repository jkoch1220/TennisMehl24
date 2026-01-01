// Newsletter Subscriber Status
export type NewsletterStatus = 'active' | 'unsubscribed';

// Quelle des Subscribers
export type NewsletterSource = 'excel-import' | 'manual' | 'website';

// Newsletter Subscriber Interface
export interface NewsletterSubscriber {
  id: string;
  email: string;
  name?: string;
  status: NewsletterStatus;
  unsubscribeToken: string;
  source?: NewsletterSource;
  tags?: string; // Komma-getrennte Tags
  notes?: string;
  subscribedAt: string;
  unsubscribedAt?: string;
  lastEmailSentAt?: string;
  emailsSentCount: number;
}

// Für neue Subscriber (ohne ID)
export interface NewsletterSubscriberInput {
  email: string;
  name?: string;
  source?: NewsletterSource;
  tags?: string;
  notes?: string;
}

export interface NewsletterBulkImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  errors: string[];
}

// Statistiken für Dashboard
export interface NewsletterStats {
  totalSubscribers: number;
  activeSubscribers: number;
  unsubscribedSubscribers: number;
  recentUnsubscribes: number; // Letzte 30 Tage
}
