/** Liveness: the process is up and serving. Does not touch dependencies. */
export function GET() {
  return Response.json(
    { status: 'ok', service: 'web', time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
