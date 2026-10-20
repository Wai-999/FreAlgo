import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16"
    >
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted">
        The page you asked for does not exist. Country pages use ISO codes, for example{' '}
        <Link href="/?country=MM">/?country=MM</Link>.
      </p>
      <p className="mt-6">
        <Link href="/" className="inline-flex min-h-11 items-center">
          Back to the map
        </Link>
      </p>
    </main>
  );
}
