/**
 * GLSL for the potential surface and its reference floor.
 *
 * Written in GLSL ES 1.0 style on purpose. three.js compiles every
 * `ShaderMaterial` as `#version 300 es` and injects compatibility defines
 * (`varying` -> in/out, `texture2D` -> texture, `gl_FragColor` -> pc_fragColor),
 * so this source gets ES 3.00 capabilities — core `fwidth`, dynamic loop bounds —
 * while staying readable. Do not set `glslVersion`; that would strip the defines.
 *
 * The field maths mirrors `field.ts`. Change one, change the other.
 */

import { MAX_CHARGES } from './field'

/**
 * Analytic anti-aliased grid lines. Screen-space derivatives keep the stroke a
 * constant pixel width no matter how the camera is angled, which is why the
 * grid needs no geometry of its own.
 */
const GRID_HELPER = /* glsl */ `
float gridMask(vec2 coordinate, float spacing, float thickness) {
  vec2 scaled = coordinate / spacing;
  vec2 distanceToLine = abs(fract(scaled - 0.5) - 0.5) / fwidth(scaled);
  return 1.0 - smoothstep(0.0, thickness, min(distanceToLine.x, distanceToLine.y));
}
`

export const SURFACE_VERTEX_SHADER = /* glsl */ `
#define MAX_CHARGES ${MAX_CHARGES}

uniform vec3 uCharges[MAX_CHARGES];
uniform int uChargeCount;
uniform int uMode;
uniform float uHeightScale;
uniform float uAmplitude;
uniform float uSoftening;

varying float vValue;
varying vec3 vNormal;
varying vec2 vPlane;

float rawField(vec2 point) {
  if (uMode == 0) {
    float potential = 0.0;
    for (int i = 0; i < MAX_CHARGES; i++) {
      if (i >= uChargeCount) break;
      vec3 charge = uCharges[i];
      vec2 offset = point - charge.xy;
      potential += charge.z * inversesqrt(dot(offset, offset) + uSoftening);
    }
    return potential;
  }

  vec2 field = vec2(0.0);
  for (int i = 0; i < MAX_CHARGES; i++) {
    if (i >= uChargeCount) break;
    vec3 charge = uCharges[i];
    vec2 offset = point - charge.xy;
    float squared = dot(offset, offset) + uSoftening;
    field += charge.z * offset * inversesqrt(squared * squared * squared);
  }
  return length(field);
}

// tanh spelled out: clamping first keeps exp() from overflowing, and the curve
// turns a charge's infinite spike into a finite, smoothly rounded peak.
float softSaturate(float value) {
  float x = clamp(value, -8.0, 8.0);
  float e = exp(2.0 * x);
  return (e - 1.0) / (e + 1.0);
}

float normalizedAt(vec2 point) {
  return softSaturate(rawField(point) * uHeightScale);
}

void main() {
  vec2 plane = position.xy;
  float value = normalizedAt(plane);
  float height = value * uAmplitude;

  // Finite differences rather than an analytic gradient: one code path then
  // covers both the potential and the field-magnitude branch.
  float delta = 0.05;
  float alongX = normalizedAt(plane + vec2(delta, 0.0)) * uAmplitude;
  float alongY = normalizedAt(plane + vec2(0.0, delta)) * uAmplitude;
  vNormal = normalize(cross(
    vec3(delta, 0.0, alongX - height),
    vec3(0.0, delta, alongY - height)
  ));

  vValue = value;
  vPlane = plane;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(plane, height, 1.0);
}
`

export const SURFACE_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uRamp;
uniform float uRampScale;
uniform float uRampOffset;
uniform vec3 uGridColor;
uniform vec3 uGridStrongColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uFillOpacity;
uniform float uGridOpacity;
uniform float uExtent;

varying float vValue;
varying vec3 vNormal;
varying vec2 vPlane;
${GRID_HELPER}
void main() {
  float t = clamp(vValue * uRampScale + uRampOffset, 0.0, 1.0);
  vec3 base = texture2D(uRamp, vec2(t, 0.5)).rgb;

  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;

  // Half-Lambert key plus a sky term, both folded into the headroom left by the
  // ambient level so neither theme ever blows out past white.
  float key = dot(normal, normalize(uLightDirection)) * 0.5 + 0.5;
  float sky = normal.z * 0.5 + 0.5;
  float lightAmount = uAmbient + (1.0 - uAmbient) * (0.76 * key + 0.24 * sky);
  vec3 shaded = base * lightAmount;

  float fine = gridMask(vPlane, 0.5, 1.15);
  float coarse = gridMask(vPlane, 2.5, 1.5);
  float lines = clamp(max(fine * 0.5, coarse), 0.0, 1.0) * uGridOpacity;
  vec3 lineColor = mix(uGridColor, uGridStrongColor, coarse);

  vec3 color = mix(shaded, lineColor, lines);
  float alpha = max(uFillOpacity, lines);

  // Soften the border so the sheet reads as floating instead of guillotined.
  vec2 rim = abs(vPlane) / uExtent;
  alpha *= 1.0 - smoothstep(0.88, 1.0, max(rim.x, rim.y));

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`

export const FLOOR_VERTEX_SHADER = /* glsl */ `
varying vec2 vPlane;
varying float vDepth;

void main() {
  vPlane = position.xy;
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`

export const FLOOR_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uGridColor;
uniform vec3 uGridStrongColor;
uniform vec3 uAxisXColor;
uniform vec3 uAxisYColor;
uniform float uOpacity;
uniform float uExtent;
uniform float uFadeNear;
uniform float uFadeFar;

varying vec2 vPlane;
varying float vDepth;
${GRID_HELPER}
void main() {
  float fine = gridMask(vPlane, 0.5, 1.0);
  float coarse = gridMask(vPlane, 2.5, 1.35);

  vec3 color = mix(uGridColor, uGridStrongColor, coarse);
  float mask = max(fine * 0.4, coarse * 0.88);

  // The two axes through the origin, one pixel-width wide at any zoom.
  vec2 axisDistance = abs(vPlane) / fwidth(vPlane);
  float axisAlongX = 1.0 - smoothstep(0.0, 1.7, axisDistance.y);
  float axisAlongY = 1.0 - smoothstep(0.0, 1.7, axisDistance.x);
  color = mix(color, uAxisXColor, axisAlongX);
  color = mix(color, uAxisYColor, axisAlongY);
  mask = max(mask, max(axisAlongX, axisAlongY) * 0.95);

  vec2 rim = abs(vPlane) / uExtent;
  float edge = 1.0 - smoothstep(0.82, 1.0, max(rim.x, rim.y));
  float haze = 1.0 - smoothstep(uFadeNear, uFadeFar, vDepth) * 0.6;

  float alpha = mask * uOpacity * edge * haze;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`
