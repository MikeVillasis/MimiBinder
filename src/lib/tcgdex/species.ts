// Pure helpers for searching Japanese cards by English species name (TCGdex has only
// Japanese names for ja cards, but every Pokémon card carries `dexId`).
import { POKEDEX_EN } from "./pokedex-en";

/** Max species fetched for one English query. */
export const MAX_SPECIES = 6;

/** Hiragana, katakana (incl. half-width) or CJK ideographs. */
const JAPANESE_RE = /[぀-ヿㇰ-ㇿ㐀-䶿一-鿿ｦ-ﾟ]/;

export function hasJapanese(q: string): boolean {
  return JAPANESE_RE.test(q);
}

/**
 * Matching key: accents stripped, lowercase, letters and digits only
 * ("Flabébé" → "flabebe", "Mr. Mime" → "mrmime", "Nidoran♀" → "nidoran").
 */
export function speciesKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

let keyCache: { names: readonly string[]; keys: string[] } | null = null;

function keysFor(names: readonly string[]): string[] {
  if (keyCache?.names !== names) keyCache = { names, keys: names.map(speciesKey) };
  return keyCache.keys;
}

/**
 * National Pokédex numbers whose English name matches `query`, case- and accent-insensitively:
 * exact matches first, then prefix matches, then substring matches, each group in dex order.
 * `names[n - 1]` is the name of dex number n.
 */
export function matchSpecies(
  query: string,
  names: readonly string[] = POKEDEX_EN,
  limit = MAX_SPECIES,
): number[] {
  const q = speciesKey(query);
  if (!q || limit <= 0) return [];
  const keys = keysFor(names);
  const exact: number[] = [];
  const prefix: number[] = [];
  const substring: number[] = [];
  keys.forEach((k, i) => {
    if (!k) return;
    if (k === q) exact.push(i + 1);
    else if (k.startsWith(q)) prefix.push(i + 1);
    else if (k.includes(q)) substring.push(i + 1);
  });
  return [...exact, ...prefix, ...substring].slice(0, limit);
}
