"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeBinder, updateBinder, updateEntry, useBinders, useEntries } from "@/lib/db";
import { VARIANT_LABELS } from "@/lib/types";
import { CardImage } from "./CardImage";
import { cardHref } from "./hooks";
import { Button, CardGridSkeleton, ConfirmDialog, EmptyState, Sheet, inputCls } from "./ui";

export function CustomBinderView({ id }: { id: string }) {
  const router = useRouter();
  const binders = useBinders();
  const entries = useEntries();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [filter, setFilter] = useState("");

  if (binders === undefined || entries === undefined) return <CardGridSkeleton count={6} />;
  const binder = binders.find((b) => b.id === id);
  if (!binder)
    return (
      <EmptyState title="Binder not found" body="It may have been deleted.">
        <Link href="/binders?tab=custom" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-fg">
          Back to binders
        </Link>
      </EmptyState>
    );

  const inBinder = entries.filter((e) => e.binderIds.includes(id));
  const available = entries.filter((e) => !e.binderIds.includes(id) && e.cardName.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div>
      <Link href="/binders?tab=custom" className="mb-2 inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Binders
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">{binder.name}</h1>
          <p className="text-sm text-muted">
            {inBinder.length} {inBinder.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAdding(true)}>+ Add cards</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setName(binder.name);
              setRenaming(true);
            }}
          >
            Rename
          </Button>
          <Button variant="danger" onClick={() => setConfirmDel(true)}>
            Delete
          </Button>
        </div>
      </div>

      {inBinder.length === 0 ? (
        <EmptyState title="This binder is empty" body="Add cards from your collection." />
      ) : (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
          {inBinder.map((e) => (
            <div key={e.id} className="min-w-0">
              <Link href={cardHref(e.cardId)} aria-label={e.cardName}>
                <CardImage image={e.image} name={e.cardName} className="card-shadow" />
              </Link>
              <div className="mt-1 truncate text-xs font-semibold">{e.cardName}</div>
              <div className="truncate text-[11px] text-muted">
                {VARIANT_LABELS[e.variant]} · ×{e.quantity}
              </div>
              <button
                type="button"
                onClick={() => updateEntry(e.id, { binderIds: e.binderIds.filter((b) => b !== id) })}
                className="mt-0.5 min-h-11 text-xs font-medium text-danger"
                aria-label={`Remove ${e.cardName} from binder`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename binder">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (!name.trim()) return;
            await updateBinder(id, { name: name.trim() });
            setRenaming(false);
          }}
        >
          <input aria-label="Binder name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          <Button type="submit">Save</Button>
        </form>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add cards to binder">
        <input aria-label="Filter your cards" placeholder="Filter by name…" className={`${inputCls} mb-3`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No more cards to add.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {available.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2">
                <div className="w-10 shrink-0">
                  <CardImage image={e.image} name={e.cardName} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.cardName}</div>
                  <div className="truncate text-xs text-muted">
                    {e.setName} · {VARIANT_LABELS[e.variant]}
                  </div>
                </div>
                <Button size="sm" onClick={() => updateEntry(e.id, { binderIds: [...e.binderIds, id] })} aria-label={`Add ${e.cardName}`}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDel}
        danger
        title="Delete binder?"
        body="The binder is deleted. Cards stay in your collection."
        confirmLabel="Delete"
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          await removeBinder(id);
          router.push("/binders?tab=custom");
        }}
      />
    </div>
  );
}
