// Splits a card search into a name part and a card-number part (client-safe, pure), so "Zorua 189",
// "#189", "189/159", "tg05" or "GG69" find cards by number instead of being matched as literal names.

export interface CardNumberQuery {
  /** Normalised number as typed, uppercase, no "#" or leading zeros in the digits ("TG5", "189"). */
  key: string;
  /** Letter prefix, uppercase ("TG", "GG", "SWSH"); "" for plain numbers. */
  prefix: string;
  /** Numeric part (189 for "189" or "TG189"). */
  num: number;
  /** Set size after a slash ("189/159" → 159), used to prefer the right set. */
  total?: number;
}

export interface ParsedCardQuery {
  /** The rest of the query, trimmed, for name matching ("" when the query is only a number). */
  name: string;
  number?: CardNumberQuery;
  /** A rarity code that was typed and removed from the name ("SAR", "SIR", "AR"…), uppercase. */
  rarity?: string;
}

/**
 * Rarity codes people type next to a card ("Espeon ex SAR 211/187"). They are not part of any card name,
 * so they are taken out of the name. Japanese: C U R RR RRR SR SAR AR UR HR CHR CSR S SSR K ACE; English:
 * IR SIR HR UR DR ("double rare"), plus PROMO.
 */
const RARITY_CODES = new Set(["RR", "RRR", "SR", "SAR", "AR", "UR", "HR", "CHR", "CSR", "SSR", "IR", "SIR", "ACE", "PROMO"]);

// "#189", "189", "189/159", "097/086", "TG05", "TG05/TG30", "GG69", "SV001", "SWSH050", "H12".
// At most 4 prefix letters, so names with digits ("Porygon2") are never read as numbers.
const NUMBER_RE = /^#?([A-Za-z]{0,4})0*(\d{1,4})(?:\/[A-Za-z]{0,4}0*(\d{1,4}))?$/;

export function parseCardQuery(q: string): ParsedCardQuery {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  let number: CardNumberQuery | undefined;
  let rarity: string | undefined;
  const rest: string[] = [];
  // Use the last number-like token (people type "Zorua 189" more than "189 Zorua"), keep the rest as the name.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (tokens.length > 1 && RARITY_CODES.has(t.toUpperCase())) {
      rarity ??= t.toUpperCase();
      continue;
    }
    const m = number ? null : NUMBER_RE.exec(t);
    if (m) {
      const prefix = m[1].toUpperCase();
      const num = parseInt(m[2], 10);
      number = { key: `${prefix}${num}`, prefix, num, ...(m[3] ? { total: parseInt(m[3], 10) } : {}) };
    } else {
      rest.unshift(t);
    }
  }
  return { name: rest.join(" "), ...(number ? { number } : {}), ...(rarity ? { rarity } : {}) };
}

/** True when a card's localId ("001", "189", "TG05", "SWSH050") is the queried number. */
export function matchesCardNumber(localId: string, n: CardNumberQuery): boolean {
  const m = /^([A-Za-z]*)0*(\d+)[A-Za-z]?$/.exec(localId.trim());
  if (!m) return false;
  return m[1].toUpperCase() === n.prefix && parseInt(m[2], 10) === n.num;
}
