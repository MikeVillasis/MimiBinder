"use client";

import { useState } from "react";
import { removeEntry, updateEntry, useBinders } from "@/lib/db";
import { CONDITION_LABELS, VARIANT_LABELS, type CollectionEntry, type Condition, type Currency, type Variant } from "@/lib/types";
import { Button, ConfirmDialog, Field, Sheet, cx, inputCls } from "./ui";

export function EntryEditor({ entry, onClose }: { entry: CollectionEntry; onClose: () => void }) {
  const binders = useBinders();
  const [variant, setVariant] = useState<Variant>(entry.variant);
  const [condition, setCondition] = useState<Condition>(entry.condition);
  const [qty, setQty] = useState(entry.quantity);
  const [price, setPrice] = useState(entry.purchasePrice != null ? String(entry.purchasePrice) : "");
  const [pCur, setPCur] = useState<Currency>(entry.purchaseCurrency ?? "CAD");
  const [date, setDate] = useState(entry.purchaseDate ?? "");
  const [binderIds, setBinderIds] = useState(entry.binderIds);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string>();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = price.trim() === "" ? undefined : Number(price);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) return setError("Enter a valid purchase price.");
    try {
      await updateEntry(entry.id, {
        variant,
        condition,
        quantity: qty,
        purchasePrice: parsed,
        purchaseCurrency: parsed != null ? pCur : undefined,
        purchaseDate: date || undefined,
        binderIds,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  };

  return (
    <>
      <Sheet open onClose={onClose} title={`Edit ${entry.cardName}`}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Variant">
              <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
                {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
                  <option key={v} value={v}>
                    {VARIANT_LABELS[v]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                  <option key={c} value={c}>
                    {c} · {CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Purchase price (per copy)">
              <input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Currency">
              <select className={inputCls} value={pCur} onChange={(e) => setPCur(e.target.value as Currency)}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <Field label="Purchase date">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
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
                      className={cx("min-h-11 rounded-full border px-4 text-sm font-medium", on ? "border-accent bg-accent/20 text-accent" : "border-muted/75 bg-surface-2 text-muted")}
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
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => setConfirmDel(true)}>
              Delete
            </Button>
            <Button type="submit" className="flex-1">
              Save changes
            </Button>
          </div>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDel}
        danger
        title="Remove from collection?"
        body={`${entry.cardName} (${VARIANT_LABELS[entry.variant]} ×${entry.quantity}) will be removed from your collection.`}
        confirmLabel="Remove"
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          await removeEntry(entry.id);
          onClose();
        }}
      />
    </>
  );
}
