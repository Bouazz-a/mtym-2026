import { BRUSHES, KICKS, MOTION, glsl } from "./sandField";

// The GPU half of the sand (see sandField.ts): every grain is one point,
// moved in the vertex shader from its home and the frame's uniforms, so
// the page does no work per grain. main() below and grainAt() in
// sandField.ts are the same motion and must stay in step.

export const VERTEX = `#version 300 es
precision highp float;
in vec2 aHome;
in vec4 aSeed;
in vec2 aStart;
in float aTone;
uniform vec2 uRes;      // the stage, in CSS px
uniform vec2 uCenter;   // the logo's centre on it, in CSS px
uniform float uScale;   // CSS px per logo unit
uniform float uDpr, uSize;
uniform float uTime, uIntro, uDrift;
uniform vec4 uLine;     // a point of the drift line, and its normal toward the side that blows away
uniform vec2 uWind;
uniform vec2 uExtent;
uniform vec4 uKick[${KICKS}];
uniform vec4 uBrush[${BRUSHES}];
out vec4 vColor;

vec2 flow(vec2 q, float t) {
  return 0.5 * vec2(sin(q.y * 2.1 + t) + sin(q.x * 1.3 - t * 0.6 + q.y * 0.7),
                    cos(q.x * 1.9 - t * 0.8) + sin(q.y * 2.7 + t * 0.5 + q.x));
}

void main() {
  vec2 h = aHome;
  float r1 = aSeed.x, r2 = aSeed.y, r3 = aSeed.z, r4 = aSeed.w, t = uTime;

  float breath = 1.0 + ${glsl(MOTION.breath)} * sin(6.28318531 * t / ${glsl(MOTION.breathPeriod)});
  vec2 p = h * breath + flow(h * 1.5, t * 0.25) * ${glsl(MOTION.sway)} + flow(h * 2.0 + r2 * 3.0, t * 0.3 + r1 * 6.0) * ${glsl(MOTION.stir)};

  vec2 n = uLine.zw;
  float along = dot(h - uLine.xy, vec2(-n.y, n.x));
  float ragged = 0.06 * sin(along * 9.0 + t * 0.21) + 0.03 * sin(along * 23.0 - t * 0.13) + (r4 - 0.5) * 0.16;
  float away = smoothstep(0.0, ${glsl(MOTION.driftEdge)}, dot(h - uLine.xy, n) + ragged) * uDrift;
  float alpha = 1.0, gone = 0.0;
  if (away > 0.0) {
    float phase = fract(t / (3.0 + 4.5 * r1) + r2);
    float hold = mix(0.85, 0.08, away);
    gone = max(0.0, (phase - hold) / (1.0 - hold));
    float travel = gone * sqrt(gone);
    float reach = ${glsl(MOTION.windReach)} * away * (0.5 + 0.9 * r3);
    vec2 b = flow(h * 2.5 + vec2(r4 * 7.0, r1 * 5.0), t * 0.3 + phase * 1.5);
    float curl = reach * travel * travel * (r4 - 0.35) * 0.5;
    p += uWind * reach * travel + b * reach * travel * 0.45 + vec2(-uWind.y, uWind.x) * curl;
    float life = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.25, 1.0, gone));
    alpha = mix(1.0, life, smoothstep(0.0, 0.25, away));
  }

  float g = clamp((uIntro - ((h.x * 0.5 + 0.5) * ${glsl(MOTION.introSpread)} + r3 * 0.5)) / ${glsl(MOTION.introDur)}, 0.0, 1.0);
  if (g < 1.0) {
    float e = g * g * g * (g * (g * 6.0 - 15.0) + 10.0);
    vec2 from = aStart * uExtent;
    float bend = (r2 - 0.5) * 0.35 * sin(3.14159265 * e);
    vec2 d = p - from;
    p = from + d * e + vec2(-d.y, d.x) * bend;
    alpha *= 0.35 + 0.65 * e;
  }

  for (int k = 0; k < ${KICKS}; k++) {
    vec4 kick = uKick[k];
    float age = t - kick.z;
    if (kick.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    vec2 d = p - kick.xy + (vec2(r2, r4) - 0.5) * 0.1;
    float len = length(d);
    float rise = 0.3 + 0.3 * r1;
    float throwIt = (age / rise) * exp(1.0 - age / rise) * exp(-dot(d, d) / ${glsl(MOTION.kickRadius2)}) * kick.w * (0.2 + 1.4 * r3 * r3 * r3);
    float turn = (r2 - 0.5) * 1.4 * (1.0 - exp(-age / rise));
    vec2 u = len > 0.0 ? d / len : vec2(0.0);
    p += vec2(u.x * cos(turn) - u.y * sin(turn), u.x * sin(turn) + u.y * cos(turn)) * throwIt
       + flow(h * 4.0 + vec2(r4 * 5.0, r3 * 5.0), t * 0.8) * throwIt * 0.25;
  }

  for (int k = 0; k < ${BRUSHES}; k++) {
    vec2 v = uBrush[k].zw;
    if (v == vec2(0.0)) continue;
    vec2 d = p - uBrush[k].xy;
    vec2 across = d - dot(d, v) / dot(v, v) * v;
    float side = length(across);
    vec2 apart = side > 1e-5 ? across / side : vec2(0.0);
    p += (v + apart * length(v) * (0.4 + 0.8 * r2)) * exp(-dot(d, d) / ${glsl(MOTION.brushRadius2)}) * (0.5 + r1);
  }

  vec2 px = uCenter + vec2(p.x, -p.y) * uScale;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, uSize * (0.7 + 0.8 * r3) * (1.0 - 0.4 * gone) * uDpr);

  // Saffron (--saffron), each grain its own shade, a rare one catching the light
  vec3 col = min(vec3(0.965, 0.659, 0.024) * aTone, vec3(1.0));
  col = mix(col, vec3(1.0, 0.88, 0.52), smoothstep(0.97, 1.0, r4) * 0.8);
  col *= 0.9 + 0.1 * sin(t * (0.5 + 1.5 * r1) + r3 * 6.28318531); // grains catch the light by turns
  float a = alpha * 0.9;
  vColor = vec4(col * a, a);
}`;

// A soft round grain, premultiplied
export const FRAGMENT = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  outColor = vColor * (1.0 - smoothstep(0.35, 1.0, dot(c, c)));
}`;
