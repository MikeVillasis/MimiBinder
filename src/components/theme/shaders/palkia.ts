import type { ShaderDef } from "./types";

/**
 * "Spatial Rift" background: an original abstract pen-and-ink scene inspired by the palette and
 * drawing technique of Origin Forme Palkia V (Astral Radiance 167/189, art by Oswaldo KATO).
 * It does not depict the card: just parchment, floating cross-hatched pillars at odd angles,
 * a faint diamond-checker plane, cloud wisps and a warm orchid glow.
 *
 * All motion uses integer multiples of 2*PI/360 s, so it loops seamlessly every 6 minutes and the
 * fastest component takes 60 s for one cycle.
 */
const fragment = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;      // canvas size in device px
uniform float u_time;    // seconds, wrapped to 360
uniform float u_px;      // device px per CSS px
uniform float u_intensity; // 0..1 overall strength of the drawing

const vec3 PARCH  = vec3(0.965, 0.937, 0.902); // #f6efe6
const vec3 STONE  = vec3(0.882, 0.831, 0.792); // #e1d4ca
const vec3 GREIGE = vec3(0.796, 0.749, 0.718); // #cbbfb7
const vec3 PEWTER = vec3(0.682, 0.690, 0.698); // #aeb0b2
const vec3 ROSE   = vec3(0.706, 0.616, 0.584); // #b49d95
const vec3 TAUPE  = vec3(0.584, 0.545, 0.522); // #958b85
const vec3 INK    = vec3(0.290, 0.318, 0.333); // #4a5155
const vec3 ORCHID = vec3(0.608, 0.290, 0.525); // #9b4a86
const vec3 NAVY   = vec3(0.184, 0.290, 0.408); // #2f4a68
const vec3 SKY    = vec3(0.800, 0.870, 0.925);
const vec3 PEACH  = vec3(0.992, 0.870, 0.780);
const vec3 CLOUD  = vec3(0.995, 0.990, 0.975);

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

// Pen line coverage for parallel lines spacing CSS px apart at coordinate c (CSS px).
// Darker tone k (0..1) -> thicker lines, which is how tonal hatching reads.
float hatch(float c, float spacing, float k) {
  float d = abs(fract(c / spacing) - 0.5) * spacing;
  float w = k * spacing * 0.36;
  return (1.0 - smoothstep(w - 0.55, w + 0.55, d)) * smoothstep(0.08, 0.22, k);
}

// One floating pillar: a cut cylinder seen from the side, its near end showing an elliptical
// face with growth rings, drawn with pen hatching that follows the form.
// c: centre, ang: axis angle, len: half length, rad: radius (all in height-normalised units).
void pillar(inout vec3 col, vec2 p, float cssPerUnit, vec2 c, float ang, float len, float rad, float amt) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 d = p - c;
  float along = dot(d, dir);
  float across = dot(d, nrm);
  float px = 1.0 / cssPerUnit; // one CSS px in p units
  const float FORE = 0.42;     // end-face foreshortening

  // Soft cast shadow, offset down-right.
  vec2 ds = d - vec2(0.020, -0.030);
  float sd = length(ds - dir * clamp(dot(ds, dir), -len, len)) - rad;
  col = mix(col, ROSE, (1.0 - smoothstep(-0.02, 0.06, sd)) * 0.12 * amt);

  // Body = band |across|<rad, |along|<len, plus an ellipse at each end.
  float band = max(abs(across) - rad, abs(along) - len);
  vec2 eFar = vec2(across / rad, (along + len) / (rad * FORE));
  vec2 eNear = vec2(across / rad, (along - len) / (rad * FORE));
  float dFar = (length(eFar) - 1.0) * rad * FORE;
  float dNear = (length(eNear) - 1.0) * rad * FORE;
  float dist = min(min(band, dFar), dNear);
  float inside = 1.0 - smoothstep(-px, px, dist);
  if (dist > 2.0 * px) return;

  vec3 L = normalize(vec3(-0.55, 0.65, 0.55));
  float s = clamp(across / rad, -0.999, 0.999);
  float face = 1.0 - smoothstep(-px, px, dNear);

  // Cylinder side.
  vec3 n = vec3(nrm * s, sqrt(1.0 - s * s));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float tone = clamp(1.05 - diff * 1.15, 0.0, 1.0);
  vec3 fill = mix(mix(TAUPE, ROSE, 0.5), PARCH, smoothstep(0.0, 0.9, diff));
  fill = mix(fill, PEACH, 0.55 * smoothstep(0.5, 1.0, diff));
  float wob = (vnoise(vec2(along * 26.0, 3.1 * ang)) - 0.5) * 1.4;
  float c1 = asin(s) * rad * cssPerUnit * 0.95 + wob;     // lines along the axis, bunching at the rim
  float c2 = (along * 0.55 + across * 0.83) * cssPerUnit; // cross-hatch only in the shadows
  float ink = hatch(c1, 5.0, tone);
  ink = max(ink, hatch(c2, 5.5, smoothstep(0.5, 1.0, tone) * 0.85));

  // End face: flat and lit, one faint inset ring, hatched on its shadow side.
  float r = length(eNear);
  float rpx = rad * cssPerUnit;
  float ring = 0.45 * (1.0 - smoothstep(0.4, 1.2, abs(r - 0.55) * rpx));
  ring = max(ring, hatch((across * 0.8 - along * 0.6) * cssPerUnit, 5.0, 0.35 * smoothstep(0.3, 1.0, r) * step(0.0, across)));
  vec3 faceCol = mix(PARCH, STONE, 0.35 * r);
  fill = mix(fill, faceCol, face);
  ink = mix(ink, ring, face);

  // Contour lines: silhouette and the rim of the end face.
  float edge = 1.0 - smoothstep(0.5 * px, 1.5 * px, abs(dist));
  float rim = (1.0 - smoothstep(0.5 * px, 1.5 * px, abs(dNear))) * step(dist, px);

  col = mix(col, fill, inside * 0.85 * amt);
  col = mix(col, INK, max(inside * ink * 0.36, max(edge, rim) * 0.42) * amt);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5 * u_res) / u_res.y;          // y up, height-normalised
  float a = 0.5 * u_res.x / u_res.y;              // half aspect
  float cssPerUnit = u_res.y / u_px;               // CSS px per p unit
  // Pillars live in min-dimension units so a portrait phone gets the same sizes, spread over its height.
  float m = min(u_res.x, u_res.y);
  vec2 pm = (fc - 0.5 * u_res) / m;
  float ax = 0.5 * u_res.x / m;                    // half extents in pillar units
  float ay = u_res.y / m;                          // 2 * half height: maps the 0.5-tall layout onto the screen
  float cpm = m / u_px;                            // CSS px per pillar unit
  vec2 q = fc / u_px;                              // CSS px
  float t = u_time;
  float k = u_intensity;

  // Paper: parchment with large soft blotches of warm stone and dusty rose.
  float blot = fbm(p * 1.4 + 3.0);
  vec3 col = mix(PARCH, STONE, smoothstep(0.35, 0.8, blot) * 0.6);
  col = mix(col, ROSE, smoothstep(0.55, 0.9, blot) * 0.10);

  // Distant architecture, suggested only by patches of faint diagonal hatching.
  float zone = smoothstep(0.52, 0.66, fbm(p * vec2(2.2, 3.0) + vec2(11.0, 0.15 * sin(t * W))));
  float bgInk = max(hatch(q.x * 0.71 + q.y * 0.71, 6.0, 0.35), hatch(q.x * 0.71 - q.y * 0.71, 7.0, 0.30) * step(0.6, zone));
  col = mix(col, INK, bgInk * zone * 0.10 * k);

  // Warm light from the centre, breathing very slowly; an orchid halo around it.
  vec2 gc = vec2(0.05 * sin(t * W * 2.0), 0.08 + 0.03 * cos(t * W * 3.0));
  float gr = length((p - gc) * vec2(0.75, 1.0));
  float breathe = 1.0 + 0.12 * sin(t * W * 6.0);
  col = mix(col, ORCHID, exp(-gr * gr * 2.0) * smoothstep(0.05, 0.45, gr) * 0.14 * breathe);
  col = mix(col, PEACH, exp(-gr * gr * 6.0) * 0.45 * breathe);
  col = mix(col, vec3(1.0, 0.975, 0.94), exp(-gr * gr * 22.0) * 0.35);

  // Faint diamond checkerboard plane below a horizon, receding into the paper.
  float hz = -0.10 + 0.015 * sin(t * W * 2.0);
  if (p.y < hz) {
    float dz = 0.30 / (hz - p.y);                  // depth
    vec2 w = vec2(p.x * dz, dz);
    float cr = 0.7854 + 0.06 * sin(t * W);         // ~45 deg, swaying
    w = mat2(cos(cr), sin(cr), -sin(cr), cos(cr)) * w;
    float f = 1.6;
    w += vec2(2.0, 1.0) * (t / 360.0) / f;         // slow glide by whole periods per loop
    float ch = sin(w.x * TAU * f) * sin(w.y * TAU * f);
    float aaw = clamp(TAU * f * dz * dz / 0.30 / u_res.y * 2.5, 0.03, 1.0);
    float sq = smoothstep(-aaw, aaw, ch);
    float fade = smoothstep(hz, hz - 0.30, p.y) * (1.0 - smoothstep(1.4, 4.0, dz));
    fade *= 1.0 - smoothstep(0.6, 1.0, abs(p.x) / (a + 0.2));
    fade *= mix(0.55, 1.0, smoothstep(-0.5, -0.25, p.y)); // softer at the very bottom (nav bar sits there)
    col = mix(col, NAVY, (1.0 - sq) * fade * 0.20 * k);
    col = mix(col, CLOUD, sq * fade * 0.35 * k);
  }

  // Distant, thin beams (atmospheric: faint).
  pillar(col, pm, cpm, vec2(-0.35 * ax + 0.02 * sin(t * W * 2.0), (0.20) * ay), 1.30 + 0.04 * sin(t * W), 0.40, 0.020, 0.40 * k);
  pillar(col, pm, cpm, vec2(0.40 * ax, (0.33 + 0.02 * cos(t * W * 2.0)) * ay), 2.75 + 0.03 * cos(t * W), 0.35, 0.016, 0.35 * k);
  pillar(col, pm, cpm, vec2(0.20 * ax, (-0.28) * ay), 0.30 + 0.03 * sin(t * W * 2.0), 0.30, 0.014, 0.32 * k);

  // Cloud wisps (lit tops, sky-blue undersides). Noise space is sampled along a slow ellipse so the drift loops.
  vec2 cp = vec2(p.x * 2.6, p.y * 5.0) + vec2(1.6 * sin(t * W), 0.3 * cos(t * W));
  float cl = fbm(cp);
  float cband = smoothstep(0.30, 0.05, abs(p.y - 0.10)) + 0.8 * smoothstep(0.14, 0.0, abs(p.y + 0.06 - 0.1 * p.x));
  float cloud = smoothstep(0.57, 0.65, cl) * cband;
  float under = smoothstep(0.54, 0.62, fbm(cp + vec2(0.0, 0.25))) * cband * (1.0 - cloud);
  col = mix(col, SKY, under * 0.22 * k);
  col = mix(col, CLOUD, cloud * 0.75 * k);

  // Near pillars at many diagonal angles, slowly drifting and turning.
  pillar(col, pm, cpm, vec2(-0.80 * ax + 0.03 * sin(t * W * 2.0), (0.22 + 0.025 * cos(t * W * 3.0)) * ay), 2.15 + 0.05 * sin(t * W * 2.0), 0.42, 0.048, 0.85 * k);
  pillar(col, pm, cpm, vec2(0.78 * ax + 0.025 * cos(t * W * 2.0), (-0.18 + 0.03 * sin(t * W)) * ay), 1.10 + 0.05 * cos(t * W), 0.36, 0.060, 0.95 * k);
  pillar(col, pm, cpm, vec2(0.10 * ax + 0.04 * sin(t * W), (0.44) * ay), 0.10 + 0.04 * sin(t * W * 2.0), 0.30, 0.030, 0.75 * k);
  pillar(col, pm, cpm, vec2(-0.40 * ax, (-0.38 + 0.02 * sin(t * W * 3.0)) * ay), 3.65 + 0.05 * cos(t * W * 2.0), 0.26, 0.040, 0.85 * k);
  pillar(col, pm, cpm, vec2(0.95 * ax, (0.40 + 0.02 * cos(t * W)) * ay), 4.30 + 0.04 * sin(t * W * 3.0), 0.28, 0.036, 0.75 * k);

  // Vignette toward warm stone, then paper fibres and static grain (grain never animates: calmer).
  float v = smoothstep(0.45, 1.3, length(p * vec2(0.75 / max(a, 0.5), 1.0)));
  col = mix(col, mix(STONE, ROSE, 0.3), v * 0.45);
  col -= 0.016 * vnoise(q * vec2(0.6, 0.08));
  col += (hash(floor(q)) - 0.5) * 0.026;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const palkia: ShaderDef = {
  fragment,
  uniforms: { u_intensity: 0.7 }, // toned down so muted text over pillars stays readable
  maxDpr: 1.5,
  maxPixels: 2_200_000,
  fps: 30,
  staticTime: 37,
  loopSeconds: 360,
};
