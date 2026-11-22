"use client";

import { useState } from "react";
import { addEntry, useBinders } from "@/lib/db";
import { CONDITION_LABELS, VARIANT_LABELS, type CardDetail, type Condition, type Currency, type Variant } from "@/lib/types";
import { useMoney } from "./hooks";
import { Button, Field, Sheet, cx, inputCls } from "./ui";

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
  const variants: Variant[] = card.variants.length ? card.variants : ["normal"];
  const [variant, setVariant] = useState<Variant>(defaultVariant && variants.includes(defaultVariant) ? defaultVariant : variants[0]);
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
        variant,
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
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Variant">
          <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            {variants.map((v) => (
              <option key={v} value={v}>
                {VARIANT_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition">
            <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                <option key={c} value={c}>
                  {c} · {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <div className="flex items-center gap-1">
              <Button variant="secondary" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 px-0">
                −
              </Button>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                className={cx(inputCls, "text-center")}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              />
              <Button variant="secondary" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)} className="w-11 px-0">
                +
              </Button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Purchase price (per copy, optional)">
            <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={pCur} onChange={(e) => setPCur(e.target.value as Currency)} aria-label="Purchase currency">
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </select>
          </Field>
        </div>
        <Field label="Purchase date">
          <input type="date" className={inputCls} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {binders && binders.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-muted">Custom binders</legend>
            <div className="flex flex-wrap gap-2">
              {binders.map((b) => {
                const on = binderIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBinderIds((ids) => (on ? ids.filter((i) => i !== b.id) : [...ids, b.id]))}
                    className={cx(
                      "min-h-11 rounded-full border px-4 text-sm font-medium",
                      on ? "border-accent bg-accent/20 text-accent" : "border-muted/75 bg-surface-2 text-muted",
                    )}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Adding…" : "Add to collection"}
        </Button>
      </form>
    </Sheet>
  );
}
