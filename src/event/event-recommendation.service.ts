import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class EventRecommendationService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
  ) {}

  async getRecommendedEvents(
    user: UserEntity,
    limit: number = 10
  ): Promise<EventEntity[]> {
    // Get events based on user's interests, past attendance, etc.
    const recommendedEvents = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.startDate > :now', { now: new Date() })
      // Add more sophisticated filtering based on:
      // - User's categories of interest
      // - Events similar to ones they've attended
      // - Events their connections are attending
      // - Geographic proximity
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();

    return recommendedEvents;
  }

  async getSimilarEvents(
    eventId: number,
    limit: number = 3
  ): Promise<EventEntity[]> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ['categories'],
    });

    if (!event) {
      return [];
    }

    // Get events with similar categories
    const similarEvents = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.id != :eventId', { eventId })
      .andWhere('event.startDate > :now', { now: new Date() })
      // Add more sophisticated matching based on:
      // - Shared categories
      // - Similar description content
      // - Geographic proximity
      // - Similar attendee profiles
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();

    return similarEvents;
  }

  async getTrendingEvents(limit: number = 5): Promise<EventEntity[]> {
    // Get events with highest recent engagement
    const trendingEvents = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.startDate > :now', { now: new Date() })
      // Add metrics for "trending" such as:
      // - Recent signup rate
      // - View count
      // - Discussion activity
      // - Social media mentions
      .orderBy('RANDOM()') // Replace with actual trending metrics
      .limit(limit)
      .getMany();

    return trendingEvents;
  }

  async findRecommendedEventsForGroup(
    groupId: number,
    limit: number = 10
  ): Promise<EventEntity[]> {
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.groupId = :groupId', { groupId })
      .andWhere('event.startDate > :now', { now: new Date() })
      // Add more sophisticated filtering based on:
      // - Group's categories/interests
      // - Past group event attendance
      // - Member preferences
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();
  }

  async findRandomEventsForGroup(
    groupId: number,
    limit: number = 10
  ): Promise<EventEntity[]> {
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.groupId = :groupId', { groupId })
      .andWhere('event.startDate > :now', { now: new Date() })
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();
  }
}