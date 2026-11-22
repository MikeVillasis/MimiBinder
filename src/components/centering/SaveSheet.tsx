"use client";

import { useState } from "react";
import { saveAssessment, useEntries } from "@/lib/db";
import { CONDITION_LABELS, VARIANT_LABELS } from "@/lib/types";
import { Button, Field, Sheet, inputCls } from "../ui";
import { buildAssessment, type FaceSummary, type Verdict } from "./model";

/** The card the check was started from (from ?card=), when there is one. */
export interface SaveCard {
  id: string;
  name: string;
  /** e.g. "151 #001". */
  detail?: string;
}

/** Save the current check to the grading log (synced when signed in), optionally linked to an owned copy. */
export function SaveSheet({
  open,
  onClose,
  front,
  back,
  verdict,
  frontFullArt,
  card,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  front: FaceSummary | null;
  back: FaceSummary | null;
  verdict: Verdict;
  frontFullArt: boolean;
  card: SaveCard | null;
  onSaved: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Save this check">
      {open && <Form onClose={onClose} front={front} back={back} verdict={verdict} frontFullArt={frontFullArt} card={card} onSaved={onSaved} />}
    </Sheet>
  );
}

function Form({ onClose, front, back, verdict, frontFullArt, card, onSaved }: Omit<Parameters<typeof SaveSheet>[0], "open">) {
  const entries = useEntries();
  const copies = card ? (entries ?? []).filter((e) => e.cardId === card.id) : [];
  const [name, setName] = useState(card ? [card.name, card.detail].filter(Boolean).join(" · ") : "");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to the only owned copy; the user can still pick "not linked".
  const chosen = entryId ?? (copies.length === 1 ? copies[0].id : "");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const row = await saveAssessment(buildAssessment(front, back, verdict, { cardId: card?.id, cardName: name, entryId: chosen || undefined, notes, frontFullArt, photos }));
      onSaved(row.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-muted">
        Keeps the ratios, flags and ceiling in your grading log, which syncs to your account when you are signed in. When the card comes back from PSA, record its grade in the log: over time that shows how well these checks hold up for you.
      </p>
      <Field label="Card" hint={card ? undefined : "A name so you can find it later."}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Charizard ex, 151 #199" maxLength={120} />
      </Field>
      {copies.length > 0 && (
        <Field label="Which copy is this?">
          <select className={inputCls} value={chosen} onChange={(e) => setEntryId(e.target.value)}>
            <option value="">Not linked to a copy</option>
            {copies.map((e) => (
              <option key={e.id} value={e.id}>
                {VARIANT_LABELS[e.variant]} · {CONDITION_LABELS[e.condition]} · qty {e.quantity}
                {e.purchaseDate ? ` · bought ${e.purchaseDate}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes (optional)">
        <textarea className={`${inputCls} min-h-20 py-2.5`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. sent in the spring batch" />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
        <span>
          Keep small photos with it
          <span className="block text-[13px] text-muted">Thumbnails of the card and the flagged spots. They are kept with the check: in your backup file and, when you are signed in, in your synced account.</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-ui-md bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
