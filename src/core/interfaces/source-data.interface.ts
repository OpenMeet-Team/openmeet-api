export interface SourceData {
  handle?: string;
  [key: string]: any;
}

export interface SourceFields {
  sourceType?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceData?: SourceData | null;
  lastSyncedAt?: Date | null;
}
