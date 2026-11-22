// Collection mutations, import/export and raw sync access. Client-only (IndexedDB).
import { z } from "zod";
import type {
  Binder,
  CardDetail,
  CollectionEntry,
  Condition,
  Currency,
  Settings,
  Variant,
} from "../types";
import { db, DEFAULT_SETTINGS, nowIso, SETTINGS_KEY, type CachedCard } from "./database";

// ---- Entries ------------------------------------------------------------------------

/** Card fields (denormalised) + variant / condition / quantity / purchase info. */
export type NewEntryInput = Omit<
  CollectionEntry,
  "id" | "createdAt" | "updatedAt" | "deletedAt" | "binderIds" | "condition" | "quantity"
> & {
  condition?: Condition; // default "NM"
  quantity?: number; // default 1
  binderIds?: string[]; // default []
};

/** Convenience: build a NewEntryInput from a CardDetail. */
export function entryInputFromCard(
  card: CardDetail,
  opts: {
    variant: Variant;
    /** Stamp of a stamped printing (StampedPrinting.stamp); omit for regular printings. */
    stamp?: string;
    condition?: Condition;
    quantity?: number;
    purchasePrice?: number;
    purchaseCurrency?: Currency;
    purchaseDate?: string;
    notes?: string;
    binderIds?: string[];
  },
): NewEntryInput {
  return {
    cardId: card.id,
    cardName: card.name,
    localId: card.localId,
    image: card.image,
    setId: card.setId,
    setName: card.setName,
    serieId: card.serieId,
    serieName: card.serieName,
    rarity: card.rarity,
    ...opts,
  };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export async function addEntry(input: NewEntryInput): Promise<CollectionEntry> {
  const now = nowIso();
  let purchaseCurrency = input.purchaseCurrency;
  if (input.purchasePrice != null && !purchaseCurrency) {
    purchaseCurrency = (await db.settings.get(SETTINGS_KEY))?.currency ?? DEFAULT_SETTINGS.currency;
  }
  const entry: CollectionEntry = stripUndefined({
    ...input,
    stamp: input.stamp || undefined, // "" means a regular printing
    id: crypto.randomUUID(),
    condition: input.condition ?? "NM",
    quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    binderIds: input.binderIds ?? [],
    purchaseCurrency,
    createdAt: now,
    updatedAt: now,
  });
  await db.entries.add(entry);
  return entry;
}

/**
 * Patch an entry and bump updatedAt. `id` and `createdAt` cannot be changed.
 * `stamp: undefined` or `stamp: ""` turns the entry back into a regular printing.
 */
export async function updateEntry(id: string, patch: Partial<CollectionEntry>): Promise<void> {
  const rest: Partial<CollectionEntry> = { ...patch };
  delete rest.id;
  delete rest.createdAt;
  await db.transaction("rw", db.entries, async () => {
    const current = await db.entries.get(id);
    if (!current) throw new Error(`Entry ${id} not found`);
    const next: CollectionEntry = { ...current, ...rest, id, updatedAt: nowIso() };
    if (!next.stamp) delete next.stamp;
    await db.entries.put(next);
  });
}

/** Soft-delete (tombstone) so the deletion syncs. */
export async function removeEntry(id: string): Promise<void> {
  const now = nowIso();
  await db.entries.update(id, { deletedAt: now, updatedAt: now });
}

// ---- Binders ------------------------------------------------------------------------

export async function createBinder(name: string, description?: string): Promise<Binder> {
  const now = nowIso();
  const binder: Binder = stripUndefined({
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  });
  await db.binders.add(binder);
  return binder;
}

export async function updateBinder(id: string, patch: Partial<Binder>): Promise<void> {
  const rest: Partial<Binder> = { ...patch };
  delete rest.id;
  delete rest.createdAt;
  await db.transaction("rw", db.binders, async () => {
    const current = await db.binders.get(id);
    if (!current) throw new Error(`Binder ${id} not found`);
    await db.binders.put({ ...current, ...rest, id, updatedAt: nowIso() });
  });
}

/** Tombstone the binder and remove its id from every entry (bumping their updatedAt). */
export async function removeBinder(id: string): Promise<void> {
  await db.transaction("rw", db.binders, db.entries, async () => {
    const now = nowIso();
    await db.binders.update(id, { deletedAt: now, updatedAt: now });
    const members = await db.entries.filter((e) => e.binderIds?.includes(id)).toArray();
    for (const e of members) {
      await db.entries.put({
        ...e,
        binderIds: e.binderIds.filter((b) => b !== id),
        updatedAt: nowIso(),
      });
    }
  });
}

// ---- Settings -----------------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(row
      ? { currency: row.currency, priceSource: row.priceSource, countSecretRares: row.countSecretRares ?? DEFAULT_SETTINGS.countSecretRares }
      : {}),
  };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const current = await getSettings();
    const next: Settings = {
      currency: patch.currency ?? current.currency,
      priceSource: patch.priceSource ?? current.priceSource,
      countSecretRares: patch.countSecretRares ?? current.countSecretRares,
    };
    await db.settings.put({ key: SETTINGS_KEY, ...next });
  });
}

// ---- Card cache (offline pricing) ----------------------------------------------------

export async function getCachedCards(ids: string[]): Promise<CachedCard[]> {
  const rows = await db.cardCache.bulkGet([...new Set(ids)]);
  return rows.filter((r): r is CachedCard => !!r);
}

export async function putCachedCards(cards: CardDetail[]): Promise<void> {
  if (!cards.length) return;
  const cachedAt = new Date().toISOString();
  await db.cardCache.bulkPut(cards.map((c) => ({ ...c, cachedAt })));
}

// ---- Export / import ----------------------------------------------------------------

const optStr = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

const entrySchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  cardName: z.string(),
  localId: z.string(),
  image: optStr,
  setId: z.string().min(1),
  setName: z.string(),
  serieId: optStr,
  serieName: optStr,
  rarity: optStr,
  variant: z.enum(["normal", "holo", "reverse", "firstEdition"]),
  // Added with stamped printings; older backups have no stamp. "" means a regular printing.
  stamp: z
    .string()
    .nullish()
    .transform((v) => v || undefined),
  condition: z.enum(["NM", "LP", "MP", "HP", "DMG"]),
  quantity: z.number().int().min(0),
  purchasePrice: z
    .number()
    .nonnegative()
    .nullish()
    .transform((v) => v ?? undefined),
  purchaseCurrency: z
    .enum(["CAD", "USD"])
    .nullish()
    .transform((v) => v ?? undefined),
  purchaseDate: optStr,
  notes: optStr,
  binderIds: z.array(z.string()).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: optStr,
});

const binderSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: optStr,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: optStr,
});

const exportSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema).default([]),
  binders: z.array(binderSchema).default([]),
  settings: z
    .object({
      currency: z.enum(["CAD", "USD"]),
      priceSource: z.enum(["tcgplayer", "cardmarket"]),
      countSecretRares: z.boolean(),
    })
    .partial()
    .optional(),
});

export type CollectionExport = z.infer<typeof exportSchema>;

/** JSON backup of live (non-deleted) entries and binders plus settings. */
export async function exportCollection(): Promise<string> {
  const [entries, binders, settings] = await Promise.all([
    db.entries.filter((e) => !e.deletedAt).toArray(),
    db.binders.filter((b) => !b.deletedAt).toArray(),
    getSettings(),
  ]);
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), entries, binders, settings },
    null,
    2,
  );
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * Import a backup produced by exportCollection().
 * - merge: last-write-wins per row by updatedAt (newer imported rows overwrite local).
 * - replace: every local row not in the file is tombstoned (so deletions sync); every
 *   imported row is written with a fresh updatedAt so it wins on the next sync. Settings
 *   from the file are applied.
 * Returns the number of entries / binders written. Throws ImportError on invalid input.
 */
export async function importCollection(
  json: string,
  mode: "merge" | "replace",
): Promise<{ entries: number; binders: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError("File is not valid JSON");
  }
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ImportError(
      `Invalid backup file${issue ? `: ${issue.path.join(".") || "root"} ${issue.message}` : ""}`,
    );
  }
  const data = parsed.data;
  const entries = data.entries.map((e) => stripUndefined(e) as CollectionEntry);
  const binders = data.binders.map((b) => stripUndefined(b) as Binder);

  if (mode === "merge") {
    return db.transaction("rw", db.entries, db.binders, () => applyLww(entries, binders));
  }

  return db.transaction("rw", db.entries, db.binders, db.settings, async () => {
    const entryIds = new Set(entries.map((e) => e.id));
    const binderIds = new Set(binders.map((b) => b.id));
    const now = nowIso();
    const staleEntries = await db.entries
      .filter((e) => !entryIds.has(e.id) && !e.deletedAt)
      .toArray();
    const staleBinders = await db.binders
      .filter((b) => !binderIds.has(b.id) && !b.deletedAt)
      .toArray();
    await db.entries.bulkPut([
      ...staleEntries.map((e) => ({ ...e, deletedAt: now, updatedAt: now })),
      ...entries.map((e) => ({ ...e, updatedAt: nowIso() })),
    ]);
    await db.binders.bulkPut([
      ...staleBinders.map((b) => ({ ...b, deletedAt: now, updatedAt: now })),
      ...binders.map((b) => ({ ...b, updatedAt: nowIso() })),
    ]);
    if (data.settings) {
      const current = await getSettings();
      await db.settings.put({ key: SETTINGS_KEY, ...current, ...stripUndefined(data.settings) });
    }
    return { entries: entries.length, binders: binders.length };
  });
}

// ---- Raw access for the sync engine ---------------------------------------------------

/** Rows (including tombstones) with updatedAt strictly after `iso`. */
export async function getChangedSince(
  iso: string,
): Promise<{ entries: CollectionEntry[]; binders: Binder[] }> {
  const [entries, binders] = await Promise.all([
    db.entries.where("updatedAt").above(canonicalIso(iso)).toArray(),
    db.binders.where("updatedAt").above(canonicalIso(iso)).toArray(),
  ]);
  return { entries, binders };
}

/** Canonical ISO form so string comparison (and the updatedAt index) orders correctly. */
function canonicalIso(v: string): string {
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toISOString();
}

function canonicalRow<T extends { createdAt: string; updatedAt: string; deletedAt?: string }>(
  row: T,
): T {
  return {
    ...row,
    createdAt: canonicalIso(row.createdAt),
    updatedAt: canonicalIso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: canonicalIso(row.deletedAt) } : {}),
  };
}

async function applyLww(
  entries: CollectionEntry[],
  binders: Binder[],
): Promise<{ entries: number; binders: number }> {
  const pick = <T extends { id: string; updatedAt: string }>(incoming: T[], local: (T | undefined)[]) =>
    incoming.filter((row, i) => !local[i] || row.updatedAt > local[i]!.updatedAt);

  // Deduplicate incoming by id, keeping the newest.
  const newest = <T extends { id: string; updatedAt: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      const cur = m.get(r.id);
      if (!cur || r.updatedAt > cur.updatedAt) m.set(r.id, r);
    }
    return [...m.values()];
  };
  const inE = newest(entries.map(canonicalRow));
  const inB = newest(binders.map(canonicalRow));
  const [localE, localB] = await Promise.all([
    db.entries.bulkGet(inE.map((e) => e.id)),
    db.binders.bulkGet(inB.map((b) => b.id)),
  ]);
  const writeE = pick(inE, localE);
  const writeB = pick(inB, localB);
  await db.entries.bulkPut(writeE);
  await db.binders.bulkPut(writeB);
  return { entries: writeE.length, binders: writeB.length };
}

/**
 * Apply rows pulled from Supabase: last-write-wins by updatedAt (strictly newer wins,
 * ties keep local). Does not modify updatedAt. Returns how many rows were written.
 */
export async function applyRemote(
  entries: CollectionEntry[],
  binders: Binder[],
): Promise<{ entries: number; binders: number }> {
  return db.transaction("rw", db.entries, db.binders, () =>
    applyLww(
      entries.map((e) => ({ ...e, binderIds: e.binderIds ?? [] })),
      binders,
    ),
  );
}
