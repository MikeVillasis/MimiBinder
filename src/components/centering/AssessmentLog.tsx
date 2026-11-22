"use client";

import { useState } from "react";
import { psaLabel } from "@/lib/centering";
import { accuracySummary, deleteAssessment, PSA_GRADES, PSA_QUALIFIERS, recordActualGrade, useAssessments, type GradingAssessment, type SavedFace } from "@/lib/db";
import { Badge, Button, ConfirmDialog, Field, Sheet, Surface, inputCls } from "../ui";
import { ratio } from "./format";
import { flagLabels } from "./model";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
};

const gradeLabel = (g: number) => (g === 0 ? "Authentic (no number)" : `PSA ${g}${Number.isInteger(g) && psaLabel(g) ? ` ${psaLabel(g)}` : ""}`);

function faceText(name: string, f: SavedFace | undefined, skipped?: boolean) {
  if (skipped) return `${name}: full art, not measured`;
  if (!f) return `${name}: not measured`;
  return `${name} ${ratio(f.lr)} · ${ratio(f.tb)}${f.shots > 1 ? ` (${f.shots} photos)` : ""}`;
}

/** How the saved ceilings compared with the grades PSA returned. Shown once at least one grade is recorded. */
function Accuracy({ rows }: { rows: GradingAssessment[] }) {
  const s = accuracySummary(rows);
  if (!s.graded) {
    return (
      <p className="text-[13px] text-muted">
        No returned grades yet. When a card comes back from PSA, record its grade here: after a few dozen you will know how far to trust these checks.
      </p>
    );
  }
  return (
    <div className="rounded-ui-md bg-surface-2 p-3 text-sm" role="status">
      <p className="font-semibold">
        Your results so far: {s.graded} graded {s.graded === 1 ? "card" : "cards"}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-muted">
        {s.centeringChecked > 0 && (
          <li>
            Centering ceiling held for {s.centeringHeld} of {s.centeringChecked} (PSA graded at or under it).
          </li>
        )}
        {s.probableChecked > 0 && (
          <li>
            Probable ceiling held for {s.probableHeld} of {s.probableChecked}; PSA landed exactly on it {s.probableExact} {s.probableExact === 1 ? "time" : "times"}
            {s.meanGap != null && Math.abs(s.meanGap) >= 0.05 ? ` and on average ${Math.abs(s.meanGap).toFixed(1)} ${s.meanGap > 0 ? "below" : "above"} it` : ""}.
          </li>
        )}
        {s.graded < 10 && <li>Too few cards to draw conclusions yet.</li>}
      </ul>
    </div>
  );
}

function GradeForm({ row, onClose }: { row: GradingAssessment; onClose: () => void }) {
  const [grade, setGrade] = useState(row.actual ? String(row.actual.grade) : "");
  const [qualifier, setQualifier] = useState(row.actual?.qualifier ?? "");
  const [gradedAt, setGradedAt] = useState(row.actual?.gradedAt ?? "");
  const [cert, setCert] = useState(row.actual?.cert ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = async (clear = false) => {
    try {
      await recordActualGrade(row.id, clear ? null : { grade: Number(grade), qualifier, gradedAt, cert });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (grade !== "") void save();
      }}
    >
      <p className="text-sm text-muted">
        What PSA returned for {row.cardName || "this card"}
        {row.probableCeiling != null ? `. The check's probable ceiling was PSA ${row.probableCeiling}.` : "."}
      </p>
      <Field label="PSA grade" hint="Half grades run from 1.5 to 8.5. There is no 9.5.">
        <select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} required>
          <option value="" disabled>
            Choose a grade
          </option>
          {PSA_GRADES.map((g) => (
            <option key={g} value={g}>
              {gradeLabel(g)}
            </option>
          ))}
          <option value="0">{gradeLabel(0)}</option>
        </select>
      </Field>
      <Field label="Qualifier (optional)" hint="Only if the label shows one, e.g. OC for off-centre.">
        <select className={inputCls} value={qualifier} onChange={(e) => setQualifier(e.target.value)}>
          <option value="">None</option>
          {PSA_QUALIFIERS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <Field label="Date graded (optional)">
          <input type="date" className={inputCls} value={gradedAt} onChange={(e) => setGradedAt(e.target.value)} />
        </Field>
        <Field label="Cert number (optional)">
          <input className={inputCls} value={cert} onChange={(e) => setCert(e.target.value)} inputMode="numeric" maxLength={20} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-ui-md bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {row.actual && (
          <Button variant="ghost" onClick={() => void save(true)}>
            Clear grade
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={grade === ""}>
          Save grade
        </Button>
      </div>
    </form>
  );
}

function LogRow({ row, onGrade, onDelete }: { row: GradingAssessment; onGrade: () => void; onDelete: () => void }) {
  const flags = [...(row.front?.flags ?? []).map((f) => ({ ...f, face: "front" })), ...(row.back?.flags ?? []).map((f) => ({ ...f, face: "back" }))];
  const crops = flags.filter((f) => f.crop).slice(0, 4);
  const thumb = row.thumbs?.front ?? row.thumbs?.back;
  const held = row.actual && row.actual.grade > 0 && row.probableCeiling != null ? row.actual.grade <= row.probableCeiling : null;
  return (
    <li className="flex gap-3 py-3">
      <div className="w-14 shrink-0">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="aspect-[63/88] w-full rounded-md object-cover" />
        ) : (
          <div className="aspect-[63/88] w-full rounded-md bg-surface-2" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-semibold">{row.cardName || "Unnamed card"}</span>
          <span className="text-xs text-muted">{fmtDate(row.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-sm">
          {row.probableCeiling != null ? (
            <>
              Probable ceiling <span className="font-semibold">PSA {row.probableCeiling}</span>
            </>
          ) : (
            "No ceiling"
          )}
          {row.centeringCeiling != null && row.centeringCeiling !== row.probableCeiling && <span className="text-muted"> · centering allows {row.centeringCeiling}</span>}
        </p>
        <p className="text-[13px] text-muted tabular-nums">
          {faceText("Front", row.front, row.frontFullArt)} · {faceText("Back", row.back)}
        </p>
        {flags.length > 0 && (
          <p className="text-[13px] text-muted">
            Flags: {[...flagLabels(flags.filter((f) => f.face === "front")).map((t) => `front ${t}`), ...flagLabels(flags.filter((f) => f.face === "back")).map((t) => `back ${t}`)].join("; ")}
          </p>
        )}
        {crops.length > 0 && (
          <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
            {crops.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f.crop} alt="" className="h-10 w-10 rounded object-cover" />
            ))}
          </div>
        )}
        {row.notes && <p className="mt-1 text-[13px] text-muted">“{row.notes}”</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {row.actual ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="accent">
                PSA returned {row.actual.grade === 0 ? "Authentic" : row.actual.grade}
                {row.actual.qualifier ? ` (${row.actual.qualifier})` : ""}
              </Badge>
              {held != null && <span className={`text-[13px] font-medium ${held ? "text-good" : "text-danger"}`}>{held ? "At or under the ceiling" : "Above the ceiling"}</span>}
            </span>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onGrade}>
            {row.actual ? "Edit grade" : "Record PSA grade"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete the saved check for ${row.cardName || "this card"}`}>
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Saved checks (synced when signed in), with the returned PSA grade once recorded. `cardId` narrows it to one card. */
export function AssessmentLog({ cardId }: { cardId?: string }) {
  const all = useAssessments();
  const [showAll, setShowAll] = useState(false);
  const [grading, setGrading] = useState<GradingAssessment | null>(null);
  const [deleting, setDeleting] = useState<GradingAssessment | null>(null);
  if (!all || all.length === 0) return null;
  const mine = cardId ? all.filter((r) => r.cardId === cardId) : all;
  const rows = cardId && !showAll ? mine : all;
  return (
    <Surface as="section" id="grading-log" aria-labelledby="log-h" padded="lg" className="scroll-mt-20">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="log-h" className="text-lg font-semibold tracking-tight">
          Grading log
        </h2>
        <Badge>Syncs when signed in</Badge>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Checks you saved. They sync to your account when you are signed in, and are included in your backup file (Settings).
      </p>
      <div className="mt-3">
        <Accuracy rows={all} />
      </div>
      {cardId && mine.length !== all.length && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={() => setShowAll((s) => !s)} aria-pressed={showAll}>
            {showAll ? "Show this card only" : `Show all ${all.length} checks`}
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No saved checks for this card yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line/40">
          {rows.map((r) => (
            <LogRow key={r.id} row={r} onGrade={() => setGrading(r)} onDelete={() => setDeleting(r)} />
          ))}
        </ul>
      )}
      <Sheet open={!!grading} onClose={() => setGrading(null)} title="Record PSA grade">
        {grading && <GradeForm row={grading} onClose={() => setGrading(null)} />}
      </Sheet>
      <ConfirmDialog
        open={!!deleting}
        title="Delete this saved check?"
        body={`${deleting?.cardName || "This check"} and its photos will be removed from this device and, once it syncs, from your account.${deleting?.actual ? " Its returned grade goes with it." : ""}`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteAssessment(deleting.id);
        }}
      />
    </Surface>
  );
}
