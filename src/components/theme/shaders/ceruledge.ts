import type { ShaderDef } from "./types";

/**
 * "Raging Amethyst" background: an original abstract painting inspired by the palette and brushwork of
 * Ceruledge ex (Prismatic Evolutions 147/131, art by akagi). It does not depict the card: just an indigo
 * void, swirling violet ink strokes with spatter, sparse clusters of faceted amethyst and ice-blue crystal
 * shards, a few twinkling prismatic sparks and rare orange ghost-flame embers drifting upward.
 *
 * All motion uses integer multiples of 2*PI/360 s, or whole cells per loop, so it loops seamlessly every
 * 6 minutes. Shards stay faint (most pixels at or below ~#3a3052) so text stays readable.
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
uniform float u_intensity; // 0..1 overall strength

const vec3 VOID     = vec3(0.043, 0.031, 0.086); // #0b0816
const vec3 INDIGO   = vec3(0.102, 0.078, 0.188); // #1a1430
const vec3 INK      = vec3(0.290, 0.184, 0.431); // #4a2f6e
const vec3 VIOLET   = vec3(0.416, 0.247, 0.561); // #6a3f8f
const vec3 AMETHYST = vec3(0.604, 0.435, 0.820); // #9a6fd1
const vec3 LAVENDER = vec3(0.773, 0.749, 0.878); // #c5bfe0
const vec3 ICE      = vec3(0.561, 0.827, 0.918); // #8fd3ea
const vec3 PINK     = vec3(0.820, 0.459, 0.655); // #d175a7
const vec3 EMBER    = vec3(0.910, 0.560, 0.310); // ghost flame

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

vec3 rainbow(float h) {
  return 0.55 + 0.45 * cos(TAU * (h + vec3(0.0, 0.33, 0.67)));
}

// One faceted crystal shard in a cell: an elongated rhombus split into four facets that catch the light
// differently, with bright facet edges. d: position in cell (CSS px from the shard centre).
void shard(inout vec3 col, vec2 d, float ang, float len, float wid, float tint, float amt) {
  vec2 u = vec2(cos(ang), sin(ang));
  vec2 v = vec2(-u.y, u.x);
  float a = dot(d, u) / len;
  float b = dot(d, v) / wid;
  float r = abs(a) + abs(b);            // rhombus "radius": 1 at the outline
  if (r > 1.08) return;
  float inside = 1.0 - smoothstep(0.96, 1.02, r);
  // Facet by quadrant; light from the upper left.
  float facet = (a > 0.0 ? 1.0 : 0.0) + (b > 0.0 ? 2.0 : 0.0);
  float lit = 0.35 + 0.65 * fract(sin(facet * 12.9898 + tint * 78.233) * 43758.5453);
  vec3 base = mix(mix(AMETHYST, LAVENDER, tint), ICE, smoothstep(0.55, 1.0, tint));
  vec3 fill = mix(INDIGO, base, 0.35 + 0.45 * lit);
  // Facet edges: the outline (distance in px to the rhombus side) and the two internal ridges.
  float side = (1.0 - r) * len * wid / sqrt(len * len + wid * wid);
  float outline = 1.0 - smoothstep(0.0, 1.4, abs(side));
  float ridge = max(1.0 - smoothstep(0.0, 1.1, abs(dot(d, u))), 1.0 - smoothstep(0.0, 1.1, abs(dot(d, v)))) * step(0.0, side);
  float edge = max(outline, ridge * 0.6);
  col = mix(col, fill, inside * 0.26 * amt);
  col = mix(col, mix(LAVENDER, vec3(1.0), 0.3), edge * 0.30 * amt);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float m = min(u_res.x, u_res.y);
  vec2 p = (fc - 0.5 * u_res) / m;     // y up, min-dimension units
  float ay = 0.5 * u_res.y / m;
  float ax = 0.5 * u_res.x / m;
  vec2 q = fc / u_px;                  // CSS px
  float t = u_time;
  float k = u_intensity;
  vec2 orbit = vec2(cos(t * W), sin(t * W));

  // Void with a faint amethyst glow, breathing slowly.
  vec2 gc = vec2(0.10 * sin(t * W), 0.25 * ay);
  float g = length((p - gc) * vec2(0.8, 1.0));
  vec3 col = mix(VOID, INDIGO, 0.55 * exp(-g * g * 1.6));
  col = mix(col, VIOLET, 0.10 * exp(-g * g * 4.0) * (1.0 + 0.15 * sin(t * W * 4.0)) * k);

  // Swirling ink strokes: iso-bands of a domain-warped field, brushed by stretched noise.
  vec2 wp = p * 1.25;
  vec2 warp = vec2(fbm(wp + 0.4 * orbit + vec2(3.1, 7.7)), fbm(wp * 1.1 - 0.4 * orbit.yx + vec2(9.2, 1.3)));
  float field = fbm(wp + 1.8 * warp);
  float band = abs(fract(field * 4.0 + 0.05 * sin(t * W * 2.0)) - 0.5);
  float brush = 0.6 + 0.4 * vnoise(vec2(dot(q, vec2(0.7, 0.7)) * 0.02, dot(q, vec2(-0.7, 0.7)) * 0.35));
  float stroke = (1.0 - smoothstep(0.06, 0.20, band)) * brush * smoothstep(0.30, 0.62, field);
  col = mix(col, INK, stroke * 0.55 * k);
  col = mix(col, VIOLET, stroke * smoothstep(0.75, 1.0, brush) * 0.25 * k);
  // Spatter: sparse small dots near the strokes.
  vec2 sc = floor(q / 9.0);
  float sh = hash(sc + 3.7);
  vec2 so = (vec2(hash(sc + 1.1), hash(sc + 2.3)) - 0.5) * 6.0;
  float dot1 = 1.0 - smoothstep(0.8, 1.8 + 1.6 * hash(sc + 9.1), length(fract(q / 9.0) * 9.0 - 4.5 - so));
  col = mix(col, VIOLET, dot1 * step(0.86, sh) * smoothstep(0.35, 0.7, field) * 0.35 * k);

  // Crystal shards: sparse clusters, drifting slowly (two cells per loop, so it wraps seamlessly).
  float cell = 110.0;
  vec2 cq = q / cell + vec2(2.0 * t / 360.0, 0.0);
  vec2 ci = floor(cq);
  float cluster = smoothstep(0.52, 0.70, vnoise(cq * 0.45 + 4.0)); // continuous (per-cell values showed seams)
  // The 2x2 cells nearest this pixel, so a shard may overhang its own cell.
  vec2 cbase = ci - step(fract(cq), vec2(0.5));
  for (int j = 0; j < 4; j++) {
    float fj = float(j);
    vec2 cc = cbase + vec2(mod(fj, 2.0), floor(fj / 2.0));
    float on = step(0.45, hash(cc + 21.0)) * smoothstep(0.52, 0.70, vnoise(cc * 0.45 + 4.0));
    if (on < 0.01) continue;
    vec2 centre = (cc + 0.3 + 0.4 * vec2(hash(cc + 5.0), hash(cc + 6.0))) * cell;
    vec2 d = cq * cell - centre;
    float ang = TAU * hash(cc + 8.0) + 0.06 * sin(t * W * (1.0 + floor(hash(cc + 4.0) * 3.0)));
    float len = 26.0 + 30.0 * hash(cc + 9.0);
    float wid = len * (0.22 + 0.18 * hash(cc + 10.0));
    shard(col, d, ang, len, wid, hash(cc + 11.0), on * k);
  }
  col = mix(col, AMETHYST, cluster * 0.03 * k); // faint haze around clusters

  // Prismatic sparks: rare four-point stars, twinkling.
  vec2 kq = q / 70.0;
  vec2 ki = floor(kq);
  float kh = hash(ki + 31.0);
  if (kh > 0.92) {
    vec2 kd = (fract(kq) - 0.5 - (vec2(hash(ki + 32.0), hash(ki + 33.0)) - 0.5) * 0.6) * 70.0;
    float tw = 0.5 + 0.5 * sin(t * W * (2.0 + floor(hash(ki + 34.0) * 4.0)) + kh * TAU);
    float star = exp(-length(kd) * 0.7) + 0.6 * exp(-abs(kd.x) * 1.4 - abs(kd.y) * 0.18) + 0.6 * exp(-abs(kd.y) * 1.4 - abs(kd.x) * 0.18);
    col += rainbow(hash(ki + 35.0) + t / 360.0) * star * tw * 0.18 * k;
  }

  // Ghost-flame embers: very rare, rising one cell every 120 s (three per loop).
  vec2 eq = q / 140.0 + vec2(0.0, -3.0 * t / 360.0);
  vec2 ei = floor(eq);
  if (hash(ei + 51.0) > 0.93) {
    vec2 ed = (fract(eq) - 0.5) * 140.0 + vec2(8.0 * sin(t * W * 3.0 + hash(ei) * TAU), 0.0);
    float e = exp(-dot(ed * vec2(1.0, 0.6), ed * vec2(1.0, 0.6)) * 0.05);
    col = mix(col, mix(EMBER, PINK, 0.3), e * 0.45 * k);
  }

  // Vignette into the void, then static grain.
  float v = smoothstep(0.7, 1.5, length(p / vec2(ax, ay)));
  col = mix(col, VOID, v * 0.6);
  col += (hash(floor(q)) - 0.5) * 0.016;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const ceruledge: ShaderDef = {
  fragment,
  uniforms: { u_intensity: 0.85 },
  maxDpr: 1.5,
  maxPixels: 2_200_000,
  fps: 30,
  staticTime: 64,
  loopSeconds: 360,
};
