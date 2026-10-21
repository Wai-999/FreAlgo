/**
 * Globe quality tiers and device heuristics. Kept free of geometry dependencies (d3-geo,
 * topojson) because the globe stage needs them on first load, long before the lazy globe chunk.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  dpr: number;
  textureWidth: number;
  antialias: boolean;
  sphereSegments: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: { dpr: 1, textureWidth: 1024, antialias: false, sphereSegments: 32 },
  medium: { dpr: 1.5, textureWidth: 2048, antialias: false, sphereSegments: 48 },
  high: { dpr: 2, textureWidth: 4096, antialias: true, sphereSegments: 64 },
};

export interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  effectiveType?: string;
  coarsePointer?: boolean;
  devicePixelRatio?: number;
  reducedMotion?: boolean;
}

/**
 * Initial quality from device hints (all optional; unknown means "assume modest").
 * Phones are not treated alike: a high-memory phone gets medium, a low-memory one gets low.
 * The runtime frame-time monitor can still downgrade later.
 */
export function chooseQuality(h: DeviceHints): QualityTier {
  if (h.saveData || h.effectiveType === 'slow-2g' || h.effectiveType === '2g') return 'low';
  const mem = h.deviceMemory ?? 4;
  const cores = h.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 2) return 'low';
  if (h.coarsePointer) return mem >= 6 && cores >= 6 ? 'medium' : 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'medium';
}

/** Mobile DPR cap from the spec: min(devicePixelRatio, 1.5) on touch devices. */
export function cappedDpr(
  tier: QualityTier,
  devicePixelRatio: number,
  coarsePointer: boolean,
): number {
  const cap = coarsePointer ? Math.min(1.5, QUALITY[tier].dpr) : QUALITY[tier].dpr;
  return Math.max(1, Math.min(devicePixelRatio, cap));
}
