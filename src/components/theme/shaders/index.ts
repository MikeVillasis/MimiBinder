import type { ShaderDef } from "./types";
import { palkia } from "./palkia";
import { giratina } from "./giratina";

export type { ShaderDef };

/** Theme id -> shader background. Only themes with `shader: true` in the theme registry are looked up. */
export const SHADERS: Record<string, ShaderDef | undefined> = {
  palkia,
  giratina,
};
