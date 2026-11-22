"use client";

import { useState, type ReactNode } from "react";
import { addEntry, useBinders } from "@/lib/db";
import { CONDITION_LABELS, type Binder, type CardDetail, type Condition, type Currency, type Variant } from "@/lib/types";
import { printingKey } from "@/lib/stamps";
import { printingChoices, type PrintingChoice } from "./printings";
import { useMoney } from "./hooks";
import { Button, Chip, ChipGroup, Field, Segmented, Sheet, cx, inputCls } from "./ui";

const today = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD

export function AddToCollectionSheet({
  card,
  open,
  onClose,
  defaultVariant,
  onAdded,
}: {
  card: CardDetail;
  open: boolean;
  onClose: () => void;
  defaultVariant?: Variant;
  onAdded?: () => void;
}) {
  const { currency } = useMoney();
  const binders = useBinders();
  const choices = printingChoices(card);
  const [printing, setPrinting] = useState<string>(() => {
    const k = defaultVariant ? printingKey(defaultVariant) : "";
    return choices.some((c) => c.key === k) ? k : choices[0].key;
  });
  const chosen = choices.find((c) => c.key === printing) ?? choices[0];
  const [condition, setCondition] = useState<Condition>("NM");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [pCur, setPCur] = useState<Currency>(currency);
  const [date, setDate] = useState(today());
  const [binderIds, setBinderIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const parsed = price.trim() === "" ? undefined : Number(price);
      if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) throw new Error("Enter a valid purchase price.");
      await addEntry({
        cardId: card.id,
        cardName: card.name,
        localId: card.localId,
        image: card.image,
        setId: card.setId,
        setName: card.setName,
        serieId: card.serieId,
        serieName: card.serieName,
        rarity: card.rarity,
        variant: chosen.variant,
        ...(chosen.stamp ? { stamp: chosen.stamp } : {}),
        condition,
        quantity: qty,
        purchasePrice: parsed,
        purchaseCurrency: parsed != null ? pCur : undefined,
        purchaseDate: date || undefined,
        binderIds,
      });
      onAdded?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add card.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Add ${card.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <PrintingPicker choices={choices} value={chosen.key} onChange={setPrinting} />
        <ConditionPicker value={condition} onChange={setCondition} />
        <QtyField value={qty} onChange={setQty} />
        <PriceFields price={price} onPrice={setPrice} currency={pCur} onCurrency={setPCur} label="Purchase price (per copy, optional)" />
        <Field label="Purchase date">
          <input type="date" className={inputCls} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <BinderChips binders={binders} value={binderIds} onChange={setBinderIds} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={saving} className="w-full">
          {saving ? "Adding…" : "Add to collection"}
        </Button>
      </form>
    </Sheet>
  );
}

/* Form pieces shared with EntryEditor. */

/** A group of related controls with a label styled like Field's (a <label> can't wrap several buttons). */
export function FieldGroup({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-muted">{label}</legend>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </fieldset>
  );
}

/** Printing as chips (a select when there are many, e.g. several stamped printings). */
export function PrintingPicker({ choices, value, onChange }: { choices: PrintingChoice[]; value: string; onChange: (k: string) => void }) {
  if (choices.length > 6) {
    return (
      <Field label="Printing">
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <FieldGroup label="Printing">
      <ChipGroup label="Printing" className="py-0">
        {choices.map((c) => (
          <Chip key={c.key} selected={c.key === value} onClick={() => onChange(c.key)}>
            {c.label}
          </Chip>
        ))}
      </ChipGroup>
    </FieldGroup>
  );
}

export function ConditionPicker({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
  return (
    <FieldGroup label="Condition" hint={CONDITION_LABELS[value]}>
      <ChipGroup label="Condition" className="py-0">
        {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
          <Chip key={c} selected={c === value} onClick={() => onChange(c)} title={CONDITION_LABELS[c]} aria-label={`${c}, ${CONDITION_LABELS[c]}`} className="min-w-12 justify-center">
            {c}
          </Chip>
        ))}
      </ChipGroup>
    </FieldGroup>
  );
}

/** − [n] + stepper. */
export function QtyField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <FieldGroup label="Quantity">
      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Decrease quantity" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} className="w-11 px-0">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
        </Button>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          aria-label="Quantity"
          className={cx(inputCls, "w-20 text-center font-semibold tabular-nums")}
          value={value}
          onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
        />
        <Button variant="secondary" aria-label="Increase quantity" onClick={() => onChange(value + 1)} className="w-11 px-0">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </Button>
      </div>
    </FieldGroup>
  );
}

/** Purchase price input with a small CAD/USD toggle beside it. */
export function PriceFields({
  price,
  onPrice,
  currency,
  onCurrency,
  label,
}: {
  price: string;
  onPrice: (v: string) => void;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  label: string;
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <Field label={label}>
          <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" className={cx(inputCls, "tabular-nums")} value={price} onChange={(e) => onPrice(e.target.value)} />
        </Field>
      </div>
      <Segmented<Currency>
        size="sm"
        label="Purchase currency"
        value={currency}
        onChange={onCurrency}
        options={[
          { value: "CAD", label: "CAD" },
          { value: "USD", label: "USD" },
        ]}
        className="shrink-0"
      />
    </div>
  );
}

export function BinderChips({ binders, value, onChange }: { binders: Binder[] | undefined; value: string[]; onChange: (ids: string[]) => void }) {
  if (!binders || binders.length === 0) return null;
  return (
    <FieldGroup label="Custom binders">
      <ChipGroup label="Custom binders" className="py-0">
        {binders.map((b) => {
          const on = value.includes(b.id);
          return (
            <Chip
              key={b.id}
              selected={on}
              onClick={() => onChange(on ? value.filter((i) => i !== b.id) : [...value, b.id])}
              icon={
                on ? (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : undefined
              }
            >
              {b.name}
            </Chip>
          );
        })}
      </ChipGroup>
    </FieldGroup>
  );
}
