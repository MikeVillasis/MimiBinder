// Language-aware ids (client-safe, pure). See the `Lang` docs in ./types.ts.
import type { Lang } from "./types";

export const JA_PREFIX = "ja:";

/** Language of a card, set or serie id. */
export function langOf(id: string): Lang {
  return id.startsWith(JA_PREFIX) ? "ja" : "en";
}

/** Splits an app id into its language and the raw TCGdex id. */
export function splitId(id: string): { lang: Lang; raw: string } {
  return id.startsWith(JA_PREFIX) ? { lang: "ja", raw: id.slice(JA_PREFIX.length) } : { lang: "en", raw: id };
}

/** Builds an app id from a raw TCGdex id. Idempotent for already-prefixed ids. */
export function joinId(raw: string, lang: Lang): string {
  if (lang === "en" || raw.startsWith(JA_PREFIX)) return raw;
  return JA_PREFIX + raw;
}

export function parseLang(v: string | null | undefined): Lang {
  return v === "ja" ? "ja" : "en";
}
