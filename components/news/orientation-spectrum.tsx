import { ORIENTATION_INFO, type Orientation } from '@/lib/domain/orientation';

/**
 * Directional spectrum marker. Position is shown with shape + text, never with a red/blue colour
 * scale. Non-positional states (Mixed, Unrated, Disputed) render no marker, by design.
 */
export function OrientationSpectrum({
  orientation,
  compact = false,
}: {
  orientation: Orientation;
  compact?: boolean;
}) {
  const info = ORIENTATION_INFO[orientation];
  const position = info.position;
  const label =
    position === null
      ? `Source orientation: ${info.label}. Not placed on the left–right spectrum.`
      : `Source orientation: ${info.label}, position ${position + 1} of 5 from Left to Right.`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}
    >
      {!compact ? (
        <span className="text-muted" aria-hidden="true">
          Left
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 items-center ${compact ? 'w-16' : 'w-28'}`}
      >
        <span
          className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${
            position === null ? 'border-t border-dashed border-muted/60' : 'bg-muted'
          }`}
        />
        {[0, 1, 2, 3, 4].map((t) => (
          <span
            key={t}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-muted"
            style={{ left: `${t * 25}%` }}
          />
        ))}
        {position !== null ? (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-text bg-bg"
            style={{ left: `${position * 25}%` }}
          />
        ) : null}
      </span>
      {!compact ? (
        <span className="text-muted" aria-hidden="true">
          Right
        </span>
      ) : null}
    </div>
  );
}
