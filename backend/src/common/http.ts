import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'validation', issues: err.issues });
    if (err?.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    console.error(err);
    return reply.status(500).send({ error: 'internal' });
  });
}
