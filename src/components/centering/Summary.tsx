"use client";

import { useState, useSyncExternalStore } from "react";
import { CONDITION_THRESHOLDS, MAX_SHOT_SPREAD, PSA_CENTERING, psaLabel } from "@/lib/centering";
import type { BorderProfile, CenteringResult } from "@/lib/centering";
import { Badge, Button, Surface } from "../ui";
import { ConditionPanel } from "./ConditionPanel";
import { ratio } from "./format";
import { summaryText, whiteningGap, type FaceSummary, type Verdict } from "./model";
import { SaveSheet, type SaveCard } from "./SaveSheet";

/** The axis that counts: the worse one, leaving out an axis the set is off-centre on by design. */
function worstOf(r: CenteringResult | null | undefined, skip?: "lr" | "tb") {
  if (!r) return null;
  return skip === "lr" ? r.tb.worst : skip === "tb" ? r.lr.worst : Math.max(r.lr.worst, r.tb.worst);
}

/** `plain`: on the highlighted row the tinted background lowers the contrast of green and red, so use the text colour. */
function Cell({ limit, worst, plain }: { limit: number; worst: number | null; plain?: boolean }) {
  const pass = worst != null && worst <= limit;
  return (
    <td className="px-2 py-2">
      <span className="tabular-nums">{ratio(limit)}</span>{" "}
      {worst == null ? (
        <span className="text-muted">n/a</span>
      ) : pass ? (
        <span className={`font-semibold ${plain ? "text-fg" : "text-good"}`}>✓ pass</span>
      ) : (
        <span className={`font-semibold ${plain ? "text-fg" : "text-danger"}`}>✗ over</span>
      )}
    </td>
  );
}

function Row({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "danger" | "muted" }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-[13px] font-medium text-muted sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm">
        <span className={tone === "good" ? "font-semibold text-good" : tone === "danger" ? "font-semibold text-danger" : tone === "muted" ? "font-medium text-muted" : "font-semibold"}>{value}</span>
        {note && <span className="block text-[13px] text-muted">{note}</span>}
      </dd>
    </div>
  );
}

const noopSubscribe = () => () => {};
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

function flagCount(f: FaceSummary | null) {
  return f ? f.condition.zones.filter((z) => z.status === "flagged").length : 0;
}

export function Summary({
  front,
  back,
  verdict: v,
  frontSkipped,
  profile,
  card,
  onReset,
}: {
  front: FaceSummary | null;
  back: FaceSummary | null;
  verdict: Verdict;
  frontSkipped: boolean;
  profile: BorderProfile | null;
  card: SaveCard | null;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  // The phone's share sheet where there is one, else the clipboard. Detected after mount (no SSR mismatch).
  const hasShare = useSyncExternalStore(noopSubscribe, canShare, () => false);
  const ceiling = v.centering;
  const fw = worstOf(front?.centering, profile?.asymmetric?.axis);
  const bw = worstOf(back?.centering);
  const flags = flagCount(front) + flagCount(back);
  const faces = [front, back].filter((f): f is FaceSummary => !!f);
  const gaps = faces.map(whiteningGap).filter(Boolean);
  const unchecked = faces.reduce((n, f) => n + f.condition.zones.filter((z) => z.status === "notAssessed").length, 0);
  const text = () => summaryText(front, back, v, { cardName: card?.name, frontFullArt: frontSkipped });

  const share = async () => {
    const t = text();
    try {
      if (hasShare) {
        await navigator.share({ title: "Grading check", text: t });
        setShared("Shared.");
        return;
      }
      await navigator.clipboard.writeText(t);
      setShared("Summary copied.");
    } catch (e) {
      // A cancelled share sheet is not an error worth showing.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setShared("Could not copy. Select the text below instead.");
    }
  };

  return (
    <Surface as="section" aria-labelledby="sum-h" padded="lg">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sum-h" className="text-lg font-semibold tracking-tight">
          Result
        </h2>
        <Badge>A ceiling, not a predicted grade</Badge>
      </div>

      {v.probable != null && (
        <div className="mt-3 rounded-ui-md bg-accent-soft p-4" role="status">
          <p className="text-[13px] font-medium text-muted">Probable ceiling</p>
          <p className="mt-1 text-3xl font-bold tracking-[-0.02em]">
            <span className="text-muted">PSA</span> <span className="text-accent">{v.probable}</span> <span className="text-lg font-semibold text-fg">({psaLabel(v.probable)})</span>
          </p>
          {v.limitedBy === "condition" || v.limitedBy === "both" ? (
            <p className="mt-1 text-sm text-muted">
              Lowered by {v.condition!.reasons.slice(0, 2).join("; ")}
              {v.condition!.reasons.length > 2 ? `, and ${v.condition!.reasons.length - 2} more` : ""}.
            </p>
          ) : ceiling?.limitedBy ? (
            <p className="mt-1 text-sm text-muted">Limited by {ceiling.limitedBy}.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing measured here rules out a 10. Surface is not assessed, and it decides 9 versus 10 most often.</p>
          )}
          {frontSkipped && <p className="mt-1 text-sm text-muted">Front centering is not measured (full-art card).</p>}
          {!frontSkipped && front && !front.centering && <p className="mt-1 text-sm text-muted">Front centering is not counted: no reliable border was found. Skip the front if this is a full-art card, or adjust the lines.</p>}
          {!frontSkipped && !front && <p className="mt-1 text-sm text-muted">The front has not been measured, so it does not count yet.</p>}
          {!back && <p className="mt-1 text-sm text-muted">The back has not been measured, so it does not count yet.</p>}
        </div>
      )}

      <dl className="mt-3 divide-y divide-line/40">
        <Row
          label="Centering"
          value={ceiling ? `Allows up to PSA ${ceiling.grade} (${ceiling.label})` : "Not measured"}
          note={ceiling ? `${ceiling.limitedBy ? `Limited by ${ceiling.limitedBy}. ` : ""}From PSA's published limits: this part is a hard ceiling.` : undefined}
        />
        <Row
          label="Corners and edges"
          value={!faces.length ? "Not checked" : flags ? `${flags} ${flags === 1 ? "zone" : "zones"} flagged: no higher than PSA ${v.condition?.grade ?? "?"}` : unchecked === faces.length * 8 ? "Not checked" : "Nothing flagged"}
          tone={!faces.length || unchecked === faces.length * 8 ? "muted" : flags ? "danger" : "good"}
          note={
            flags
              ? "A rule of thumb from PSA's written grade descriptions. The thresholds are not calibrated, so check the evidence photos."
              : gaps.length
                ? `Not checked: ${gaps.join("; ")}.`
                : faces.length
                  ? "On the zones these photos could check. Light wear can be missed."
                  : undefined
          }
        />
        <Row label="Surface" value="Not assessed" tone="muted" note="Scratches, print lines, dents and creases need angled light that a single photo does not capture." />
      </dl>

      {faces.some((f) => f.shots > 1 && f.centering) && (
        <ul className="mt-2 flex flex-col gap-1 text-[13px]">
          {faces
            .filter((f) => f.shots > 1 && f.centering)
            .map((f) => (
              <li key={f.face} className={f.inconsistent ? "font-medium text-danger" : "text-muted"}>
                <span className="capitalize">{f.face}</span>: average of {f.shots} photos,{" "}
                {f.inconsistent
                  ? `which disagree by ${f.centering!.spread.toFixed(1)} points (more than ${MAX_SHOT_SPREAD}). Retake the one that looks off.`
                  : `which agree within ${f.centering!.spread.toFixed(1)} points.`}
              </li>
            ))}
        </ul>
      )}

      {faces
        .filter((f) => f.shots > 1 || f.condition.zones.some((z) => z.status === "flagged") || f.condition.unconfirmed.length > 0)
        .map((f) => (
          <div key={f.face} className="mt-4 border-t border-line/40 pt-4">
            <ConditionPanel
              face={f.face}
              zones={f.condition.zones}
              evidence={f.evidence}
              lightBackground={f.condition.lightBackground}
              shots={f.shots}
              unconfirmed={f.condition.unconfirmed}
              compact
              heading={`${f.face === "front" ? "Front" : "Back"} corners and edges${f.shots > 1 ? ` (${f.shots} photos)` : ""}`}
            />
          </div>
        ))}

      {profile?.asymmetric && front?.centering && (
        <p className="mt-3 rounded-ui-md bg-surface-2 p-3 text-[13px] leading-relaxed">
          <span className="font-semibold">Set note:</span> {profile.asymmetric.why} The front {profile.asymmetric.axis === "lr" ? "left/right" : "top/bottom"} reading is shown but left out of the ceiling.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left text-[13px] text-muted">PSA centering limits (larger border share, worst point) and this card</caption>
          <thead>
            <tr className="border-b border-line/60 text-xs text-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">PSA</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Front</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Back</th>
            </tr>
          </thead>
          <tbody>
            {PSA_CENTERING.map((row) => (
              <tr key={row.grade} className={`border-b border-line/40 last:border-0 ${ceiling && ceiling.grade === row.grade ? "bg-accent-soft" : ""}`}>
                <th scope="row" className="px-2 py-2 font-semibold">
                  {row.grade} <span className="text-xs font-normal text-muted">{row.label}</span>
                </th>
                <Cell limit={row.frontMax} worst={fw} plain={ceiling?.grade === row.grade} />
                <Cell limit={row.backMax} worst={bw} plain={ceiling?.grade === row.grade} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-muted tabular-nums">
        This card: front {fw != null ? `${ratio(fw)} (${profile?.asymmetric ? (profile.asymmetric.axis === "lr" ? "top/bottom only" : "left/right only") : "worst axis"})` : "not measured"} · back {bw != null ? `${ratio(bw)} (worst axis)` : "not measured"}
      </p>

      <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-muted">
        <li>This is a ceiling, not a prediction: it is the best grade these measurements allow, not the grade you will get.</li>
        <li>Phone photos are good to about ±1 point of centering, so a result close to a limit could go either way.</li>
        <li>PSA judges the worst point along the edges, so that is what we measure.</li>
        <li>For grades 7 and up, PSA may allow about 5% extra front leeway for eye appeal.</li>
        <li>
          Corner and edge flags use conservative thresholds that have not been calibrated against graded cards (whitening is flagged from about {CONDITION_THRESHOLDS.edgeWhiteningMm[0]} mm along an edge). No flag does not mean no wear.
        </li>
        <li>Surface is not assessed, and it decides 9 versus 10 more often than centering does. PSA grades also vary: the same card can come back a grade apart.</li>
        <li>A face you did not measure does not count toward the ceiling.</li>
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setSaving(true)} disabled={v.probable == null}>
          {savedId ? "Save again" : "Save this check"}
        </Button>
        <Button variant="secondary" onClick={share} disabled={v.probable == null}>
          {hasShare ? "Share summary" : "Copy summary"}
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Start over
        </Button>
      </div>
      <p className="mt-2 min-h-5 text-[13px] text-muted" role="status" aria-live="polite">
        {savedId ? (
          <>
            Saved to your grading log on this device.{" "}
            <a href="#grading-log" className="font-medium text-accent underline-offset-2 hover:underline">
              See the log
            </a>{" "}
            to record the grade PSA returns.
          </>
        ) : (
          shared
        )}
      </p>
      {shared?.startsWith("Could not") && <textarea readOnly value={text()} rows={6} className="mt-2 w-full rounded-ui-md border border-muted/45 bg-surface-2 p-3 text-[13px]" aria-label="Summary text" />}

      <SaveSheet
        open={saving}
        onClose={() => setSaving(false)}
        front={front}
        back={back}
        verdict={v}
        frontFullArt={frontSkipped}
        card={card}
        onSaved={(id) => {
          setSavedId(id);
          setShared(null);
        }}
      />
    </Surface>
  );
}
