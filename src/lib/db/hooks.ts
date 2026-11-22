// React hooks over Dexie. SSR-safe: useLiveQuery only subscribes (and so only touches
// IndexedDB) in an effect on the client; during server render these return the default.
import { useLiveQuery } from "dexie-react-hooks";
import type { Binder, CollectionEntry, Settings } from "../types";
import type { GradingAssessment } from "./assessments";
import { db, DEFAULT_SETTINGS, SETTINGS_KEY } from "./database";

/** Live, non-deleted entries, newest first. `undefined` while loading / on the server. */
export function useEntries(): CollectionEntry[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.entries.filter((e) => !e.deletedAt).toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, []);
}

/** A single non-deleted entry; `undefined` while loading or when missing/deleted. */
export function useEntry(id: string): CollectionEntry | undefined {
  return useLiveQuery(async () => {
    const e = await db.entries.get(id);
    return e && !e.deletedAt ? e : undefined;
  }, [id]);
}

/** Live, non-deleted custom binders, sorted by name. */
export function useBinders(): Binder[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.binders.filter((b) => !b.deletedAt).toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
}

/** Saved grading assessments, newest first; all of them, or only one card's. `undefined` while loading. */
export function useAssessments(cardId?: string): GradingAssessment[] | undefined {
  return useLiveQuery(async () => {
    const rows = cardId ? await db.assessments.where("cardId").equals(cardId).toArray() : await db.assessments.toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, [cardId]);
}

/** Settings with defaults applied; returns defaults until loaded. */
export function useSettings(): Settings {
  const row = useLiveQuery(() => db.settings.get(SETTINGS_KEY), []);
  return row
    ? { currency: row.currency, priceSource: row.priceSource, countSecretRares: row.countSecretRares ?? DEFAULT_SETTINGS.countSecretRares }
    : DEFAULT_SETTINGS;
}
