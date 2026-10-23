import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, parseJsonBody } from '@/lib/api/handler';

const schema = z.object({ event: z.string() });
const request = (body: BodyInit, type = 'application/json') =>
  new Request('http://local.test/api', {
    method: 'POST',
    headers: { 'content-type': type },
    body,
    duplex: 'half',
  } as RequestInit);

describe('parseJsonBody', () => {
  it('parses a valid body and rejects wrong types, size and JSON', async () => {
    await expect(parseJsonBody(schema, request('{"event":"x"}'))).resolves.toEqual({ event: 'x' });
    await expect(parseJsonBody(schema, request('x', 'text/plain'))).rejects.toMatchObject({
      status: 415,
    });
    await expect(
      parseJsonBody(schema, request('{"event":"' + 'a'.repeat(300) + '"}'), 256),
    ).rejects.toMatchObject({ status: 413 });
    await expect(parseJsonBody(schema, request('{'))).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('answers a body the client abandoned with a 400, not a server error', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error('aborted'));
      },
    });
    const err = await parseJsonBody(schema, request(stream)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'BODY_UNREADABLE' });
  });
});
