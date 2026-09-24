import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { buildErrorBody, registerErrorHandler } from './http/errorHandler.js';
import { registerRequestId } from './http/requestId.js';
import { alarmRoutes } from './routes/alarms.js';
import { authRoutes } from './routes/auth.js';
import { folderRoutes } from './routes/folders.js';
import { healthRoutes } from './routes/health.js';

export const API_PREFIX = '/api/v1';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    ajv: {
      customOptions: {
        // The rule schemas are discriminated unions; without this Ajv reports
        // every branch's failures instead of only the one the client asked for.
        discriminator: true,
        allErrors: true,
      },
    },
  });

  registerRequestId(app);
  registerErrorHandler(app);

  await app.register(cookie, { secret: config.sessionSecret });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(folderRoutes);
      await api.register(alarmRoutes);
    },
    { prefix: API_PREFIX },
  );

  // One origin: the API also serves the built SPA. The dist directory is
  // absent during API-only development, when Vite serves the front end itself.
  const hasWebBuild = existsSync(config.webDistDir);
  if (hasWebBuild) {
    await app.register(fastifyStatic, { root: config.webDistDir, prefix: '/' });
  }

  // A single 404 handler: API paths always get the error envelope, while
  // unknown non-API paths fall through to the SPA so client-side routing works.
  app.setNotFoundHandler((request, reply) => {
    if (!hasWebBuild || request.url.startsWith(API_PREFIX)) {
      reply
        .status(404)
        .send(buildErrorBody('not_found', 'Resource not found.', request.requestId));
      return;
    }
    reply.sendFile('index.html', config.webDistDir);
  });

  return app;
}

export function webIndexPath(): string {
  return join(config.webDistDir, 'index.html');
}
