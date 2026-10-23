'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({
  items,
  className,
  small = false,
}: {
  items: readonly { href: string; label: string }[];
  className?: string;
  /** Secondary navigation: smaller, quieter links. */
  small?: boolean;
}) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              // No prefetch: loading every section's payload on each page view wastes data on slow
              // connections (baseline defect D5). Navigation stays client-side on click.
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-md no-underline transition-colors ${small ? 'px-2 text-[13px]' : 'px-3 text-sm'} ${
                active
                  ? 'bg-surface-raised text-text'
                  : 'text-muted hover:bg-surface hover:text-text'
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
