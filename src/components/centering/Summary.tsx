import { PSA_CENTERING, psaCeiling } from "@/lib/centering";
import type { CenteringResult } from "@/lib/centering";
import { Button } from "../ui";
import { ratio } from "./format";

function worstOf(r: CenteringResult | null) {
  return r ? Math.max(r.lr.worst, r.tb.worst) : null;
}

function Cell({ limit, worst }: { limit: number; worst: number | null }) {
  const pass = worst != null && worst <= limit;
  return (
    <td className="px-2 py-2">
      <span className="tabular-nums">{ratio(limit)}</span>{" "}
      {worst == null ? (
        <span className="text-muted">n/a</span>
      ) : pass ? (
        <span className="font-semibold text-good">✓ pass</span>
      ) : (
        <span className="font-semibold text-danger">✗ over</span>
      )}
    </td>
  );
}

export function Summary({ front, back, frontSkipped, onReset }: { front: CenteringResult | null; back: CenteringResult | null; frontSkipped: boolean; onReset: () => void }) {
  let ceiling: ReturnType<typeof psaCeiling> | null = null;
  try {
    ceiling = psaCeiling(front, back);
  } catch {
    ceiling = null;
  }
  const fw = worstOf(front);
  const bw = worstOf(back);
  return (
    <section aria-labelledby="sum-h" className="rounded-2xl border border-accent/30 bg-surface p-4 md:p-5">
      <h2 id="sum-h" className="text-xs font-medium uppercase tracking-wide text-muted">
        Centering ceiling
      </h2>
      {ceiling && (
        <div className="mt-1" role="status">
          <p className="text-2xl font-extrabold tracking-tight">
            Best PSA grade centering allows: <span className="text-accent">{ceiling.grade}</span> ({ceiling.label})
          </p>
          {ceiling.limitedBy && <p className="mt-1 text-sm text-muted">Limited by {ceiling.limitedBy}.</p>}
          {frontSkipped && <p className="mt-1 text-sm text-muted">Front centering is not measured (full-art card).</p>}
          {!frontSkipped && !ceiling.measured.front && <p className="mt-1 text-sm text-muted">The front has not been measured, so it does not count yet.</p>}
          {!ceiling.measured.back && <p className="mt-1 text-sm text-muted">The back has not been measured, so it does not count yet.</p>}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-1 text-left text-xs text-muted">PSA centering limits (larger border share, worst point) and this card</caption>
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">PSA</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Front</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Back</th>
            </tr>
          </thead>
          <tbody>
            {PSA_CENTERING.map((row) => (
              <tr key={row.grade} className={`border-b border-line/60 ${ceiling && ceiling.grade === row.grade ? "bg-accent/10" : ""}`}>
                <th scope="row" className="px-2 py-2 font-semibold">
                  {row.grade} <span className="text-xs font-normal text-muted">{row.label}</span>
                </th>
                <Cell limit={row.frontMax} worst={fw} />
                <Cell limit={row.backMax} worst={bw} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted tabular-nums">
        This card: front {fw != null ? `${ratio(fw)} (worst axis)` : "not measured"} · back {bw != null ? `${ratio(bw)} (worst axis)` : "not measured"}
      </p>

      <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>This is a ceiling, not a prediction: it is the best grade centering allows, not the grade you will get.</li>
        <li>Phone photos are good to about ±1 point of centering, so a result close to a limit could go either way.</li>
        <li>PSA judges the worst point along the edges, so that is what we measure.</li>
        <li>For grades 7 and up, PSA may allow about 5% extra front leeway for eye appeal.</li>
        <li>Corners, edges and surface are not assessed here, and they decide 9 versus 10 more often than centering does.</li>
        <li>A face you did not measure does not count toward the ceiling.</li>
      </ul>

      <div className="mt-4">
        <Button variant="secondary" onClick={onReset}>
          Start over
        </Button>
      </div>
    </section>
  );
}
