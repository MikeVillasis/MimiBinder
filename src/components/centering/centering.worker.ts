/// <reference lib="webworker" />
import { loadAndDetect, measureFace, release } from "./core";
import type { Face, Quad, RGBAImage } from "@/lib/centering";

export type WorkerRequest =
  | { id: number; type: "load"; face: Face; image: RGBAImage }
  | { id: number; type: "measure"; face: Face; quad: Quad }
  | { id: number; type: "release"; face: Face };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === "load") {
      self.postMessage({ id: m.id, ok: true, result: loadAndDetect(m.face, m.image) });
    } else if (m.type === "measure") {
      const out = measureFace(m.face, m.quad);
      // Hand the warped pixels over instead of copying them.
      (self as unknown as Worker).postMessage({ id: m.id, ok: true, result: out }, [out.warp.image.data.buffer, ...out.crops.map((c) => c.image.data.buffer)]);
    } else {
      release(m.face);
      self.postMessage({ id: m.id, ok: true, result: null });
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
