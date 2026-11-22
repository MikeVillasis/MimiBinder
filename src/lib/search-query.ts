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
}

// "#189", "189", "189/159", "097/086", "TG05", "TG05/TG30", "GG69", "SV001", "SWSH050", "H12".
// At most 4 prefix letters, so names with digits ("Porygon2") are never read as numbers.
const NUMBER_RE = /^#?([A-Za-z]{0,4})0*(\d{1,4})(?:\/[A-Za-z]{0,4}0*(\d{1,4}))?$/;

export function parseCardQuery(q: string): ParsedCardQuery {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  let number: CardNumberQuery | undefined;
  const rest: string[] = [];
  // Use the last number-like token (people type "Zorua 189" more than "189 Zorua"), keep the rest as the name.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    const m = number ? null : NUMBER_RE.exec(t);
    if (m) {
      const prefix = m[1].toUpperCase();
      const num = parseInt(m[2], 10);
      number = { key: `${prefix}${num}`, prefix, num, ...(m[3] ? { total: parseInt(m[3], 10) } : {}) };
    } else {
      rest.unshift(t);
    }
  }
  return { name: rest.join(" "), ...(number ? { number } : {}) };
}

/** True when a card's localId ("001", "189", "TG05", "SWSH050") is the queried number. */
export function matchesCardNumber(localId: string, n: CardNumberQuery): boolean {
  const m = /^([A-Za-z]*)0*(\d+)[A-Za-z]?$/.exec(localId.trim());
  if (!m) return false;
  return m[1].toUpperCase() === n.prefix && parseInt(m[2], 10) === n.num;
}
