import type { ReactNode } from 'react';

type Tone = 'neutral' | 'warning' | 'danger' | 'success' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'border-border-strong text-muted',
  info: 'border-accent/70 text-accent-hover',
  warning: 'border-warning/70 text-warning',
  danger: 'border-danger/70 text-danger',
  success: 'border-success/70 text-success',
};

/** Text-first badge. Tone is a secondary cue only; the text always carries the meaning. */
export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function FixtureBadge() {
  return (
    <Badge tone="warning" title="Fixture data for development and tests. Not real news.">
      Fixture: not real news
    </Badge>
  );
}
