import { SiteFooter } from '@/components/shell/site-footer';

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-6 lg:py-12">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
