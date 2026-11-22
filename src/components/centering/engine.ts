// Talks to the centering Web Worker, and falls back to the main thread if workers are unavailable.
import type { Face, Quad, RGBAImage } from "@/lib/centering";
import type { DetectOut, MeasureOut } from "./core";
import type { WorkerRequest } from "./centering.worker";

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;
type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30));

export class CenteringEngine {
  private worker: Worker | null = null;
  private broken = false;
  private seq = 0;
  private pending = new Map<number, Pending>();

  /** True when the heavy steps run in a Worker (false: main thread fallback). */
  get usesWorker() {
    return !!this.worker && !this.broken;
  }

  private ensureWorker(): Worker | null {
    if (this.broken) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") {
      this.broken = true;
      return null;
    }
    try {
      const w = new Worker(new URL("./centering.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result as never);
        else p.reject(new Error(e.data.error ?? "Measurement failed"));
      };
      w.onerror = () => this.fail();
      w.onmessageerror = () => this.fail();
      this.worker = w;
      return w;
    } catch {
      this.broken = true;
      return null;
    }
  }

  private fail() {
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    const err = new Error("WORKER_FAILED");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private post<T>(msg: Req, w: Worker, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      w.postMessage({ ...msg, id }, transfer);
    });
  }

  /**
   * Hand over the full-resolution pixels and detect the card. `getPixels` is called again on the main-thread
   * fallback because a transferred buffer cannot be reused.
   */
  async load(face: Face, getPixels: () => RGBAImage): Promise<DetectOut> {
    const w = this.ensureWorker();
    if (w) {
      try {
        const img = getPixels();
        return await this.post<DetectOut>({ type: "load", face, image: img }, w, [img.data.buffer]);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== "WORKER_FAILED") throw e;
      }
    }
    await nextFrame(); // let the "working" state paint before blocking the main thread
    const core = await import("./core");
    return core.loadAndDetect(face, getPixels());
  }

  async measure(face: Face, quad: Quad): Promise<MeasureOut> {
    const w = this.ensureWorker();
    if (w) {
      try {
        return await this.post<MeasureOut>({ type: "measure", face, quad }, w);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== "WORKER_FAILED") throw e;
        throw new Error("The measuring worker stopped. Please choose the photo again.");
      }
    }
    await nextFrame();
    const core = await import("./core");
    return core.measureFace(face, quad);
  }

  release(face: Face) {
    if (this.worker && !this.broken) void this.post({ type: "release", face }, this.worker).catch(() => {});
    else void import("./core").then((c) => c.release(face));
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
