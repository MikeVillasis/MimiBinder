import { printingKey, printingLabel } from "@/lib/stamps";
import type { CardDetail, Variant } from "@/lib/types";

export interface PrintingChoice {
  key: string;
  variant: Variant;
  stamp?: string;
  label: string;
}

/** Regular variants first, then every stamped printing, as separate choices. */
export function printingChoices(card: CardDetail | undefined, regular?: Variant[]): PrintingChoice[] {
  const variants: Variant[] = regular ?? (card?.variants.length ? card.variants : ["normal"]);
  const out: PrintingChoice[] = variants.map((v) => ({ key: printingKey(v), variant: v, label: printingLabel(v) }));
  for (const s of card?.stamped ?? []) {
    const key = printingKey(s.variant, s.stamp);
    if (!out.some((c) => c.key === key)) out.push({ key, variant: s.variant, stamp: s.stamp, label: printingLabel(s.variant, s.stamp) });
  }
  return out;
}
