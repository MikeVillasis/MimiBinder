import type { AxisCentering, BorderFit, CenteringResult, Side } from "@/lib/centering";
import { ratio, ratio1, sideLabel, widths } from "./format";
import { WARN_Q } from "./ResultEditor";

function Axis({ title, axis, name }: { title: string; axis: AxisCentering; name: "lr" | "tb" }) {
  const w = widths(axis, name);
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-0.5 text-3xl font-extrabold tabular-nums text-accent">{ratio(axis.worst)}</div>
      <div className="mt-1 text-sm">
        {sideLabel(axis.heavySide)} border is wider.
      </div>
      <div className="text-sm text-muted tabular-nums">
        {sideLabel(w.first)} {w.firstMm.toFixed(2)} mm · {sideLabel(w.second)} {w.secondMm.toFixed(2)} mm
      </div>
      <div className="mt-1 text-xs text-muted tabular-nums">
        Worst point {ratio1(axis.worst)} · average {ratio1(axis.mean)}
      </div>
    </div>
  );
}

/** Text version of the measurement (the overlay is never the only place the numbers appear). */
export function Readout({ result, fit, onCheck }: { result: CenteringResult | null; fit: BorderFit; onCheck: (side: Side) => void }) {
  const bad = (["left", "right", "top", "bottom"] as Side[]).filter((s) => fit.quality[s] < WARN_Q);
  return (
    <div className="flex flex-col gap-3">
      {result ? (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Axis title="Left / right" axis={result.lr} name="lr" />
          <Axis title="Top / bottom" axis={result.tb} name="tb" />
        </div>
      ) : (
        <p role="alert" className="text-sm text-danger">
          Could not calculate centering from these lines.
        </p>
      )}
      {bad.length > 0 && (
        <div role="status" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-semibold text-danger">Check this line</p>
          <p className="mt-0.5 text-muted">The edge was hard to find on these sides (dashed on the card). Zoom in and nudge the lines if they are off.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {bad.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onCheck(s)}
                className="inline-flex min-h-11 items-center rounded-xl border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger/15"
              >
                {sideLabel(s)} side
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
