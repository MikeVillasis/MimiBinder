/** A procedural full-screen fragment shader used as a theme background. */
export interface ShaderDef {
  /** GLSL ES 1.00 fragment shader. Receives u_res (device px), u_time (s), u_px (device px per CSS px) + `uniforms`. */
  fragment: string;
  /** Extra float uniforms and their defaults. */
  uniforms: Record<string, number>;
  /** Max device-pixel ratio to render at (lower = cheaper; CSS upscales). */
  maxDpr: number;
  /** Hard cap on rendered pixels (width*height) for very large screens. */
  maxPixels: number;
  /** Frame-rate cap; slow ambient motion looks identical at 30 fps and halves GPU/battery cost. */
  fps: number;
  /** Time (s) used for the single static frame under prefers-reduced-motion. */
  staticTime: number;
  /** u_time wraps at this period (s) so float precision never degrades; the shader loops seamlessly on it. */
  loopSeconds: number;
}
