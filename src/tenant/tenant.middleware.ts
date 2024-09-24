import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId) {
      return res.status(400).send('Tenant ID is required');
    }

    req.tenantId = tenantId;

    next();
  }
}
