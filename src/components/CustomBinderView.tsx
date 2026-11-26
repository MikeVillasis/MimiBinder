"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeBinder, updateBinder, updateEntry, useBinders, useEntries } from "@/lib/db";
import { printingLabel } from "@/lib/stamps";
import { CardImage } from "./CardImage";
import { CardFan } from "./fun";
import { glitterTier } from "@/lib/fun";
import { CardTile, QtyBadge } from "./CardTile";
import { Button, CardGridSkeleton, ConfirmDialog, EmptyState, Field, ListGroup, PageHeader, Sheet, buttonCls, cx, inputCls } from "./ui";

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
        <Link href="/binders?tab=custom" className={buttonCls()}>
          Back to binders
        </Link>
      </EmptyState>
    );

  const inBinder = entries.filter((e) => e.binderIds.includes(id));
  const available = entries.filter((e) => !e.binderIds.includes(id) && e.cardName.toLowerCase().includes(filter.trim().toLowerCase()));
  const copies = inBinder.reduce((n, e) => n + e.quantity, 0);

  return (
    <div>
      <Link href="/binders?tab=custom" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-ui-sm px-2 text-sm font-medium text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Binders
      </Link>
      <PageHeader
        title={binder.name}
        subtitle={
          inBinder.length === 0
            ? "Empty"
            : `${inBinder.length} ${inBinder.length === 1 ? "entry" : "entries"} · ${copies} ${copies === 1 ? "card" : "cards"}`
        }
        actions={
          <>
            <Button
              variant="secondary"
              aria-label="Rename binder"
              onClick={() => {
                setName(binder.name);
                setRenaming(true);
              }}
              icon={
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              }
            >
              <span className="hidden sm:inline">Rename</span>
            </Button>
            <Button
              variant="danger"
              aria-label="Delete binder"
              onClick={() => setConfirmDel(true)}
              icon={
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              }
            >
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <Button onClick={() => setAdding(true)} icon={<PlusIcon />}>
              Add cards
            </Button>
          </>
        }
      />

      {inBinder.length === 0 ? (
        <EmptyState art={<CardFan />} title="Empty sleeves" body="This binder is waiting for its first cards. Pick some from your collection.">
          <Button variant="secondary" onClick={() => setAdding(true)} icon={<PlusIcon />}>
            Add cards
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-6">
          {inBinder.map((e, i) => (
            <CardTile
              key={e.id}
              index={i}
              id={e.cardId}
              name={e.cardName}
              image={e.image}
              glitter={glitterTier(e)}
              badge={e.quantity > 1 ? <QtyBadge n={e.quantity} /> : undefined}
              meta={printingLabel(e.variant, e.stamp)}
              action={
                <button
                  type="button"
                  onClick={() => updateEntry(e.id, { binderIds: e.binderIds.filter((b) => b !== id) })}
                  aria-label={`Remove ${e.cardName} from binder`}
                  title="Remove from binder"
                  className="ui-motion flex h-11 w-9 items-center justify-center rounded-ui-sm text-muted/80 hover:bg-danger/12 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 12h12" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </button>
              }
            />
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
          <Field label="Binder name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          </Field>
          <Button type="submit" size="lg">
            Save
          </Button>
        </form>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add cards to binder">
        <div className="relative mb-3">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input type="search" aria-label="Filter your cards" placeholder="Filter by name" className={cx(inputCls, "pl-10")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {available.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No more cards to add.</p>
        ) : (
          <ListGroup label="Cards you can add" className="[&>ul]:bg-surface-2/60 [&>ul]:shadow-none">
            {available.map((e) => (
              <li key={e.id} className="list-row flex items-center gap-3 px-4 py-2.5">
                <div className="w-10 shrink-0">
                  <CardImage image={e.image} name={e.cardName} glitter={glitterTier(e)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold leading-snug">{e.cardName}</div>
                  <div className="truncate text-[13px] text-muted">
                    {e.setName} · {printingLabel(e.variant, e.stamp)}
                  </div>
                </div>
                <Button size="sm" variant="secondary" pill icon={<PlusIcon />} onClick={() => updateEntry(e.id, { binderIds: [...e.binderIds, id] })} aria-label={`Add ${e.cardName}`}>
                  Add
                </Button>
              </li>
            ))}
          </ListGroup>
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
