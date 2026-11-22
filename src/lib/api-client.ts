// Client-safe wrappers around our own /api routes. Never calls TCGdex directly.
import type {
  CardDetail,
  CardSummary,
  FxRate,
  PriceSnapshot,
  Serie,
  SetDetail,
  SetSummary,
} from "./types";

export const BATCH_SIZE = 50;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: "application/json" }, ...init });
  } catch (err) {
    throw new ApiError(`Network error: ${(err as Error).message}`, 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export function searchCards(
  q: string,
  page = 1,
): Promise<{ cards: CardSummary[]; page: number; hasMore: boolean }> {
  const params = new URLSearchParams({ q, page: String(page) });
  return get(`/api/cards?${params}`);
}

export function getCard(id: string): Promise<CardDetail> {
  return get(`/api/cards/${encodeURIComponent(id)}`);
}

/** Fetches any number of cards, chunked into ≤50 ids per request. Unknown ids are omitted. */
export async function getCardsBatch(ids: string[]): Promise<CardDetail[]> {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) chunks.push(unique.slice(i, i + BATCH_SIZE));
  const results = await Promise.all(
    chunks.map((chunk) =>
      get<{ cards: CardDetail[] }>(
        `/api/cards/batch?ids=${chunk.map(encodeURIComponent).join(",")}`,
      ),
    ),
  );
  return results.flatMap((r) => r.cards);
}

export async function getSets(): Promise<SetSummary[]> {
  return (await get<{ sets: SetSummary[] }>("/api/sets")).sets;
}

export function getSet(id: string): Promise<SetDetail> {
  return get(`/api/sets/${encodeURIComponent(id)}`);
}

export async function getSeries(): Promise<Serie[]> {
  return (await get<{ series: Serie[] }>("/api/series")).series;
}

export function getFx(): Promise<FxRate> {
  return get("/api/fx");
}

/** Daily price history; [] when history is unavailable (no Supabase, offline, errors). */
export async function getPriceHistory(cardId: string): Promise<PriceSnapshot[]> {
  try {
    const body = await get<{ snapshots?: PriceSnapshot[] }>(
      `/api/history/${encodeURIComponent(cardId)}`,
    );
    return Array.isArray(body.snapshots) ? body.snapshots : [];
  } catch {
    return [];
  }
}
