// Surface finish presets (glossy / fine matte / coarse matte) and continuous PBR material parameters.

export const SURFACE_FINISH_PRESETS = Object.freeze([
  { id: 'glossy', label: '亮面', roughness: 8, maxRoughness: 24, hint: '高光锐利 · 光滑高透' },
  { id: 'fine_matte', label: '细磨砂', roughness: 42, maxRoughness: 58, hint: '细腻微粒 · 柔和漫反射' },
  { id: 'coarse_matte', label: '粗磨砂', roughness: 74, maxRoughness: 100, hint: '雾面粗粒 · 哑光质感' },
]);

const PRESET_MAP = new Map(SURFACE_FINISH_PRESETS.map(p => [p.id, p]));

export function clampRoughnessPercent(value, fallback = 42) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

export function getSurfaceFinishPreset(id) {
  return PRESET_MAP.get(id) || SURFACE_FINISH_PRESETS[1];
}

export function finishFromRoughness(roughness) {
  const r = clampRoughnessPercent(roughness);
  if (r <= 24) return 'glossy';
  if (r <= 58) return 'fine_matte';
  return 'coarse_matte';
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Compute physically balanced PBR + micro-grain shader parameters for both solid and translucent PP.
// Anchored cleanly at glossy (8%), fine_matte (42%), and coarse_matte (74%) while varying smoothly with slider.
export function computeSurfaceMaterialParams({ category = 'solid', roughness = 42, transmission = 58 } = {}) {
  const translucent = category === 'transparent';
  const rPct = clampRoughnessPercent(roughness);
  const rNorm = rPct / 100;
  const finish = finishFromRoughness(rPct);

  // Smooth blend factors across 3 perceptual zones: glossy -> fine matte -> coarse matte.
  const matteBlend = smoothstep(0.12, 0.44, rNorm);
  const coarseBlend = smoothstep(0.44, 0.82, rNorm);

  // Material roughness: glossy stays crisp low roughness; matte rises cleanly without turning dead grey.
  const materialRoughness = translucent
    ? lerp(lerp(0.06, 0.42, matteBlend), 0.74, coarseBlend)
    : lerp(lerp(0.05, 0.44, matteBlend), 0.78, coarseBlend);

  // Clearcoat gives bright plastic specular highlights in glossy mode and fades softly for matte finishes.
  const clearcoat = lerp(lerp(translucent ? 0.90 : 0.95, 0.22, matteBlend), 0.04, coarseBlend);
  const clearcoatRoughness = lerp(lerp(0.06, 0.40, matteBlend), 0.76, coarseBlend);

  // Specular & environment intensity keep matte surfaces vibrant rather than flat/ashy.
  const specularIntensity = translucent
    ? lerp(lerp(0.95, 0.60, matteBlend), 0.44, coarseBlend)
    : lerp(lerp(0.92, 0.50, matteBlend), 0.36, coarseBlend);

  const envMapIntensity = lerp(lerp(1.24, 1.12, matteBlend), 1.18, coarseBlend);

  // Soft velvet sheen lifts diffuse grazing light on frosted / coarse matte plastics so colors stay lively.
  const sheen = lerp(lerp(0.0, 0.20, matteBlend), 0.34, coarseBlend);
  const sheenRoughness = lerp(0.55, 0.85, coarseBlend);

  // UV-free 3D micro-grain normal perturbation (zero in glossy, fine stipple in fine_matte, tactile pebble in coarse_matte).
  const grainStrength = lerp(lerp(0.0, translucent ? 0.085 : 0.095, matteBlend), translucent ? 0.175 : 0.195, coarseBlend);
  const grainFreq = lerp(175.0, 74.0, coarseBlend);

  // Subtle translucent matte scatter lift (frosted surfaces scatter more ambient light internally than clear glossy PP).
  const matteScatterLift = translucent ? lerp(lerp(0.0, 0.08, matteBlend), 0.16, coarseBlend) : 0.0;

  // Optical density for translucent PP (Beer-Lambert attenuation).
  const tNorm = Math.min(1, Math.max(0, Number(transmission) / 100));
  const baseDensity = 0.24 + 3.25 * Math.pow(1 - tNorm, 2.25);
  // Frosted surfaces scatter slightly more light than crystal-glossy at the same transmission slider.
  const opticalDensity = baseDensity * lerp(0.88, 1.14, matteBlend * 0.65 + coarseBlend * 0.35);

  return {
    finish,
    translucent,
    materialRoughness,
    clearcoat,
    clearcoatRoughness,
    specularIntensity,
    envMapIntensity,
    sheen,
    sheenRoughness,
    grainStrength,
    grainFreq,
    matteScatterLift,
    opticalDensity,
  };
}
