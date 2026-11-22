"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

export function cx(...p: (string | false | null | undefined)[]) {
  return p.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions}
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

export function EmptyState({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-12 w-12 rounded-lg opacity-40" />
      <h2 className="text-lg font-bold">{title}</h2>
      {body && <p className="text-sm text-muted">{body}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-6 py-10 text-center">
      <h2 className="text-lg font-bold text-danger">Something went wrong</h2>
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Try again
        </Button>
      )}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
};

export function Button({ variant = "primary", size = "md", className, ...rest }: BtnProps) {
  const v = {
    primary: "bg-accent text-accent-fg hover:brightness-110 font-bold",
    secondary: "bg-surface-2 text-fg hover:bg-line border border-line font-semibold",
    ghost: "text-muted hover:text-fg hover:bg-surface-2 font-medium",
    danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/40 font-semibold",
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3",
        v,
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-muted/75 bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-10 rounded-lg px-4 text-sm font-semibold transition",
            value === o.value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-anim relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface md:max-w-lg md:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
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
              onConfirm();
              onClose();
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
      <span className="font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-xl border border-muted/75 bg-surface-2 px-3 text-base text-fg placeholder:text-muted focus:border-accent focus:outline-none md:text-sm";

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(p)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Completion"}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${p}%`, background: p >= 100 ? "var(--color-good)" : "linear-gradient(90deg, var(--color-brand), var(--color-accent))" }}
      />
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold",
        tone === "accent" ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: "good" | "bad"; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1 text-2xl font-extrabold tabular-nums", tone === "good" && "text-good", tone === "bad" && "text-danger")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
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
export function SetLogo({ name, logo, symbol, className = "h-10 w-14" }: { name: string; logo?: string; symbol?: string; className?: string }) {
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
          className="flex h-full max-h-10 w-full max-w-14 items-center justify-center rounded-lg border border-line bg-surface-2 text-xs font-extrabold tracking-wide text-muted"
        >
          {setInitials(name)}
        </span>
      )}
    </div>
  );
}
