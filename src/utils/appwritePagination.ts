import { Query, type Models } from 'appwrite';
import { databases } from '../config/appwrite';

export interface PaginationOptions {
  queries?: string[];
  batchSize?: number;
  maxItems?: number;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ITEMS = 10000;

/**
 * Lädt alle Dokumente einer Collection per Pagination (Appwrite-Limit pro Request: 100).
 * Standard-Default-Generic ist `Models.DefaultDocument`, identisch zur Appwrite-SDK.
 */
export async function loadAllDocuments<T extends Models.Document = Models.DefaultDocument>(
  databaseId: string,
  collectionId: string,
  options: PaginationOptions = {}
): Promise<T[]> {
  const {
    queries = [],
    batchSize = DEFAULT_BATCH_SIZE,
    maxItems = DEFAULT_MAX_ITEMS,
  } = options;

  const allDocs: T[] = [];
  let offset = 0;

  while (offset < maxItems) {
    const remaining = maxItems - offset;
    const currentLimit = Math.min(batchSize, remaining);

    const response = await databases.listDocuments<T>(
      databaseId,
      collectionId,
      [...queries, Query.limit(currentLimit), Query.offset(offset)]
    );

    allDocs.push(...response.documents);

    if (response.documents.length < currentLimit) break;
    offset += currentLimit;
  }

  return allDocs;
}
