export interface AdminChangelogEntry {
  $id?: string;
  timestamp?: string;
  type: 'auto' | 'manual'; // auto = from commit, manual = user-entered
  title: string; // kurzer Titel (max 100 chars)
  description: string; // Detaillierte Beschreibung
  category?: 'feature' | 'bugfix' | 'infra' | 'config' | 'other'; // Kategorisierung
  commitHash?: string; // Bei auto: Git commit hash
  createdBy?: string; // User ID wer den Eintrag erstellt hat
}

export interface AdminChangelogDbEntry extends AdminChangelogEntry {
  $id: string;
  timestamp: string;
  $createdAt: string;
  $updatedAt: string;
}
