import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeCard } from "../tcgdex/normalize";
import { bulbasaur } from "../tcgdex/fixtures.test-data";
import type { Binder, CollectionEntry } from "../types";
import {
  addEntry,
  applyRemote,
  createBinder,
  db,
  entryInputFromCard,
  exportCollection,
  getCachedCards,
  getChangedSince,
  getSettings,
  importCollection,
  ImportError,
  putCachedCards,
  removeBinder,
  removeEntry,
  updateBinder,
  updateEntry,
  updateSettings,
} from "./index";

const card = normalizeCard(bulbasaur, { id: "sv", name: "Scarlet & Violet" });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("entries", () => {
  it("addEntry fills defaults and denormalised card fields", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "reverse" }));
    expect(e).toMatchObject({
      cardId: "sv03.5-001",
      cardName: "Bulbasaur",
      localId: "001",
      setId: "sv03.5",
      serieId: "sv",
      variant: "reverse",
      condition: "NM",
      quantity: 1,
      binderIds: [],
    });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.createdAt).toBe(e.updatedAt);
    expect(await db.entries.get(e.id)).toEqual(e);
  });

  it("addEntry defaults purchaseCurrency to the settings currency", async () => {
    await updateSettings({ currency: "USD" });
    const e = await addEntry(entryInputFromCard(card, { variant: "normal", purchasePrice: 3 }));
    expect(e.purchaseCurrency).toBe("USD");
  });

  it("updateEntry patches and bumps updatedAt, but keeps id/createdAt", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "normal" }));
    await updateEntry(e.id, { quantity: 3, id: "hacked", createdAt: "x" });
    const after = (await db.entries.get(e.id))!;
    expect(after.quantity).toBe(3);
    expect(after.createdAt).toBe(e.createdAt);
    expect(after.updatedAt > e.updatedAt).toBe(true);
    await expect(updateEntry("missing", { quantity: 1 })).rejects.toThrow();
  });

  it("removeEntry tombstones", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "normal" }));
    await removeEntry(e.id);
    const after = (await db.entries.get(e.id))!;
    expect(after.deletedAt).toBeDefined();
    expect(after.updatedAt).toBe(after.deletedAt);
  });
});

describe("stamped entries", () => {
  it("addEntry keeps the stamp; an empty stamp is dropped", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "holo", stamp: "pokemon-center" }));
    expect((await db.entries.get(e.id))!.stamp).toBe("pokemon-center");
    const plain = await addEntry(entryInputFromCard(card, { variant: "holo", stamp: "" }));
    expect("stamp" in (await db.entries.get(plain.id))!).toBe(false);
  });

  it("updateEntry sets and clears the stamp", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "holo" }));
    await updateEntry(e.id, { stamp: "set-logo+staff" });
    expect((await db.entries.get(e.id))!.stamp).toBe("set-logo+staff");
    await updateEntry(e.id, { quantity: 2 });
    expect((await db.entries.get(e.id))!.stamp).toBe("set-logo+staff");
    await updateEntry(e.id, { stamp: undefined });
    expect("stamp" in (await db.entries.get(e.id))!).toBe(false);
  });

  it("stamp round-trips through export / import; old backups without stamp still import", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "holo", stamp: "pokemon-center" }));
    const json = await exportCollection();
    await db.entries.clear();
    await importCollection(json, "merge");
    expect((await db.entries.get(e.id))!.stamp).toBe("pokemon-center");

    const old = { ...e, id: "old-1" } as Partial<CollectionEntry>;
    delete old.stamp;
    const res = await importCollection(
      JSON.stringify({ version: 1, entries: [old, { ...e, id: "old-2", stamp: null }, { ...e, id: "old-3", stamp: "" }] }),
      "merge",
    );
    expect(res.entries).toBe(3);
    for (const id of ["old-1", "old-2", "old-3"]) expect("stamp" in (await db.entries.get(id))!).toBe(false);
    await expect(
      importCollection(JSON.stringify({ version: 1, entries: [{ ...e, id: "bad", stamp: 5 }] }), "merge"),
    ).rejects.toBeInstanceOf(ImportError);
  });
});

describe("binders", () => {
  it("create / update / remove (tombstone + detach from entries)", async () => {
    const b = await createBinder("  Favourites ", "best");
    expect(b.name).toBe("Favourites");
    await updateBinder(b.id, { name: "Faves" });
    expect((await db.binders.get(b.id))!.name).toBe("Faves");

    const e = await addEntry(entryInputFromCard(card, { variant: "normal", binderIds: [b.id, "other"] }));
    await removeBinder(b.id);
    expect((await db.binders.get(b.id))!.deletedAt).toBeDefined();
    const after = (await db.entries.get(e.id))!;
    expect(after.binderIds).toEqual(["other"]);
    expect(after.updatedAt > e.updatedAt).toBe(true);
  });
});

describe("settings", () => {
  it("defaults and patches", async () => {
    expect(await getSettings()).toEqual({ currency: "CAD", priceSource: "tcgplayer", countSecretRares: true });
    await updateSettings({ priceSource: "cardmarket" });
    expect(await getSettings()).toEqual({ currency: "CAD", priceSource: "cardmarket", countSecretRares: true });
    await updateSettings({ countSecretRares: false });
    expect((await getSettings()).countSecretRares).toBe(false);
    expect((await getSettings()).priceSource).toBe("cardmarket"); // other settings kept
  });
});

describe("card cache", () => {
  it("stores and reads CardDetail with cachedAt", async () => {
    await putCachedCards([card]);
    const [c] = await getCachedCards([card.id, "missing"]);
    expect(c.id).toBe(card.id);
    expect(c.cachedAt).toBeDefined();
  });
});

describe("export / import", () => {
  it("round-trips through replace mode and tombstones rows not in the file", async () => {
    const keep = await addEntry(entryInputFromCard(card, { variant: "normal", notes: "hi" }));
    const b = await createBinder("A");
    await updateSettings({ currency: "USD" });
    const json = await exportCollection();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(1);

    const extra = await addEntry(entryInputFromCard(card, { variant: "reverse" }));
    await updateSettings({ currency: "CAD" });
    const res = await importCollection(json, "replace");
    expect(res).toEqual({ entries: 1, binders: 1 });
    expect((await db.entries.get(extra.id))!.deletedAt).toBeDefined();
    const kept = (await db.entries.get(keep.id))!;
    expect(kept.deletedAt).toBeUndefined();
    expect(kept.notes).toBe("hi");
    expect(kept.updatedAt > keep.updatedAt).toBe(true);
    expect((await db.binders.get(b.id))!.deletedAt).toBeUndefined();
    expect((await getSettings()).currency).toBe("USD");
  });

  it("merge mode is last-write-wins by updatedAt", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "normal" }));
    const older = { ...e, quantity: 5, updatedAt: "2000-01-01T00:00:00.000Z" };
    const newer = { ...e, id: e.id, quantity: 7, updatedAt: "2999-01-01T00:00:00.000Z" };
    const fresh = { ...e, id: "new-id", quantity: 2 };

    let res = await importCollection(JSON.stringify({ version: 1, entries: [older] }), "merge");
    expect(res.entries).toBe(0);
    expect((await db.entries.get(e.id))!.quantity).toBe(1);

    res = await importCollection(
      JSON.stringify({ version: 1, entries: [newer, fresh], binders: [] }),
      "merge",
    );
    expect(res).toEqual({ entries: 2, binders: 0 });
    expect((await db.entries.get(e.id))!.quantity).toBe(7);
    expect(await db.entries.get("new-id")).toBeDefined();
  });

  it("rejects invalid input with ImportError", async () => {
    await expect(importCollection("not json", "merge")).rejects.toBeInstanceOf(ImportError);
    await expect(importCollection('{"version":2}', "merge")).rejects.toBeInstanceOf(ImportError);
    await expect(
      importCollection(JSON.stringify({ version: 1, entries: [{ id: "x" }] }), "merge"),
    ).rejects.toThrow(/Invalid backup file/);
  });

  it("accepts nulls for optional fields", async () => {
    const e = await addEntry(entryInputFromCard(card, { variant: "normal" }));
    const row = { ...e, id: "n1", notes: null, purchasePrice: null, image: null };
    await importCollection(JSON.stringify({ version: 1, entries: [row] }), "merge");
    const got = (await db.entries.get("n1"))!;
    expect("notes" in got).toBe(false);
    expect(got.image).toBeUndefined();
  });
});

describe("sync access", () => {
  const base: CollectionEntry = {
    id: "r1",
    cardId: "sv03.5-001",
    cardName: "Bulbasaur",
    localId: "001",
    setId: "sv03.5",
    setName: "151",
    variant: "normal",
    condition: "NM",
    quantity: 1,
    binderIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const binder: Binder = {
    id: "b1",
    name: "B",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("getChangedSince includes tombstones after the timestamp", async () => {
    await db.entries.bulkPut([
      base,
      { ...base, id: "r2", updatedAt: "2026-01-05T00:00:00.000Z", deletedAt: "2026-01-05T00:00:00.000Z" },
    ]);
    await db.binders.put(binder);
    const res = await getChangedSince("2026-01-03T00:00:00.000Z");
    expect(res.entries.map((e) => e.id)).toEqual(["r2"]);
    expect(res.binders).toEqual([]);
    expect((await getChangedSince("2026-01-01T00:00:00+00:00")).entries).toHaveLength(2);
  });

  it("applyRemote is last-write-wins and keeps updatedAt", async () => {
    await db.entries.put(base);
    const res = await applyRemote(
      [
        { ...base, quantity: 9, updatedAt: "2026-01-01T00:00:00.000Z" }, // older → ignored
        { ...base, id: "r3", updatedAt: "2026-01-03T00:00:00+00:00" }, // new row
      ],
      [binder],
    );
    expect(res).toEqual({ entries: 1, binders: 1 });
    expect((await db.entries.get("r1"))!.quantity).toBe(1);
    expect((await db.entries.get("r3"))!.updatedAt).toBe("2026-01-03T00:00:00.000Z");

    await applyRemote([{ ...base, quantity: 4, updatedAt: "2026-02-01T00:00:00.000Z" }], []);
    expect((await db.entries.get("r1"))!.quantity).toBe(4);
  });
});
