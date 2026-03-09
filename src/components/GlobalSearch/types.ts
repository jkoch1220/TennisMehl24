import { ComponentType } from 'react';

export type SearchCategory = 'tools' | 'projekte' | 'kunden' | 'debitoren' | 'anfragen';

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: {
    text: string;
    color: string; // Tailwind color class (e.g., 'green', 'amber', 'red')
  };
  href: string;
  score?: number; // For sorting within category
}

export interface CategoryConfig {
  id: SearchCategory;
  label: string;
  icon: ComponentType<{ className?: string }>;
  maxResults: number;
}

export const CATEGORY_ORDER: SearchCategory[] = ['tools', 'projekte', 'kunden', 'debitoren', 'anfragen'];

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  tools: 'Tools & Navigation',
  projekte: 'Projekte',
  kunden: 'Kunden / Vereine',
  debitoren: 'Debitoren',
  anfragen: 'Anfragen',
};
