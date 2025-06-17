import { Injectable, Logger } from '@nestjs/common';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';
import { MatrixUserService } from './matrix-user.service';
import { UserService } from '../../user/user.service';
import { Trace } from '../../utils/trace.decorator';

export interface HandleMigrationResult {
  success: boolean;
  oldMatrixId: string;
  newMatrixId: string;
  migrationSteps: string[];
  warnings: string[];
}

/**
 * Service for handling Matrix handle changes
 * Since Matrix IDs are immutable, this requires creating a new Matrix account
 */
@Injectable()
export class MatrixHandleMigrationService {
  private readonly logger = new Logger(MatrixHandleMigrationService.name);

  constructor(
    private readonly globalValidationService: GlobalMatrixValidationService,
    private readonly matrixUserService: MatrixUserService,
    private readonly userService: UserService,
  ) {}

  /**
   * Migrate a user to a new Matrix handle
   * WARNING: This creates a new Matrix account and the old one becomes inactive
   *
   * @param userId User ID in tenant
   * @param tenantId Tenant ID
   * @param newHandle Desired new Matrix handle
   * @returns Migration result with steps taken
   */
  @Trace('matrix.handle.migrate')
  async migrateUserHandle(
    userId: number,
    tenantId: string,
    newHandle: string,
  ): Promise<HandleMigrationResult> {
    const migrationSteps: string[] = [];
    const warnings: string[] = [];
    let user;
    let oldMatrixId = 'unknown';

    try {
      // 1. Get current user and Matrix info
      user = await this.userService.findById(userId, tenantId);
      if (!user) {
        throw new Error(`User ${userId} not found in tenant ${tenantId}`);
      }

      oldMatrixId = user.matrixUserId || 'none';
      if (!user.matrixUserId) {
        throw new Error('User does not have an existing Matrix account');
      }

      migrationSteps.push(`Found existing Matrix ID: ${oldMatrixId}`);

      // 2. Validate new handle
      const isAvailable =
        await this.globalValidationService.isMatrixHandleUnique(newHandle);
      if (!isAvailable) {
        throw new Error(`Handle ${newHandle} is already taken`);
      }

      migrationSteps.push(`Validated new handle availability: ${newHandle}`);

      // 3. Create new Matrix account with new handle
      const newMatrixUserInfo =
        await this.matrixUserService.provisionMatrixUser(
          { ...user, slug: newHandle }, // Use new handle as slug for username generation
          tenantId,
        );

      const newMatrixId = newMatrixUserInfo.userId;
      migrationSteps.push(`Created new Matrix account: ${newMatrixId}`);

      // 4. Update user record with new Matrix credentials
      await this.userService.update(
        userId,
        {
          matrixUserId: newMatrixUserInfo.userId,
          matrixAccessToken: newMatrixUserInfo.accessToken,
          matrixDeviceId: newMatrixUserInfo.deviceId,
        },
        tenantId,
      );

      migrationSteps.push('Updated user record with new Matrix credentials');

      // 5. Update global registry
      // Remove old handle registration
      await this.globalValidationService.unregisterMatrixHandle(
        tenantId,
        userId,
      );
      migrationSteps.push('Removed old handle from global registry');

      // Register new handle
      await this.globalValidationService.registerMatrixHandle(
        newHandle,
        tenantId,
        userId,
      );
      migrationSteps.push(`Registered new handle: ${newHandle}`);

      // 6. Add warnings about what the user needs to do manually
      warnings.push(
        'Your old Matrix account still exists but is no longer linked to OpenMeet',
      );
      warnings.push(
        'You will need to rejoin Matrix rooms with your new account',
      );
      warnings.push(
        'Chat history from your old account will not be transferred',
      );
      warnings.push(
        'Third-party Matrix clients will need to login with the new Matrix ID',
      );
      warnings.push('Consider informing contacts about your new Matrix ID');

      this.logger.log(
        `Successfully migrated user ${userId} from ${oldMatrixId} to ${newMatrixId}`,
      );

      return {
        success: true,
        oldMatrixId,
        newMatrixId,
        migrationSteps,
        warnings,
      };
    } catch (error) {
      this.logger.error(
        `Failed to migrate Matrix handle for user ${userId}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        oldMatrixId,
        newMatrixId: '',
        migrationSteps,
        warnings: [error.message],
      };
    }
  }

  /**
   * Check if a user can migrate their handle (safety checks)
   */
  async canMigrateHandle(
    userId: number,
    tenantId: string,
  ): Promise<{
    canMigrate: boolean;
    reason?: string;
  }> {
    try {
      const user = await this.userService.findById(userId, tenantId);

      if (!user) {
        return { canMigrate: false, reason: 'User not found' };
      }

      if (!user.matrixUserId) {
        return {
          canMigrate: false,
          reason: 'User does not have a Matrix account',
        };
      }

      // Check if user has recent Matrix activity (optional safety check)
      // This could be implemented by checking last Matrix sync time

      return { canMigrate: true };
    } catch (error) {
      return { canMigrate: false, reason: error.message };
    }
  }

  /**
   * Get migration impact summary for user review
   */
  async getMigrationImpact(
    userId: number,
    tenantId: string,
  ): Promise<{
    currentMatrixId: string;
    roomCount: number; // Could be implemented by querying Matrix server
    lastActivity: Date | null;
    impactSummary: string[];
  }> {
    const user = await this.userService.findById(userId, tenantId);

    if (!user?.matrixUserId) {
      throw new Error('User does not have a Matrix account');
    }

    // This could be enhanced to query the Matrix server for actual room membership
    const impactSummary = [
      'You will get a new Matrix ID that others can use to contact you',
      'Your current Matrix account will remain but be disconnected from OpenMeet',
      'You will need to rejoin all Matrix rooms with your new account',
      'Chat history will not be transferred to the new account',
      'External Matrix contacts will need your new Matrix ID',
      'This change cannot be undone - Matrix IDs are permanent',
    ];

    return {
      currentMatrixId: user.matrixUserId,
      roomCount: 0, // TODO: Query Matrix server for actual count
      lastActivity: null, // TODO: Get from Matrix server or user preferences
      impactSummary,
    };
  }
}
