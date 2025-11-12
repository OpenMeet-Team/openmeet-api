import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';

/**
 * Guard that blocks access to test-only endpoints in production.
 *
 * This guard should be applied to controllers or endpoints that are only
 * intended for testing and development environments.
 *
 * @example
 * ```typescript
 * @Controller('api/v1/test')
 * @UseGuards(TestOnlyGuard)
 * export class TestHelpersController {}
 * ```
 */
@Injectable()
export class TestOnlyGuard implements CanActivate {
  constructor(private configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = this.configService.get('app.nodeEnv', { infer: true });

    // Block access in production environment
    if (nodeEnv === 'production') {
      throw new ForbiddenException(
        'Test endpoints are not available in production',
      );
    }

    // Allow access in test and development environments
    return true;
  }
}
