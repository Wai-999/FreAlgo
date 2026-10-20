'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api/handler';
import {
  requestRefetch,
  resetCircuit,
  resolveQuarantine,
  setArticleStatus,
  updateSource,
} from '@/lib/admin/service';
import { requireAdminActor } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/**
 * Admin server actions. Authorization is re-checked inside every action (server-side), and
 * Next.js server actions reject cross-origin submissions.
 */
async function run(fn: (actor: string) => Promise<unknown>, okMessage: string) {
  let target = `/admin?ok=${encodeURIComponent(okMessage)}`;
  try {
    const actor = await requireAdminActor();
    await fn(actor);
    revalidatePath('/admin');
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Action failed';
    target = `/admin?error=${encodeURIComponent(message.slice(0, 200))}`;
  }
  redirect(target);
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

export async function activateSourceAction(fd: FormData) {
  const id = str(fd, 'id');
  const notes = str(fd, 'licenseNotes');
  const termsUrl = str(fd, 'termsUrl');
  await run(
    (actor) =>
      updateSource(getPrisma(), actor, id, {
        status: 'ACTIVE',
        ...(notes
          ? {
              termsReviewed: {
                licenseNotes: notes,
                termsUrl: termsUrl || null,
                excerptAllowed: fd.get('excerptAllowed') === 'on',
              },
            }
          : {}),
      }),
    'Source activated',
  );
}

export async function pauseSourceAction(fd: FormData) {
  await run(
    (actor) => updateSource(getPrisma(), actor, str(fd, 'id'), { status: 'PAUSED' }),
    'Source paused',
  );
}

export async function refetchSourceAction(fd: FormData) {
  await run((actor) => requestRefetch(getPrisma(), actor, str(fd, 'id')), 'Re-fetch queued');
}

export async function resetCircuitAction(fd: FormData) {
  await run((actor) => resetCircuit(getPrisma(), actor, str(fd, 'id')), 'Circuit reset');
}

export async function resolveQuarantineAction(fd: FormData) {
  await run(
    (actor) => resolveQuarantine(getPrisma(), actor, str(fd, 'id'), { resolution: 'dismissed' }),
    'Quarantine item resolved',
  );
}

export async function articleStatusAction(fd: FormData) {
  const status = str(fd, 'status') as 'PUBLISHED' | 'REMOVED';
  await run(
    (actor) =>
      setArticleStatus(getPrisma(), actor, str(fd, 'id'), {
        status,
        reason: str(fd, 'reason') || 'Admin review',
      }),
    `Article ${status.toLowerCase()}`,
  );
}
