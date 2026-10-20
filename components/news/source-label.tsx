import Link from 'next/link';
import {
  LABEL_STATUS_INFO,
  ORIENTATION_INFO,
  formatConfidence,
  formatIdeologyTag,
  type LabelStatus,
  type Orientation,
} from '@/lib/domain/orientation';
import { formatUtc } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';
import { Badge } from '@/components/ui/badge';
import { OrientationSpectrum } from './orientation-spectrum';

export interface SourceLabelData {
  orientation: Orientation;
  labelStatus: LabelStatus;
  labelConfidence: number | null;
  ideologyTags: string[];
  labelMethodology: string | null;
  labelSourceUrl: string | null;
  labelReviewedAt: Date | string | null;
  labelContext: string | null;
  labelIsMachine: boolean;
}

/**
 * Source-level (outlet) orientation label with provenance, disclosed progressively.
 * Uses <details> so it works without JavaScript. Never coloured by political direction.
 */
export function SourceLabel({
  label,
  outletName,
  compact = false,
}: {
  label: SourceLabelData;
  outletName: string;
  compact?: boolean;
}) {
  const info = ORIENTATION_INFO[label.orientation];
  const status = LABEL_STATUS_INFO[label.labelStatus];
  return (
    <details
      className="group rounded-md border border-border bg-surface/60 text-sm open:bg-surface"
      data-testid="source-label"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-muted">Outlet label:</span>
        <span className="font-medium text-text">{info.label}</span>
        <OrientationSpectrum orientation={label.orientation} compact />
        {label.labelStatus !== 'UNRATED' ? (
          <Badge tone={label.labelStatus === 'DISPUTED' ? 'warning' : 'neutral'}>
            {status.label}
          </Badge>
        ) : null}
        {label.labelIsMachine ? <Badge tone="warning">Machine-generated</Badge> : null}
        <span className="ml-auto text-xs text-muted group-open:hidden">Why?</span>
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3 text-muted">
        <p>
          This describes <strong className="text-text">{outletName}</strong>&apos;s general
          editorial orientation as assessed by the cited source. It is{' '}
          <strong className="text-text">not</strong> a rating of this story&apos;s accuracy or
          viewpoint.
        </p>
        {!compact ? <OrientationSpectrum orientation={label.orientation} /> : null}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          <dt>Status</dt>
          <dd className="text-text">
            {status.label}: {status.description}
          </dd>
          <dt>Confidence</dt>
          <dd className="text-text">{formatConfidence(label.labelConfidence)}</dd>
          {label.ideologyTags.length ? (
            <>
              <dt>Descriptive tags</dt>
              <dd className="text-text">
                {label.ideologyTags.map(formatIdeologyTag).join(', ')}
                {label.labelContext
                  ? ` (in context: ${label.labelContext})`
                  : ' (meaning depends on national context)'}
              </dd>
            </>
          ) : null}
          <dt>Reviewed</dt>
          <dd className="text-text">
            {label.labelReviewedAt ? formatUtc(label.labelReviewedAt).slice(0, 10) : 'Not reviewed'}
          </dd>
          <dt>Methodology</dt>
          <dd className="text-text">{label.labelMethodology ?? 'None cited (unrated).'}</dd>
          {safeHref(label.labelSourceUrl) ? (
            <>
              <dt>Source</dt>
              <dd>
                <a
                  href={safeHref(label.labelSourceUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="break-all"
                >
                  {label.labelSourceUrl}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
        <p>
          <Link href="/methodology#labels">How labels work</Link> ·{' '}
          <Link href="/methodology#corrections">Report a label issue</Link>
        </p>
      </div>
    </details>
  );
}
