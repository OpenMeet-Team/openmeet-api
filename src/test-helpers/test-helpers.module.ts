import { Module, forwardRef } from '@nestjs/common';
import { TestHelpersController } from './test-helpers.controller';
import { AuthModule } from '../auth/auth.module';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';
import { AuthBlueskyModule } from '../auth-bluesky/auth-bluesky.module';

/**
 * Test Helpers Module
 *
 * Provides test-only endpoints for e2e testing that bypass OAuth flows
 * and allow direct creation of test data.
 *
 * This module is:
 * - Only imported in test and development environments
 * - Excluded from production builds (see AppModule)
 * - Protected by TestOnlyGuard at controller level
 * - Hidden from Swagger documentation
 */
@Module({
  imports: [
    AuthModule,
    ShadowAccountModule,
    forwardRef(() => AuthBlueskyModule),
  ],
  controllers: [TestHelpersController],
})
export class TestHelpersModule {}
