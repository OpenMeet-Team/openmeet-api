import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MatrixHandleRegistryEntity } from '../infrastructure/persistence/relational/entities/matrix-handle-registry.entity';
import { Trace } from '../../utils/trace.decorator';

export interface MatrixHandleRegistration {
  id: number;
  handle: string;
  tenantId: string;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service for managing global Matrix handle uniqueness across all tenants
 * Uses a global registry table in the public schema to track all Matrix handles
 */
@Injectable()
export class GlobalMatrixValidationService {
  private readonly logger = new Logger(GlobalMatrixValidationService.name);
  private readonly registry: Repository<MatrixHandleRegistryEntity>;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.registry = this.dataSource.getRepository(MatrixHandleRegistryEntity);
  }

  /**
   * Check if a Matrix handle is globally unique across all tenants
   * @param handle The proposed Matrix handle (without @ or domain)
   * @returns true if handle is available, false if taken
   */
  @Trace('matrix.handle.checkUnique')
  async isMatrixHandleUnique(handle: string): Promise<boolean> {
    try {
      // Validate handle format
      if (!this.isValidMatrixHandle(handle)) {
        return false;
      }

      // Query global registry using repository
      const existing = await this.registry.findOne({
        where: { handle: handle.toLowerCase() },
      });

      const isUnique = !existing;

      this.logger.debug(
        `Matrix handle uniqueness check: ${handle} -> ${isUnique ? 'available' : 'taken'}`,
      );

      return isUnique;
    } catch (error) {
      this.logger.error(
        `Error checking Matrix handle uniqueness for ${handle}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Register a Matrix handle in the global registry
   * @param handle The Matrix handle to register
   * @param tenantId The tenant ID of the user
   * @param userId The user ID within the tenant
   * @throws Error if handle is already taken or invalid
   */
  @Trace('matrix.handle.register')
  async registerMatrixHandle(
    handle: string,
    tenantId: string,
    userId: number,
  ): Promise<void> {
    try {
      // Validate handle format
      if (!this.isValidMatrixHandle(handle)) {
        throw new Error(`Invalid Matrix handle format: ${handle}`);
      }

      // Check if handle is already registered for this user
      const existing = await this.registry.findOne({
        where: { handle: handle.toLowerCase() },
      });

      if (existing) {
        // If same user and tenant, allow re-registration (idempotent)
        if (existing.userId === userId && existing.tenantId === tenantId) {
          this.logger.log(
            `Matrix handle ${handle} already registered for user ${userId} in tenant ${tenantId} - skipping duplicate registration`,
          );
          return;
        }
        // If different user, it's already taken
        throw new Error(`Matrix handle ${handle} is already taken`);
      }

      // Register in global registry
      const registration = this.registry.create({
        handle: handle.toLowerCase(),
        tenantId,
        userId,
      });
      await this.registry.save(registration);

      this.logger.log(
        `Registered Matrix handle: ${handle} for user ${userId} in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error registering Matrix handle ${handle}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get the Matrix handle for a user (alias for getMatrixHandleRegistration)
   * @param userId The user ID within the tenant
   * @param tenantId The tenant ID
   * @returns The handle registration or null if not found
   */
  async getMatrixHandleForUser(
    userId: number,
    tenantId: string,
  ): Promise<MatrixHandleRegistration | null> {
    return this.getMatrixHandleRegistration(tenantId, userId);
  }

  /**
   * Get the Matrix handle registration for a user
   * @param tenantId The tenant ID
   * @param userId The user ID within the tenant
   * @returns The handle registration or null if not found
   */
  async getMatrixHandleRegistration(
    tenantId: string,
    userId: number,
  ): Promise<MatrixHandleRegistration | null> {
    try {
      const registration = await this.registry.findOne({
        where: { tenantId, userId },
      });

      return registration || null;
    } catch (error) {
      this.logger.error(
        `Error getting Matrix handle registration for user ${userId} in tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find user by Matrix handle
   * @param handle The Matrix handle (without @ or domain)
   * @param tenantId The tenant ID to search within
   * @returns The handle registration or null if not found
   */
  async getUserByMatrixHandle(
    handle: string,
    tenantId: string,
  ): Promise<MatrixHandleRegistration | null> {
    try {
      const registration = await this.registry.findOne({
        where: { handle: handle.toLowerCase(), tenantId },
      });

      return registration || null;
    } catch (error) {
      this.logger.error(
        `Error finding user by Matrix handle ${handle} in tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Remove a Matrix handle registration (e.g., when user is deleted)
   * @param tenantId The tenant ID
   * @param userId The user ID within the tenant
   */
  async unregisterMatrixHandle(
    tenantId: string,
    userId: number,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Attempting to unregister Matrix handle for user ${userId} (type: ${typeof userId}) in tenant ${tenantId}`,
      );

      // First check what's actually in the registry for this user
      const existingRegistration = await this.registry.findOne({
        where: { tenantId, userId },
      });

      if (existingRegistration) {
        this.logger.debug(
          `Found existing registration for user ${userId}: ${JSON.stringify(existingRegistration)}`,
        );
      } else {
        this.logger.debug(
          `No existing registration found for user ${userId} in tenant ${tenantId}`,
        );
        
        // Try to find by any criteria to see what's actually there
        const allForTenant = await this.registry.find({
          where: { tenantId },
        });
        this.logger.debug(
          `All registrations for tenant ${tenantId}: ${JSON.stringify(allForTenant.map(r => ({ id: r.id, userId: r.userId, userIdType: typeof r.userId, handle: r.handle })))}`,
        );
      }

      const result = await this.registry.delete({ tenantId, userId });

      this.logger.debug(
        `Delete result for user ${userId} in tenant ${tenantId}: affected=${result.affected}`,
      );

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Successfully unregistered Matrix handle for user ${userId} in tenant ${tenantId}`,
        );
      } else {
        this.logger.warn(
          `No Matrix handle registration found to delete for user ${userId} in tenant ${tenantId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error unregistering Matrix handle for user ${userId} in tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Suggest an available Matrix handle based on a desired handle
   * @param desiredHandle The handle the user wants
   * @param maxSuggestions Maximum number of suggestions to return
   * @returns Array of available handle suggestions
   */
  @Trace('matrix.handle.suggest')
  async suggestAvailableHandles(
    desiredHandle: string,
    maxSuggestions = 5,
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Clean the desired handle
    const cleanHandle = this.cleanHandle(desiredHandle);

    // Try the original handle first
    if (await this.isMatrixHandleUnique(cleanHandle)) {
      suggestions.push(cleanHandle);
    }

    // Generate numbered variants
    for (let i = 2; suggestions.length < maxSuggestions && i <= 999; i++) {
      const variant = `${cleanHandle}${i}`;
      if (await this.isMatrixHandleUnique(variant)) {
        suggestions.push(variant);
      }
    }

    // Generate dot variants
    if (cleanHandle.includes('.')) {
      const withoutDots = cleanHandle.replace(/\./g, '');
      if (await this.isMatrixHandleUnique(withoutDots)) {
        suggestions.push(withoutDots);
      }
    } else {
      // Try adding dots in common places
      const parts = cleanHandle.split(/(?=[A-Z])/); // Split on capital letters
      if (parts.length > 1) {
        const dotted = parts.join('.').toLowerCase();
        if (await this.isMatrixHandleUnique(dotted)) {
          suggestions.push(dotted);
        }
      }
    }

    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Validate Matrix handle format according to Matrix specification
   * @param handle The handle to validate
   * @returns true if valid, false otherwise
   */
  private isValidMatrixHandle(handle: string): boolean {
    if (!handle || typeof handle !== 'string') {
      return false;
    }

    // Matrix localpart rules:
    // - Must be 1-255 characters
    // - Only lowercase letters, digits, '.', '_', '-', '='
    // - Cannot start with '_' (reserved for appservices)
    const matrixLocalpartRegex = /^[a-z0-9.\-=_]+$/;

    return (
      handle.length >= 1 &&
      handle.length <= 255 &&
      !handle.startsWith('_') &&
      matrixLocalpartRegex.test(handle)
    );
  }

  /**
   * Clean a proposed handle to make it Matrix-compliant
   * @param handle The handle to clean
   * @returns A cleaned handle that follows Matrix rules
   */
  private cleanHandle(handle: string): string {
    if (!handle) return '';

    return handle
      .toLowerCase()
      .replace(/[^a-z0-9.\-=_]/g, '') // Remove invalid characters (keep underscores for now)
      .replace(/^_+/, '') // Remove leading underscores
      .slice(0, 255); // Limit length
  }
}
