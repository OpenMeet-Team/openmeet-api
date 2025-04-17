import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard for service-to-service authentication
 * Verifies that the request contains a valid service API key
 */
@Injectable()
export class ServiceKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceKeyAuthGuard.name);
  private readonly apiKeys: string[];

  constructor(private readonly configService: ConfigService) {
    // Load API keys from configuration
    const keys = this.configService.get<string>('SERVICE_API_KEYS', {
      infer: true,
    });
    this.apiKeys = keys ? keys.split(',').map((key) => key.trim()) : [];

    if (this.apiKeys.length === 0) {
      this.logger.warn(
        'No service API keys configured. Service-to-service authentication may fail.',
      );
    } else {
      this.logger.log(
        `Loaded ${this.apiKeys.length} service API keys from configuration`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.debug('Request rejected: Missing API key');
      throw new UnauthorizedException('Authentication required');
    }

    if (!this.apiKeys.includes(apiKey)) {
      this.logger.warn(
        `Request rejected: Invalid API key provided: ${apiKey.slice(0, 4)}...`,
      );
      throw new UnauthorizedException('Invalid authentication credentials');
    }

    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    // First check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (authValue && authValue.startsWith('Bearer ')) {
        return authValue.substring(7);
      }
    }

    // Then check query parameter
    if (request.query.api_key) {
      return request.query.api_key as string;
    }

    return undefined;
  }
}
