// Labels for stamped printings (client-safe, pure). See StampedPrinting in ./types.ts.
import { VARIANT_LABELS, type Variant } from "./types";

const SLUG_LABELS: Record<string, string> = {
  "pokemon-center": "Pokémon Center",
  "set-logo": "Set logo (prerelease)",
  staff: "Staff",
  "player-rewards-program": "Player Rewards",
  gamestop: "GameStop",
  "eb-games": "EB Games",
  "pokemon-together": "Pokémon Together",
  snowflake: "Holiday snowflake",
  "30th-pokeday": "30th Pokémon Day",
  "ace-trainer": "Ace Trainer",
  lenticular: "Lenticular",
  "top-thirty-two": "Top 32",
  "top-sixteen": "Top 16",
  "top-eight": "Top 8",
  "semi-finalist": "Semi-finalist",
  finalist: "Finalist",
};

function slugLabel(slug: string): string {
  if (SLUG_LABELS[slug]) return SLUG_LABELS[slug];
  const worlds = /^worlds-(\d{4})$/.exec(slug);
  if (worlds) return `Worlds ${worlds[1]}`;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** "pokemon-center" → "Pokémon Center stamp", "set-logo+staff" → "Set logo (prerelease) · Staff stamp". */
export function stampLabel(stamp: string): string {
  const parts = stamp.split("+").filter(Boolean).map(slugLabel);
  return parts.length ? `${parts.join(" · ")} stamp` : "";
}

/** "Holo" or "Holo · Pokémon Center stamp". */
export function printingLabel(variant: Variant, stamp?: string): string {
  return stamp ? `${VARIANT_LABELS[variant]} · ${stampLabel(stamp)}` : VARIANT_LABELS[variant];
}

/** Stable key for a printing, e.g. "holo" or "holo:pokemon-center". */
export function printingKey(variant: Variant, stamp?: string): string {
  return stamp ? `${variant}:${stamp}` : variant;
}
