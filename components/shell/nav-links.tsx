'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({
  items,
  className,
}: {
  items: readonly { href: string; label: string }[];
  className?: string;
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
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-md px-3 text-sm no-underline transition-colors ${
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
