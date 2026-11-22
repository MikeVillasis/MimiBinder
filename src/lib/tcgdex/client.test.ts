import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_FX } from "../pricing";
import {
  _resetSerieIndex,
  fetchCard,
  fetchCards,
  fetchFx,
  fetchSeries,
  fetchSet,
  fetchSets,
  searchCards,
  TcgdexError,
} from "./client";
import {
  bulbasaur,
  jaBulbasaur,
  jaPikachuCards,
  jaSerieDetails,
  jaSetDetailSV2a,
  jaSetOrder,
  searchPage,
  serieDetails,
  setDetail151,
  valet,
} from "./fixtures.test-data";

type Route = (url: URL) => unknown | Response;

function mockFetch(route: Route) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    void init;
    const url = new URL(typeof input === "string" ? input : input.toString());
    const body = route(url);
    if (body instanceof Response) return body;
    if (body === undefined) return new Response('{"status":404}', { status: 404 });
    return Response.json(body);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function tcgdexRoutes(extra: Route = () => undefined): Route {
  return (url) => {
    if (url.pathname.startsWith("/v2/ja")) return jaRoutes(extra)(url);
    const path = url.pathname.replace("/v2/en", "");
    if (path === "/series") return serieDetails.map(({ id, name }) => ({ id, name }));
    const serie = serieDetails.find((s) => path === `/series/${s.id}`);
    if (serie) return serie;
    return extra(url);
  };
}

/** Japanese catalog routes; anything else goes to `extra`. */
function jaRoutes(extra: Route = () => undefined): Route {
  return (url) => {
    const path = url.pathname.replace("/v2/ja", "");
    if (path === "/series") return jaSerieDetails.map(({ id, name }) => ({ id, name }));
    const serie = jaSerieDetails.find((s) => path === `/series/${s.id}`);
    if (serie) return serie;
    if (path === "/sets" && url.searchParams.get("sort:field") === "releaseDate") {
      return jaSetOrder.map((id) => ({ id, name: id }));
    }
    return extra(url);
  };
}

/** n Japanese dex-search results for one species, in set SV1V. */
function jaDexCards(n: number, dex: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `SV1V-${dex}${String(i).padStart(3, "0")}`,
    localId: `${dex}${String(i).padStart(3, "0")}`,
    name: "x",
  }));
}

beforeEach(() => _resetSerieIndex());
afterEach(() => vi.unstubAllGlobals());

describe("tcgdex client", () => {
  it("fetchCard adds serie from the index and uses the fetch cache", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) => (url.pathname.endsWith("/cards/sv03.5-001") ? bulbasaur : undefined)),
    );
    const card = await fetchCard("sv03.5-001");
    expect(card.serieId).toBe("sv");
    expect(card.serieName).toBe("Scarlet & Violet");
    const cardCall = fn.mock.calls.find(([u]) => String(u).includes("/cards/"));
    expect(cardCall?.[1]).toMatchObject({ next: { revalidate: 21600 } });
  });

  it("fetchCard maps 404 to TcgdexError(404)", async () => {
    mockFetch(tcgdexRoutes());
    await expect(fetchCard("nope-1")).rejects.toMatchObject({ status: 404 });
    await expect(fetchCard("nope-1")).rejects.toBeInstanceOf(TcgdexError);
  });

  it("fetchCard rejects TCG Pocket cards", async () => {
    mockFetch(
      tcgdexRoutes((url) =>
        url.pathname.endsWith("/cards/A1-035")
          ? { ...bulbasaur, id: "A1-035", set: { id: "A1", name: "Genetic Apex" } }
          : undefined,
      ),
    );
    await expect(fetchCard("A1-035")).rejects.toMatchObject({ status: 404 });
  });

  it("fetchCard still works when the serie index fails", async () => {
    mockFetch((url) =>
      url.pathname.endsWith("/cards/sv03.5-001")
        ? bulbasaur
        : new Response("boom", { status: 500 }),
    );
    const card = await fetchCard("sv03.5-001");
    expect(card.id).toBe("sv03.5-001");
    expect(card.serieId).toBeUndefined();
  });

  it("fetchCards skips failures and dedupes", async () => {
    mockFetch(
      tcgdexRoutes((url) => (url.pathname.endsWith("/cards/sv03.5-001") ? bulbasaur : undefined)),
    );
    const cards = await fetchCards(["sv03.5-001", "missing-1", "sv03.5-001"]);
    expect(cards.map((c) => c.id)).toEqual(["sv03.5-001"]);
  });

  it("searchCards passes pagination, filters TCG Pocket, reports hasMore", async () => {
    const full = Array.from({ length: 24 }, (_, i) => searchPage[i % searchPage.length]);
    const fn = mockFetch(
      tcgdexRoutes((url) => (url.pathname.endsWith("/cards") ? full : undefined)),
    );
    const res = await searchCards("  charizard ", 2);
    const call = fn.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname.endsWith("/cards"))!;
    expect(call.searchParams.get("name")).toBe("charizard");
    expect(call.searchParams.get("pagination:page")).toBe("2");
    expect(call.searchParams.get("pagination:itemsPerPage")).toBe("24");
    expect(res.page).toBe(2);
    expect(res.hasMore).toBe(true);
    expect(res.cards.some((c) => c.id.startsWith("A"))).toBe(false);
    expect(res.cards.length).toBeLessThan(24);
  });

  it("searchCards: short page → hasMore false; empty query → no request", async () => {
    const fn = mockFetch(tcgdexRoutes((url) => (url.pathname.endsWith("/cards") ? searchPage : undefined)));
    expect((await searchCards("charizard")).hasMore).toBe(false);
    fn.mockClear();
    expect(await searchCards("   ")).toEqual({ cards: [], page: 1, hasMore: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("fetchSets / fetchSeries come from the serie index", async () => {
    mockFetch(tcgdexRoutes());
    expect((await fetchSeries()).map((s) => s.id)).toEqual(["sv", "base"]);
    expect((await fetchSets())[0].id).toBe("sv03.5");
  });

  it("fetchSet normalises and hides TCG Pocket sets", async () => {
    mockFetch(
      tcgdexRoutes((url) => {
        if (url.pathname.endsWith("/sets/sv03.5")) return setDetail151;
        if (url.pathname.endsWith("/sets/A1"))
          return { ...setDetail151, id: "A1", serie: { id: "tcgp", name: "Pocket" } };
        return undefined;
      }),
    );
    expect((await fetchSet("sv03.5")).cards).toHaveLength(2);
    await expect(fetchSet("A1")).rejects.toMatchObject({ status: 404 });
  });

  it("fetchFx parses Valet and falls back on failure", async () => {
    mockFetch(() => valet);
    expect(await fetchFx()).toEqual({ usdCad: 1.4325, eurCad: 1.5727, date: "2026-11-20" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchFx()).toEqual(FALLBACK_FX);
    mockFetch(() => ({ observations: [] }));
    expect(await fetchFx()).toEqual(FALLBACK_FX);
  });
});

describe("tcgdex client: Japanese", () => {
  it("fetchSets / fetchSeries use the ja API, prefix ids and sort newest first", async () => {
    const fn = mockFetch(tcgdexRoutes());
    const sets = await fetchSets("ja");
    expect(sets.map((s) => s.id)).toEqual(["ja:M2", "ja:M1L", "ja:SV2a", "ja:SV1V", "ja:SV-P"]);
    expect((await fetchSeries("ja")).map((s) => s.id)).toEqual(["ja:M", "ja:SV"]);
    const urls = fn.mock.calls.map(([u]) => String(u));
    expect(urls.every((u) => u.startsWith("https://api.tcgdex.net/v2/ja/"))).toBe(true);
    // English index is separate
    expect((await fetchSets())[0].id).toBe("sv03.5");
  });

  it("the ja index still works when the release-order list fails", async () => {
    mockFetch(
      tcgdexRoutes((url) => (url.pathname.endsWith("/v2/ja/sets") ? new Response("x", { status: 500 }) : undefined)),
    );
    const sets = await fetchSets("ja");
    expect(sets).toHaveLength(5);
  });

  it("fetchCard / fetchSet accept prefixed ids", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) => {
        if (url.pathname === "/v2/ja/cards/SV2a-001") return jaBulbasaur;
        if (url.pathname === "/v2/ja/sets/SV2a") return jaSetDetailSV2a;
        return undefined;
      }),
    );
    const card = await fetchCard("ja:SV2a-001");
    expect(card).toMatchObject({ id: "ja:SV2a-001", setId: "ja:SV2a", serieId: "ja:SV" });
    expect(card.prices.tcgplayer).toBeUndefined();
    expect(card.prices.cardmarket?.normal.trend).toBe(0.02);
    const set = await fetchSet("ja:SV2a");
    expect(set.id).toBe("ja:SV2a");
    expect(set.cards[0].id).toBe("ja:SV2a-001");
    expect(fn.mock.calls.some(([u]) => String(u).includes("ja%3A"))).toBe(false);
    await expect(fetchCard("ja:")).rejects.toMatchObject({ status: 404 });
  });

  it("fetchCards handles mixed English and Japanese ids", async () => {
    mockFetch(
      tcgdexRoutes((url) => {
        if (url.pathname === "/v2/ja/cards/SV2a-001") return jaBulbasaur;
        if (url.pathname === "/v2/en/cards/sv03.5-001") return bulbasaur;
        return undefined;
      }),
    );
    const cards = await fetchCards(["sv03.5-001", "ja:SV2a-001", "ja:nope-1"]);
    expect(cards.map((c) => c.id)).toEqual(["sv03.5-001", "ja:SV2a-001"]);
  });

  it("searchCards ja + Japanese text uses the ja name search", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) => (url.pathname === "/v2/ja/cards" ? jaPikachuCards : undefined)),
    );
    const res = await searchCards("ピカチュウ", 1, "ja");
    const call = fn.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname === "/v2/ja/cards")!;
    expect(call.searchParams.get("name")).toBe("ピカチュウ");
    expect(call.searchParams.get("dexId")).toBeNull();
    expect(res.cards.map((c) => c.id)).toEqual(jaPikachuCards.map((c) => `ja:${c.id}`));
    expect(res.hasMore).toBe(false);
  });

  it("searchCards ja + English name searches by dex number, newest set first", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/ja/cards" && url.searchParams.get("dexId") === "eq:25"
          ? jaPikachuCards
          : undefined,
      ),
    );
    const res = await searchCards("PIKACHU", 1, "ja");
    const dexCalls = fn.mock.calls
      .map(([u, init]) => ({ url: new URL(String(u)), init }))
      .filter(({ url }) => url.pathname === "/v2/ja/cards");
    const byDex = dexCalls.filter((c) => c.url.searchParams.has("dexId"));
    expect(byDex.map((c) => c.url.searchParams.get("dexId"))).toEqual(["eq:25"]);
    expect(byDex[0].init).toMatchObject({ next: { revalidate: 43200 } });
    // Also searched by Japanese name, for cards TCGdex has without a dexId.
    expect(dexCalls.map((c) => c.url.searchParams.get("name")).filter(Boolean)).toContain("ピカチュウ");
    // M2 (newest), SV2a, SV1V, then SV-P (not in the release order)
    expect(res.cards.map((c) => c.id)).toEqual([
      "ja:M2-030",
      "ja:SV2a-025",
      "ja:SV1V-024",
      "ja:SV-P-001",
    ]);
    expect(res).toMatchObject({ page: 1, hasMore: false });
  });

  it("searchCards ja: merges + dedupes species and paginates locally at 24", async () => {
    // "char" → Charmander(4), Charmeleon(5), Charizard(6), ...
    mockFetch(
      tcgdexRoutes((url) => {
        if (url.pathname !== "/v2/ja/cards") return undefined;
        const dex = Number(url.searchParams.get("dexId")?.replace("eq:", ""));
        if (dex === 4) return jaDexCards(20, 4);
        if (dex === 5) return [...jaDexCards(10, 5), jaDexCards(1, 4)[0]]; // duplicate of a dex 4 card
        if (dex === 6) return jaDexCards(10, 6);
        return [];
      }),
    );
    const p1 = await searchCards("char", 1, "ja");
    const p2 = await searchCards("char", 2, "ja");
    expect(p1.cards).toHaveLength(24);
    expect(p1.hasMore).toBe(true);
    expect(p2.cards).toHaveLength(16);
    expect(p2.hasMore).toBe(false);
    const all = [...p1.cards, ...p2.cards].map((c) => c.id);
    expect(new Set(all).size).toBe(40);
    expect(all.every((id) => id.startsWith("ja:SV1V-"))).toBe(true);
    expect((await searchCards("char", 3, "ja")).cards).toEqual([]);
  });

  it("searchCards ja: no species match or empty query → no card request", async () => {
    const fn = mockFetch(tcgdexRoutes());
    expect(await searchCards("zzzz", 1, "ja")).toEqual({ cards: [], page: 1, hasMore: false });
    expect(await searchCards("  ", 1, "ja")).toEqual({ cards: [], page: 1, hasMore: false });
    expect(fn.mock.calls.some(([u]) => String(u).includes("/cards"))).toBe(false);
  });
});

describe("searchCards: card numbers", () => {
  const cardsCalls = (fn: ReturnType<typeof mockFetch>, lang = "en") =>
    fn.mock.calls
      .map(([u]) => new URL(String(u)))
      .filter((u) => u.pathname === `/v2/${lang}/cards`);

  it("name + number: localId and name filters, exact matches only, Pocket dropped", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/en/cards"
          ? [
              { id: "svp-189", localId: "189", name: "N's Zorua" },
              { id: "smp-SM189", localId: "SM189", name: "N's Zorua" }, // lax match, wrong prefix
              { id: "x-1189", localId: "1189", name: "N's Zorua" },
              { id: "A1-189", localId: "189", name: "N's Zorua" }, // TCG Pocket
            ]
          : undefined,
      ),
    );
    const res = await searchCards("N's Zorua 189");
    const [call] = cardsCalls(fn);
    expect(call.searchParams.get("localId")).toBe("189");
    expect(call.searchParams.get("name")).toBe("N's Zorua");
    expect(call.searchParams.get("pagination:itemsPerPage")).toBe("250");
    expect(cardsCalls(fn)).toHaveLength(1); // short first page → no more pages
    expect(res).toEqual({ cards: [{ id: "svp-189", localId: "189", name: "N's Zorua", image: undefined }], page: 1, hasMore: false });
  });

  it("number/total ranks sets with that official count first, keeping the others", async () => {
    const list = [
      { id: "base1-189", localId: "189", name: "a" },
      { id: "svp-189", localId: "189", name: "b" },
      { id: "sv01-189", localId: "189", name: "c" },
    ];
    mockFetch(tcgdexRoutes((url) => (url.pathname === "/v2/en/cards" ? list : undefined)));
    const withTotal = await searchCards("189/198");
    expect(withTotal.cards.map((c) => c.id)).toEqual(["sv01-189", "svp-189", "base1-189"]);
    const plain = await searchCards("#189");
    // newest set first: SV serie (sv01 is listed after svp, so it is newer), then base
    expect(plain.cards.map((c) => c.id)).toEqual(["sv01-189", "svp-189", "base1-189"]);
    const promoTotal = await searchCards("189/225");
    expect(promoTotal.cards.map((c) => c.id)).toEqual(["svp-189", "sv01-189", "base1-189"]);
  });

  it("number only: no name filter, caps pages, paginates locally at 24", async () => {
    // Every page full: 60 exact "1"/"001" cards on page 1, the rest lax noise ("10", "21", "TG01").
    const page = (pg: number) =>
      Array.from({ length: 250 }, (_, i) => {
        const exact = pg === 1 && i < 60;
        const localId = exact ? (i % 2 ? "001" : "1") : ["10", "21", "TG01"][i % 3];
        return { id: `s${pg}x${i}-${localId}`, localId, name: "x" };
      });
    const fn = mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/en/cards" ? page(Number(url.searchParams.get("pagination:page"))) : undefined,
      ),
    );
    const p1 = await searchCards("1");
    const calls = cardsCalls(fn);
    expect(calls.map((c) => c.searchParams.get("pagination:page")).sort()).toEqual(["1", "2", "3", "4"]);
    expect(calls.every((c) => c.searchParams.get("localId") === "1" && !c.searchParams.has("name"))).toBe(true);
    expect(p1.cards).toHaveLength(24);
    expect(p1.hasMore).toBe(true);
    expect((await searchCards("1", 3)).cards).toHaveLength(12);
    expect((await searchCards("1", 3)).hasMore).toBe(false);
    expect((await searchCards("001", 3)).cards).toHaveLength(12);
  });

  it("a failing later page keeps the results of the others", async () => {
    mockFetch(
      tcgdexRoutes((url) => {
        if (url.pathname !== "/v2/en/cards") return undefined;
        const pg = url.searchParams.get("pagination:page");
        if (pg === "2") return new Response("boom", { status: 500 });
        return Array.from({ length: pg === "1" ? 250 : 3 }, (_, i) => ({ id: `p${pg}-${i}-5`, localId: "5", name: "x" }));
      }),
    );
    expect((await searchCards("5", 11)).cards).toHaveLength(256 - 240);
  });

  it("prefixed numbers filter by prefix (TCGdex has no match for 'TG5') and match exactly", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/en/cards"
          ? [
              { id: "swsh9tg-TG05", localId: "TG05", name: "Pikachu" },
              { id: "swsh10tg-TG15", localId: "TG15", name: "Pikachu" },
              { id: "swsh11tg-TG05", localId: "TG05", name: "Pikachu VMAX" },
              { id: "swsh12-5", localId: "5", name: "Pikachu" },
            ]
          : undefined,
      ),
    );
    const res = await searchCards("pikachu tg05");
    const [call] = cardsCalls(fn);
    expect(call.searchParams.get("localId")).toBe("TG");
    expect(call.searchParams.get("name")).toBe("pikachu");
    expect(res.cards.map((c) => c.id)).toEqual(["swsh9tg-TG05", "swsh11tg-TG05"]);
  });

  it("ja + English name finds cards without a dexId by their Japanese name, with ex and number", async () => {
    // SV8a-211 エーフィex has no dexId in TCGdex, so only the name search can find it.
    const espeonByName = [
      { id: "SV8a-211", localId: "211", name: "エーフィex", image: "https://assets.tcgdex.net/ja/SV/SV8a/211" },
      { id: "SV8a-062", localId: "062", name: "エーフィex" },
      { id: "SM11b-030", localId: "030", name: "エーフィ" },
    ];
    mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/ja/cards" && url.searchParams.get("name") === "エーフィ" ? espeonByName : url.pathname === "/v2/ja/cards" ? [] : undefined,
      ),
    );
    expect((await searchCards("Espeon ex 211", 1, "ja")).cards.map((c) => c.id)).toEqual(["ja:SV8a-211"]);
    const exOnly = (await searchCards("espeon ex", 1, "ja")).cards.map((c) => c.id);
    expect(exOnly).toContain("ja:SV8a-211");
    expect(exOnly).not.toContain("ja:SM11b-030");
    expect((await searchCards("espeon", 1, "ja")).cards.map((c) => c.id)).toContain("ja:SM11b-030");
  });

  it("ja + English name + number filters the species results", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) =>
        url.pathname === "/v2/ja/cards" && url.searchParams.get("dexId") === "eq:25" ? jaPikachuCards : undefined,
      ),
    );
    const res = await searchCards("pikachu 25", 1, "ja");
    expect(res.cards.map((c) => c.id)).toEqual(["ja:SV2a-025"]);
    expect(cardsCalls(fn, "ja").every((u) => !u.searchParams.has("localId"))).toBe(true);
    expect((await searchCards("pikachu 1/0", 1, "ja")).cards.map((c) => c.id)).toEqual(["ja:SV-P-001"]);
  });

  it("ja + Japanese name + number, or number only, uses the localId filter on the ja API", async () => {
    const fn = mockFetch(
      tcgdexRoutes((url) => (url.pathname === "/v2/ja/cards" ? jaPikachuCards : undefined)),
    );
    const res = await searchCards("ピカチュウ 025", 1, "ja");
    const [call] = cardsCalls(fn, "ja");
    expect(call.searchParams.get("localId")).toBe("25");
    expect(call.searchParams.get("name")).toBe("ピカチュウ");
    expect(res.cards.map((c) => c.id)).toEqual(["ja:SV2a-025"]);
    fn.mockClear();
    expect((await searchCards("30", 1, "ja")).cards.map((c) => c.id)).toEqual(["ja:M2-030"]);
    expect(cardsCalls(fn, "ja")[0].searchParams.has("name")).toBe(false);
  });

  it("queries without a number keep the plain name search", async () => {
    const fn = mockFetch(tcgdexRoutes((url) => (url.pathname === "/v2/en/cards" ? searchPage : undefined)));
    await searchCards("Porygon2");
    const [call] = cardsCalls(fn);
    expect(call.searchParams.get("name")).toBe("Porygon2");
    expect(call.searchParams.has("localId")).toBe(false);
    expect(call.searchParams.get("pagination:itemsPerPage")).toBe("24");
  });
});
