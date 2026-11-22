import type { ShaderDef } from "./types";

/**
 * "Star Requiem" background: an original abstract painting inspired by the palette and brushwork of
 * Giratina VSTAR (Crown Zenith GG69/GG70, art by Akira Egawa). It does not depict the card: just a
 * dark umber void, marbled gold flow lines rising from below like wood grain, gold-leaf flecks,
 * rare crimson and teal paint dabs, faint drips and clusters of small rings drifting upward.
 *
 * All motion uses integer multiples of 2*PI/360 s (or whole cells per loop), so it loops seamlessly
 * every 6 minutes. The brightest pixels stay near #5a3d20 outside tiny flecks, which keeps text
 * readable over the bare background.
 */
const fragment = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;        // canvas size in device px
uniform float u_time;      // seconds, wrapped to 360
uniform float u_px;        // device px per CSS px
uniform float u_intensity; // 0..1 overall strength of the painting

const vec3 VOID   = vec3(0.071, 0.039, 0.020); // #120a05
const vec3 UMBER  = vec3(0.176, 0.071, 0.024); // #2d1206
const vec3 BARK   = vec3(0.325, 0.180, 0.094); // #532e18
const vec3 SIENNA = vec3(0.416, 0.275, 0.165); // #6a462a
const vec3 OCHRE  = vec3(0.545, 0.384, 0.216); // #8b6237
const vec3 GOLD   = vec3(0.898, 0.710, 0.286); // #e5b549
const vec3 CREAM  = vec3(0.957, 0.945, 0.910); // #f4f1e8
const vec3 CRIMSON= vec3(0.494, 0.161, 0.192); // #7e2931
const vec3 TEAL   = vec3(0.239, 0.592, 0.443); // #3d9771

const float TAU = 6.2831853;
const float W = 0.017453293; // TAU / 360  -> k*W*t has a period of 360/k seconds

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float m = min(u_res.x, u_res.y);
  vec2 p = (fc - 0.5 * u_res) / m;     // y up, min-dimension units (portrait phones keep the same scale)
  float ay = 0.5 * u_res.y / m;        // half height in p units
  vec2 q = fc / u_px;                  // CSS px
  float t = u_time;
  float k = u_intensity;
  vec2 orbit = vec2(cos(t * W), sin(t * W)); // noise is sampled along circles so the drift loops

  // Void: dark umber, a little warmer toward the bottom centre where the flow wells up.
  float rise = smoothstep(ay + 0.1, -ay, p.y);              // 0 at top, 1 at bottom
  float well = exp(-dot(p * vec2(1.3, 0.9) - vec2(0.0, -0.35 * ay), p * vec2(1.3, 0.9) - vec2(0.0, -0.35 * ay)) * 1.8);
  vec3 col = mix(VOID, UMBER, 0.55 + 0.35 * well);

  // Mottled, rock-like masses in the upper corners: soft blotches of bark and crimson.
  float rock = fbm(p * 2.4 + vec2(5.0, 1.0) + 0.15 * orbit);
  float corners = smoothstep(0.2, 0.9, abs(p.x) + 0.4 * (p.y / ay));
  col = mix(col, BARK, smoothstep(0.5, 0.78, rock) * corners * 0.45 * k);
  col = mix(col, CRIMSON, smoothstep(0.66, 0.82, fbm(p * 3.1 - 2.0)) * corners * 0.22 * k);

  // Marbled flow: a field that mostly increases with x (so contours run upward), bent by a
  // domain warp. Its contour lines are the "wood grain" bands, fanning out from below.
  vec2 wp = p * vec2(1.5, 1.1);
  vec2 warp = vec2(fbm(wp + 0.35 * orbit + vec2(1.7, 9.2)), fbm(wp * 1.2 - 0.35 * orbit.yx + vec2(8.3, 2.8)));
  float fan = p.x / (0.55 + 0.6 * smoothstep(-ay, ay, p.y));      // bands spread as they rise
  float field = fan * 2.2 + 1.9 * fbm(wp + 1.6 * warp + vec2(0.0, -0.06 * sin(t * W * 2.0)));
  float bands = field * 7.0;
  float idx = floor(bands);
  float f = abs(fract(bands) - 0.5);                               // 0 on a contour line
  float line = 1.0 - smoothstep(0.03, 0.16, f);                     // soft painted stroke
  float fill = smoothstep(0.5, 0.1, f);                             // broad tone between strokes
  float flowMask = (0.12 + 0.88 * rise) * smoothstep(1.25, 0.25, abs(p.x) - 0.15 * rise);
  float hb = hash(vec2(idx, 3.0));
  vec3 bandCol = hb < 0.35 ? SIENNA : (hb < 0.75 ? OCHRE : GOLD);
  col = mix(col, bandCol, fill * 0.16 * flowMask * k);
  col = mix(col, GOLD, line * (0.12 + 0.14 * step(0.7, hb)) * flowMask * k);
  col = mix(col, VOID, smoothstep(0.42, 0.5, f) * 0.25 * flowMask * k); // dark seams between bands

  // Faint drips running down from the upper half.
  float dc = floor(q.x / 34.0);
  float dh = hash(vec2(dc, 7.0));
  float dx = abs(fract(q.x / 34.0) - 0.3 - 0.4 * dh) * 34.0;
  float dlen = 0.15 + 0.35 * hash(vec2(dc, 11.0));
  float drip = (1.0 - smoothstep(0.4, 1.2, dx)) * step(0.72, dh)
             * smoothstep(ay - dlen * 2.0 * ay, ay - 0.1, p.y) * smoothstep(ay + 0.2, ay - 0.2, p.y);
  col = mix(col, OCHRE, drip * 0.22 * k);

  // Gold-leaf flecks and rare crimson / teal dabs: sparse cells that glint slowly.
  vec2 fcell = floor(q / 22.0);
  vec2 fl = fract(q / 22.0) - 0.5;
  float fh = hash(fcell + 41.0);
  vec2 fo = vec2(hash(fcell + 3.0), hash(fcell + 5.0)) - 0.5;
  vec2 fd = (fl - fo * 0.5) * vec2(1.0, 1.0 + 1.5 * hash(fcell + 9.0)); // slightly elongated dabs
  float fs = 0.06 + 0.08 * hash(fcell + 13.0);
  float dab = 1.0 - smoothstep(fs * 0.6, fs, length(fd));
  float glint = 0.6 + 0.4 * sin(t * W * (1.0 + floor(hash(fcell + 17.0) * 4.0)) + fh * TAU);
  float place = 0.35 + 0.65 * max(corners, flowMask * 0.6);
  if (fh > 0.93) col = mix(col, mix(GOLD, CREAM, 0.25), dab * 0.30 * glint * place * k);
  else if (fh > 0.915) col = mix(col, CRIMSON * 1.4, dab * 0.45 * place * k);
  else if (fh > 0.905) col = mix(col, TEAL, dab * 0.32 * place * k);

  // Clusters of small rings drifting upward (one cell height per 120 s, so 3 cells per loop).
  vec2 rq = q / 54.0 + vec2(0.0, -3.0 * t / 360.0);
  vec2 rcell = floor(rq);
  float rh = hash(rcell + 71.0);
  // Sparse, and only in a slowly meandering band on the sides (the art keeps them to the edges).
  float cx = ((rcell.x + 0.5) * 54.0 * u_px - 0.5 * u_res.x) / m; // cell centre, so rings are never cut
  float side = smoothstep(0.35, 0.8, abs(cx) /max(0.5 * u_res.x / m, 0.5) + 0.3 * (vnoise(rcell * 0.35) - 0.5));
  if (rh > 1.0 - 0.10 * side) {
    vec2 rl = fract(rq) - 0.5;
    float rings = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 c = vec2(hash(rcell + fi * 3.1), hash(rcell + fi * 5.7)) * 0.5 - 0.25;
      float r = 0.05 + 0.06 * hash(rcell + fi * 9.3);
      float d = abs(length(rl - c) - r) * 54.0;            // CSS px from the ring
      rings = max(rings, 1.0 - smoothstep(0.5, 1.4, d));
    }
    col = mix(col, OCHRE, rings * 0.30 * k);
  }

  // Vignette into the void, then canvas texture and static grain (grain never animates: calmer).
  float v = smoothstep(0.7, 1.5, length(p / vec2(0.5 * u_res.x / m, ay))); // 1 at mid-edges, 1.41 at corners
  col = mix(col, VOID, v * 0.55);
  col *= 0.97 + 0.03 * vnoise(q * vec2(0.08, 0.6));
  col += (hash(floor(q)) - 0.5) * 0.018;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const giratina: ShaderDef = {
  fragment,
  uniforms: { u_intensity: 0.8 },
  maxDpr: 1.25, // soft painted strokes: a lower DPR is invisible and saves GPU on phones
  maxPixels: 2_000_000,
  fps: 30,
  staticTime: 52,
  loopSeconds: 360,
};
