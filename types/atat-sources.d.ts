declare module "@atat/api" {
  export type SourceName = "clipboard" | "favorites" | "captures";
  export interface SourceSummary {
    source: SourceName;
    id: string;
    title: string;
    kind: "text" | "image" | "video" | "files" | "data";
    createdAt: string;
    updatedAt: string;
    sourceApp?: string;
    sourceApplicationName?: string;
    excerpt: string;
  }
  export interface SourceItem extends SourceSummary {
    /** Original text when the stored item has a readable text representation. */
    text?: string;
    /** Read/ocr grants last for this invocation or panel session. Copy into your own
     * folder to retain media or return it from a later recall. Never writable. */
    filePaths: string[];
    /** Captures currently supply source media, not the edited render. */
    mediaRole?: "source";
  }
  export interface SourceQuery {
    sources: SourceName[];
    query?: string;
    /** ISO 8601; inclusive update-time bounds, compared at millisecond precision. */
    after?: string;
    before?: string;
    sourceApp?: string;
    kinds?: SourceSummary["kind"][];
    cursor?: string;
    /** 1–100, default 50. */
    limit?: number;
  }
  export interface SourcePage {
    items: SourceSummary[];
    nextCursor?: string;
  }
  export interface SourcesAPI {
    /** Requires the matching clipboardRead/favoritesRead/capturesRead entitlements.
     * Literal, case/diacritic-insensitive search of stored text/title. Captures are title-only.
     * Sorted by updatedAt descending and source/id ascending. Cursor binds to filters;
     * this is live pagination, not a snapshot or an incremental change feed. */
    query(query: SourceQuery): Promise<SourcePage>;
    /** Returns null when the record is no longer present. */
    get(lookup: { source: SourceName; id: string }): Promise<SourceItem | null>;
  }
  export const sources: SourcesAPI;
}
