import { DEPTH_INFO, READING_DEPTHS, type ReadingDepth } from '@/lib/explore/why';
import { NavAnchor } from './nav-anchor';

/**
 * Reading depth switch (links, so it works without JavaScript and keeps every other URL
 * parameter). The chosen depth is part of the URL and therefore shareable.
 */
export function ReadingDepthNav({
  current,
  hrefFor,
}: {
  current: ReadingDepth;
  hrefFor: (depth: ReadingDepth) => string;
}) {
  return (
    <nav aria-label="Reading depth" className="flex flex-wrap gap-2" data-testid="reading-depth">
      {READING_DEPTHS.map((d) => (
        <NavAnchor
          key={d}
          href={hrefFor(d)}
          aria-current={d === current ? 'page' : undefined}
          title={DEPTH_INFO[d].description}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm no-underline ${
            d === current
              ? 'border-accent text-text'
              : 'border-border-strong text-muted hover:text-text'
          }`}
        >
          {DEPTH_INFO[d].label}
        </NavAnchor>
      ))}
    </nav>
  );
}
