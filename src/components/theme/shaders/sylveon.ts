import type { ShaderDef } from "./types";

/**
 * "Ribbon Prism" background: an original abstract pattern inspired by the palette and motifs of Sylveon ex
 * (Prismatic Evolutions 156/131, art by Cona Nitanda). It does not depict the card: just a soft pink
 * harlequin lattice with polka dots, slowly flowing satin ribbon bands in pink and ice-blue, a few faceted
 * gems bobbing in place and catching prismatic light, sparse twinkling sparkles, tiny hearts and flowers,
 * and a faint rainbow holo glow around the edges.
 *
 * All motion uses integer multiples of 2*PI/360 s, so it loops seamlessly every 6 minutes. Nothing
 * translates across cells: gems and motifs sit in their own cell (they never overhang it), and the lattice
 * is static. Everything stays light and low-contrast (darkest pixels around #ecc3d1) so text stays readable.
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

const vec3 CREAM  = vec3(0.996, 0.957, 0.965); // #fef4f6
const vec3 BLUSH  = vec3(0.973, 0.894, 0.922); // #f8e4eb
const vec3 PETAL  = vec3(0.957, 0.847, 0.882); // #f4d8e1
const vec3 ROSE   = vec3(0.933, 0.651, 0.745); // #eea6be
const vec3 BERRY  = vec3(0.882, 0.478, 0.620); // #e17a9e
const vec3 ICE    = vec3(0.741, 0.886, 0.945); // #bde2f1
const vec3 CYAN   = vec3(0.502, 0.769, 0.886); // #80c4e2
const vec3 LEMON  = vec3(0.976, 0.902, 0.600); // #f9e699
const vec3 SILVER = vec3(0.835, 0.843, 0.882); // #d5d7e1

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

vec3 rainbow(float h) {
  return 0.55 + 0.45 * cos(TAU * (h + vec3(0.0, 0.33, 0.67)));
}

// Heart SDF (unit heart spanning roughly y -0.5..0.6, x -0.6..0.6), after Inigo Quilez.
float sdHeart(vec2 p) {
  p.y += 0.5;
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - 0.35355;
  vec2 a = p - vec2(0.0, 1.0);
  vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}

// A satin ribbon: a band around a wavy centreline in a rotated frame, its width folding as it twists.
// Returns (coverage, across-band coordinate -1..1, fold shade 0..1).
vec3 ribbon(vec2 p, float ang, float off, float amp, float freq, float ph, float wid, float t, float n) {
  vec2 u = vec2(cos(ang), sin(ang));
  vec2 v = vec2(-u.y, u.x);
  float x = dot(p, u);
  float y = dot(p, v) - off;
  float arg = freq * x + n * W * t + ph;
  float c = amp * sin(arg) + 0.35 * amp * sin(2.0 * freq * x - 2.0 * n * W * t + ph * 1.7);
  float slope = amp * freq * cos(arg);
  float twist = cos(0.8 * freq * x - n * W * t + ph * 0.6);
  float w = wid * (0.18 + 0.82 * abs(twist));
  float d = (y - c) / sqrt(1.0 + slope * slope);
  float s = d / w;
  float cov = 1.0 - smoothstep(0.86, 1.0, abs(s));
  return vec3(cov, s, abs(twist));
}

void paintRibbon(inout vec3 col, vec3 r, vec3 base, vec3 deep, float amt) {
  if (r.x <= 0.0) return;
  float s = r.y;
  vec3 c = mix(base, deep, 0.35 * smoothstep(0.2, 1.0, abs(s)) + 0.25 * (1.0 - r.z));
  c = mix(c, CREAM, 0.55 * exp(-pow((s + 0.35) * 3.2, 2.0)) * r.z); // satin sheen along one side
  col = mix(col, c, r.x * amt);
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

  // Soft blush ground with a slowly wandering cream glow.
  float lowf = vnoise(p * 1.4 + 0.5 * orbit + 3.0);
  vec3 col = mix(BLUSH, CREAM, 0.35 * lowf);
  vec2 gc = vec2(0.25 * cos(t * W) * ax, 0.30 * ay + 0.08 * sin(2.0 * t * W));
  col = mix(col, CREAM, 0.45 * exp(-dot(p - gc, p - gc) * 2.2));

  // Harlequin lattice: diamonds (a 45-degree checker), alternating two close pinks, with fine light seams.
  float ds = 46.0;
  vec2 lq = vec2(q.x + q.y, q.x - q.y) / (ds * 1.41421);
  vec2 li = floor(lq);
  vec2 lf = fract(lq);
  float checker = mod(li.x + li.y, 2.0);
  col = mix(col, PETAL, checker * 0.30 * k);
  float seam = min(min(lf.x, 1.0 - lf.x), min(lf.y, 1.0 - lf.y)) * ds; // px to the nearest seam
  col = mix(col, CREAM, (1.0 - smoothstep(0.0, 1.2, seam)) * 0.45 * k);
  // Polka dots: faint white at the lattice crossings, small ice-blue ones in the darker diamonds.
  vec2 dc = (fract(lq + 0.5) - 0.5) * ds;
  col = mix(col, vec3(1.0), (1.0 - smoothstep(2.6, 4.0, length(dc))) * 0.55 * k);
  vec2 cc = (lf - 0.5) * ds;
  col = mix(col, ICE, checker * (1.0 - smoothstep(1.6, 2.6, length(cc))) * 0.45 * k);

  // Flowing ribbons: two pink, one ice-blue, drifting along their length.
  vec3 r1 = ribbon(p, 0.32, 0.18 * ay, 0.16, 2.3, 0.0, 0.048, t, 2.0);
  vec3 r2 = ribbon(p, -0.42, -0.30 * ay, 0.13, 2.8, 2.1, 0.045, t, -3.0);
  vec3 r3 = ribbon(p, 1.25, 0.55 * ax, 0.10, 3.2, 4.0, 0.034, t, 1.0);
  paintRibbon(col, r2, ICE, CYAN, 0.36 * k);
  paintRibbon(col, r1, ROSE, BERRY, 0.30 * k);
  paintRibbon(col, r3, ROSE, BERRY, 0.22 * k);

  // Faceted gems: sparse, each bobbing in its own cell (never overhanging it), catching prismatic light.
  float cell = 170.0;
  vec2 gq = q / cell;
  vec2 gi = floor(gq);
  float gh = hash(gi + 11.0);
  float gon = step(0.70, gh) * smoothstep(0.35, 0.55, vnoise(gi * 0.5 + 7.0) + 0.25 * gh);
  if (gon > 0.01) {
    float n1 = 1.0 + floor(hash(gi + 12.0) * 3.0);
    vec2 centre = (gi + 0.32 + 0.36 * vec2(hash(gi + 13.0), hash(gi + 14.0))) * cell
                + vec2(10.0 * sin(n1 * W * t + gh * TAU), 14.0 * cos(n1 * W * t + gh * 9.0));
    vec2 d = q - centre;
    float rad = 13.0 + 9.0 * hash(gi + 15.0);
    float spin = TAU * hash(gi + 16.0) + 0.25 * sin(W * t + gh * 5.0);
    float ang = atan(d.y, d.x) - spin;
    float sector = floor(ang / (TAU / 8.0) + 8.0);
    float sa = (sector + 0.5) * (TAU / 8.0);
    float ca = mod(ang, TAU / 8.0) - TAU / 16.0;          // angle from the sector's centre
    float rr = length(d) * cos(ca) / cos(TAU / 16.0);   // octagon radius (1 at the outline after /rad)
    float r = rr / rad;
    if (r < 1.08) {
      float tsel = hash(gi + 17.0);
      vec3 base = tsel < 0.3 ? LEMON : tsel < 0.6 ? ICE : tsel < 0.8 ? SILVER : CREAM;
      float lit = 0.5 + 0.5 * cos(sa + spin - 2.3);      // light from the upper left
      float table = 1.0 - smoothstep(0.50, 0.54, r);
      vec3 fill = mix(base * 0.86, mix(base, vec3(1.0), 0.6), lit);
      fill = mix(fill, mix(base, vec3(1.0), 0.45), table);
      vec3 prism = rainbow(sector / 8.0 + 2.0 * t / 360.0 + gh);
      fill = mix(fill, prism, (0.10 + 0.14 * table) * (0.5 + 0.5 * sin(2.0 * W * t + sector)));
      float inside = 1.0 - smoothstep(0.96, 1.02, r);
      float edge = (1.0 - smoothstep(0.0, 1.2, abs(r - 1.0) * rad)) + (1.0 - smoothstep(0.0, 1.0, abs(r - 0.52) * rad)) * 0.7
                 + (1.0 - smoothstep(0.0, 0.9, (TAU / 16.0 - abs(ca)) * length(d))) * step(0.52, r) * step(r, 1.0) * 0.6;
      col = mix(col, fill, inside * 0.60 * gon * k);
      col = mix(col, vec3(1.0), clamp(edge, 0.0, 1.0) * 0.55 * gon * k);
      // A soft glint that sweeps over the gem twice per loop.
      float glint = exp(-pow(dot(d / rad, vec2(0.7, 0.7)) - 1.6 * sin(2.0 * W * t + gh * TAU), 2.0) * 10.0);
      col = mix(col, vec3(1.0), inside * glint * 0.35 * gon * k);
    }
  }

  // Tiny motifs: sparkles, hearts and flowers, kept sparse, twinkling in place.
  float mc = 64.0;
  vec2 mq = q / mc;
  vec2 mi = floor(mq);
  float mh = hash(mi + 41.0);
  if (mh > 0.84) {
    vec2 md = (fract(mq) - 0.5 - (vec2(hash(mi + 42.0), hash(mi + 43.0)) - 0.5) * 0.4) * mc;
    float kind = hash(mi + 44.0);
    float tw = 0.55 + 0.45 * sin(W * t * (2.0 + floor(hash(mi + 45.0) * 4.0)) + mh * 40.0);
    if (kind < 0.42) {
      // Four-point sparkle.
      float star = (1.0 - smoothstep(12.0, 18.0, length(md))) * (exp(-length(md) * 0.55) + 0.7 * exp(-abs(md.x) * 1.1 - abs(md.y) * 0.22) + 0.7 * exp(-abs(md.y) * 1.1 - abs(md.x) * 0.22));
      vec3 sc = mix(hash(mi + 46.0) < 0.5 ? CYAN : BERRY, LEMON, 0.25 + 0.25 * sin(W * t + mh * TAU));
      col = mix(col, sc, clamp(star, 0.0, 1.0) * tw * 0.50 * k);
      col = mix(col, vec3(1.0), exp(-length(md) * 0.9) * tw * 0.8 * k);
    } else if (kind < 0.70) {
      // Heart.
      float s = 7.0 + 3.0 * hash(mi + 47.0);
      float h = sdHeart(md / s) * s;
      vec3 hc = hash(mi + 48.0) < 0.6 ? BERRY : CYAN;
      col = mix(col, mix(hc, CREAM, 0.25), (1.0 - smoothstep(-0.5, 0.7, h)) * (0.30 + 0.25 * tw) * k);
    } else {
      // Five-petal flower with a pale centre.
      float s = 7.0 + 3.0 * hash(mi + 49.0);
      float a = atan(md.y, md.x) + 0.15 * sin(W * t + mh * TAU);
      float r = length(md) / s;
      float petal = 0.55 + 0.45 * abs(cos(2.5 * a));
      float f = 1.0 - smoothstep(petal - 0.08, petal + 0.06, r);
      vec3 fl = hash(mi + 50.0) < 0.55 ? ROSE : ICE;
      col = mix(col, fl, f * (0.40 + 0.15 * tw) * k);
      col = mix(col, CREAM, (1.0 - smoothstep(0.18, 0.26, r)) * 0.8 * k);
    }
  }

  // Rainbow holo frame: a faint iridescent glow at the screen edges.
  vec2 e = abs(p / vec2(ax, ay));
  float edgeD = max(e.x, e.y);
  float frame = smoothstep(0.82, 1.0, edgeD);
  vec3 holo = mix(rainbow((q.x + q.y) / 900.0 + t / 360.0), CREAM, 0.45);
  col = mix(col, holo, frame * 0.15 * k);

  // Static grain.
  col += (hash(floor(q)) - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const sylveon: ShaderDef = {
  fragment,
  uniforms: { u_intensity: 0.85 },
  maxDpr: 1.5,
  maxPixels: 2_200_000,
  fps: 30,
  staticTime: 52,
  loopSeconds: 360,
};
