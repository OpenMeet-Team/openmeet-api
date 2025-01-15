import { Request as ExpressRequest, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

declare module 'express' {
  export interface Request extends ExpressRequest {
    tenantId?: string;
    headers: {
      'x-tenant-id'?: string;
      'x-event-slug'?: string;
      'x-group-slug'?: string;
      [key: string]: string | string[] | undefined;
    };
    params: ParamsDictionary;
    query: ParsedQs;
    body: any;
    route: {
      path: string;
    };
  }
  export { Response };
}
