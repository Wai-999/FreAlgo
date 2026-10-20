import { describe, expect, it } from 'vitest';
import * as PrismaEnums from '@/generated/prisma/enums';
import {
  LABEL_STATUSES,
  ORIENTATIONS,
  ORIENTATION_INFO,
  POSITIONAL_ORIENTATIONS,
  formatConfidence,
  isOrientation,
  isPositional,
  orientationFromSlug,
  orientationToSlug,
  validateSourceLabel,
  type SourceLabel,
} from '@/lib/domain/orientation';

const base: SourceLabel = {
  orientation: 'CENTER',
  status: 'REVIEWED',
  confidence: 0.7,
  ideologyTags: [],
  methodology: 'Cited methodology',
  sourceUrl: 'https://example.org/method',
  reviewedAt: '2026-01-01',
  context: 'National context',
  isMachine: false,
};

describe('orientation taxonomy', () => {
  it('matches the Prisma enums exactly (no drift between DB and UI)', () => {
    expect([...ORIENTATIONS].sort()).toEqual(Object.values(PrismaEnums.Orientation).sort());
    expect([...LABEL_STATUSES].sort()).toEqual(Object.values(PrismaEnums.LabelStatus).sort());
  });

  it('places only the five directional values on the spectrum', () => {
    expect(POSITIONAL_ORIENTATIONS).toEqual([
      'LEFT',
      'CENTER_LEFT',
      'CENTER',
      'CENTER_RIGHT',
      'RIGHT',
    ]);
    for (const o of ['MIXED', 'UNRATED', 'DISPUTED'] as const) {
      expect(isPositional(o)).toBe(false);
      expect(ORIENTATION_INFO[o].position).toBeNull();
    }
    const positions = POSITIONAL_ORIENTATIONS.map((o) => ORIENTATION_INFO[o].position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps ideology words off the directional enum', () => {
    expect(ORIENTATIONS).not.toContain('LIBERAL');
    expect(ORIENTATIONS).not.toContain('CONSERVATIVE');
  });

  it('round-trips URL slugs and rejects unknown values', () => {
    for (const o of ORIENTATIONS) expect(orientationFromSlug(orientationToSlug(o))).toBe(o);
    expect(orientationFromSlug('center-left')).toBe('CENTER_LEFT');
    expect(orientationFromSlug('liberal')).toBeNull();
    expect(orientationFromSlug("'; drop table")).toBeNull();
    expect(isOrientation('LEFT')).toBe(true);
    expect(isOrientation('left')).toBe(false);
  });

  it('provides human labels for every state including Unrated and Disputed', () => {
    expect(ORIENTATION_INFO.UNRATED.label).toBe('Unrated');
    expect(ORIENTATION_INFO.DISPUTED.label).toBe('Disputed');
    expect(ORIENTATION_INFO.MIXED.label).toBe('Mixed / Varies');
  });
});

describe('validateSourceLabel', () => {
  it('accepts a complete reviewed label', () => {
    expect(validateSourceLabel(base)).toEqual([]);
  });

  it('accepts an honest unrated label with no provenance', () => {
    expect(
      validateSourceLabel({
        ...base,
        orientation: 'UNRATED',
        status: 'UNRATED',
        confidence: null,
        methodology: null,
        sourceUrl: null,
        reviewedAt: null,
      }),
    ).toEqual([]);
  });

  it('rejects out-of-range confidence', () => {
    expect(validateSourceLabel({ ...base, confidence: 1.2 })).toContain('confidence-out-of-range');
    expect(validateSourceLabel({ ...base, confidence: -0.1 })).toContain('confidence-out-of-range');
  });

  it('requires methodology, date and source for reviewed labels', () => {
    const issues = validateSourceLabel({
      ...base,
      methodology: '',
      reviewedAt: null,
      sourceUrl: null,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        'reviewed-without-methodology',
        'reviewed-without-date',
        'rated-without-source',
      ]),
    );
  });

  it('never lets machine output be presented as reviewed', () => {
    expect(validateSourceLabel({ ...base, isMachine: true })).toContain('machine-marked-reviewed');
  });

  it('flags inconsistent unrated/disputed states', () => {
    expect(validateSourceLabel({ ...base, status: 'UNRATED' })).toContain('unrated-with-position');
    expect(validateSourceLabel({ ...base, orientation: 'DISPUTED' })).toContain(
      'disputed-status-mismatch',
    );
  });
});

describe('formatConfidence', () => {
  it('describes confidence in words with the stated percentage', () => {
    expect(formatConfidence(null)).toBe('Confidence not stated');
    expect(formatConfidence(0.85)).toBe('High confidence (85%)');
    expect(formatConfidence(0.5)).toBe('Moderate confidence (50%)');
    expect(formatConfidence(0.2)).toBe('Low confidence (20%)');
  });
});
