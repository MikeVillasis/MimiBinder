"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { chunkPages } from "@/lib/fun";
import { motionOK } from "@/lib/prefs";
import { cx } from "./ui";

const POCKETS = 9;

/**
 * A set shown as 3×3 pocket pages, like a real binder: one page per screen on phones, an open
 * spread of two on desktop. Paging is native CSS scroll-snap (swipe, trackpad), plus arrow buttons
 * and the ← → keys. `renderPocket` returns the same tile the grid view uses.
 */
export function BinderPages<T>({
  items,
  itemKey,
  renderPocket,
  label,
}: {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderPocket: (item: T, index: number) => ReactNode;
  label: string;
}) {
  const pages = chunkPages(items, POCKETS);
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [pos, setPos] = useState({ first: 0, perView: 1 });

  const measure = useCallback(() => {
    frame.current = 0;
    const el = scroller.current;
    const page = el?.firstElementChild as HTMLElement | null;
    if (!el || !page || !page.offsetWidth) return;
    const perView = Math.max(1, Math.round(el.clientWidth / page.offsetWidth));
    const first = Math.round(el.scrollLeft / page.offsetWidth);
    setPos((p) => (p.first === first && p.perView === perView ? p : { first, perView }));
  }, []);
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule]);

  // A new filter (All / Owned / Missing) starts again at the first page.
  const count = pages.length;
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
    schedule();
  }, [count, schedule]);

  const turn = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: motionOK() ? "smooth" : "auto" });
  };

  const last = Math.min(count, pos.first + pos.perView);
  const atStart = pos.first <= 0;
  const atEnd = last >= count;
  const where = count === 0 ? "" : pos.perView > 1 && last > pos.first + 1 ? `Pages ${pos.first + 1}–${last} of ${count}` : `Page ${Math.min(count, pos.first + 1)} of ${count}`;

  return (
    <div className="mx-auto max-w-4xl">
      <div
        ref={scroller}
        role="group"
        aria-roledescription="binder"
        aria-label={label}
        tabIndex={0}
        onScroll={schedule}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          turn(e.key === "ArrowRight" ? 1 : -1);
        }}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-ui-lg px-2.5 focus-visible:outline-offset-0 md:mx-0 md:px-0"
      >
        {pages.map((page, i) => (
          <section
            key={i}
            aria-label={`Page ${i + 1} of ${count}`}
            className={cx("w-full shrink-0 px-1.5 pb-3 pt-1 md:w-1/2", i % 2 === 0 ? "snap-center md:snap-start" : "snap-center md:snap-align-none")}
          >
            <div className="grid grid-cols-3 gap-1.5 rounded-ui-lg bg-surface p-2 elev-1 md:gap-2 md:p-3">
              {page.map((item, j) => (
                <div key={itemKey(item)} className="binder-pocket min-w-0 p-1.5 pb-1 md:p-2 md:pb-1.5">
                  {renderPocket(item, i * POCKETS + j)}
                </div>
              ))}
              {Array.from({ length: POCKETS - page.length }, (_, k) => (
                <div key={`empty-${k}`} className="binder-pocket opacity-60" aria-hidden="true" />
              ))}
            </div>
          </section>
        ))}
        {/* Desktop: an odd number of pages ends on a blank facing page, so the last spread is whole. */}
        {count % 2 === 1 && (
          <div className="hidden w-1/2 shrink-0 px-1.5 pb-3 pt-1 md:block" aria-hidden="true">
            <div className="h-full rounded-ui-lg bg-surface/40 elev-0" />
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <PageButton dir={-1} disabled={atStart} onClick={() => turn(-1)} />
        <span aria-live="polite" className="min-w-[9.5rem] text-center text-[13px] font-medium tabular-nums text-muted">
          {where}
        </span>
        <PageButton dir={1} disabled={atEnd} onClick={() => turn(1)} />
      </div>
    </div>
  );
}

function PageButton({ dir, disabled, onClick }: { dir: 1 | -1; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 1 ? "Next page" : "Previous page"}
      className="ui-motion ui-press flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg elev-0 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir === 1 ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
      </svg>
    </button>
  );
}
