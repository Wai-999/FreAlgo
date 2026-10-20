import { z } from 'zod';
import { apiHandler, parseJsonBody } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { CLIENT_EVENTS } from '@/lib/telemetry/events';

const body = z.object({ event: z.enum(CLIENT_EVENTS) }).strict();

/**
 * Aggregate, anonymous client health counter: increments (day, event). Nothing else is stored:
 * no IP, no user agent, no identifiers.
 */
export const POST = apiHandler(
  { rateLimit: { bucket: 'telemetry', limit: 30, windowSec: 60 } },
  async (req) => {
    if (!getEnv().CLIENT_TELEMETRY_ENABLED) return new Response(null, { status: 204 });
    const { event } = await parseJsonBody(body, req, 256);
    const day = new Date(new Date().toISOString().slice(0, 10));
    await getPrisma().$executeRaw`
    INSERT INTO "ClientEventCounter" (day, event, count) VALUES (${day}::date, ${event}, 1)
    ON CONFLICT (day, event) DO UPDATE SET count = "ClientEventCounter".count + 1`;
    return new Response(null, { status: 204 });
  },
);
