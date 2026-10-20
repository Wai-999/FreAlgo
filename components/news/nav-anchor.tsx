'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type AnchorHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from 'react';

/**
 * Workspace navigation: every control is a real <a href> or GET <form> (works without
 * JavaScript, deep-linkable); with JavaScript, clicks become client transitions so the globe and
 * sheet stay mounted and a pending state is shown instead of a blank page.
 */
interface NavContext {
  navigate: (href: string) => void;
  pending: boolean;
}

const Ctx = createContext<NavContext | null>(null);

export function WorkspaceNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => startTransition(() => router.push(href, { scroll: false })),
    [router],
  );
  const value = useMemo(() => ({ navigate, pending }), [navigate, pending]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceNav(): NavContext | null {
  return useContext(Ctx);
}

export function NavAnchor({
  href,
  children,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const nav = useWorkspaceNav();
  const router = useRouter();
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        if (rest.target && rest.target !== '_self') return;
        e.preventDefault();
        if (nav) nav.navigate(href);
        else router.push(href, { scroll: false });
      }}
    >
      {children}
    </a>
  );
}

/** Enhances a GET form: submits as a client navigation to `action?{form fields}`. */
export function useGetFormSubmit(action: string) {
  const nav = useWorkspaceNav();
  const router = useRouter();
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) if (typeof v === 'string' && v !== '') params.append(k, v);
    const href = `${action}?${params.toString()}`;
    if (nav) nav.navigate(href);
    else router.push(href, { scroll: false });
  };
}
