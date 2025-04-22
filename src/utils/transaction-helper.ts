import { DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';

const logger = new Logger('TransactionHelper');

/**
 * A utility class to handle complex transactions involving events and event series
 * to maintain relationship integrity and prevent seriesSlug from being lost
 */
export class TransactionHelper {
  /**
   * Run operations in a transaction with relationship verification
   * @param dataSource TypeORM data source
   * @param operationCallback The callback with operations to execute in the transaction
   * @returns Result of the transaction operations
   */
  static async runInTransaction<T>(
    dataSource: DataSource,
    operationCallback: (entityManager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await operationCallback(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      logger.error(`Transaction failed: ${err.message}`);
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Verify and repair event-series relationships if needed
   * @param entityManager Entity manager for the current transaction
   * @param eventId ID of the event to verify
   * @param seriesSlug Expected series slug (if any)
   */
  static async verifyEventSeriesRelationship(
    entityManager: EntityManager,
    eventId: number,
    seriesSlug: string | null,
  ): Promise<void> {
    if (!seriesSlug) {
      return; // Nothing to verify if no series relationship is expected
    }

    // Get the event with its series relation
    const event = await entityManager.query(
      `SELECT e.id, e."seriesSlug", es.slug AS "seriesSlugFromRelation"
       FROM events e
       LEFT JOIN "eventSeries" es ON e."seriesSlug" = es.slug
       WHERE e.id = $1`,
      [eventId],
    );

    if (!event || !event.length) {
      logger.warn(
        `Cannot verify series relationship for event ID ${eventId} - event not found`,
      );
      return;
    }

    const currentSlug = event[0].seriesSlug;
    const relationSlug = event[0].seriesSlugFromRelation;

    // Repair if needed - check both the column and the relationship
    if (currentSlug !== seriesSlug || relationSlug !== seriesSlug) {
      logger.warn(
        `Repairing series relationship for event ID ${eventId}: expected "${seriesSlug}", found column="${currentSlug || 'null'}", relation="${relationSlug || 'null'}"`,
      );

      await entityManager.query(
        `UPDATE events SET "seriesSlug" = $1 WHERE id = $2`,
        [seriesSlug, eventId],
      );
    }
  }

  /**
   * Safely clear an event's series relationship
   * This method properly handles type constraints and ensures both the relation and column are cleared
   *
   * @param entityManager Entity manager for the current transaction
   * @param event The event entity to update
   * @returns The updated event entity
   */
  static async clearEventSeriesRelationship(
    entityManager: EntityManager,
    event: any, // Use 'any' to avoid TypeScript issues with the relationship
  ): Promise<any> {
    if (!event || !event.id) {
      logger.error('Cannot clear series relationship: Invalid event object');
      return event;
    }

    // Use direct save with null to handle the relationship properly
    event.series = null;

    // Save with full entity to ensure proper relationship handling
    return await entityManager.save(event);
  }
}
