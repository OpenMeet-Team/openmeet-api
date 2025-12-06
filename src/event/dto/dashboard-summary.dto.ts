import { ApiProperty } from '@nestjs/swagger';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';

export class DashboardEventCounts {
  @ApiProperty({ description: 'Total events user is hosting (upcoming)' })
  hostingUpcoming: number;

  @ApiProperty({ description: 'Total events user is attending (upcoming)' })
  attendingUpcoming: number;

  @ApiProperty({ description: 'Total past events' })
  past: number;
}

export class DashboardSummaryDto {
  @ApiProperty({ type: DashboardEventCounts })
  counts: DashboardEventCounts;

  @ApiProperty({
    type: [EventEntity],
    description: 'Events user is hosting this week',
  })
  hostingThisWeek: EventEntity[];

  @ApiProperty({
    type: [EventEntity],
    description: 'Events user is hosting after this week (limited preview)',
  })
  hostingLater: EventEntity[];

  @ApiProperty({
    type: [EventEntity],
    description: 'Events user is attending soon (limited preview)',
  })
  attendingSoon: EventEntity[];
}
