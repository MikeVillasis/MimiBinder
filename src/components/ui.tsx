"use client";

import Link from "next/link";
import { useBackToClose } from "./useBackToClose";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export function cx(...p: (string | false | null | undefined)[]) {
  return p.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------------------------------- */

export type SurfacePadding = boolean | "sm" | "md" | "lg";

/**
 * Class string for a Surface, for elements that can't be a <Surface> (e.g. a next/link <Link>):
 * `<Link className={surfaceCls({ interactive: true, padded: true })}>`.
 */
export function surfaceCls({
  padded = false,
  interactive = false,
  tone = "default",
}: { padded?: SurfacePadding; interactive?: boolean; tone?: "default" | "sunken" } = {}) {
  return cx(
    "rounded-ui-lg",
    tone === "sunken" ? "bg-surface-2 elev-0" : "bg-surface elev-1",
    padded === "sm" && "p-3",
    (padded === true || padded === "md") && "p-4",
    padded === "lg" && "p-5 md:p-6",
    interactive && "ui-motion ui-press ui-lift cursor-pointer",
  );
}

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  /** Element to render. Default "div". */
  as?: "div" | "section" | "article" | "aside" | "ul" | "ol" | "li" | "header" | "footer";
  /** true/"md" = 16px, "sm" = 12px, "lg" = 20/24px. Default none. */
  padded?: SurfacePadding;
  /** Hover lift + press scale (for clickable panels). */
  interactive?: boolean;
  /** "sunken" = surface-2 without shadow, for a panel nested inside another Surface. */
  tone?: "default" | "sunken";
};

/** A panel: bg-surface, radius-lg, hairline highlight, soft shadow. Group related things on one. */
export function Surface({ as: Tag = "div", padded, interactive, tone, className, ...rest }: SurfaceProps) {
  return <Tag {...rest} className={cx(surfaceCls({ padded, interactive, tone }), className)} />;
}

/** Title (text-lg/semibold) + an optional trailing action (a node, or `href` + `actionLabel`). */
export function SectionHeader({
  title,
  subtitle,
  action,
  href,
  actionLabel = "See all",
  as: Tag = "h2",
  id,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  href?: string;
  actionLabel?: string;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag id={id} className="truncate text-lg font-semibold tracking-tight">
          {title}
        </Tag>
        {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
      </div>
      {action ??
        (href && (
          <Link
            href={href}
            className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-ui-sm px-2 text-sm font-medium text-accent hover:bg-accent-soft"
          >
            {actionLabel}
            <Chevron />
          </Link>
        ))}
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * An inset grouped list: one Surface whose ListRow children are divided by hairlines.
 * Children should be <ListRow>s (they render <li>). Optional `title`/`action` render a SectionHeader.
 */
export function ListGroup({
  title,
  action,
  href,
  actionLabel,
  footer,
  label,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  href?: string;
  actionLabel?: string;
  /** Muted note under the group. */
  footer?: ReactNode;
  /** aria-label for the list when there is no title. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={className} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}>
      {title && <SectionHeader id={titleId} title={title} action={action} href={href} actionLabel={actionLabel} />}
      <ul role="list" className={cx(surfaceCls(), "overflow-hidden")}>
        {children}
      </ul>
      {footer && <p className="mt-2 px-1 text-[13px] text-muted">{footer}</p>}
    </section>
  );
}

/**
 * One row of a ListGroup: leading media, title/subtitle, trailing value, chevron.
 * The whole row is the link (`href`) or button (`onClick`); otherwise it's static.
 */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  ariaLabel,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Defaults to true for links. */
  chevron?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const showChevron = chevron ?? !!href;
  const inner = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right text-sm tabular-nums">{trailing}</span>}
      {showChevron && <Chevron className="-mr-1 shrink-0 text-muted/70" />}
    </>
  );
  const rowCls = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left";
  const hoverCls = "ui-motion hover:bg-surface-2/70 active:bg-surface-2 focus-visible:-outline-offset-2";
  return (
    <li
      className={cx(
        "list-row", // inset hairline divider between rows (globals.css)
        className,
      )}
    >
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={cx(rowCls, hoverCls)}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={cx(rowCls, hoverCls)}>
          {inner}
        </button>
      ) : (
        <div className={rowCls}>{inner}</div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Page furniture
 * ---------------------------------------------------------------------------------------------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[63/88] w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  children,
}: {
  title: string;
  body?: ReactNode;
  /** Replaces the default app mark inside the soft circle. */
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-muted elev-0" aria-hidden="true">
        {icon ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-md opacity-60" />
        )}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {body && <p className="text-sm leading-relaxed text-muted">{body}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-ui-lg bg-danger/10 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-danger">Something went wrong</h2>
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Controls
 * ---------------------------------------------------------------------------------------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** All sizes keep a 44px touch target; sm is tighter and smaller text, lg is taller. */
  size?: "sm" | "md" | "lg";
  /** Leading icon (an svg sized ~18px). */
  icon?: ReactNode;
  /** Fully rounded instead of radius-md. */
  pill?: boolean;
};

/** Class string for a Button, for links styled as buttons: `<Link className={buttonCls({ variant: "secondary" })}>`. */
export function buttonCls({ variant = "primary", size = "md", pill = false }: Pick<BtnProps, "variant" | "size" | "pill"> = {}) {
  const v = {
    primary: "bg-accent text-accent-fg font-semibold shadow-[var(--hairline),var(--shadow-1)] hover:brightness-110",
    secondary: "bg-surface-2 text-fg font-semibold elev-0 hover:bg-surface-3",
    ghost: "text-muted font-medium hover:bg-surface-2 hover:text-fg",
    danger: "bg-danger/12 text-danger font-semibold hover:bg-danger/20",
  }[variant];
  return cx(
    "ui-motion ui-press inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" && "px-3 text-[13px]",
    size === "md" && "px-4 text-sm",
    size === "lg" && "min-h-12 px-5 text-[15px]",
    pill ? "rounded-full" : "rounded-ui-md",
    v,
  );
}

export function Button({ variant = "primary", size = "md", icon, pill, className, children, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} className={cx(buttonCls({ variant, size, pill }), className)}>
      {icon && (
        <span className="-ml-0.5 flex shrink-0 items-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * A segmented control: neutral track with a raised thumb that slides to the selected option.
 * size "sm" is for secondary toggles (e.g. English/Japanese).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const btn = track?.querySelectorAll<HTMLElement>("[role=radio]")[selectedIndex];
    if (!track || !btn) return setThumb(null);
    setThumb((t) => (t && t.x === btn.offsetLeft && t.w === btn.offsetWidth ? t : { x: btn.offsetLeft, w: btn.offsetWidth }));
  }, [selectedIndex]);

  useLayoutEffect(measure, [measure, options.length]);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);
  // Only slide after the first placement, so the thumb doesn't fly in from the left on mount.
  useEffect(() => {
    if (!thumb || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [thumb, animate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d || !options.length) return;
    e.preventDefault();
    const next = options[(Math.max(0, selectedIndex) + d + options.length) % options.length];
    onChange(next.value);
    trackRef.current?.querySelectorAll<HTMLElement>("[role=radio]")[options.indexOf(next)]?.focus();
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx("relative inline-flex max-w-full rounded-ui-md bg-surface-2 p-1 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-line)_45%,transparent)]", className)}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={cx("absolute bottom-1 left-0 top-1 rounded-[10px] bg-surface-3 elev-1", animate && "seg-thumb")}
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o, i) => {
        const on = i === selectedIndex;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (selectedIndex < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative z-[1] whitespace-nowrap rounded-[10px] transition-colors duration-150",
              // stretch the hit area over the track padding: 36 + 8 = 44px
              "after:absolute after:-inset-1 after:content-['']",
              size === "sm" ? "min-h-9 px-3 text-[13px]" : "min-h-10 px-4 text-sm",
              on ? "font-semibold text-fg" : "font-medium text-muted hover:text-fg",
              // before the thumb is measured (SSR / first paint), mark the selection statically
              on && !thumb && "bg-surface-3 elev-1",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A compact filter/toggle chip. Selected = accent-soft bg + accent text. */
export function Chip({
  selected = false,
  icon,
  count,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: ReactNode;
  /** Small trailing number (e.g. matches). */
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "ui-motion ui-press relative inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium",
        // 36px visual, 44px hit area
        "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]"
          : "bg-surface-2 text-muted elev-0 hover:bg-surface-3 hover:text-fg",
        className,
      )}
    >
      {icon && (
        <span className="-ml-0.5 flex items-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {count != null && <span className={cx("tabular-nums", selected ? "opacity-80" : "opacity-75")}>{count}</span>}
    </button>
  );
}

/**
 * A row of Chips. `scroll` keeps them on one line and scrolls sideways (bleeding to the screen
 * edge on phones) instead of wrapping, so a filter row never eats the first screen.
 */
export function ChipGroup({
  label,
  scroll = false,
  className,
  children,
}: {
  label: string;
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "flex gap-2",
        scroll ? "no-scrollbar -mx-4 overflow-x-auto px-4 py-1 md:mx-0 md:px-0" : "flex-wrap py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  // Android/browser Back closes the sheet instead of navigating the page underneath.
  useBackToClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-anim relative flex max-h-[92dvh] w-full flex-col rounded-t-ui-xl bg-surface backdrop-blur-xl elev-pop md:max-w-lg md:rounded-ui-xl"
      >
        <span className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted/40 md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-2 md:pt-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ui-motion -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </span>
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Back-to-close comes from the Sheet below (one history entry per dialog).
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-5">
        <div className="text-sm text-muted">{body}</div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            className="flex-1"
            onClick={() => {
              onClose();
              // Closing pops the Sheet's Back-history entry (useBackToClose). Run onConfirm after that
              // pop, so a navigation it starts (e.g. router.push) isn't undone by the history.back().
              let done = false;
              const run = () => {
                if (done) return;
                done = true;
                window.removeEventListener("popstate", run);
                onConfirm();
              };
              window.addEventListener("popstate", run);
              window.setTimeout(run, 500);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "ui-motion min-h-11 w-full rounded-ui-md border border-muted/45 bg-surface-2 px-3.5 text-base text-fg placeholder:text-muted hover:border-muted/70 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 md:text-sm";

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(p)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Completion"}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3/80 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-line)_40%,transparent)]"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${p}%`, minWidth: p > 0 ? 6 : 0, background: p >= 100 ? "var(--color-good)" : "var(--color-accent)" }}
      />
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted elev-0",
      )}
    >
      {children}
    </span>
  );
}

/** Small "JP" marker for Japanese cards. Opaque so it stays legible on top of card art. */
export function LangBadge({ className }: { className?: string }) {
  return (
    <span
      title="Japanese card"
      aria-label="Japanese card"
      className={cx("inline-flex items-center rounded-md bg-surface-3 px-1.5 py-0.5 text-xs font-bold leading-none text-fg backdrop-blur elev-1", className)}
    >
      JP
    </span>
  );
}

/**
 * A big tabular number with a small muted sentence-case label.
 * Standalone it is its own Surface; with `inset` it has no box (use inside a Surface, e.g. a grid of stats).
 */
export function Stat({
  label,
  value,
  tone,
  sub,
  inset = false,
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "bad" | "accent";
  sub?: ReactNode;
  inset?: boolean;
  /** "lg" for the one number that matters most on the screen. */
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cx(!inset && surfaceCls({ padded: true }), "min-w-0", className)}>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div
        className={cx(
          "mt-1.5 font-bold leading-none tracking-[-0.02em] tabular-nums",
          size === "lg" ? "text-4xl md:text-5xl" : "text-2xl md:text-[28px]",
          tone === "good" && "text-good",
          tone === "bad" && "text-danger",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** "Delta Reign" -> "DR", "30th Celebration" -> "30C", "Scarlet & Violet" -> "SV". */
export function setInitials(name: string): string {
  const words = name.split(/[\s\-–:]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words
    .slice(0, 3)
    .map((w) => (/^\d/.test(w) ? w.match(/^\d+/)![0] : w[0].toUpperCase()))
    .join("")
    .slice(0, 4);
}

/**
 * A set (or generation) logo that falls back to the set symbol, then to initials, both when TCGdex
 * has no image (common for the newest sets) and when an image fails to load.
 * Sized by the parent: pass a `size` box class such as "h-10 w-14".
 */
export function SetLogo({
  name,
  logo,
  symbol,
  fallbackText,
  className = "h-10 w-14",
}: {
  name: string;
  logo?: string;
  symbol?: string;
  /** Text shown when there is no image, instead of initials (e.g. the set code of a Japanese set). */
  fallbackText?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [logo, symbol].find((u): u is string => !!u && !failed.includes(u));
  return (
    <div className={cx("flex shrink-0 items-center justify-center", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed((f) => [...f, src])}
          className={cx("max-h-full max-w-full object-contain", src === symbol && "max-h-[80%] max-w-[80%]")}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cx(
            "flex h-full max-h-10 w-full max-w-14 items-center justify-center overflow-hidden rounded-ui-sm bg-surface-2 font-bold text-muted elev-0",
            fallbackText && fallbackText.length > 3 ? "px-0.5 text-xs tracking-tight" : "text-xs tracking-wide",
          )}
        >
          {fallbackText ?? setInitials(name)}
        </span>
      )}
    </div>
  );
}
