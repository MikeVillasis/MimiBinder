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
import { bulbasaur, searchPage, serieDetails, setDetail151, valet } from "./fixtures.test-data";

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
    const path = url.pathname.replace("/v2/en", "");
    if (path === "/series") return serieDetails.map(({ id, name }) => ({ id, name }));
    const serie = serieDetails.find((s) => path === `/series/${s.id}`);
    if (serie) return serie;
    return extra(url);
  };
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
