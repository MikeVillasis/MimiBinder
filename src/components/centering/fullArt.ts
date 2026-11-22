// Which cards probably have art to the cut, so the front has no printed border to measure. A hint only: the
// tool pre-selects "Full-art card" from it and the user can untick. TCGdex gives English cards a rarity name
// ("Special illustration rare"); Japanese cards often come back as "None", so the card number is the second signal:
// a number past the set's official count is a secret rare, which is nearly always full art.

export interface FullArtCard {
  rarity?: string;
  localId?: string;
  setOfficialCount?: number;
}

const NAME = /illustration rare|hyper rare|secret|rainbow|ultra rare|full art|shiny ultra|shiny rare v|black white rare|amazing rare/i;
// Japanese rarity codes, as a whole word ("SAR", not "SARA").
const CODE = /(^|[^A-Za-z])(SAR|SR|AR|HR|UR|CHR|CSR|SSR|ACE)([^A-Za-z]|$)/;

/** Why the card looks full art (for the one-line explanation), or null when nothing says so. */
export function fullArtReason(card: FullArtCard | null | undefined): string | null {
  if (!card) return null;
  const r = card.rarity?.trim();
  if (r && r !== "None" && (NAME.test(r) || CODE.test(r))) return `its rarity (${r}) is usually full art`;
  const n = /^\d+$/.test(card.localId ?? "") ? Number(card.localId) : NaN;
  if (card.setOfficialCount && n > card.setOfficialCount) return `its number (${card.localId}) is past the set's ${card.setOfficialCount} regular cards, which is usually a full-art secret rare`;
  return null;
}
