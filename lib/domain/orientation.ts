/**
 * Source-orientation taxonomy.
 *
 * Design rules (docs/source-policy.md#labels):
 *  - `orientation` is a *directional spectrum* field. Only the five positional values sit on the
 *    line; MIXED, UNRATED and DISPUTED are explicit non-positional states.
 *  - Descriptive ideology words ("liberal", "conservative", ...) are separate tags because their
 *    meaning varies by national context; they are never mapped onto the spectrum.
 *  - Labels describe an outlet's general editorial orientation, not the accuracy or ideology of an
 *    individual article. Article-level labels are separate and null unless explicitly reviewed.
 *  - No colour encodes political direction; UI uses position + text.
 *
 * This module is framework-free so it can be shared by the web app, worker, and tests.
 */

export const ORIENTATIONS = [
  'LEFT',
  'CENTER_LEFT',
  'CENTER',
  'CENTER_RIGHT',
  'RIGHT',
  'MIXED',
  'UNRATED',
  'DISPUTED',
] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const LABEL_STATUSES = ['REVIEWED', 'PROVISIONAL', 'DISPUTED', 'UNRATED'] as const;
export type LabelStatus = (typeof LABEL_STATUSES)[number];

export const POSITIONAL_ORIENTATIONS = [
  'LEFT',
  'CENTER_LEFT',
  'CENTER',
  'CENTER_RIGHT',
  'RIGHT',
] as const satisfies readonly Orientation[];
export type PositionalOrientation = (typeof POSITIONAL_ORIENTATIONS)[number];

interface OrientationInfo {
  label: string;
  /** 0..4 on the spectrum for positional values; null for non-positional states. */
  position: number | null;
  description: string;
}

export const ORIENTATION_INFO: Record<Orientation, OrientationInfo> = {
  LEFT: {
    label: 'Left',
    position: 0,
    description: 'Editorial line consistently toward the left of its national political spectrum.',
  },
  CENTER_LEFT: {
    label: 'Center-Left',
    position: 1,
    description: 'Editorial line leaning left of centre in its national context.',
  },
  CENTER: {
    label: 'Center',
    position: 2,
    description: 'No consistent lean detected by the cited methodology.',
  },
  CENTER_RIGHT: {
    label: 'Center-Right',
    position: 3,
    description: 'Editorial line leaning right of centre in its national context.',
  },
  RIGHT: {
    label: 'Right',
    position: 4,
    description: 'Editorial line consistently toward the right of its national political spectrum.',
  },
  MIXED: {
    label: 'Mixed / Varies',
    position: null,
    description: 'Orientation varies by section, author or period; no single position applies.',
  },
  UNRATED: {
    label: 'Unrated',
    position: null,
    description: 'Not yet reviewed. Absence of a label says nothing about the outlet.',
  },
  DISPUTED: {
    label: 'Disputed',
    position: null,
    description:
      'Credible sources disagree; see methodology and cited sources before relying on it.',
  },
};

export const LABEL_STATUS_INFO: Record<LabelStatus, { label: string; description: string }> = {
  REVIEWED: {
    label: 'Reviewed',
    description: 'Checked by a maintainer against the cited methodology on the review date.',
  },
  PROVISIONAL: {
    label: 'Provisional',
    description: 'Initial classification awaiting full review; treat with caution.',
  },
  DISPUTED: {
    label: 'Disputed',
    description: 'Under appeal or contested by credible sources.',
  },
  UNRATED: { label: 'Unrated', description: 'No classification has been made.' },
};

/** Descriptive ideology tags. Context-dependent; displayed with the outlet's labelContext. */
export const IDEOLOGY_TAGS = [
  'liberal',
  'conservative',
  'progressive',
  'libertarian',
  'social-democratic',
  'nationalist',
  'religious',
  'green',
  'populist',
  'pro-government',
  'opposition-aligned',
] as const;
export type IdeologyTag = (typeof IDEOLOGY_TAGS)[number];

export function isOrientation(value: unknown): value is Orientation {
  return typeof value === 'string' && (ORIENTATIONS as readonly string[]).includes(value);
}

export function isPositional(o: Orientation): o is PositionalOrientation {
  return ORIENTATION_INFO[o].position !== null;
}

export function orientationLabel(o: Orientation): string {
  return ORIENTATION_INFO[o].label;
}

export function formatIdeologyTag(tag: string): string {
  return tag
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join('-');
}

/** Lower-case URL slug <-> enum, e.g. "center-left" <-> CENTER_LEFT. */
export function orientationToSlug(o: Orientation): string {
  return o.toLowerCase().replace(/_/g, '-');
}

export function orientationFromSlug(slug: string): Orientation | null {
  const candidate = slug.trim().toUpperCase().replace(/-/g, '_');
  return isOrientation(candidate) ? candidate : null;
}

export interface SourceLabel {
  orientation: Orientation;
  status: LabelStatus;
  confidence: number | null;
  ideologyTags: readonly string[];
  methodology: string | null;
  sourceUrl: string | null;
  reviewedAt: Date | string | null;
  context: string | null;
  isMachine: boolean;
}

export type LabelIssue =
  | 'confidence-out-of-range'
  | 'reviewed-without-methodology'
  | 'reviewed-without-date'
  | 'rated-without-source'
  | 'unrated-with-position'
  | 'machine-marked-reviewed'
  | 'disputed-status-mismatch';

/**
 * Editorial consistency checks applied by the seed, admin edits and the editorial-quality test.
 * A label that fails any check must not be published as REVIEWED.
 */
export function validateSourceLabel(label: SourceLabel): LabelIssue[] {
  const issues: LabelIssue[] = [];
  if (label.confidence !== null && (label.confidence < 0 || label.confidence > 1)) {
    issues.push('confidence-out-of-range');
  }
  if (label.status === 'REVIEWED' && !label.methodology?.trim()) {
    issues.push('reviewed-without-methodology');
  }
  if (label.status === 'REVIEWED' && !label.reviewedAt) issues.push('reviewed-without-date');
  if (label.orientation !== 'UNRATED' && label.status !== 'UNRATED' && !label.sourceUrl) {
    issues.push('rated-without-source');
  }
  if (label.status === 'UNRATED' && label.orientation !== 'UNRATED') {
    issues.push('unrated-with-position');
  }
  if (label.isMachine && label.status === 'REVIEWED') issues.push('machine-marked-reviewed');
  if (label.orientation === 'DISPUTED' && label.status !== 'DISPUTED') {
    issues.push('disputed-status-mismatch');
  }
  return issues;
}

/** Human-readable confidence; never implies precision the methodology does not have. */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return 'Confidence not stated';
  if (confidence >= 0.8) return `High confidence (${Math.round(confidence * 100)}%)`;
  if (confidence >= 0.5) return `Moderate confidence (${Math.round(confidence * 100)}%)`;
  return `Low confidence (${Math.round(confidence * 100)}%)`;
}
