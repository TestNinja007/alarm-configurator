import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import { config } from './config.js';
import { buildErrorBody, registerErrorHandler } from './http/errorHandler.js';
import { registerRequestId } from './http/requestId.js';
import { alarmRoutes } from './routes/alarms.js';
import { authRoutes } from './routes/auth.js';
import { folderRoutes } from './routes/folders.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { testRoutes } from './routes/test.js';
import { occurrenceRoutes } from './routes/occurrences.js';

export const API_PREFIX = '/api/v1';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // Hosting platforms terminate TLS in front of the app, so the real
    // protocol and client address arrive in X-Forwarded-* headers.
    trustProxy: config.isProduction,
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

  // The document is generated from the very TypeBox schemas the routes
  // validate with, so it cannot drift from what the server accepts.
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Alarm Configurator',
        version: config.version,
        description:
          'Configuration of recurring alarms. Every instant is UTC with a Z suffix. ' +
          'Non-2xx responses share one error envelope.',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          sessionCookie: { type: 'apiKey', in: 'cookie', name: 'sid' },
        },
      },
      security: [{ sessionCookie: [] }],
      tags: [
        { name: 'auth', description: 'Sign in and session' },
        { name: 'folders', description: 'Folders, their summary and their conflicts' },
        { name: 'alarms', description: 'Alarm CRUD, filtering and enable state' },
        { name: 'occurrences', description: 'Preview and saved-alarm occurrences' },
        { name: 'drafts', description: 'The create wizard draft (A-03)' },
        { name: 'ui-state', description: 'Per-user folder filter and sort order (A-04)' },
        { name: 'health', description: 'Service health' },
        { name: 'test-support', description: 'Only present when TEST_SUPPORT=1' },
      ],
    },
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(folderRoutes);
      await api.register(alarmRoutes);
      await api.register(occurrenceRoutes);
      await api.register(meRoutes);

      // T-01..T-03 exist only with the flag on; without it they are never
      // registered, so they are missing from the router and the document alike.
      if (config.testSupport) await api.register(testRoutes);

      api.get(
        '/openapi.json',
        {
          schema: {
            summary: 'The OpenAPI 3.1 document for this API',
            tags: ['health'],
            hide: false,
          },
        },
        async () => api.swagger(),
      );
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
