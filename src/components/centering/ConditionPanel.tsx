"use client";

import { useState } from "react";
import { defectLabel, zoneLabel, zoneSeverity } from "@/lib/centering";
import type { Defect, Face, Severity, SkipReason, ZoneFinding, ZoneId } from "@/lib/centering";
import { Badge, Sheet, cx } from "../ui";
import type { Evidence, EvidenceCrop } from "./evidence";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const zoneTitle = (z: ZoneId) => cap(zoneLabel(z));
const SEV_LABEL: Record<Severity, string> = { minor: "Minor", moderate: "Moderate", heavy: "Heavy" };

/** One line of plain numbers for a defect (what was measured, not what it means for the grade). */
export function describeDefect(d: Defect, zone: ZoneId): string {
  const mm = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));
  if (d.kind === "whitening") {
    return zone.startsWith("corner-")
      ? `about ${mm(d.areaMm2)} mm² of paper showing, up to ${d.depthMm.toFixed(1)} mm in from the cut`
      : `about ${mm(d.lengthMm)} mm of the edge, up to ${d.depthMm.toFixed(1)} mm in from the cut`;
  }
  if (d.kind === "chipping") return `a notch about ${d.depthMm.toFixed(1)} mm deep and ${mm(d.lengthMm)} mm long`;
  return `the tip sits about ${d.depthMm.toFixed(1)} mm inside the factory curve`;
}

const SKIP_TEXT: Record<SkipReason, string> = {
  blur: "The photo is too soft to check corners and edges. Retake it in focus.",
  glare: "Glare covers part of the border, so those zones were not checked. Retake without the reflection.",
  lightBorder: "Whitening was not checked: this border is silver or light, too close to paper white to show it. The blue back shows whitening best.",
  noBorder: "No plain printed border was found on some sides, so they were not checked.",
  thinBorder: "The border is too thin on one side to check it for whitening.",
  lowContrast: "The card edge is hard to tell from the table on some sides, so chips could not be checked there. Use a plain surface that contrasts with the card.",
};

/** The view model both the per-photo panel and the combined summary use. */
export interface ZoneView extends ZoneFinding {
  /** Photos (of this face) that showed the flag, when more than one was taken. */
  seenIn?: number;
}

function Marks({ crop }: { crop: EvidenceCrop }) {
  if (!crop.marks.length) return null;
  const sw = Math.max(crop.w, crop.h) / 60;
  return (
    <svg viewBox={`0 0 ${crop.w} ${crop.h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {crop.marks.map((line, i) => {
        const pts = line.map((p) => `${p.x},${p.y}`).join(" ");
        return (
          <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={pts} stroke="#000" strokeOpacity="0.7" strokeWidth={sw * 1.9} />
            <polyline points={pts} stroke="#ff3df0" strokeWidth={sw} />
          </g>
        );
      })}
    </svg>
  );
}

/** The crop with its marks. Decorative unless `alt` is given. */
export function CropImage({ crop, alt = "", marks = true, className }: { crop: EvidenceCrop; alt?: string; marks?: boolean; className?: string }) {
  return (
    <span className={cx("relative block overflow-hidden bg-surface-2", className)} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={crop.src} alt={alt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {marks && <Marks crop={crop} />}
    </span>
  );
}

function StatusDot({ z }: { z: ZoneView }) {
  const sev = zoneSeverity(z);
  const tone = z.status === "flagged" ? "bg-danger" : z.status === "clear" ? "bg-good" : "bg-muted";
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", tone)} title={sev ?? z.status} aria-hidden="true" />;
}

/** Small diagram of the card: which of the 8 zones are flagged, clear or unchecked. Decorative (the list says it all). */
function ZoneMap({ zones }: { zones: ZoneView[] }) {
  const by = new Map(zones.map((z) => [z.zone, z]));
  const fill = (id: ZoneId) => {
    const z = by.get(id);
    if (!z || z.status === "notAssessed") return "var(--color-surface-3)";
    return z.status === "flagged" ? "var(--color-danger)" : "var(--color-good)";
  };
  const op = (id: ZoneId) => {
    const z = by.get(id);
    return !z || z.status === "notAssessed" ? 1 : z.status === "flagged" ? 0.95 : z.checked.whitening && z.checked.contour ? 0.75 : 0.4;
  };
  const W = 63, H = 88, c = 9, t = 4;
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width="84" height="116" className="shrink-0" aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} rx="3" fill="var(--color-surface-2)" stroke="var(--color-line)" strokeWidth="0.6" />
      <rect x={c} y="0" width={W - 2 * c} height={t} fill={fill("edge-top")} opacity={op("edge-top")} />
      <rect x={c} y={H - t} width={W - 2 * c} height={t} fill={fill("edge-bottom")} opacity={op("edge-bottom")} />
      <rect x="0" y={c} width={t} height={H - 2 * c} fill={fill("edge-left")} opacity={op("edge-left")} />
      <rect x={W - t} y={c} width={t} height={H - 2 * c} fill={fill("edge-right")} opacity={op("edge-right")} />
      <path d={`M0 ${c} V3 A3 3 0 0 1 3 0 H${c} V${t} H${t} V${c} Z`} fill={fill("corner-tl")} opacity={op("corner-tl")} />
      <path d={`M${W} ${c} V3 A3 3 0 0 0 ${W - 3} 0 H${W - c} V${t} H${W - t} V${c} Z`} fill={fill("corner-tr")} opacity={op("corner-tr")} />
      <path d={`M${W} ${H - c} V${H - 3} A3 3 0 0 1 ${W - 3} ${H} H${W - c} V${H - t} H${W - t} V${H - c} Z`} fill={fill("corner-br")} opacity={op("corner-br")} />
      <path d={`M0 ${H - c} V${H - 3} A3 3 0 0 0 3 ${H} H${c} V${H - t} H${t} V${H - c} Z`} fill={fill("corner-bl")} opacity={op("corner-bl")} />
    </svg>
  );
}

export function flagSummary(zones: ZoneView[]): { flagged: ZoneView[]; clear: number; partly: number; unchecked: number } {
  const flagged = zones.filter((z) => z.status === "flagged");
  const clear = zones.filter((z) => z.status === "clear" && z.checked.whitening && z.checked.contour).length;
  const partly = zones.filter((z) => z.status === "clear" && !(z.checked.whitening && z.checked.contour)).length;
  return { flagged, clear, partly, unchecked: zones.filter((z) => z.status === "notAssessed").length };
}

/** Corner and edge flags for one face, with evidence crops that open zoomed. */
export function ConditionPanel({
  face,
  zones,
  evidence,
  lightBackground,
  shots = 1,
  unconfirmed = [],
  heading = "Corners and edges",
  compact = false,
}: {
  face: Face;
  zones: ZoneView[];
  evidence: Evidence;
  lightBackground: boolean;
  shots?: number;
  /** Flags seen in fewer than half of the photos. */
  unconfirmed?: ZoneView[];
  heading?: string;
  /** Only the flagged zones and the notes: no diagram, no corner close-ups (the result summary uses this). */
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState<ZoneId | null>(null);
  const s = flagSummary(zones);
  const corners = zones.filter((z) => z.zone.startsWith("corner-"));
  const reasons = [...new Set(zones.flatMap((z) => z.skipped))];
  const zoomed = zoom ? [...zones, ...unconfirmed].find((z) => z.zone === zoom) : undefined;
  const zoomCrop = zoom ? evidence[zoom] : undefined;
  const nothingChecked = s.unchecked === zones.length;

  const line = (z: ZoneView) => z.defects.map((d) => `${cap(defectLabel(d.kind))}: ${describeDefect(d, z.zone)}`).join(". ");

  return (
    <section aria-label={`${face} ${heading.toLowerCase()}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">{heading}</h3>
        <Badge>Flags, not grades</Badge>
      </div>

      <div className="flex items-start gap-4">
        {!compact && <ZoneMap zones={zones} />}
        <div className="min-w-0 flex-1 text-sm">
          {nothingChecked ? (
            <p className="font-medium">Not checked on this photo.</p>
          ) : s.flagged.length ? (
            <p className="font-semibold text-danger">
              {s.flagged.length} of 8 {s.flagged.length === 1 ? "zone" : "zones"} flagged
            </p>
          ) : (
            <p className="font-semibold text-good">No visible wear flagged</p>
          )}
          <p className="mt-1 text-[13px] text-muted">
            Of the 4 corners and 4 edges, {s.clear + s.partly} {s.clear + s.partly === 1 ? "was" : "were"} checked and clear{s.partly ? ` (${s.partly} only partly)` : ""}
            {s.unchecked ? ` and ${s.unchecked} could not be checked` : ""}.
          </p>
          {!compact && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-hidden="true">
              <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-danger" /> Flagged</li>
              <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-good" /> Clear</li>
              <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-surface-3 ring-1 ring-line" /> Not checked</li>
            </ul>
          )}
        </div>
      </div>

      {s.flagged.length > 0 && (
        <ul className="flex flex-col gap-2">
          {s.flagged.map((z) => {
            const crop = evidence[z.zone];
            const sev = zoneSeverity(z)!;
            return (
              <li key={z.zone}>
                <button
                  type="button"
                  onClick={() => setZoom(z.zone)}
                  disabled={!crop}
                  className="ui-motion ui-press flex min-h-11 w-full items-center gap-3 rounded-ui-md bg-danger/10 p-2 text-left hover:bg-danger/15"
                  aria-label={`${zoneTitle(z.zone)}, ${SEV_LABEL[sev].toLowerCase()}. ${line(z)}. Open the evidence photo.`}
                >
                  {crop && <CropImage crop={crop} className="h-16 w-16 shrink-0 rounded-ui-sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold">{zoneTitle(z.zone)}</span>
                      <span className="text-xs font-semibold text-danger">{SEV_LABEL[sev]}</span>
                      {shots > 1 && z.seenIn != null && <span className="text-xs text-muted">seen in {z.seenIn} of {shots} photos</span>}
                    </span>
                    <span className="block text-[13px] text-muted">{line(z)}</span>
                  </span>
                  <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {unconfirmed.length > 0 && (
        <p className="text-[13px] text-muted">
          Seen in only one of {shots} photos, so not counted: {unconfirmed.map((z) => `${zoneLabel(z.zone)} (${z.defects.map((d) => defectLabel(d.kind)).join(", ")})`).join("; ")}.
        </p>
      )}

      {!compact && corners.some((z) => evidence[z.zone]) && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Corner close-ups (tap to zoom)</p>
          <div className="grid grid-cols-4 gap-2">
            {corners.map((z) => {
              const crop = evidence[z.zone];
              if (!crop) return <span key={z.zone} />;
              return (
                <button
                  key={z.zone}
                  type="button"
                  onClick={() => setZoom(z.zone)}
                  className="ui-motion ui-press flex flex-col items-stretch gap-1 rounded-ui-sm text-left"
                  aria-label={`${zoneTitle(z.zone)}: ${z.status === "flagged" ? "flagged" : z.status === "clear" ? "clear" : "not checked"}. Open zoomed.`}
                >
                  <CropImage crop={crop} className={cx("w-full rounded-ui-sm", z.status === "flagged" && "ring-2 ring-danger")} />
                  <span className="flex items-start gap-1.5 text-xs leading-tight text-muted">
                    <span className="mt-0.5"><StatusDot z={z} /></span>
                    <span>{zoneTitle(z.zone).replace(" corner", "").replace("-", " ")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(reasons.length > 0 || lightBackground) && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-muted">
          {reasons.map((r) => (
            <li key={r}>{SKIP_TEXT[r]}</li>
          ))}
          {lightBackground && !reasons.includes("blur") && <li>The table is lighter than the border, so thin whitening right at the cut can be missed. A dark, plain surface works best.</li>}
        </ul>
      )}

      <Sheet open={!!zoomed && !!zoomCrop} onClose={() => setZoom(null)} title={zoom ? zoneTitle(zoom) : "Evidence"}>
        {zoomed && zoomCrop && <ZoomBody face={face} zone={zoomed} crop={zoomCrop} />}
      </Sheet>
    </section>
  );
}

function ZoomBody({ face, zone, crop }: { face: Face; zone: ZoneView; crop: EvidenceCrop }) {
  const [marks, setMarks] = useState(true);
  const sev = zoneSeverity(zone);
  return (
    <div className="flex flex-col gap-3">
      <CropImage
        crop={crop}
        marks={marks}
        alt={`Zoomed photo of the ${face} ${zoneLabel(zone.zone)}`}
        className="mx-auto w-full max-w-sm rounded-ui-md"
      />
      {crop.marks.length > 0 && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
          Show where it was flagged (pink line, just outside the cut)
        </label>
      )}
      {zone.status === "flagged" ? (
        <div className="rounded-ui-md bg-danger/10 p-3 text-sm">
          <p className="font-semibold text-danger">{sev ? `${SEV_LABEL[sev]} flag` : "Flagged"}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {zone.defects.map((d) => (
              <li key={d.kind}>
                <span className="font-medium">{cap(defectLabel(d.kind))}:</span> {describeDefect(d, zone.zone)}.
              </li>
            ))}
          </ul>
        </div>
      ) : zone.status === "clear" ? (
        <p className="rounded-ui-md bg-surface-2 p-3 text-sm">
          Nothing flagged here{zone.checked.whitening && zone.checked.contour ? "" : zone.checked.contour ? " (shape checked; whitening could not be)" : " (whitening checked; shape could not be)"}.
        </p>
      ) : (
        <p className="rounded-ui-md bg-surface-2 p-3 text-sm">This zone could not be checked on this photo.</p>
      )}
      <p className="text-[13px] leading-relaxed text-muted">
        Look at the photo yourself: the thresholds behind these flags are not calibrated against graded cards, and dust, glare or a busy table can fool them.
      </p>
    </div>
  );
}
