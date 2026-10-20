'use client';

import { useEffect, useRef } from 'react';

/** Keeps the selected chip of a horizontally scrolling nav visible (e.g. "Agriculture"). */
export function ScrollActiveIntoView({
  children,
  watch,
}: {
  children: React.ReactNode;
  watch: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [watch]);
  return <div ref={ref}>{children}</div>;
}
