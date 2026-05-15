/**
 * Standalone smoke server for the Contrail XRPC layer.
 *
 * Boots a minimal NestJS app with just `ContrailXrpcModule` and the same
 * /xrpc/net.openmeet middleware mount used in main.ts. No tenants, no
 * TypeORM, no auth — just the new XRPC surface, so you can curl it.
 *
 * Usage:
 *   CONTRAIL_DATABASE_URL=postgres://... \
 *   CONTRAIL_SCHEMA=contrail \
 *   PORT=3010 \
 *   ts-node -r tsconfig-paths/register src/contrail/smoke-server.ts
 *
 * Curl examples:
 *   curl 'http://localhost:3010/xrpc/net.openmeet.event.listRecords?limit=3'
 *   curl 'http://localhost:3010/xrpc/net.openmeet.event.listRecords?sort=rsvpsCount&limit=3'
 *   curl 'http://localhost:3010/xrpc/net.openmeet.rsvp.listRecords?limit=3'
 *
 * Phase 1 dev aid only. Not deployed.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { ContrailXrpcModule } from './contrail-xrpc.module';
import { ContrailProvider } from './contrail.provider';

@Module({ imports: [ContrailXrpcModule] })
class SmokeAppModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(SmokeAppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const provider = app.get(ContrailProvider);

  app.use(
    '/xrpc',
    async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
      if (!req.url.startsWith('/net.openmeet.')) return next();
      try {
        const fullPath = `/xrpc${req.url}`;
        const url = new URL(
          fullPath,
          `http://${req.headers.host ?? 'localhost'}`,
        );
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }
        const fetchRequest = new globalThis.Request(url.toString(), {
          method: req.method,
          headers,
        });
        const fetchResponse = await provider.handle(fetchRequest);
        res.status(fetchResponse.status);
        fetchResponse.headers.forEach((value, key) =>
          res.setHeader(key, value),
        );
        res.send(await fetchResponse.text());
      } catch (err) {
        next(err);
      }
    },
  );

  const port = parseInt(process.env.PORT ?? '3010', 10);
  await app.listen(port);
  console.log(`Contrail smoke listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
