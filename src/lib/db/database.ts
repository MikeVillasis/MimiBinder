// Dexie (IndexedDB) database. Client-only at runtime: constructing Dexie is safe on the
// server (it only opens IndexedDB lazily on first query), but never query it there.
import { Dexie, type EntityTable } from "dexie";
import type { Binder, CardDetail, CollectionEntry, Settings } from "../types";
import type { GradingAssessment } from "./assessments";

export const SETTINGS_KEY = "settings";

export interface SettingsRow extends Settings {
  key: typeof SETTINGS_KEY;
}

export interface CachedCard extends CardDetail {
  cachedAt: string; // ISO
}

export const DEFAULT_SETTINGS: Settings = { currency: "CAD", priceSource: "tcgplayer", countSecretRares: true };

export class MimiBinderDB extends Dexie {
  entries!: EntityTable<CollectionEntry, "id">;
  binders!: EntityTable<Binder, "id">;
  settings!: EntityTable<SettingsRow, "key">;
  cardCache!: EntityTable<CachedCard, "id">;
  /** Saved grading assessments (centering tool). Synced when signed in (tombstones via deletedAt). Added in schema version 2. */
  assessments!: EntityTable<GradingAssessment, "id">;

  constructor(name = "mimibinder") {
    super(name);
    this.version(1).stores({
      entries: "id, cardId, setId, serieId, updatedAt",
      binders: "id, updatedAt",
      settings: "key",
      cardCache: "id, cachedAt",
    });
    // v2 only adds a table, so existing rows need no migration (Dexie keeps unlisted tables as they are).
    this.version(2).stores({
      assessments: "id, cardId, entryId, createdAt, updatedAt",
    });
  }
}

export const db = new MimiBinderDB();

let lastTs = 0;
/** Strictly increasing ISO timestamp (last-write-wins needs distinct updatedAt values). */
export function nowIso(): string {
  const t = Math.max(Date.now(), lastTs + 1);
  lastTs = t;
  return new Date(t).toISOString();
}
