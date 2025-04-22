import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { TransactionHelper } from '../../utils/transaction-helper';

/**
 * Utilities for working with the relationship between events and event series
 */
@Injectable()
export class EventSeriesUtilitiesService {
  private readonly logger = new Logger(EventSeriesUtilitiesService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    @InjectRepository(EventSeriesEntity)
    private readonly seriesRepository: Repository<EventSeriesEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Associate an event with a series
   * This method handles the relationship properly by setting both the series relation and seriesSlug
   *
   * @param eventId ID of the event to associate
   * @param seriesSlug Slug of the series to associate with
   * @returns True if successful, false otherwise
   */
  async associateEventWithSeries(
    eventId: number,
    seriesSlug: string,
  ): Promise<boolean> {
    try {
      return await TransactionHelper.runInTransaction(
        this.dataSource,
        async (manager) => {
          // Find the series by slug
          const series = await manager.findOne(EventSeriesEntity, {
            where: { slug: seriesSlug },
          });

          if (!series) {
            this.logger.error(`Could not find series with slug ${seriesSlug}`);
            return false;
          }

          // Find the event
          const event = await manager.findOne(EventEntity, {
            where: { id: eventId },
          });

          if (!event) {
            this.logger.error(`Could not find event with ID ${eventId}`);
            return false;
          }

          // Set the relationship
          event.series = series;

          // Save the event
          await manager.save(event);

          // Verify the link was established correctly
          await TransactionHelper.verifyEventSeriesRelationship(
            manager,
            event.id,
            series.slug,
          );

          return true;
        },
      );
    } catch (error) {
      this.logger.error(
        `Error associating event ${eventId} with series ${seriesSlug}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Disassociate an event from its series
   *
   * @param eventId ID of the event to disassociate
   * @returns True if successful, false otherwise
   */
  async disassociateEventFromSeries(eventId: number): Promise<boolean> {
    try {
      return await TransactionHelper.runInTransaction(
        this.dataSource,
        async (manager) => {
          // Find the event
          const event = await manager.findOne(EventEntity, {
            where: { id: eventId },
            relations: ['series'],
          });

          if (!event) {
            this.logger.error(`Could not find event with ID ${eventId}`);
            return false;
          }

          if (!event.series) {
            // Nothing to do
            return true;
          }

          // Use the utility method to safely clear the relationship
          await TransactionHelper.clearEventSeriesRelationship(manager, event);

          return true;
        },
      );
    } catch (error) {
      this.logger.error(
        `Error disassociating event ${eventId} from series: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Fix all orphaned series references in the database
   * This is useful for maintenance operations and fixing data integrity issues
   *
   * @returns Number of events fixed
   */
  async fixOrphanedSeriesReferences(): Promise<number> {
    try {
      return await TransactionHelper.runInTransaction(
        this.dataSource,
        async (manager) => {
          // Find all events with seriesSlug set but series relation missing
          const result = await manager.query(`
            SELECT e.id, e."seriesSlug" 
            FROM events e
            LEFT JOIN "eventSeries" es ON e."seriesSlug" = es.slug
            WHERE e."seriesSlug" IS NOT NULL 
            AND es.slug IS NULL
          `);

          if (!result || result.length === 0) {
            return 0;
          }

          this.logger.log(
            `Found ${result.length} events with orphaned series references`,
          );

          // Clear all orphaned references
          await manager.query(`
            UPDATE events e
            SET "seriesSlug" = NULL
            WHERE e."seriesSlug" IS NOT NULL 
            AND NOT EXISTS (
              SELECT 1 FROM "eventSeries" es 
              WHERE e."seriesSlug" = es.slug
            )
          `);

          return result.length;
        },
      );
    } catch (error) {
      this.logger.error(
        `Error fixing orphaned series references: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }
}
