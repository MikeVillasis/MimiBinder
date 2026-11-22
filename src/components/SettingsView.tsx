"use client";

import { useRef, useState, type ReactNode } from "react";
import { exportCollection, importCollection, updateSettings, useSettings } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth, useSync, verifyEmailCode } from "@/lib/sync";
import type { Currency, PriceSource } from "@/lib/types";
import { Button, ConfirmDialog, PageHeader, Segmented, inputCls } from "./ui";

function Card({ title, children, desc }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      <h2 className="text-base font-bold">{title}</h2>
      {desc && <p className="mb-3 mt-0.5 text-sm text-muted">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function SettingsView() {
  const settings = useSettings();
  const configured = isSupabaseConfigured();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Settings" />
      <Card title="Currency" desc="All prices are converted to this currency using Bank of Canada rates.">
        <Segmented<Currency>
          label="Currency"
          value={settings.currency}
          onChange={(currency) => updateSettings({ currency })}
          options={[{ value: "CAD", label: "CAD" }, { value: "USD", label: "USD" }]}
        />
      </Card>
      <Card title="Price source" desc="TCGPlayer is in USD, Cardmarket is in EUR. Both are converted for display.">
        <Segmented<PriceSource>
          label="Price source"
          value={settings.priceSource}
          onChange={(priceSource) => updateSettings({ priceSource })}
          options={[{ value: "tcgplayer", label: "TCGPlayer" }, { value: "cardmarket", label: "Cardmarket" }]}
        />
      </Card>
      {configured ? (
        <AccountCard />
      ) : (
        <Card title="Guest mode">
          <p className="text-sm text-muted">
            Cloud sync is not set up for this app, so everything you add stays on this device only. Use the export below to back up your collection or move it to another device.
          </p>
        </Card>
      )}
      <DataCard />
      <Card title="About MimiBinder">
        <div className="flex flex-col gap-2 text-sm text-muted">
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
            Open source under the MIT License ·{" "}
            <a className="text-accent underline" href="https://github.com/MikeVillasis/MimiBinder" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </p>
        </div>
      </Card>
    </div>
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
    <Card title="Account & sync" desc="Sign in to sync your collection across devices. Without an account, data stays on this device.">
      {auth.user ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm">
            Signed in as <span className="font-semibold">{auth.user.email ?? "owner"}</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium capitalize" role="status">
              {sync.status}
            </dd>
            <dt className="text-muted">Last synced</dt>
            <dd className="font-medium">{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : "Never"}</dd>
          </dl>
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
        </div>
      ) : state === "sent" ? (
        <form
          className="flex flex-col gap-3"
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
        <form onSubmit={send} className="flex flex-col gap-3">
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
    </Card>
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
    <Card title="Your data" desc="Export a JSON backup or import one from another device.">
      <div className="flex flex-col gap-4">
        <Button variant="secondary" onClick={doExport} className="self-start">
          Export JSON
        </Button>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Segmented<"merge" | "replace">
            label="Import mode"
            value={mode}
            onChange={setMode}
            options={[{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace" }]}
          />
          <p className="text-xs text-muted">
            {mode === "merge" ? "Merge keeps your current data and adds or updates entries from the file." : "Replace deletes your current collection and uses only the file."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="Choose backup file"
            className="block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-surface-2 file:px-4 file:font-semibold file:text-fg"
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
        </div>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-good" : "text-sm text-danger"}>
            {msg.text}
          </p>
        )}
      </div>
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
            setMsg({ ok: true, text: `Imported ${r.entries} entries and ${r.binders} binders.` });
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Import failed." });
          }
        }}
      />
    </Card>
  );
}
