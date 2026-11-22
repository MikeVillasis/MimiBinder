"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { exportCollection, importCollection, updateSettings, useSettings } from "@/lib/db";
import { THEMES, setTheme, useTheme, type ThemeMeta } from "@/lib/themes";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth, useSync, verifyEmailCode } from "@/lib/sync";
import type { Currency, PriceSource } from "@/lib/types";
import { haptic, PREF, useHapticsSupported, usePref, usePrefersReducedMotion, writePref } from "@/lib/prefs";
import { Button, ConfirmDialog, PageHeader, Segmented, SectionHeader, Surface, Switch, inputCls } from "./ui";

/** An iOS-style grouped section: a title, one Surface whose rows are divided by hairlines, a muted footnote. */
function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} className="mb-2 px-1" />
      <Surface className="divide-y divide-line/60 overflow-hidden">{children}</Surface>
      {footer && <p className="mt-2 px-1 text-[13px] leading-relaxed text-muted">{footer}</p>}
    </section>
  );
}

/** A label (and optional hint) on the left, a control or value on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="text-[13px] text-muted">{hint}</div>}
      </div>
      {children != null && <div className="min-w-0 shrink-0 text-right text-sm">{children}</div>}
    </div>
  );
}

function Pad({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-3 p-4 ${className}`}>{children}</div>;
}

export function SettingsView() {
  const settings = useSettings();
  const configured = isSupabaseConfigured();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7">
      <div className="-mb-2">
        <PageHeader title="Settings" />
      </div>
      <ThemeCard />
      <FeelCard />
      <Group title="Prices" footer="All prices are converted to your currency using Bank of Canada rates. TCGPlayer is in USD, Cardmarket is in EUR.">
        <Row label="Currency">
          <Segmented<Currency>
            size="sm"
            label="Currency"
            value={settings.currency}
            onChange={(currency) => updateSettings({ currency })}
            options={[{ value: "CAD", label: "CAD" }, { value: "USD", label: "USD" }]}
          />
        </Row>
        <Row label="Price source">
          <Segmented<PriceSource>
            size="sm"
            label="Price source"
            value={settings.priceSource}
            onChange={(priceSource) => updateSettings({ priceSource })}
            options={[{ value: "tcgplayer", label: "TCGPlayer" }, { value: "cardmarket", label: "Cardmarket" }]}
          />
        </Row>
      </Group>
      {configured ? (
        <AccountCard />
      ) : (
        <Group title="Account and sync">
          <Pad>
            <p className="text-sm font-semibold">Guest mode</p>
            <p className="text-sm text-muted">
              Cloud sync is not set up for this app, so everything you add stays on this device only. Use the export below to back up your collection or move it to another device.
            </p>
          </Pad>
        </Group>
      )}
      <DataCard />
      <section aria-labelledby="about-h" className="px-1">
        <h2 id="about-h" className="mb-2 text-lg font-semibold tracking-tight">
          About MimiBinder
        </h2>
        <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted">
          <p>
            MimiBinder is a free hobby project: no ads, no subscriptions, no paid features, and no intention to ever
            sell it or your data. Without signing in, your collection is stored only in this browser. Account sign-in
            is reserved for the site owner.
          </p>
          <p>
            Unofficial fan project, not affiliated with, endorsed by, or sponsored by Nintendo, Creatures Inc., GAME
            FREAK inc. or The Pokemon Company. Pokemon names and card images are trademarks of their respective owners.
            Card data and prices come from TCGdex (TCGPlayer, Cardmarket) and are informational only, not financial
            advice.
          </p>
          <p>
            Theme art credits:{" "}
            {THEMES.filter((t) => t.credit).map((t, i) => (
              <span key={t.id}>
                {i > 0 && "; "}
                {t.name}: {creditText(t)}
              </span>
            ))}
            . Themes are original designs inspired by the colours and drawing style of the credited cards; card artwork
            belongs to its artists and The Pokemon Company.
          </p>
          <p>
            Open source under the MIT License ·{" "}
            <a className="text-accent underline" href="https://github.com/MikeVillasis/MimiBinder" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

/** Per-device switches for the playful layer: card shine and motion, and haptics. */
function FeelCard() {
  const motionOn = usePref(PREF.motion, "on") !== "off";
  const hapticsOn = usePref(PREF.haptics, "on") !== "off";
  const reduced = usePrefersReducedMotion();
  const canVibrate = useHapticsSupported();
  return (
    <Group title="Feel" footer="These only change how the app moves and feels on this device. Prices and your collection are never affected.">
      <Row
        label="Card shine and motion"
        hint={reduced ? "Off: your device asks for reduced motion" : "Tilt and light on cards, dealt-in grids, the add reveal and the total counting up"}
      >
        <Switch label="Card shine and motion" checked={motionOn && !reduced} disabled={reduced} onChange={(on) => writePref(PREF.motion, on ? null : "off")} />
      </Row>
      <Row label="Haptics" hint={canVibrate ? "A light tap when you hold a card, add one or reach a set milestone" : "This device or browser does not support vibration"}>
        <Switch
          label="Haptics"
          checked={hapticsOn && canVibrate}
          disabled={!canVibrate}
          onChange={(on) => {
            writePref(PREF.haptics, on ? null : "off");
            if (on) haptic("tick");
          }}
        />
      </Row>
    </Group>
  );
}

function creditText(t: ThemeMeta) {
  const c = t.credit;
  if (!c) return "";
  return `Inspired by ${c.card} (${c.set} ${c.number}) · Illustrated by ${c.artist}`;
}

function ThemeCard() {
  const current = useTheme();
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title="Appearance" subtitle="Pick a look for this device. Your choice is saved in this browser." className="px-1" />
      <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const on = t.id === current.id;
          const [bg, surface, accent, ...extras] = t.swatches;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setTheme(t.id)}
              className={`ui-motion ui-press relative flex flex-col gap-2 rounded-ui-lg bg-surface p-2.5 text-left ${
                on ? "elev-2 outline outline-2 outline-accent" : "elev-1 hover:elev-2"
              }`}
            >
              <div className="flex h-20 flex-col justify-between rounded-ui-md p-2" style={{ background: bg }} aria-hidden="true">
                <div className="flex items-center gap-1.5 rounded-lg p-1.5" style={{ background: surface }}>
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: accent }} />
                  <span className="h-1.5 flex-1 rounded-full opacity-40" style={{ background: extras[0] ?? accent }} />
                </div>
                <div className="flex gap-1.5">
                  {extras.map((c, i) => (
                    <span key={i} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-[15px] font-semibold">{t.name}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium capitalize text-muted">{t.mode}</span>
              </div>
              <p className="px-0.5 text-[13px] text-muted">{t.description}</p>
              {t.credit && <p className="px-0.5 text-xs leading-snug text-muted">{creditText(t)}</p>}
              {on && (
                <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AccountCard() {
  const auth = useAuth();
  const sync = useSync();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string>();
  const [syncing, setSyncing] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(undefined);
    try {
      await auth.signInWithEmail(email.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in email.");
      setState("idle");
    }
  };

  return (
    <Group title="Account and sync" footer={auth.user ? undefined : "Sign in to sync your collection across devices. Without an account, data stays on this device."}>
      {auth.user ? (
        <>
          <Row label="Signed in as">
            <span className="font-medium">{auth.user.email ?? "owner"}</span>
          </Row>
          <Row label="Status">
            <span className="font-medium capitalize text-muted" role="status">
              {sync.status}
            </span>
          </Row>
          <Row label="Last synced">
            <span className="text-muted">{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : "Never"}</span>
          </Row>
          <Pad>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  setError(undefined);
                  try {
                    await sync.syncNow();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Sync failed.");
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button variant="secondary" onClick={() => auth.signOut()}>
                Sign out
              </Button>
            </div>
          </Pad>
        </>
      ) : state === "sent" ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(undefined);
            try {
              await verifyEmailCode(email.trim(), code.trim());
            } catch (err) {
              setError(err instanceof Error ? err.message : "That code did not work.");
            }
          }}
        >
          <p role="status" className="text-sm">
            Check <span className="font-semibold">{email}</span> for a sign-in link, or enter the code from the email.
          </p>
          <input inputMode="numeric" autoComplete="one-time-code" aria-label="Email code" placeholder="Code from email" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!code.trim()}>
            Verify code
          </Button>
        </form>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-3 p-4">
          <input type="email" required autoComplete="email" aria-label="Email address" placeholder="you@example.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={state === "sending" || !email}>
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      )}
    </Group>
  );
}

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [pending, setPending] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const doExport = async () => {
    try {
      const json = await exportCollection();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `mimibinder-${new Date().toLocaleDateString("en-CA")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Export downloaded." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Export failed." });
    }
  };

  return (
    <>
    <Group title="Your data" footer="Export a JSON backup or import one from another device.">
      <Row label="Export backup" hint="Download your collection and grading log as JSON">
        <Button variant="secondary" size="sm" onClick={doExport}>
          Export JSON
        </Button>
      </Row>
      <Pad>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-medium">Import backup</span>
          <Segmented<"merge" | "replace">
            size="sm"
            label="Import mode"
            value={mode}
            onChange={setMode}
            options={[{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace" }]}
          />
        </div>
        <p className="text-[13px] text-muted">
          {mode === "merge" ? "Merge keeps your current data and adds or updates entries from the file." : "Replace deletes your current collection and uses only the file."}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose backup file"
          className="block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-ui-md file:border-0 file:bg-surface-2 file:px-4 file:font-semibold file:text-fg hover:file:bg-surface-3"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMsg(undefined);
            try {
              setPending(await f.text());
              setFileName(f.name);
            } catch {
              setMsg({ ok: false, text: "Could not read that file." });
            }
          }}
        />
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>
            {msg.text}
          </p>
        )}
      </Pad>
    </Group>
      <ConfirmDialog
        open={pending !== undefined}
        danger={mode === "replace"}
        title={mode === "replace" ? "Replace your collection?" : "Import and merge?"}
        body={
          mode === "replace"
            ? `This deletes everything currently on this device and replaces it with ${fileName}. This cannot be undone.`
            : `Entries from ${fileName} will be merged into your collection.`
        }
        confirmLabel={mode === "replace" ? "Replace" : "Import"}
        onClose={() => {
          setPending(undefined);
          if (fileRef.current) fileRef.current.value = "";
        }}
        onConfirm={async () => {
          try {
            const r = await importCollection(pending!, mode);
            setMsg({ ok: true, text: `Imported ${r.entries} entries and ${r.binders} binders${r.assessments ? `, plus ${r.assessments} saved grading ${r.assessments === 1 ? "check" : "checks"}` : ""}.` });
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Import failed." });
          }
        }}
      />
    </>
  );
}
