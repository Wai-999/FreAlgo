import { SECTORS } from '@/lib/domain/sectors';
import { NavAnchor } from './nav-anchor';
import { ScrollActiveIntoView } from './scroll-active-into-view';

/**
 * Sector switcher. Implemented as navigation links with aria-current (each sector is its own
 * URL), not an ARIA tabs widget, so it deep-links and works without JavaScript.
 */
export function SectorNav({
  selected,
  hrefFor,
}: {
  selected: string | null;
  hrefFor: (slug: string | null) => string;
}) {
  const items: { slug: string | null; name: string }[] = [{ slug: null, name: 'All' }, ...SECTORS];
  return (
    <ScrollActiveIntoView watch={selected ?? 'all'}>
      <nav aria-label="Sectors" className="-mx-4 overflow-x-auto px-4" data-testid="sector-nav">
        <ul className="flex gap-2 pb-1">
          {items.map((s) => {
            const active = s.slug === selected;
            return (
              <li key={s.slug ?? 'all'} className="shrink-0">
                <NavAnchor
                  href={hrefFor(s.slug)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm whitespace-nowrap no-underline ${
                    active
                      ? 'border-accent bg-surface-raised text-text'
                      : 'border-border-strong text-muted hover:text-text'
                  }`}
                >
                  {s.name}
                </NavAnchor>
              </li>
            );
          })}
        </ul>
      </nav>
    </ScrollActiveIntoView>
  );
}
