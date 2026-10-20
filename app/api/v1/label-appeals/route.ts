import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiHandler, seeOther } from '@/lib/api/handler';
import { assertSameOrigin } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

const appealSchema = z.object({
  outletSlug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  message: z.string().trim().min(20, 'Please explain the issue (at least 20 characters)').max(4000),
  contactEmail: z
    .email()
    .max(254)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0).optional().or(z.literal('')),
});

/**
 * Public label appeal / correction request. Accepts an HTML form (works without JavaScript) or
 * JSON. Contact email is optional and purged 30 days after resolution.
 */
export const POST = apiHandler(
  { rateLimit: { bucket: 'appeals', limit: 5, windowSec: 3600 } },
  async (req) => {
    const isForm = (req.headers.get('content-type') ?? '').includes('form');
    if (isForm) assertSameOrigin(req);
    const raw = isForm
      ? Object.fromEntries((await req.formData()).entries())
      : await req.json().catch(() => ({}));
    const input = appealSchema.parse(raw);
    const outlet = await getPrisma().mediaOutlet.findUnique({
      where: { slug: input.outletSlug },
      select: { id: true },
    });
    if (!outlet) throw new ApiError(404, 'NOT_FOUND', 'Outlet not found');
    await getPrisma().labelAppeal.create({
      data: {
        outletId: outlet.id,
        message: input.message,
        contactEmail: input.contactEmail ?? null,
      },
    });
    if (isForm) {
      return seeOther(`/sources/${input.outletSlug}?appeal=received#appeal`);
    }
    return NextResponse.json({ received: true }, { status: 201 });
  },
);
