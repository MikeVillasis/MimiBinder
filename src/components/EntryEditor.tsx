"use client";

import { useState } from "react";
import { removeEntry, updateEntry, useBinders } from "@/lib/db";
import { getCard } from "@/lib/api-client";
import { printingKey, printingLabel } from "@/lib/stamps";
import { VARIANT_LABELS, type CollectionEntry, type Condition, type Currency, type Variant } from "@/lib/types";
import { useAsync } from "./hooks";
import { printingChoices } from "./printings";
import { BinderChips, ConditionPicker, PriceFields, PrintingPicker, QtyField } from "./AddToCollectionSheet";
import { Button, ConfirmDialog, Field, Sheet, inputCls } from "./ui";

export function EntryEditor({ entry, onClose }: { entry: CollectionEntry; onClose: () => void }) {
  const binders = useBinders();
  const [printing, setPrinting] = useState(printingKey(entry.variant, entry.stamp));
  const { data: card } = useAsync(() => getCard(entry.cardId), entry.cardId);
  // Every regular variant (as before) plus the card's stamped printings once its detail has loaded.
  const choices = printingChoices(card, Object.keys(VARIANT_LABELS) as Variant[]);
  if (!choices.some((c) => c.key === printing)) {
    choices.push({ key: printing, variant: entry.variant, stamp: entry.stamp, label: printingLabel(entry.variant, entry.stamp) });
  }
  const chosen = choices.find((c) => c.key === printing)!;
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
        variant: chosen.variant,
        stamp: chosen.stamp ?? "",
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
        <form onSubmit={save} className="flex flex-col gap-5">
          <PrintingPicker choices={choices} value={chosen.key} onChange={setPrinting} />
          <ConditionPicker value={condition} onChange={setCondition} />
          <QtyField value={qty} onChange={setQty} />
          <PriceFields price={price} onPrice={setPrice} currency={pCur} onCurrency={setPCur} label="Purchase price (per copy)" />
          <Field label="Purchase date">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <BinderChips binders={binders} value={binderIds} onChange={setBinderIds} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="danger" size="lg" onClick={() => setConfirmDel(true)}>
              Delete
            </Button>
            <Button type="submit" size="lg" className="flex-1">
              Save changes
            </Button>
          </div>
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDel}
        danger
        title="Remove from collection?"
        body={`${entry.cardName} (${printingLabel(entry.variant, entry.stamp)} ×${entry.quantity}) will be removed from your collection.`}
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
