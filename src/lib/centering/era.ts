// Set- and era-aware notes for the centering tool, keyed on TCGdex set / serie ids (not on the year): which
// fronts are asymmetric by design, which borders are silver, which printings are probably full art. Pure TS.
// Sources: docs/research/PSA grade prediction from photos.md ("Pokemon cards add specific traps").
import type { BorderFit, Side } from "./types";

export interface CardRef {
  /** TCGdex card id, possibly with a language prefix ("ja:SV2a-001"). */
  id?: string;
  setId?: string;
  serieId?: string;
  rarity?: string;
}

export interface BorderProfile {
  /** Front border the era prints. "silver" fronts cannot be checked for whitening. */
  border: "yellow" | "silver" | "unknown";
  /** A front axis that is off-centre by design, so PSA's table does not apply to it as measured. */
  asymmetric?: { axis: "lr" | "tb"; why: string };
  /** The rarity suggests art to the cut (no border to measure on the front). */
  likelyFullArt: boolean;
}

const bare = (id: string | undefined) => (id ?? "").replace(/^[a-z]{2}:/i, "").toLowerCase();

/** Series that print silver front borders (English: Scarlet & Violet onward; Japanese cards always did). */
const SILVER_SERIES = new Set(["sv", "me"]);
const YELLOW_SERIES = new Set(["base", "gym", "neo", "lc", "ecard", "ex", "pop", "dp", "pl", "hgss", "col", "bw", "xy", "sm", "swsh"]);

// TCGdex rarity names whose printings usually run the art to the cut. Only ever used as a hint.
const FULL_ART_RARITY = /illustration rare|hyper rare|secret|rainbow|ultra rare|full art|shiny ultra|shiny rare v|black white rare/i;

export function borderProfile(card: CardRef): BorderProfile {
  const serie = bare(card.serieId), set = bare(card.setId);
  const japanese = /^ja:/i.test(card.id ?? "") || /^ja:/i.test(card.setId ?? "");
  let border: BorderProfile["border"] = "unknown";
  if (japanese || SILVER_SERIES.has(serie)) border = "silver";
  else if (YELLOW_SERIES.has(serie)) border = "yellow";
  let asymmetric: BorderProfile["asymmetric"];
  if (serie === "ecard" && !japanese) {
    asymmetric = { axis: "lr", why: "e-Card sets have a deep strip down the left side by design (the left share is about 75%)." };
  } else if (set === "ex3" && !japanese) {
    asymmetric = { axis: "tb", why: "EX Dragon has a much deeper bottom border by design (about 5.1 mm against 1.5 mm at the top)." };
  }
  return { border, asymmetric, likelyFullArt: !!card.rarity && FULL_ART_RARITY.test(card.rarity) };
}

/**
 * True when the measured front has no printed frame on at least three sides: probably a full-art card, whose
 * front centering cannot be measured. Needs the `innerQuality` that measureBorders reports.
 */
export function looksFullArt(fit: BorderFit): boolean {
  if (!fit.innerQuality) return false;
  const sides: Side[] = ["left", "right", "top", "bottom"];
  return sides.filter((s) => fit.innerQuality![s] < 0.15).length >= 3;
}
